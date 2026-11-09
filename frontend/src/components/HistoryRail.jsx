import { audioUrl } from '../api.js'

export default function HistoryRail({ items, currentId, onSelect, onReuse, onClear }) {
  return (
    <section className="panel history" data-reveal style={{ '--delay': '240ms' }}>
      <header className="panel__head">
        <h2 className="panel__title">السِّجِل</h2>
        <span className="panel__label" dir="ltr">
          renders
          {items.length > 0 && (
            <button type="button" className="linkish" onClick={onClear}>
              clear
            </button>
          )}
        </span>
      </header>

      {items.length === 0 ? (
        <p className="history__empty">لم تُولَّد أي مقاطع بعد.</p>
      ) : (
        <ol className="history__list">
          {items.map((item) => (
            <li key={item.id} className={item.id === currentId ? 'is-current' : ''}>
              <button type="button" className="history__pick" onClick={() => onSelect(item)}>
                <span className="history__text">{item.text}</span>
                <span className="history__meta" dir="ltr">
                  {item.audio_seconds.toFixed(1)}s · {item.speed.toFixed(2)}× · rtf {item.rtf.toFixed(3)}
                </span>
              </button>
              <div className="history__tools">
                <button type="button" onClick={() => onReuse(item)} title="إعادة استخدام النص">↺</button>
                <a href={audioUrl(item.download_url)} download title="تنزيل">↓</a>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
