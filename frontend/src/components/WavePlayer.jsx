import { useEffect, useRef, useState } from 'react'
import { audioUrl } from '../api.js'

const BUCKETS = 260

export default function WavePlayer({ clip }) {
  const audioRef = useRef(null)
  const canvasRef = useRef(null)
  const [peaks, setPeaks] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)

  const src = audioUrl(clip.url)

  // Decode once for the waveform; playback itself streams through <audio>.
  useEffect(() => {
    let cancelled = false
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return undefined
    const ctx = new Ctx()
    fetch(src)
      .then((res) => res.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        if (cancelled) return
        const data = decoded.getChannelData(0)
        const step = Math.floor(data.length / BUCKETS) || 1
        const out = new Float32Array(BUCKETS)
        let max = 1e-6
        for (let i = 0; i < BUCKETS; i += 1) {
          let peak = 0
          for (let j = i * step; j < (i + 1) * step && j < data.length; j += 1) {
            const v = Math.abs(data[j])
            if (v > peak) peak = v
          }
          out[i] = peak
          if (peak > max) max = peak
        }
        for (let i = 0; i < BUCKETS; i += 1) out[i] /= max
        setPeaks(out)
      })
      .catch(() => setPeaks(null))
      .finally(() => ctx.close?.())
    return () => {
      cancelled = true
    }
  }, [src])

  // Paint the bars, lit up to the play head.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = width * dpr
    canvas.height = height * dpr
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const n = peaks ? peaks.length : BUCKETS
    const gap = 1.5
    const barWidth = Math.max(1.2, width / n - gap)
    const mid = height / 2
    for (let i = 0; i < n; i += 1) {
      const value = peaks ? peaks[i] : 0.06
      const h = Math.max(2, value * (height * 0.86))
      const x = i * (barWidth + gap)
      const played = x / width <= position
      ctx.fillStyle = played ? '#e0a44e' : 'rgba(232, 220, 198, 0.22)'
      ctx.fillRect(x, mid - h / 2, barWidth, h)
    }
  }, [peaks, position])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return undefined
    let frame
    const tick = () => {
      if (audio.duration) setPosition(audio.currentTime / audio.duration)
      frame = requestAnimationFrame(tick)
    }
    const onPlay = () => {
      setPlaying(true)
      frame = requestAnimationFrame(tick)
    }
    const onPause = () => {
      setPlaying(false)
      cancelAnimationFrame(frame)
    }
    const onEnd = () => {
      setPlaying(false)
      setPosition(0)
      cancelAnimationFrame(frame)
    }
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnd)
    return () => {
      cancelAnimationFrame(frame)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnd)
    }
  }, [src])

  // Autoplay the freshly generated clip; browsers may refuse without a gesture.
  useEffect(() => {
    audioRef.current?.play().catch(() => {})
  }, [src])

  const seek = (event) => {
    const audio = audioRef.current
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    if (audio?.duration) {
      audio.currentTime = ratio * audio.duration
      setPosition(ratio)
    }
  }

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(() => {})
    else audio.pause()
  }

  return (
    <section className="panel player" data-reveal style={{ '--delay': '0ms' }}>
      <header className="panel__head">
        <h2 className="panel__title">الصَّوْت</h2>
        <span className="panel__label" dir="ltr">render · {clip.id.slice(0, 8)}</span>
      </header>

      <div className="player__body">
        <button type="button" className={`transport ${playing ? 'is-playing' : ''}`} onClick={toggle} aria-label={playing ? 'إيقاف' : 'تشغيل'}>
          {playing ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
          )}
        </button>

        <div className="wave" onClick={seek} role="presentation">
          <canvas ref={canvasRef} />
          <span className="wave__head" style={{ insetInlineStart: `${position * 100}%` }} aria-hidden="true" />
        </div>

        <a className="btn btn--ghost btn--icon" href={audioUrl(clip.download_url)} download title="تنزيل WAV">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 19h14" /></svg>
          <span dir="ltr">WAV</span>
        </a>
      </div>

      <dl className="readout" dir="ltr">
        <Stat label="duration" value={`${clip.audio_seconds.toFixed(2)}s`} />
        <Stat label="synth" value={`${(clip.synth_seconds * 1000).toFixed(0)}ms`} />
        <Stat label="rtf" value={clip.rtf.toFixed(3)} accent />
        <Stat label="speed" value={`${clip.speed.toFixed(2)}×`} />
        <Stat label="rate" value={`${(clip.sample_rate / 1000).toFixed(0)}kHz`} />
        <Stat label="chunks" value={String(clip.segments.length)} />
      </dl>

      <audio ref={audioRef} src={src} preload="auto" />
    </section>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div className={`readout__item ${accent ? 'is-accent' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
