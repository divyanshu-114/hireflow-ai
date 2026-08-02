import { useState } from 'react'

/**
 * Multi-value tag/chip input. Enter (or comma) adds a chip, Backspace on an
 * empty field removes the last chip, and each chip has a remove button.
 * Fully keyboard-accessible (it's a real text input with a labelled field).
 */
export default function TagInput({
  id,
  label,
  chips = [],
  onChange,
  placeholder = 'Type and press Enter',
  hint,
  error,
  required = false,
  maxChips = 20,
}) {
  const [draft, setDraft] = useState('')

  const add = (raw) => {
    const value = raw.trim().replace(/,+$/, '').trim()
    if (!value) return
    setDraft('')
    if (chips.some((chip) => chip.toLowerCase() === value.toLowerCase())) return
    if (chips.length >= maxChips) return
    onChange([...chips, value])
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      add(event.currentTarget.value)
    } else if (event.key === 'Backspace' && event.currentTarget.value === '' && chips.length) {
      onChange(chips.slice(0, -1))
    }
  }

  return (
    <div className={`field${error ? ' field--has-error' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}{' '}
        {required && (
          <span className="field__req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className="chips-input">
        {chips.map((chip) => (
          <span key={chip} className="chip">
            {chip}
            <button
              type="button"
              className="chip__remove"
              aria-label={`Remove ${chip}`}
              onClick={() => onChange(chips.filter((existing) => existing !== chip))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          className="chips-input__field"
          type="text"
          placeholder={chips.length ? 'Add another…' : placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={(event) => {
            if (event.currentTarget.value.trim()) add(event.currentTarget.value)
          }}
          aria-required={required ? 'true' : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        />
      </div>
      {hint && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
