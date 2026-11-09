export default function StatusPanel({ status, onRetry }) {
  const state = status?.state || 'idle'
  const rows = [
    ['model', status?.repo_id?.split('/').pop() || 'Nabra-7M-Distill'],
    ['params', status?.parameters ? `${(status.parameters / 1e6).toFixed(2)}M` : '—'],
    ['device', status?.device || '—'],
    ['voice', status?.voice || 'af_msa'],
    ['sample rate', status?.sample_rate ? `${status.sample_rate / 1000} kHz` : '—'],
    ['tashkeel', status?.diacritizer ? 'camel-tools' : 'espeak guess'],
    ['warm-up', status?.load_seconds ? `${status.load_seconds.toFixed(1)}s` : '—'],
  ]

  return (
    <section className="panel status" data-reveal style={{ '--delay': '160ms' }}>
      <header className="panel__head">
        <h2 className="panel__title">المُحَرِّك</h2>
        <span className="panel__label" dir="ltr">engine</span>
      </header>

      <div className={`status__state status__state--${state}`} dir="ltr">
        <span className={`beacon beacon--${state}`} />
        {state}
        {state === 'loading' && <span className="status__hint">downloading weights…</span>}
      </div>

      <dl className="status__rows" dir="ltr">
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      {!status?.diacritizer && state === 'ready' && (
        <p className="status__note">
          التشكيل التلقائي غير مفعّل. ثبّت <code dir="ltr">camel-tools</code> أو اكتب النص مشكولًا للحصول على نطق أدق.
        </p>
      )}

      {(state === 'error' || state === 'offline') && (
        <>
          {status?.error && <p className="status__error" dir="ltr">{status.error}</p>}
          <button type="button" className="btn btn--ghost btn--block" onClick={onRetry}>
            إعادة المحاولة
          </button>
        </>
      )}
    </section>
  )
}
