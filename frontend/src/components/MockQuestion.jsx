import { useState } from 'react'

/**
 * MockQuestion — an accordion-style mock interview question.
 *
 * Collapsed by default (deliberately reducing cognitive overload per the
 * acceptance criteria), expands on click with a smooth height transition.
 * Keyboard accessible: it's a real <button>, so Enter/Space toggle it
 * natively, and aria-expanded reflects the open state.
 */

export default function MockQuestion({ question, category, defaultExpanded = false }) {
  const [open, setOpen] = useState(Boolean(defaultExpanded))

  const categoryLabel = category ? category.replace(/_/g, ' ') : 'general'

  return (
    <div className={`mock-q${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="mock-q__toggle"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="mock-q__cat">{categoryLabel}</span>
        <span className="mock-q__text">{question}</span>
        <svg
          className={`mock-q__chevron${open ? ' is-open' : ''}`}
          viewBox="0 0 16 16"
          width="16"
          height="16"
          aria-hidden="true"
        >
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className="mock-q__body" hidden={!open}>
        <p className="mock-q__body-text">{question}</p>
      </div>
    </div>
  )
}
