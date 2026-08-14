import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PrepGuidePage from './PrepGuidePage.jsx'
import { getPrepGuide } from '../api/client.js'

vi.mock('../api/client.js', () => ({
  getPrepGuide: vi.fn(),
}))

const GUIDE = {
  id: 1,
  application_id: 42,
  company_name: 'LangChain Labs',
  role_title: 'AI Engineer Intern',
  interview_rounds: {
    round_count: 2,
    source: 'inferred',
    rounds: [
      {
        number: 1,
        type: 'technical',
        label: 'Technical Interview',
        focus: ['Coding', 'System design'],
        duration_minutes: 60,
        tips: ['Explain your thought process out loud.', 'Ask clarifying questions.'],
      },
      {
        number: 2,
        type: 'hr',
        label: 'HR Round',
        focus: ['Communication', 'Culture fit'],
        duration_minutes: 30,
        tips: ['Research the company mission.'],
      },
    ],
  },
  topics_to_prepare: {
    strong: ['Python'],
    moderate: ['FastAPI'],
    gaps: ['Docker'],
  },
  resources: {
    Docker: [
      { title: 'Docker Official Docs', url: 'https://docs.docker.com/get-started/', type: 'docs' },
      { title: 'Docker Tutorial', url: 'https://example.com/docker', type: 'video' },
    ],
  },
  mock_questions: [
    { question: 'Explain how RAG works.', category: 'technical' },
    { question: 'Tell me about a time you failed.', category: 'behavioral' },
  ],
  company_intel: {
    stage: 'series_a',
    tech_stack: ['Python', 'LangChain'],
    summary: 'LangChain Labs appears to be a Series A company.',
    interview_patterns: ['2 rounds, technical then HR'],
    key_people: [],
    recent_news: [],
  },
  created_at: '2026-08-10T10:00:00Z',
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/prep-guide/42']}>
      <Routes>
        <Route path="/prep-guide/:id" element={<PrepGuidePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PrepGuidePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all sections from mocked full data', async () => {
    getPrepGuide.mockResolvedValue(GUIDE)
    renderPage()

    // Header with Job context.
    expect(await screen.findByText('AI Engineer Intern')).toBeInTheDocument()
    expect(screen.getByText('LangChain Labs')).toBeInTheDocument()

    // Topics → TopicBadges. "Docker" appears twice (badge + resource
    // group heading), so use getAllByText for it.
    expect(screen.getByText('Python')).toBeInTheDocument()
    expect(screen.getByText('FastAPI')).toBeInTheDocument()
    expect(screen.getAllByText('Docker').length).toBeGreaterThanOrEqual(2)
    expect(
      screen.getAllByTitle('Gap: Docker').some((el) => el.textContent === 'Docker'),
    ).toBe(true)

    // Rounds → RoundCards with duration and prep tips.
    expect(screen.getByText('~60 min')).toBeInTheDocument()
    expect(screen.getByText('Technical Interview')).toBeInTheDocument()
    // Both rounds render their prep-tips callout.
    expect(screen.getAllByText('Prep tips').length).toBe(2)

    // Resources → clickable links opening in a new tab, safely.
    const dockerLink = screen.getByRole('link', { name: /docker official docs/i })
    expect(dockerLink).toHaveAttribute('href', 'https://docs.docker.com/get-started/')
    expect(dockerLink).toHaveAttribute('target', '_blank')
    expect(dockerLink).toHaveAttribute('rel', 'noopener noreferrer')

    // Mock questions → accordions, collapsed by default (question shows in
    // the toggle; the body copy is hidden until expanded).
    expect(screen.getAllByText('Explain how RAG works.').length).toBeGreaterThanOrEqual(1)

    // Company intel panel.
    expect(screen.getByText('Company intel')).toBeInTheDocument()
    // "Series A" appears in both the summary paragraph and the stage cell.
    expect(screen.getAllByText(/series a/i).length).toBeGreaterThanOrEqual(2)

    expect(getPrepGuide).toHaveBeenCalledWith(42)
  })

  it('shows the friendly not-ready state on a 404', async () => {
    getPrepGuide.mockRejectedValue(
      Object.assign(new Error('Prep guide not ready yet for this application.'), { status: 404 }),
    )
    renderPage()

    expect(await screen.findByText(/prep guide not ready yet/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to applications/i })).toBeInTheDocument()
  })

  it('shows the error state with retry on a network failure', async () => {
    const user = userEvent.setup()
    getPrepGuide.mockRejectedValueOnce(Object.assign(new Error('Backend unreachable.'), { status: 500 }))
    renderPage()

    expect(await screen.findByText(/couldn't load your prep guide/i)).toBeInTheDocument()

    getPrepGuide.mockResolvedValueOnce(GUIDE)
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('AI Engineer Intern')).toBeInTheDocument()
  })

  it('renders a calm fallback when company intel is sparse', async () => {
    getPrepGuide.mockResolvedValue({
      ...GUIDE,
      company_intel: {
        stage: '',
        tech_stack: [],
        summary: '',
        interview_patterns: [],
        key_people: [],
        recent_news: [],
      },
    })
    renderPage()

    expect(await screen.findByText(/we don't have much on this one yet/i)).toBeInTheDocument()
  })
})
