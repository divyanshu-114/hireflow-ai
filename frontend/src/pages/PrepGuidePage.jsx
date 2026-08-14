import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getPrepGuide } from '../api/client.js'
import RoundCard from '../components/RoundCard.jsx'
import TopicBadge from '../components/TopicBadge.jsx'
import MockQuestion from '../components/MockQuestion.jsx'

const SKELETON_BLOCKS = 3

const CATEGORY_ORDER = ['technical', 'behavioral', 'design']

function groupByCategory(questions = []) {
  const grouped = new Map()
  for (const q of questions) {
    const key = q.category || 'general'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(q)
  }
  return grouped
}

function CompanyIntel({ intel }) {
  if (!intel) return null

  const { stage, tech_stack = [], summary, interview_patterns = [], key_people = [] } = intel
  const hasData = stage || tech_stack.length > 0 || summary || interview_patterns.length > 0

  if (!hasData) {
    // Issue 19's "no interview reviews found" fallback — calm, honest, not an error.
    return (
      <section className="prep-section">
        <h2 className="prep-section__title">Company intel</h2>
        <div className="intel-panel">
          <p className="intel-panel__empty">
            We don't have much on this one yet — new or small companies often don't have much
            public interview data. Your rounds and mock questions above are built from the job
            description itself, so you're still covered.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="prep-section">
      <h2 className="prep-section__title">Company intel</h2>
      <div className="intel-panel">
        {summary && <p className="intel-panel__summary">{summary}</p>}
        <dl className="intel-panel__grid">
          {stage && (
            <div className="intel-panel__cell">
              <dt>Stage</dt>
              <dd>{stage.replace(/_/g, ' ')}</dd>
            </div>
          )}
          {tech_stack.length > 0 && (
            <div className="intel-panel__cell">
              <dt>Tech stack</dt>
              <dd>{tech_stack.join(', ')}</dd>
            </div>
          )}
          {interview_patterns.length > 0 && (
            <div className="intel-panel__cell">
              <dt>Interview patterns</dt>
              <dd>{interview_patterns.join(' · ')}</dd>
            </div>
          )}
          {key_people.length > 0 && (
            <div className="intel-panel__cell">
              <dt>Key people</dt>
              <dd>{key_people.join(', ')}</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  )
}

function ResourcesSection({ resources }) {
  if (!resources || Object.keys(resources).length === 0) return null

  return (
    <section className="prep-section">
      <h2 className="prep-section__title">Resources</h2>
      <div className="prep-section__stack">
        {Object.entries(resources).map(([topic, links]) => (
          <div key={topic} className="resource-group">
            <h3 className="resource-group__topic">{topic}</h3>
            <ul className="resource-group__list">
              {(links ?? []).map((link, index) => (
                <li key={`${link.url}-${index}`}>
                  <a
                    className="resource-link"
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.title || link.url}
                    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                      <path
                        d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10M10 2h4v4M14 2 7 9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function PrepGuidePage() {
  const { id } = useParams()
  const applicationId = id ? Number.parseInt(id, 10) : null

  const [guide, setGuide] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | not_ready | error
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (applicationId == null) return
    let cancelled = false

    getPrepGuide(applicationId)
      .then((data) => {
        if (cancelled) return
        setGuide(data)
        setError(null)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        if (err?.status === 404) {
          // Expected case — the guide just hasn't been generated yet.
          setStatus('not_ready')
        } else {
          setError(err?.message ?? 'Could not load your prep guide.')
          setStatus('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [applicationId, refreshKey])

  const rounds = guide?.interview_rounds?.rounds ?? []
  const topics = guide?.topics_to_prepare ?? {}
  const questions = guide?.mock_questions ?? []
  const questionsByCategory = groupByCategory(questions)

  return (
    <section className="page">
      <header className="page__header">
        <p className="page__eyebrow">Interview prep</p>
        {status === 'ready' && guide ? (
          <>
            <h1 className="page__title">{guide.role_title}</h1>
            <p className="page__desc">
              At <strong className="font-semibold text-stone-900">{guide.company_name}</strong> —
              everything you need for the night before the interview.
            </p>
          </>
        ) : (
          <h1 className="page__title">Prep Guide</h1>
        )}
      </header>

      {status === 'loading' && (
        <div className="flex flex-col gap-4" aria-label="Loading your prep guide">
          {Array.from({ length: SKELETON_BLOCKS }).map((_, index) => (
            <div key={index} className="skeleton-card">
              <div className="skeleton mb-3 h-4 w-32" />
              <div className="skeleton mb-2 h-6 w-64" />
              <div className="skeleton h-4 w-48" />
            </div>
          ))}
        </div>
      )}

      {status === 'not_ready' && (
        <section className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">
            📝
          </span>
          <h2 className="empty-state__title">Prep guide not ready yet</h2>
          <p className="empty-state__desc">
            This guide is generated after your application is confirmed — check back in a little
            while. Nothing's wrong; it just needs a moment.
          </p>
          <Link to="/applications" className="btn btn--primary">
            Back to applications
          </Link>
        </section>
      )}

      {status === 'error' && (
        <section className="empty-state">
          <span className="empty-state__icon" aria-hidden="true">
            !
          </span>
          <h2 className="empty-state__title">Couldn't load your prep guide</h2>
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

      {status === 'ready' && guide && (
        <>
          {topics && Object.keys(topics).length > 0 && (
            <section className="prep-section">
              <h2 className="prep-section__title">Topics to prepare</h2>
              <div className="topic-group">
                {(['strong', 'moderate', 'gaps']).map((bucket) =>
                  (topics[bucket] ?? []).map((topic) => (
                    <TopicBadge
                      key={`${bucket}-${topic}`}
                      status={bucket === 'gaps' ? 'gap' : bucket}
                      label={topic}
                    />
                  )),
                )}
              </div>
            </section>
          )}

          {rounds.length > 0 && (
            <section className="prep-section">
              <h2 className="prep-section__title">Interview rounds</h2>
              <div className="prep-section__stack">
                {rounds.map((round) => (
                  <RoundCard key={round.number ?? round.label} round={round} />
                ))}
              </div>
            </section>
          )}

          {questions.length > 0 && (
            <section className="prep-section">
              <h2 className="prep-section__title">Mock questions</h2>
              <div className="prep-section__stack">
                {CATEGORY_ORDER.filter((cat) => questionsByCategory.has(cat)).map((cat) => (
                  <div key={cat} className="mock-group">
                    <h3 className="mock-group__cat">{cat.replace(/_/g, ' ')}</h3>
                    <div className="prep-section__stack">
                      {questionsByCategory.get(cat).map((q, index) => (
                        <MockQuestion key={`${q.question}-${index}`} question={q.question} category={q.category} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <ResourcesSection resources={guide.resources} />

          <CompanyIntel intel={guide.company_intel} />
        </>
      )}
    </section>
  )
}
