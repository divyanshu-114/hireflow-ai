/**
 * RoundCard — one interview round in the prep guide.
 *
 * The shape matches PrepGuideAgent.predict_rounds() output exactly:
 *   { number, type, label, focus: string[], duration_minutes, tips: string[] }
 * Any optional field missing is rendered conditionally (e.g. no tips →
 * no callout box, not an empty one).
 */

const TYPE_LABELS = {
  online_assessment: 'Online Assessment',
  technical: 'Technical',
  hr: 'HR',
  behavioral: 'Behavioral',
  founder: 'Founder / Leadership',
  managerial: 'Managerial',
  portfolio_case: 'Portfolio / Case',
}

export default function RoundCard({ round }) {
  const {
    number,
    type,
    label,
    focus = [],
    duration_minutes,
    tips = [],
  } = round ?? {}

  const typeLabel = label || TYPE_LABELS[type] || (type ?? 'Round')
  const title = `Round ${number ?? ''}`.trim()

  return (
    <article className="round-card">
      <div className="round-card__head">
        <div className="round-card__title-block">
          <span className="round-card__tag">{typeLabel}</span>
          {number != null && <span className="round-card__num">{title}</span>}
        </div>
        {duration_minutes != null && (
          <span className="round-card__duration">~{duration_minutes} min</span>
        )}
      </div>

      {focus.length > 0 && (
        <div className="round-card__focus">
          {focus.map((item) => (
            <span key={item} className="pill">
              {item}
            </span>
          ))}
        </div>
      )}

      {tips.length > 0 && (
        <div className="round-card__tips">
          <p className="round-card__tips-label">Prep tips</p>
          <ul className="round-card__tips-list">
            {tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}
