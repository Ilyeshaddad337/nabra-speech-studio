import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Composer from './components/Composer.jsx'
import WavePlayer from './components/WavePlayer.jsx'
import HistoryRail from './components/HistoryRail.jsx'
import StatusPanel from './components/StatusPanel.jsx'
import PhonemeSheet from './components/PhonemeSheet.jsx'
import { getSamples, getStatus, loadModel, phonemize, synthesize } from './api.js'

const HISTORY_LIMIT = 12

export default function App() {
  const [status, setStatus] = useState(null)
  const [samples, setSamples] = useState([])
  const [text, setText] = useState('مَرْحَبًا بِكُم فِي عَالَمِ تَحْوِيلِ النَّصِّ إِلَى كَلَام.')
  const [speed, setSpeed] = useState(1)
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const pollRef = useRef(null)

  const ready = status?.state === 'ready'

  const refreshStatus = useCallback(async () => {
    try {
      const next = await getStatus()
      setStatus(next)
      return next
    } catch (err) {
      setStatus({ state: 'offline', error: err.message })
      return null
    }
  }, [])

  useEffect(() => {
    refreshStatus()
    getSamples().then(setSamples).catch(() => setSamples([]))
  }, [refreshStatus])

  // Poll while the weights are downloading / warming up.
  useEffect(() => {
    const state = status?.state
    if (state === 'ready') {
      clearInterval(pollRef.current)
      return undefined
    }
    pollRef.current = setInterval(refreshStatus, 2000)
    return () => clearInterval(pollRef.current)
  }, [status?.state, refreshStatus])

  const handleGenerate = useCallback(async () => {
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await synthesize(value, speed)
      const entry = { ...result, text: value, at: Date.now() }
      setCurrent(entry)
      setPreview(null)
      setHistory((prev) => [entry, ...prev].slice(0, HISTORY_LIMIT))
    } catch (err) {
      setError(err.message)
      if (err.status === 503) refreshStatus()
    } finally {
      setBusy(false)
    }
  }, [text, speed, busy, refreshStatus])

  const handlePreview = useCallback(async () => {
    const value = text.trim()
    if (!value || previewing) return
    setPreviewing(true)
    setError(null)
    try {
      setPreview(await phonemize(value))
    } catch (err) {
      setError(err.message)
    } finally {
      setPreviewing(false)
    }
  }, [text, previewing])

  const handleRetryLoad = useCallback(async () => {
    setError(null)
    setStatus((s) => ({ ...(s || {}), state: 'loading' }))
    try {
      setStatus(await loadModel())
    } catch (err) {
      setError(err.message)
      refreshStatus()
    }
  }, [refreshStatus])

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        handleGenerate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleGenerate])

  const charCount = useMemo(() => text.trim().length, [text])

  return (
    <div className="shell">
      <div className="atmosphere" aria-hidden="true">
        <div className="glow glow--one" />
        <div className="glow glow--two" />
        <div className="tile" />
        <div className="grain" />
      </div>

      <header className="masthead" data-reveal style={{ '--delay': '0ms' }}>
        <div className="wordmark">
          <span className="wordmark__ar">نَبْرَة</span>
          <span className="wordmark__rule" aria-hidden="true" />
          <span className="wordmark__en" dir="ltr">
            Speech Studio
            <em>Nabra-7M-Distill · 24 kHz</em>
          </span>
        </div>
        <div className="masthead__meta" dir="ltr">
          <span className={`beacon beacon--${status?.state || 'idle'}`} />
          <span className="masthead__state">{stateLabel(status)}</span>
        </div>
      </header>

      <main className="stage">
        <section className="column column--main">
          <Composer
            text={text}
            onTextChange={setText}
            speed={speed}
            onSpeedChange={setSpeed}
            samples={samples}
            maxChars={status?.max_chars ?? 3000}
            charCount={charCount}
            busy={busy}
            ready={ready}
            previewing={previewing}
            onGenerate={handleGenerate}
            onPreview={handlePreview}
          />

          {error && (
            <div className="alert" role="alert">
              <span className="alert__tag" dir="ltr">error</span>
              <p>{error}</p>
            </div>
          )}

          {current && <WavePlayer key={current.id} clip={current} />}
          {(preview || current) && <PhonemeSheet preview={preview} clip={current} />}
        </section>

        <aside className="column column--rail">
          <StatusPanel status={status} onRetry={handleRetryLoad} />
          <HistoryRail
            items={history}
            currentId={current?.id}
            onSelect={setCurrent}
            onReuse={(item) => {
              setText(item.text)
              setSpeed(item.speed)
            }}
            onClear={() => setHistory([])}
          />
        </aside>
      </main>

      <footer className="footer" dir="ltr">
        <span>FastAPI · PyTorch · React</span>
        <a href="https://huggingface.co/oddadmix/Nabra-7M-Distill" target="_blank" rel="noreferrer">
          oddadmix/Nabra-7M-Distill ↗
        </a>
      </footer>
    </div>
  )
}

function stateLabel(status) {
  switch (status?.state) {
    case 'ready':
      return 'جاهز · ready'
    case 'loading':
      return 'يُحمّل النموذج · loading'
    case 'error':
      return 'خطأ · error'
    case 'offline':
      return 'الخادم غير متصل · offline'
    default:
      return 'في الانتظار · idle'
  }
}
