import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getResumeDownloadUrl, getResumeLibrary } from '../api/client.js'
import { getCurrentUserId } from '../utils/currentUser.js'

const SKELETON_ROWS = 4

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function ResumeLibraryPage() {
  const userId = getCurrentUserId()

  const [resumes, setResumes] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [downloadingId, setDownloadingId] = useState(null)

  useEffect(() => {
    if (userId == null) return
    let cancelled = false

    getResumeLibrary(userId)
      .then((data) => {
        if (cancelled) return
        setResumes(data ?? [])
        setError(null)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message ?? 'Could not load your resumes.')
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [userId, refreshKey])

  /**
   * Trigger a real file download (not just opening the PDF in a tab):
   * fetch the PDF as a blob, then hand it to a temporary <a download>
   * so the browser saves it under the versioned filename.
   */
  const handleDownload = async (resume) => {
    const url = getResumeDownloadUrl(userId, resume.job_id)
    setDownloadingId(resume.job_id)
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Download failed (${response.status})`)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)

      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = `${resume.company_name}_${resume.role_title}_v${resume.resume_version ?? 1}.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      // Fall back to opening the PDF in a new tab if the blob path fails.
      window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setDownloadingId(null)
    }
  }

  if (userId == null) {
    return (
      <section className="page">
        <header className="page__header">
          <p className="page__eyebrow">Your generated resumes</p>
          <h1 className="page__title">Resume Library</h1>
        </header>
        <section className="panel panel--center">
          <p className="panel__eyebrow">No profile yet</p>
          <h2 className="panel__title">Let's set you up first</h2>
          <p className="panel__desc">
            Create your profile so we can save the tailored resumes we generate for you.
          </p>
          <div className="form__actions">
            <Link to="/profile" className="btn btn--primary">
              Create profile
            </Link>
          </div>
        </section>
      </section>
    )
  }

  return (
    <section className="page">
      <header className="page__header">
        <p className="page__eyebrow">Your generated resumes</p>
        <h1 className="page__title">Resume Library</h1>
        <p className="page__desc">
          Every tailored resume we've generated for you — each version saved, ready to download.
        </p>
      </header>

      {status === 'loading' && (
        <div className="flex flex-col gap-2" aria-label="Loading your resumes">
          {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
            <div key={index} className="skeleton-row rounded-xl border border-stone-200 bg-white" />
          ))}
        </div>
      )}

      {status === 'error' && (
        <section className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">
            !
          </span>
          <h2 className="empty-state__title">Couldn't load your resumes</h2>
          <p className="empty-state__desc">{error}</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setStatus('loading')
              setRefreshKey((key) => key + 1)
            }}
          >
            Try again
          </button>
        </section>
      )}

      {status === 'ready' && resumes.length === 0 && (
        <section className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">
            📄
          </span>
          <h2 className="empty-state__title">No resumes yet</h2>
          <p className="empty-state__desc">
            Your tailored resumes will appear here after you confirm your weekly plan — each one
            is generated fresh for the job you're applying to.
          </p>
          <Link to="/weekly-plan" className="btn btn--primary">
            Go to my weekly plan
          </Link>
        </section>
      )}

      {status === 'ready' && resumes.length > 0 && (
        <div className="data-table-wrap">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Role</th>
                  <th>Version</th>
                  <th>Date</th>
                  <th className="w-28 text-right">Download</th>
                </tr>
              </thead>
              <tbody>
                {resumes.map((resume) => (
                  <tr key={resume.job_id}>
                    <td className="font-medium text-stone-900">{resume.company_name}</td>
                    <td className="text-stone-600">{resume.role_title}</td>
                    <td>
                      <span className="pill">v{resume.resume_version ?? 1}</span>
                    </td>
                    <td className="text-stone-500">{formatDate(resume.created_at)}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => handleDownload(resume)}
                        disabled={downloadingId === resume.job_id}
                      >
                        {downloadingId === resume.job_id ? (
                          <>
                            <span className="spinner spinner--dark" aria-hidden="true" />
                            Downloading…
                          </>
                        ) : (
                          'Download'
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
