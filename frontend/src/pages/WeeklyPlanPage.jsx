import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  confirmWeeklyPlan,
  getPlanAlternatives,
  getResumePreviewUrl,
  getWeeklyPlan,
  swapJob,
} from '../api/client.js'
import { getCurrentUserId } from '../utils/currentUser.js'
import JobCard from '../components/JobCard.jsx'
import ResumePreview from '../components/ResumePreview.jsx'

const SKELETON_ROWS = 3

export default function WeeklyPlanPage() {
  const navigate = useNavigate()
  const userId = getCurrentUserId()

  const [plan, setPlan] = useState([])
  const [pagination, setPagination] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)
  const [page, setPage] = useState(null) // individual-mode pagination
  const [refreshKey, setRefreshKey] = useState(0) // bump to re-fetch (retry)

  const [removedJobIds, setRemovedJobIds] = useState([])
  const [offer, setOffer] = useState(null) // { removeJobId, alternative }
  const [dismissedAltIds, setDismissedAltIds] = useState([])
  const [swapping, setSwapping] = useState(false)
  const [swapError, setSwapError] = useState(null)

  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState(null)

  const [preview, setPreview] = useState(null) // { jobId, title, url }

  // Fetch the plan. State is only updated inside the async .then/.catch
  // callbacks (never synchronously in the effect body) — this keeps the
  // mount effect free of cascading renders (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (userId == null) return
    let cancelled = false

    getWeeklyPlan(userId, page ?? null)
      .then((data) => {
        if (cancelled) return
        setPlan(data.applications ?? [])
        if (data.confirmation_mode === 'individual') {
          setPagination({
            page: data.page,
            totalPages: data.total_pages,
            hasNext: data.has_next,
            hasPrevious: data.has_previous,
          })
        } else {
          setPagination(null)
        }
        setError(null)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message ?? 'Could not load your weekly plan.')
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [userId, page, refreshKey])

  // ---- Remove + add-alternative (swap) flow -----------------------------

  const handleRemove = async (jobId) => {
    setPlan((prev) => prev.filter((job) => job.job_id !== jobId))
    setRemovedJobIds((prev) => [...prev, jobId])
    setConfirmError(null)

    // Offer the next ranked alternative. Issue 11's swap endpoint is a
    // combined remove+add, so we surface the top scored job not currently
    // in the plan and let the user swap it in explicitly.
    try {
      const data = await getPlanAlternatives(userId)
      const candidate = (data.alternatives ?? []).find(
        (alt) =>
          !plan.some((job) => job.job_id === alt.job_id) &&
          !removedJobIds.includes(alt.job_id) &&
          !dismissedAltIds.includes(alt.job_id),
      )
      if (candidate) setOffer({ removeJobId: jobId, alternative: candidate })
    } catch {
      // Alternatives are a nice-to-have — never block removal on them.
    }
  }

  const handleSwap = async () => {
    if (!offer || swapping) return
    setSwapping(true)
    setSwapError(null)
    try {
      const data = await swapJob(userId, offer.removeJobId, offer.alternative.job_id)
      setPlan(data.applications ?? [])
      setOffer(null)
      setRemovedJobIds((prev) => prev.filter((id) => id !== offer.removeJobId))
    } catch (err) {
      setSwapError(err?.message ?? 'Could not swap in the alternative job.')
    } finally {
      setSwapping(false)
    }
  }

  const dismissOffer = () => {
    if (!offer) return
    setDismissedAltIds((prev) => [...prev, offer.alternative.job_id])
    setOffer(null)
  }

  // ---- Confirm (the safety gate) ----------------------------------------

  const handleConfirm = async () => {
    if (confirming || plan.length === 0) return
    setConfirming(true)
    setConfirmError(null)
    try {
      await confirmWeeklyPlan(
        userId,
        plan.map((job) => job.job_id),
        removedJobIds,
      )
      navigate('/applications')
    } catch (err) {
      setConfirmError(err?.message ?? 'Could not confirm the plan. Please try again.')
      setConfirming(false)
    }
  }

  // ---- Resume preview ----------------------------------------------------

  const handlePreviewResume = (jobId) => {
    const job = plan.find((entry) => entry.job_id === jobId)
    setPreview({
      jobId,
      title: `${job?.role_title ?? 'Resume'} — ${job?.company_name ?? ''}`,
      url: getResumePreviewUrl(userId, jobId),
    })
  }

  // ---- No profile yet ----------------------------------------------------

  if (userId == null) {
    return (
      <section className="page">
        <header className="page__header">
          <p className="page__eyebrow">This week's targets</p>
          <h1 className="page__title">Weekly Plan</h1>
        </header>
        <section className="panel panel--center">
          <p className="panel__eyebrow">No profile yet</p>
          <h2 className="panel__title">Let's set you up first</h2>
          <p className="panel__desc">
            Create your profile so we can build a weekly application plan around your skills and
            targets.
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
        <p className="page__eyebrow">This week's targets</p>
        <h1 className="page__title">Weekly Plan</h1>
        <p className="page__desc">
          Review the week's best-matching jobs. Nothing is submitted until you confirm.
        </p>
      </header>

      {swapError && (
        <div className="banner banner--error mb-4" role="alert">
          <span className="banner__icon" aria-hidden="true">
            !
          </span>
          <p>{swapError}</p>
        </div>
      )}

      {confirmError && (
        <div className="banner banner--error mb-4" role="alert">
          <span className="banner__icon" aria-hidden="true">
            !
          </span>
          <p>{confirmError}</p>
        </div>
      )}

      {offer && (
        <div className="swap-banner" role="status">
          <div className="min-w-0">
            <p className="swap-banner__title">Add the next ranked alternative?</p>
            <p className="swap-banner__desc">
              Swap in {offer.alternative.role_title} at {offer.alternative.company_name} instead?
            </p>
          </div>
          <div className="swap-banner__actions">
            <button type="button" className="btn btn--primary btn--sm" onClick={handleSwap} disabled={swapping}>
              {swapping ? 'Swapping…' : 'Swap in'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={dismissOffer}>
              Not now
            </button>
          </div>
        </div>
      )}

      {pagination && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={!pagination.hasPrevious}
            onClick={() => {
              setStatus('loading')
              setPage((pagination.page ?? 1) - 1)
            }}
          >
            ← Previous
          </button>
          <span className="text-stone-500">
            Job {pagination.page} of {pagination.totalPages}
          </span>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={!pagination.hasNext}
            onClick={() => {
              setStatus('loading')
              setPage((pagination.page ?? 1) + 1)
            }}
          >
            Next →
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col gap-4" aria-label="Loading your weekly plan">
          {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
            <div key={index} className="skeleton-card">
              <div className="skeleton mb-3 h-4 w-24" />
              <div className="skeleton mb-2 h-6 w-64" />
              <div className="skeleton h-4 w-40" />
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <section className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">
            !
          </span>
          <h2 className="empty-state__title">Couldn't load your plan</h2>
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

      {status === 'ready' && plan.length === 0 && (
        <section className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">
            🗓
          </span>
          <h2 className="empty-state__title">Your plan is ready to fill</h2>
          <p className="empty-state__desc">
            No jobs are in your plan right now — they appear here after the next job-discovery run.
            If you already confirmed this week, check the application tracker.
          </p>
          <Link to="/applications" className="btn btn--primary">
            View applications
          </Link>
        </section>
      )}

      {status === 'ready' && plan.length > 0 && (
        <>
          <div className="flex flex-col gap-4">
            {plan.map((job) => (
              <JobCard
                key={job.job_id}
                job={job}
                onRemove={handleRemove}
                onPreviewResume={handlePreviewResume}
              />
            ))}
          </div>

          <div className="confirm-bar">
            <div className="confirm-bar__inner">
              <div>
                <p className="confirm-bar__title">Confirm &amp; Apply</p>
                <p className="confirm-bar__meta">
                  {plan.length} job{plan.length === 1 ? '' : 's'} confirmed · {removedJobIds.length}{' '}
                  removed
                </p>
              </div>
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={handleConfirm}
                disabled={confirming || plan.length === 0}
              >
                {confirming ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Confirming…
                  </>
                ) : (
                  `Confirm & apply (${plan.length})`
                )}
              </button>
            </div>
          </div>
        </>
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
