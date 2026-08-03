import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ApplicationsPage from './ApplicationsPage.jsx'
import { getApplications } from '../api/client.js'

vi.mock('../api/client.js', () => ({
  getApplications: vi.fn(),
  getResumePreviewUrl: vi.fn(),
}))

vi.mock('../utils/currentUser.js', () => ({
  getCurrentUserId: () => 1,
}))

const ROWS = [
  {
    id: 1,
    user_id: 1,
    job_id: 101,
    company_name: 'Acme',
    role_title: 'Backend Intern',
    status: 'applied',
    resume_path: 'data/resumes/1/101_resume_v1.pdf',
    failure_reason: null,
    applied_at: '2026-08-01T10:00:00Z',
  },
  {
    id: 2,
    user_id: 1,
    job_id: 102,
    company_name: 'Beta',
    role_title: 'ML Engineer',
    status: 'failed',
    resume_path: null,
    failure_reason: 'Form rejected — missing experience',
    applied_at: '2026-07-28T10:00:00Z',
  },
  {
    id: 3,
    user_id: 1,
    job_id: 103,
    company_name: 'Gamma',
    role_title: 'Data Analyst',
    status: 'needs_action',
    resume_path: null,
    failure_reason: null,
    applied_at: null,
  },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/applications']}>
      <ApplicationsPage />
    </MemoryRouter>,
  )
}

describe('ApplicationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getApplications.mockResolvedValue(ROWS)
  })

  it('renders status badges with the correct acceptance-criteria colors', async () => {
    renderPage()

    expect(await screen.findByText('Acme')).toBeInTheDocument()

    // The filter tabs also read "Applied"/"Failed"/"Needs action", so pick
    // the matching element by its badge class rather than by text alone.
    const badgeByClass = (className) =>
      screen.getAllByText(/applied|failed|needs action/i).find((el) => el.className.includes(className))

    expect(badgeByClass('status-badge--applied')).toHaveClass('status-badge--applied')
    expect(badgeByClass('status-badge--failed')).toHaveClass('status-badge--failed')
    expect(badgeByClass('status-badge--needs_action')).toHaveClass('status-badge--needs_action')
  })

  it('re-calls the API server-side when a filter tab is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Acme')

    await user.click(screen.getByRole('button', { name: /failed/i }))

    await waitFor(() => {
      expect(getApplications).toHaveBeenCalledWith(1, 'failed')
    })
  })

  it('renders the "All" filter without a status query param', async () => {
    renderPage()
    await screen.findByText('Acme')
    expect(getApplications).toHaveBeenCalledWith(1, null)
  })

  it('reveals the manual apply link for a needs_action row when expanded', async () => {
    const user = userEvent.setup()
    // needs_action rows get manual_application_url injected by the backend.
    const withUrl = ROWS.map((row) =>
      row.status === 'needs_action'
        ? { ...row, manual_application_url: 'https://gamma.example/apply' }
        : row,
    )
    getApplications.mockResolvedValue(withUrl)

    renderPage()
    await screen.findByText('Gamma')

    const applyButton = screen.getByRole('button', { name: /apply link/i })
    expect(applyButton).toHaveAttribute('aria-expanded', 'false')

    await user.click(applyButton)

    const link = await screen.findByRole('link', { name: /https:\/\/gamma\.example\/apply/i })
    expect(link).toHaveAttribute('href', 'https://gamma.example/apply')
    expect(link).toHaveAttribute('target', '_blank')
    expect(applyButton).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows the empty state when there are no applications', async () => {
    getApplications.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText(/no applications yet/i)).toBeInTheDocument()
  })

  it('shows an error state with retry when the fetch fails', async () => {
    const user = userEvent.setup()
    getApplications.mockRejectedValueOnce(Object.assign(new Error('Server error.'), { status: 500 }))

    renderPage()

    expect(await screen.findByText(/couldn't load applications/i)).toBeInTheDocument()

    getApplications.mockResolvedValueOnce(ROWS)
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('Acme')).toBeInTheDocument()
  })
})
