/**
 * TopicBadge — small color-coded pill for a prep topic or skill.
 *
 * Mirrors Issue 24's status-badge treatment: strong = green, moderate =
 * yellow, gap = red. An unexpected status value degrades to a neutral
 * gray pill instead of crashing.
 */

const STATUS_STYLES = {
  strong: 'bg-green-100 text-green-800 border-green-200',
  moderate: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  gap: 'bg-red-100 text-red-800 border-red-200',
}

const STATUS_LABELS = {
  strong: 'Strong',
  moderate: 'Moderate',
  gap: 'Gap',
}

export default function TopicBadge({ status, label }) {
  const tone = STATUS_STYLES[status] ?? 'bg-stone-100 text-stone-600 border-stone-200'
  const statusLabel = STATUS_LABELS[status] ?? 'Topic'

  return (
    <span
      className={`topic-badge ${tone}`}
      title={`${statusLabel}: ${label}`}
    >
      {label}
    </span>
  )
}
