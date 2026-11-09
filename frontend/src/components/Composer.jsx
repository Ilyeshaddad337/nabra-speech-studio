const SPEED_MARKS = [0.75, 0.9, 1, 1.15, 1.3]

const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent)
const SHORTCUT = IS_MAC ? 'Cmd + Enter' : 'Ctrl + Enter'

export default function Composer({
  text,
  onTextChange,
  speed,
  onSpeedChange,
  samples,
  maxChars,
  charCount,
  busy,
  ready,
  previewing,
  onGenerate,
  onPreview,
}) {
  const over = charCount > maxChars
  const fill = Math.min(100, (charCount / maxChars) * 100)

  return (
    <section className="panel composer" data-reveal style={{ '--delay': '80ms' }}>
      <header className="panel__head">
        <h2 className="panel__title">النَّص</h2>
        <span className="panel__label" dir="ltr">script</span>
      </header>

      <div className={`composer__field ${busy ? 'is-busy' : ''}`}>
        <textarea
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="اكتب نصًّا بالعربية الفصحى… التشكيل يُحسّن النطق كثيرًا."
          spellCheck="false"
          dir="rtl"
          rows={6}
          aria-label="النص العربي"
        />
        <div className="composer__gauge" aria-hidden="true">
          <span style={{ inlineSize: `${fill}%` }} className={over ? 'is-over' : ''} />
        </div>
        <div className="composer__count" dir="ltr">
          <span className={over ? 'is-over' : ''}>{charCount.toLocaleString('en-US')}</span>
          <span className="dim"> / {maxChars.toLocaleString('en-US')}</span>
        </div>
      </div>

      {samples.length > 0 && (
        <div className="chips">
          <span className="chips__label" dir="ltr">presets</span>
          {samples.map((sample) => (
            <button
              key={sample.label}
              type="button"
              className="chip"
              onClick={() => onTextChange(sample.text)}
              title={sample.text}
            >
              {sample.label}
            </button>
          ))}
        </div>
      )}

      <div className="controls">
        <div className="dial">
          <div className="dial__head">
            <span className="dial__name">السُّرْعَة</span>
            <output className="dial__value" dir="ltr">{speed.toFixed(2)}×</output>
          </div>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.05"
            value={speed}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
            aria-label="سرعة الكلام"
          />
          <div className="dial__marks" dir="ltr">
            {SPEED_MARKS.map((mark) => (
              <button key={mark} type="button" onClick={() => onSpeedChange(mark)} className={speed === mark ? 'is-active' : ''}>
                {mark}×
              </button>
            ))}
          </div>
        </div>

        <div className="actions">
          <button type="button" className="btn btn--ghost" onClick={onPreview} disabled={previewing || !ready || !charCount}>
            {previewing ? 'يُحلّل…' : 'الفونيمات'}
          </button>
          <button
            type="button"
            className={`btn btn--primary ${busy ? 'is-busy' : ''}`}
            onClick={onGenerate}
            disabled={busy || !ready || !charCount || over}
          >
            <span className="btn__label">{busy ? 'يُولِّد الصوت…' : 'وَلِّدِ الصَّوْت'}</span>
            <kbd dir="ltr">{SHORTCUT}</kbd>
          </button>
        </div>
      </div>
    </section>
  )
}
