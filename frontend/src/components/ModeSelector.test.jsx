import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModeSelector from './ModeSelector.jsx'

describe('ModeSelector', () => {
  it('renders both options with Internship active by default', () => {
    render(<ModeSelector value="internship" onChange={() => {}} />)

    const internship = screen.getByRole('radio', { name: /internship/i })
    const job = screen.getByRole('radio', { name: /job/i })

    expect(internship).toBeInTheDocument()
    expect(job).toBeInTheDocument()
    expect(internship).toHaveAttribute('aria-checked', 'true')
    expect(job).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onChange with "job" when the Job option is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ModeSelector value="internship" onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: /job/i }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('job')
  })

  it('calls onChange with "internship" when the Internship option is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ModeSelector value="job" onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: /internship/i }))

    expect(onChange).toHaveBeenCalledWith('internship')
  })

  it('moves between options with the arrow keys', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ModeSelector value="internship" onChange={onChange} />)

    const internship = screen.getByRole('radio', { name: /internship/i })
    internship.focus()
    await user.keyboard('{ArrowRight}')

    expect(onChange).toHaveBeenCalledWith('job')
  })

  it('selects via keyboard (ArrowRight then Enter)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ModeSelector value="internship" onChange={onChange} />)

    const internship = screen.getByRole('radio', { name: /internship/i })
    internship.focus()
    await user.keyboard('{ArrowRight}') // focus moves to Job
    await user.keyboard('{Enter}') // activates the focused (Job) option

    expect(onChange).toHaveBeenCalledWith('job')
  })

  it('does not call onChange when the already-active option is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ModeSelector value="internship" onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: /internship/i }))

    expect(onChange).not.toHaveBeenCalled()
  })
})
