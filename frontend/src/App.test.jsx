import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App.jsx'

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

  it('renders the weekly plan stub at /weekly-plan', () => {
    renderAt('/weekly-plan')
    expect(screen.getByRole('heading', { name: /weekly plan/i })).toBeInTheDocument()
    expect(screen.getByText(/issue 24/i)).toBeInTheDocument()
  })

  it('renders the applications stub at /applications', () => {
    renderAt('/applications')
    expect(screen.getByRole('heading', { name: /applications/i })).toBeInTheDocument()
  })

  it('renders the prep guide stub with the :id route param at /prep-guide/42', () => {
    renderAt('/prep-guide/42')
    expect(screen.getByRole('heading', { name: /prep guide #42/i })).toBeInTheDocument()
    expect(screen.getByText(/route param :id = 42/i)).toBeInTheDocument()
  })

  it('renders the resumes stub at /resumes', () => {
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
