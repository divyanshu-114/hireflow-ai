import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ResumePreview from './ResumePreview.jsx'

const RESUME_URL = 'http://localhost:8000/applications/1/101/resume'

function renderModal(props = {}) {
  return render(
    <ResumePreview
      isOpen={false}
      onClose={() => {}}
      resumeUrl={RESUME_URL}
      jobTitle="Backend Intern — Acme"
      {...props}
    />,
  )
}

describe('ResumePreview', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when closed', () => {
    renderModal()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('probes the PDF route and embeds the iframe when it exists', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

    renderModal({ isOpen: true })

    expect(await screen.findByTitle(/resume preview — backend intern — acme/i)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: /resume preview/i })).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith(RESUME_URL, { method: 'HEAD' })
  })

  it('shows a friendly inline message when the resume 404s instead of a broken iframe', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })

    renderModal({ isOpen: true })

    expect(await screen.findByText(/resume not yet generated/i)).toBeInTheDocument()
    expect(screen.queryByTitle(/resume preview/i)).not.toBeInTheDocument()
  })

  it('shows a network error (not “not yet generated”) when the check throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'))

    renderModal({ isOpen: true })

    expect(await screen.findByText(/couldn't load the resume/i)).toBeInTheDocument()
    expect(screen.queryByText(/resume not yet generated/i)).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
    const onClose = vi.fn()

    renderModal({ isOpen: true, onClose })
    await screen.findByTitle(/resume preview/i)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('traps focus inside the dialog', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

    renderModal({ isOpen: true })
    await screen.findByTitle(/resume preview/i)

    // The only focusable elements are the close button (and the iframe).
    const closeButton = screen.getByRole('button', { name: /close resume preview/i })
    closeButton.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })

    await waitFor(() => {
      expect(document.activeElement).toBe(closeButton)
    })
  })
})
