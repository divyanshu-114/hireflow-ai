import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TopicBadge from './TopicBadge.jsx'

describe('TopicBadge', () => {
  it('renders green tones for strong topics', () => {
    render(<TopicBadge status="strong" label="Python" />)
    const badge = screen.getByText('Python')
    expect(badge.className).toContain('bg-green-100')
    expect(badge.className).toContain('text-green-800')
    expect(badge.className).toContain('border-green-200')
  })

  it('renders yellow tones for moderate topics', () => {
    render(<TopicBadge status="moderate" label="FastAPI" />)
    const badge = screen.getByText('FastAPI')
    expect(badge.className).toContain('bg-yellow-100')
    expect(badge.className).toContain('text-yellow-800')
    expect(badge.className).toContain('border-yellow-200')
  })

  it('renders red tones for gaps', () => {
    render(<TopicBadge status="gap" label="Docker" />)
    const badge = screen.getByText('Docker')
    expect(badge.className).toContain('bg-red-100')
    expect(badge.className).toContain('text-red-800')
    expect(badge.className).toContain('border-red-200')
  })

  it('degrades to neutral gray for an unknown status without crashing', () => {
    render(<TopicBadge status="mystery-status" label="SQL" />)
    const badge = screen.getByText('SQL')
    expect(badge.className).toContain('bg-stone-100')
    expect(badge.className).toContain('text-stone-600')
  })
})
