import { useState } from 'react'

export default function PhonemeSheet({ preview, clip }) {
  const [open, setOpen] = useState(Boolean(preview))
  const segments = clip?.segments || []
  const diacritized = preview?.diacritized || clip?.diacritized

  return (
    <section className="panel sheet" data-reveal style={{ '--delay': '0ms' }}>
      <button type="button" className="sheet__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="panel__title">الفونيمات والتَّشْكِيل</span>
        <span className="panel__label" dir="ltr">front end {open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="sheet__body">
          {diacritized && (
            <div className="sheet__block">
              <span className="sheet__key" dir="ltr">diacritized</span>
              <p className="sheet__ar" dir="rtl">{diacritized}</p>
            </div>
          )}
          {preview?.phonemes && segments.length === 0 && (
            <div className="sheet__block">
              <span className="sheet__key" dir="ltr">ipa</span>
              <p className="sheet__ipa" dir="ltr">{preview.phonemes}</p>
            </div>
          )}
          {segments.map((segment, index) => (
            <div className="sheet__block" key={`${segment.phonemes}-${index}`}>
              <span className="sheet__key" dir="ltr">
                chunk {index + 1} · {segment.seconds.toFixed(2)}s
              </span>
              <p className="sheet__ar" dir="rtl">{segment.text}</p>
              <p className="sheet__ipa" dir="ltr">{segment.phonemes}</p>
            </div>
          ))}
          {preview && (
            <p className="sheet__foot" dir="ltr">
              {preview.already_diacritized ? 'input kept as written' : 'tashkeel restored automatically'}
              {preview.latin_runs_dropped > 0 && ` · ${preview.latin_runs_dropped} latin run(s) dropped`}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
