import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MockQuestion from './MockQuestion.jsx'

function renderQuestion(props = {}) {
  return render(<MockQuestion question="Explain how RAG works." category="technical" {...props} />)
}

describe('MockQuestion', () => {
  it('starts collapsed: body hidden, aria-expanded false', () => {
    renderQuestion()
    const toggle = screen.getByRole('button')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // The body content is hidden until expanded.
    const body = document.querySelector('.mock-q__body')
    expect(body).not.toBeVisible()
  })

  it('expands on click and toggles aria-expanded', async () => {
    const user = userEvent.setup()
    renderQuestion()
    const toggle = screen.getByRole('button')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(document.querySelector('.mock-q__body')).toBeVisible()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('.mock-q__body')).not.toBeVisible()
  })

  it('toggles with the keyboard (Enter/Space via the native button)', async () => {
    const user = userEvent.setup()
    renderQuestion()
    const toggle = screen.getByRole('button')

    toggle.focus()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard(' ')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('supports defaultExpanded', () => {
    renderQuestion({ defaultExpanded: true })
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    expect(document.querySelector('.mock-q__body')).toBeVisible()
  })
})
