import { useEffect, useRef, useState } from 'react'

/**
 * Modal overlay that previews a generated resume PDF in an iframe.
 *
 * Chose <iframe> over <embed>: iframes render PDFs consistently across
 * browsers and give us a contained scrollable surface inside the modal;
 * <embed> has inconsistent behavior (especially for fallback content).
 *
 * Before rendering the iframe we probe the PDF route with a HEAD request
 * so a missing/404 resume shows a friendly inline message instead of a
 * broken blank iframe.
 *
 * Keyboard support: Escape closes, and Tab is trapped inside the dialog
 * while it's open. Focus is restored to the trigger on close.
 *
 * Props:
 * - isOpen: bool
 * - onClose(): void
 * - resumeUrl: string (backend PDF route)
 * - jobTitle: string (modal header)
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export default function ResumePreview({ isOpen, onClose, resumeUrl, jobTitle }) {
  // `checkedUrl` remembers which URL the current availability refers to.
  // While `checkedUrl !== resumeUrl` we render the checking state — this
  // replaces a synchronous "reset to checking" setState in the effect, so
  // the effect only ever updates state from the async fetch callback
  // (react-hooks/set-state-in-effect).
  //
  // Callers unmount this component when closed ({preview && <ResumePreview/>}),
  // so state always starts fresh on open; a same-URL reopen with a parent
  // that keeps it mounted would briefly show stale availability.
  const [availability, setAvailability] = useState('checking') // checking | ready | missing | error
  const [checkedUrl, setCheckedUrl] = useState(null)
  const dialogRef = useRef(null)
  const previouslyFocused = useRef(null)

  // Probe the PDF route so a 404 shows a message rather than a dead iframe.
  useEffect(() => {
    if (!isOpen) return

    previouslyFocused.current = document.activeElement
    let cancelled = false

    fetch(resumeUrl, { method: 'HEAD' })
      .then((response) => {
        if (cancelled) return
        setAvailability(response.ok ? 'ready' : 'missing')
        setCheckedUrl(resumeUrl)
      })
      .catch(() => {
        if (cancelled) return
        // Network failure is different from a genuine 404 — the PDF may
        // exist but the backend may be down.
        setAvailability('error')
        setCheckedUrl(resumeUrl)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, resumeUrl])

  // Escape-to-close + focus trap.
  useEffect(() => {
    if (!isOpen) return

    const dialog = dialogRef.current
    dialog?.querySelector('button')?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !dialog) return
      const focusables = Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (focusables.length === 0) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Restore focus to whatever opened the modal when it closes.
  useEffect(() => {
    if (!isOpen) previouslyFocused.current?.focus?.()
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="modal-backdrop animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Resume preview — ${jobTitle ?? 'application'}`}
      >
        <header className="modal__header">
          <h2 className="modal__title">{jobTitle ?? 'Resume preview'}</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close resume preview">
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5 5 15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="modal__body">
          {checkedUrl !== resumeUrl && (
            <div className="modal__notice" role="status">
              <span className="spinner spinner--dark" aria-hidden="true" />
              <p className="text-sm text-stone-500">Loading resume…</p>
            </div>
          )}

          {checkedUrl === resumeUrl && availability === 'missing' && (
            <div className="modal__notice">
              <span className="empty-state__icon" aria-hidden="true">
                !
              </span>
              <p className="font-semibold text-stone-800">Resume not yet generated</p>
              <p className="max-w-[38ch] text-sm text-stone-500">
                This resume hasn't been generated yet. Confirm the weekly plan and resume generation
                will create it for this application.
              </p>
            </div>
          )}

          {checkedUrl === resumeUrl && availability === 'error' && (
            <div className="modal__notice">
              <span className="empty-state__icon" aria-hidden="true">
                !
              </span>
              <p className="font-semibold text-stone-800">Couldn't load the resume</p>
              <p className="max-w-[38ch] text-sm text-stone-500">
                We couldn't reach the server right now. Make sure the backend is running and try
                again.
              </p>
            </div>
          )}

          {checkedUrl === resumeUrl && availability === 'ready' && (
            <iframe
              title={`Resume preview — ${jobTitle ?? 'application'}`}
              src={resumeUrl}
              className="h-full w-full"
            />
          )}
        </div>
      </div>
    </div>
  )
}
