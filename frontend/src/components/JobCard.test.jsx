import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import JobCard from './JobCard.jsx'

const BASE_JOB = {
  job_id: 7,
  company_name: 'LangChain Labs',
  role_title: 'AI Engineer Intern',
  match_score: 0.85,
  skill_gaps: ['GraphQL', 'Docker', 'PostgreSQL', 'Kubernetes'],
  rank: 1,
  status: 'planned',
}

describe('JobCard', () => {
  it('renders company, role, score percentage and skill gaps', () => {
    render(<JobCard job={BASE_JOB} onRemove={() => {}} onPreviewResume={() => {}} />)

    expect(screen.getByText('LangChain Labs')).toBeInTheDocument()
    expect(screen.getByText('AI Engineer Intern')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument() // 0.85 → 85%
    expect(screen.getByRole('img', { name: /85% match/i })).toBeInTheDocument()

    // Top 3 gaps only, plus a "+1 more" indicator for the 4th.
    expect(screen.getByText('GraphQL')).toBeInTheDocument()
    expect(screen.getByText('Docker')).toBeInTheDocument()
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument()
    expect(screen.queryByText('Kubernetes')).not.toBeInTheDocument()
    expect(screen.getByText('+1 more')).toBeInTheDocument()
  })

  it('calls onRemove with the job id when Remove is clicked', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<JobCard job={BASE_JOB} onRemove={onRemove} onPreviewResume={() => {}} />)

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledWith(7)
  })

  it('calls onPreviewResume with the job id when Preview resume is clicked', async () => {
    const user = userEvent.setup()
    const onPreviewResume = vi.fn()
    render(<JobCard job={BASE_JOB} onRemove={() => {}} onPreviewResume={onPreviewResume} />)

    await user.click(screen.getByRole('button', { name: /preview resume/i }))

    expect(onPreviewResume).toHaveBeenCalledWith(7)
  })

  it('shows a positive message instead of an empty space when there are no skill gaps', () => {
    render(
      <JobCard
        job={{ ...BASE_JOB, skill_gaps: [] }}
        onRemove={() => {}}
        onPreviewResume={() => {}}
      />,
    )

    expect(screen.getByText('No skill gaps — great match!')).toBeInTheDocument()
  })

  it('handles a missing skill_gaps array without crashing', () => {
    const noGapsJob = { ...BASE_JOB }
    delete noGapsJob.skill_gaps
    render(<JobCard job={noGapsJob} onRemove={() => {}} onPreviewResume={() => {}} />)

    expect(screen.getByText('No skill gaps — great match!')).toBeInTheDocument()
  })
})
