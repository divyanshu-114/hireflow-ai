import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import WeeklyPlanPage from './WeeklyPlanPage.jsx'
import {
  confirmWeeklyPlan,
  getPlanAlternatives,
  getResumePreviewUrl,
  getWeeklyPlan,
  swapJob,
} from '../api/client.js'

vi.mock('../api/client.js', () => ({
  getWeeklyPlan: vi.fn(),
  confirmWeeklyPlan: vi.fn(),
  swapJob: vi.fn(),
  getPlanAlternatives: vi.fn(),
  getResumePreviewUrl: vi.fn(),
}))

vi.mock('../utils/currentUser.js', () => ({
  getCurrentUserId: () => 1,
}))

const PLAN = {
  user_id: 1,
  cycle_start: '2026-08-03',
  confirmation_mode: 'batch',
  applications: [
    {
      job_id: 11,
      company_name: 'LangChain Labs',
      role_title: 'AI Engineer Intern',
      match_score: 0.9,
      skill_gaps: ['Docker'],
      rank: 1,
      status: 'planned',
    },
    {
      job_id: 12,
      company_name: 'VectorDB Co',
      role_title: 'RAG Engineer',
      match_score: 0.72,
      skill_gaps: ['LangChain'],
      rank: 2,
      status: 'planned',
    },
  ],
  total_count: 2,
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/weekly-plan']}>
      <WeeklyPlanPage />
    </MemoryRouter>,
  )
}

describe('WeeklyPlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWeeklyPlan.mockResolvedValue(PLAN)
  })

  it('renders one job card per application in the plan', async () => {
    renderPage()

    expect(await screen.findByText('LangChain Labs')).toBeInTheDocument()
    expect(screen.getByText('VectorDB Co')).toBeInTheDocument()
    expect(getWeeklyPlan).toHaveBeenCalledWith(1, null)
  })

  it('Confirm and Apply calls confirmWeeklyPlan with confirmed + removed job ids', async () => {
    const user = userEvent.setup()
    confirmWeeklyPlan.mockResolvedValue({ confirmed_count: 2, removed_count: 0 })

    renderPage()
    await screen.findByText('LangChain Labs')

    await user.click(screen.getByRole('button', { name: /confirm & apply \(2\)/i }))

    await waitFor(() => {
      expect(confirmWeeklyPlan).toHaveBeenCalledTimes(1)
      expect(confirmWeeklyPlan).toHaveBeenCalledWith(1, [11, 12], [])
    })
  })

  it('shows an inline error and does NOT redirect when confirm fails', async () => {
    const user = userEvent.setup()
    confirmWeeklyPlan.mockRejectedValue(
      Object.assign(new Error('Job IDs [999] are not in the current weekly plan.'), { status: 404 }),
    )

    renderPage()
    await screen.findByText('LangChain Labs')
    await user.click(screen.getByRole('button', { name: /confirm & apply \(2\)/i }))

    expect(await screen.findByText(/not in the current weekly plan/i)).toBeInTheDocument()
    // Still on the page — the confirm button is present and re-clickable.
    expect(screen.getByRole('button', { name: /confirm & apply \(2\)/i })).toBeInTheDocument()
  })

  it('removing a card is optimistic and offers the next ranked alternative via swap', async () => {
    const user = userEvent.setup()
    getPlanAlternatives.mockResolvedValue({
      alternatives: [{ job_id: 13, company_name: 'Embedding Inc', role_title: 'ML Engineer', match_score: 0.6, skill_gaps: [], rank: 3, status: 'pending' }],
      total_count: 1,
    })
    swapJob.mockResolvedValue({
      applications: [
        PLAN.applications[1],
        { job_id: 13, company_name: 'Embedding Inc', role_title: 'ML Engineer', match_score: 0.6, skill_gaps: [], rank: 2, status: 'planned' },
      ],
    })

    renderPage()
    await screen.findByText('LangChain Labs')

    await user.click(screen.getAllByRole('button', { name: /remove/i })[0])

    // Optimistic: card disappears immediately.
    await waitFor(() => {
      expect(screen.queryByText('LangChain Labs')).not.toBeInTheDocument()
    })

    // The swap offer surfaces with the next ranked alternative.
    expect(getPlanAlternatives).toHaveBeenCalledWith(1)
    expect(await screen.findByText(/swap in ML Engineer at Embedding Inc/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /swap in/i }))

    await waitFor(() => {
      expect(swapJob).toHaveBeenCalledWith(1, 11, 13)
    })
  })

  it('renders a friendly error state with retry when the fetch fails', async () => {
    const user = userEvent.setup()
    getWeeklyPlan.mockRejectedValueOnce(Object.assign(new Error('Backend unreachable.'), { status: 500 }))

    renderPage()

    expect(await screen.findByText(/couldn't load your plan/i)).toBeInTheDocument()
    expect(screen.getByText(/backend unreachable/i)).toBeInTheDocument()

    getWeeklyPlan.mockResolvedValueOnce(PLAN)
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('LangChain Labs')).toBeInTheDocument()
  })

  it('shows the empty state when the plan has zero jobs', async () => {
    getWeeklyPlan.mockResolvedValue({ ...PLAN, applications: [], total_count: 0 })

    renderPage()

    expect(await screen.findByText(/your plan is ready to fill/i)).toBeInTheDocument()
  })

  it('getResumePreviewUrl is used to open the resume preview modal', async () => {
    const user = userEvent.setup()
    getResumePreviewUrl.mockReturnValue('http://localhost:8000/applications/1/11/resume')
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })

    renderPage()
    await screen.findByText('LangChain Labs')

    await user.click(screen.getAllByRole('button', { name: /preview resume/i })[0])

    expect(getResumePreviewUrl).toHaveBeenCalledWith(1, 11)
    expect(await screen.findByRole('dialog', { name: /resume preview/i })).toBeInTheDocument()
  })
})
