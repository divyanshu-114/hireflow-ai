import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ProfilePage from './ProfilePage.jsx'
import { createProfile } from '../api/client.js'

vi.mock('../api/client.js', () => ({
  createProfile: vi.fn(),
  getProfile: vi.fn(),
}))

// ProfilePage uses useNavigate (Issue 24) — it must render inside a Router.
function renderPage() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  )
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing and shows all required fields', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: /set up your profile/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/skills/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/target roles/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/location preferences/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/resume/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/weekly application quota/i)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /internship/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save profile/i })).toBeInTheDocument()
  })

  it('shows inline validation errors when required fields are missing', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(screen.getByText('Please enter your name.')).toBeInTheDocument()
    expect(screen.getByText('Please enter your email address.')).toBeInTheDocument()
    expect(screen.getByText(/add at least one skill/i)).toBeInTheDocument()
    expect(createProfile).not.toHaveBeenCalled()
  })

  it('rejects an invalid email format', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace')
    await user.type(screen.getByLabelText(/email address/i), 'not-an-email')
    await user.type(screen.getByLabelText(/skills/i), 'Python{Enter}')
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(screen.getByText(/that email doesn't look right/i)).toBeInTheDocument()
    expect(createProfile).not.toHaveBeenCalled()
  })

  it('adds chips on Enter and submits all fields, showing the returned user ID on success', async () => {
    const user = userEvent.setup()
    createProfile.mockResolvedValue({
      id: 1,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      mode: 'internship',
      weekly_quota: 10,
    })
    renderPage()

    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace')
    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/skills/i), 'Python{Enter}')
    await user.type(screen.getByLabelText(/target roles/i), 'AI Engineer Intern{Enter}')
    await user.type(screen.getByLabelText(/location preferences/i), 'Remote{Enter}')

    expect(screen.getByText('Python')).toBeInTheDocument()
    expect(screen.getByText('AI Engineer Intern')).toBeInTheDocument()
    expect(screen.getByText('Remote')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(createProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        mode: 'internship',
        skills: ['Python'],
        targetRoles: ['AI Engineer Intern'],
        preferredLocations: ['Remote'],
        weeklyQuota: 10,
        resumeFile: null,
      }),
    )

    // Acceptance criterion: the success message displays the returned user ID.
    expect(await screen.findByRole('heading', { name: /you're all set, ada!/i })).toBeInTheDocument()
    expect(screen.getByText(/Profile created!/i)).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument()
  })

  it('rejects a non-PDF resume file with an inline error', async () => {
    renderPage()

    const input = screen.getByLabelText(/resume/i)
    const badFile = new File(['hello'], 'resume.txt', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [badFile] } })

    expect(screen.getByText('Please upload a PDF file.')).toBeInTheDocument()
    expect(input.value).toBe('')
  })

  it('rejects a weekly quota outside the 1-20 range', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace')
    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/skills/i), 'Python{Enter}')
    const quota = screen.getByLabelText(/weekly application quota/i)
    await user.clear(quota)
    await user.type(quota, '25')
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(screen.getByText(/weekly quota must be a whole number between 1 and 20/i)).toBeInTheDocument()
    expect(createProfile).not.toHaveBeenCalled()
  })

  it('shows a friendly inline error when the API fails and keeps the form data', async () => {
    const user = userEvent.setup()
    createProfile.mockRejectedValue(
      Object.assign(new Error('A user with this email address is already registered.'), {
        status: 400,
      }),
    )
    renderPage()

    await user.type(screen.getByLabelText(/full name/i), 'Ada Lovelace')
    await user.type(screen.getByLabelText(/email address/i), 'ada@example.com')
    await user.type(screen.getByLabelText(/skills/i), 'Python{Enter}')
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(await screen.findByText(/already registered/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/full name/i)).toHaveValue('Ada Lovelace')
    expect(screen.getByLabelText(/email address/i)).toHaveValue('ada@example.com')
  })
})
