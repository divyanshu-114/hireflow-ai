import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ResumeLibraryPage from './ResumeLibraryPage.jsx'
import { getResumeDownloadUrl, getResumeLibrary } from '../api/client.js'

vi.mock('../api/client.js', () => ({
  getResumeLibrary: vi.fn(),
  getResumeDownloadUrl: vi.fn(),
}))

vi.mock('../utils/currentUser.js', () => ({
  getCurrentUserId: () => 1,
}))

const RESUMES = [
  {
    job_id: 11,
    company_name: 'LangChain Labs',
    role_title: 'AI Engineer Intern',
    resume_version: 2,
    created_at: '2026-08-10T10:00:00Z',
  },
  {
    job_id: 12,
    company_name: 'VectorDB Co',
    role_title: 'RAG Engineer',
    resume_version: 1,
    created_at: '2026-08-11T10:00:00Z',
  },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/resumes']}>
      <ResumeLibraryPage />
    </MemoryRouter>,
  )
}

describe('ResumeLibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getResumeLibrary.mockResolvedValue(RESUMES)
    getResumeDownloadUrl.mockReturnValue('http://localhost:8000/applications/1/11/resume')
  })

  it('renders the list of resumes from the API', async () => {
    renderPage()

    expect(await screen.findByText('LangChain Labs')).toBeInTheDocument()
    expect(screen.getByText('VectorDB Co')).toBeInTheDocument()
    expect(screen.getByText('AI Engineer Intern')).toBeInTheDocument()
    expect(screen.getByText('v2')).toBeInTheDocument()
    expect(screen.getByText('v1')).toBeInTheDocument()
    expect(getResumeLibrary).toHaveBeenCalledWith(1)
  })

  it('shows the empty state when there are no resumes', async () => {
    getResumeLibrary.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText(/no resumes yet/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go to my weekly plan/i })).toBeInTheDocument()
  })

  it('triggers a blob download when Download is clicked', async () => {
    const user = userEvent.setup()
    const originalCreate = URL.createObjectURL
    const originalRevoke = URL.revokeObjectURL
    const createSpy = vi.fn(() => 'blob:fake-url')
    URL.createObjectURL = createSpy
    URL.revokeObjectURL = vi.fn()

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, blob: async () => new Blob(['pdf']) })

    renderPage()
    await screen.findByText('LangChain Labs')

    await user.click(screen.getAllByRole('button', { name: /download/i })[0])

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/applications/1/11/resume')
      expect(createSpy).toHaveBeenCalled()
    })
    // Download anchors are created and clicked then cleaned up.
    await waitFor(() => {
      const anchor = document.querySelector('a[download]')
      expect(anchor).toBeNull()
    })

    fetchMock.mockRestore()
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  })

  it('shows the error state with retry when the fetch fails', async () => {
    const user = userEvent.setup()
    getResumeLibrary.mockRejectedValueOnce(Object.assign(new Error('Backend unreachable.'), { status: 500 }))

    renderPage()

    expect(await screen.findByText(/couldn't load your resumes/i)).toBeInTheDocument()

    getResumeLibrary.mockResolvedValueOnce(RESUMES)
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('LangChain Labs')).toBeInTheDocument()
  })
})
