import { useId, useRef } from 'react'

const MODES = [
  { value: 'internship', label: 'Internship', icon: 'briefcase' },
  { value: 'job', label: 'Job', icon: 'suitcase' },
]

const ICONS = {
  briefcase: (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M2.75 6.5h14.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm4.5-3h5.5a1 1 0 0 1 1 1V6.5H6.25V4.5a1 1 0 0 1 1-1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  suitcase: (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 2.5a1.75 1.75 0 0 1 1.75 1.75V5h-3.5V4.25A1.75 1.75 0 0 1 10 2.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.75 6.25h14.5a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
}

/**
 * Segmented-control toggle for ApplicationMode ("internship" | "job").
 *
 * Implemented with real <button role="radio"> elements so it is fully keyboard
 * accessible (Tab to focus, Enter/Space to select, Arrow keys to move), with a
 * sliding highlight that animates between the two options.
 */
export default function ModeSelector({ value, onChange, name = 'mode', id }) {
  const fallbackId = useId()
  const controlId = id ?? fallbackId
  const activeIndex = Math.max(
    0,
    MODES.findIndex((mode) => mode.value === value),
  )
  const buttonsRef = useRef([])

  const handleKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = (activeIndex + direction + MODES.length) % MODES.length
    onChange(MODES[nextIndex].value)
    buttonsRef.current[nextIndex]?.focus()
  }

  return (
    <div
      id={controlId}
      className="segmented"
      role="radiogroup"
      aria-label="Application mode"
      onKeyDown={handleKeyDown}
    >
      <span
        className="segmented__thumb"
        aria-hidden="true"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {MODES.map((mode, index) => {
        const isActive = mode.value === value
        return (
          <button
            key={mode.value}
            ref={(node) => {
              buttonsRef.current[index] = node
            }}
            type="button"
            role="radio"
            name={name}
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            className={`segmented__option${isActive ? ' is-active' : ''}`}
            onClick={() => {
              if (mode.value !== value) onChange(mode.value)
            }}
          >
            {ICONS[mode.icon]}
            <span>{mode.label}</span>
          </button>
        )
      })}
    </div>
  )
}
