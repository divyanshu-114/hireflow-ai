import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App.jsx'

// The prep-guide route now fetches real data — stub the API client so the
// routing test stays network-free. Defaults: prep guide 404s (expected,
// friendly state) and the resume library is empty.
vi.mock('./api/client.js', () => ({
  getPrepGuide: vi.fn(() =>
    Promise.reject(Object.assign(new Error('Prep guide not ready yet.'), { status: 404 })),
  ),
  getResumeLibrary: vi.fn(() => Promise.resolve([])),
  getResumeDownloadUrl: vi.fn(() => ''),
}))

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('App routing (acceptance criteria: all 5 routes)', () => {
  it('renders the profile page at /', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: /set up your profile/i })).toBeInTheDocument()
  })

  it('renders the weekly plan page at /weekly-plan', () => {
    renderAt('/weekly-plan')
    expect(screen.getByRole('heading', { name: /weekly plan/i })).toBeInTheDocument()
    // No profile created in this browser → friendly prompt instead of a crash.
    expect(screen.getByText(/create your profile/i)).toBeInTheDocument()
  })

  it('renders the applications page at /applications', () => {
    renderAt('/applications')
    expect(screen.getByRole('heading', { name: /applications/i })).toBeInTheDocument()
    expect(screen.getByText(/create your profile/i)).toBeInTheDocument()
  })

  it('renders the prep guide page at /prep-guide/:id', () => {
    renderAt('/prep-guide/42')
    // The page fetches on mount; it renders its header while loading/failing
    // rather than the old stub text.
    expect(screen.getByRole('heading', { name: /prep guide/i })).toBeInTheDocument()
  })

  it('renders the resume library at /resumes', () => {
    renderAt('/resumes')
    expect(screen.getByRole('heading', { name: /resume library/i })).toBeInTheDocument()
  })

  it('shows nav links for all five routes', () => {
    renderAt('/')
    const nav = screen.getByRole('navigation', { name: /primary/i })

    for (const label of ['Profile', 'Weekly Plan', 'Applications', 'Prep Guide', 'Resumes']) {
      expect(within(nav).getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    }
  })

  it('renders the 404 page for an unknown route', () => {
    renderAt('/definitely-not-a-route')
    expect(screen.getByRole('heading', { name: /isn't part of the flow yet/i })).toBeInTheDocument()
  })
})
