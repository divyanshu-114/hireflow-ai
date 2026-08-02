import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getApplications, getResumePreviewUrl } from '../api/client.js'
import { getCurrentUserId } from '../utils/currentUser.js'
import ResumePreview from '../components/ResumePreview.jsx'

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'applied', label: 'Applied' },
  { value: 'failed', label: 'Failed' },
  { value: 'needs_action', label: 'Needs action' },
]

const STATUS_LABELS = {
  pending: 'Pending',
  planned: 'Planned',
  confirmed: 'Confirmed',
  resume_pending: 'Resume pending',
  applying: 'Applying',
  applied: 'Applied',
  failed: 'Failed',
  needs_action: 'Needs action',
}

function StatusBadge({ status }) {
  const label = STATUS_LABELS[status] ?? status
  return <span className={`status-badge status-badge--${status ?? 'default'}`}>{label}</span>
}

function formatDate(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function ApplicationsPage() {
  const userId = getCurrentUserId()

  const [filter, setFilter] = useState('all')
  const [applications, setApplications] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0) // bump to re-fetch (retry)

  // Server-side filtering: the backend already supports ?status= and the
  // list grows with every weekly cycle, so we re-query rather than ship
  // the full history to the client and filter in memory.
  //
  // State is only updated inside the async .then/.catch callbacks (never
  // synchronously in the effect body) — react-hooks/set-state-in-effect.
  useEffect(() => {
    if (userId == null) return
    let cancelled = false

    getApplications(userId, filter === 'all' ? null : filter)
      .then((data) => {
        if (cancelled) return
        setApplications(data)
        setError(null)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message ?? 'Could not load your applications.')
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [userId, filter, refreshKey])

  const handlePreviewResume = (app) => {
    setPreview({
      jobId: app.job_id,
      title: `${app.role_title} — ${app.company_name}`,
      url: getResumePreviewUrl(userId, app.job_id),
    })
  }

  // ---- No profile yet ----------------------------------------------------

  if (userId == null) {
    return (
      <section className="page">
        <header className="page__header">
          <p className="page__eyebrow">Pipeline status</p>
          <h1 className="page__title">Applications</h1>
        </header>
        <section className="panel panel--center">
          <p className="panel__eyebrow">No profile yet</p>
          <h2 className="panel__title">Let's set you up first</h2>
          <p className="panel__desc">
            Create your profile and confirm a weekly plan — then every application will show up here
            as it moves through the pipeline.
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
        <p className="page__eyebrow">Pipeline status</p>
        <h1 className="page__title">Applications</h1>
        <p className="page__desc">
          Every application across the pipeline — statuses, dates, and anything that needs your
          attention.
        </p>
      </header>

      <div className="mb-4" role="group" aria-label="Filter applications by status">
        <div className="filter-tabs">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              className={`filter-tabs__option${filter === item.value ? ' is-active' : ''}`}
              onClick={() => {
                setStatus('loading')
                setFilter(item.value)
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="banner banner--error mb-4" role="alert">
          <span className="banner__icon" aria-hidden="true">
            !
          </span>
          <p>{error}</p>
        </div>
      )}

      {status === 'loading' && (
        <div className="data-table-wrap" aria-label="Loading applications">
          <table className="data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Status</th>
                <th>Applied</th>
                <th>Resume</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, index) => (
                <tr key={index}>
                  <td>
                    <div className="skeleton skeleton-row w-28" />
                  </td>
                  <td>
                    <div className="skeleton skeleton-row w-44" />
                  </td>
                  <td>
                    <div className="skeleton skeleton-row w-20" />
                  </td>
                  <td>
                    <div className="skeleton skeleton-row w-24" />
                  </td>
                  <td>
                    <div className="skeleton skeleton-row w-16" />
                  </td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {status === 'error' && (
        <section className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">
            !
          </span>
          <h2 className="empty-state__title">Couldn't load applications</h2>
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

      {status === 'ready' && applications.length === 0 && (
        <section className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">
            📋
          </span>
          <h2 className="empty-state__title">
            {filter === 'all' ? 'No applications yet' : `No ${filter.replace('_', ' ')} applications`}
          </h2>
          <p className="empty-state__desc">
            {filter === 'all'
              ? 'Confirm your weekly plan and your applications will appear here as they move through the pipeline.'
              : 'Try a different filter, or check back after the next application run.'}
          </p>
          <Link to="/weekly-plan" className="btn btn--primary">
            Go to weekly plan
          </Link>
        </section>
      )}

      {status === 'ready' && applications.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Status</th>
                <th>Applied</th>
                <th>Resume</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => {
                const isExpanded = expandedId === app.id
                const needsAction = app.status === 'needs_action'
                return (
                  <Fragment key={app.id}>
                    <tr>
                      <td className="font-semibold text-stone-900">{app.company_name}</td>
                      <td className="text-stone-700">{app.role_title}</td>
                      <td>
                        <StatusBadge status={app.status} />
                      </td>
                      <td className="text-stone-500">{formatDate(app.applied_at)}</td>
                      <td>
                        {app.resume_path ? (
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => handlePreviewResume(app)}
                          >
                            View resume
                          </button>
                        ) : (
                          <span className="text-[13px] text-stone-400">—</span>
                        )}
                      </td>
                      <td>
                        {needsAction && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            aria-expanded={isExpanded}
                            onClick={() => setExpandedId(isExpanded ? null : app.id)}
                          >
                            {isExpanded ? 'Hide apply link' : 'Apply link'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {needsAction && isExpanded && (
                      <tr className="data-table__expand">
                        <td colSpan={6} className="px-4 py-3">
                          <p className="mb-1 text-[12px] font-semibold tracking-[0.06em] text-stone-500 uppercase">
                            Manual application link
                          </p>
                          {app.manual_application_url ? (
                            <a
                              className="apply-link"
                              href={app.manual_application_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {app.manual_application_url}
                            </a>
                          ) : (
                            <span className="text-sm text-stone-500">
                              No apply link was recorded for this application.
                            </span>
                          )}
                          {app.failure_reason && (
                            <p className="mt-2 text-[13px] font-medium text-red-700">
                              {app.failure_reason}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {preview && (
        <ResumePreview
          isOpen
          onClose={() => setPreview(null)}
          resumeUrl={preview.url}
          jobTitle={preview.title}
        />
      )}
    </section>
  )
}
