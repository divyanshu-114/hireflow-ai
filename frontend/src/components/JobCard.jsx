/**
 * A single weekly-plan job card.
 *
 * Shows company + role with a visual match-score ring, the TOP 3 skill
 * gaps (with a "+N more" indicator), and the two card-level actions:
 * "Preview resume" (secondary) and "Remove" (deliberately lighter —
 * the Confirm button elsewhere is the visually primary action).
 *
 * Props:
 * - job: { job_id, company_name, role_title, match_score, skill_gaps[], rank, status }
 * - onRemove(jobId)
 * - onPreviewResume(jobId)
 */

const MAX_VISIBLE_GAPS = 3

/** Map a 0-1 (or already-percentage) match score to its color treatment. */
function scoreTone(pct) {
  if (pct >= 70) return { stroke: 'stroke-emerald-600', text: 'text-emerald-600', ring: 'ring-emerald-500/15' }
  if (pct >= 40) return { stroke: 'stroke-amber-500', text: 'text-amber-600', ring: 'ring-amber-500/15' }
  return { stroke: 'stroke-rose-500', text: 'text-rose-600', ring: 'ring-rose-500/15' }
}

function ScoreRing({ score }) {
  const raw = score ?? 0
  // Backend stores a 0-1 float; be defensive and accept a raw percentage too.
  const pct = Math.max(0, Math.min(100, raw > 1 ? raw : Math.round(raw * 100)))
  const radius = 20
  const circumference = 2 * Math.PI * radius
  const tone = scoreTone(pct)

  return (
    <div className="flex shrink-0 flex-col items-center">
      <div
        className={`score-ring ${tone.ring}`}
        role="img"
        aria-label={`${pct}% match`}
      >
        <svg viewBox="0 0 48 48" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="24" cy="24" r={radius} fill="none" strokeWidth="4" className="stroke-stone-200" />
          <circle
            cx="24"
            cy="24"
            r={radius}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            className={tone.stroke}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct / 100)}
          />
        </svg>
        <span className={`text-sm font-bold ${tone.text}`}>{pct}%</span>
      </div>
      <span className="score-ring__label">match</span>
    </div>
  )
}

export default function JobCard({ job, onRemove, onPreviewResume }) {
  const gaps = Array.isArray(job?.skill_gaps) ? job.skill_gaps : []
  const visibleGaps = gaps.slice(0, MAX_VISIBLE_GAPS)
  const extraGaps = gaps.length - visibleGaps.length

  return (
    <article className="job-card">
      <div className="job-card__main">
        <span className="job-card__rank" aria-label={`Rank ${job.rank}`}>
          #{job.rank}
        </span>

        <div className="job-card__body">
          <p className="job-card__company">{job.company_name}</p>
          <h3 className="job-card__role">{job.role_title}</h3>

          <div className="job-card__gaps">
            {visibleGaps.length > 0 ? (
              <>
                {visibleGaps.map((gap) => (
                  <span key={gap} className="pill">
                    {gap}
                  </span>
                ))}
                {extraGaps > 0 && <span className="pill pill--more">+{extraGaps} more</span>}
              </>
            ) : (
              <span className="job-card__nogaps">No skill gaps — great match!</span>
            )}
          </div>
        </div>

        <ScoreRing score={job.match_score} />
      </div>

      <div className="job-card__actions">
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => onPreviewResume(job.job_id)}>
          Preview resume
        </button>
        <button type="button" className="btn btn--danger-ghost btn--sm" onClick={() => onRemove(job.job_id)}>
          Remove
        </button>
      </div>
    </article>
  )
}
