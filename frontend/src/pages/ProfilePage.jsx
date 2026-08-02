import { useState } from 'react'
import { createProfile } from '../api/client.js'
import ModeSelector from '../components/ModeSelector.jsx'
import TagInput from '../components/TagInput.jsx'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_RESUME_MB = 10

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function SkillIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="m8 2 1.2 3.3L12.5 6.5 9.2 7.7 8 11l-1.2-3.3L3.5 6.5l3.3-1.2L8 2Z"
        fill="currentColor"
      />
      <path
        d="m14 9 .8 2.2 2.2.8-2.2.8L14 15l-.8-2.2-2.2-.8 2.2-.8L14 9Z"
        fill="currentColor"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M4 10.5 8 14.5 16 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const INITIAL_FORM = {
  name: '',
  email: '',
  skills: [],
  targetRoles: [],
  preferredLocations: [],
  mode: 'internship',
  weeklyQuota: '10',
  resumeFile: null,
}

function validate(form) {
  const errors = {}

  if (!form.name.trim()) {
    errors.name = 'Please enter your name.'
  }

  if (!form.email.trim()) {
    errors.email = 'Please enter your email address.'
  } else if (!EMAIL_RE.test(form.email.trim())) {
    errors.email = "That email doesn't look right — please double-check it."
  }

  if (form.skills.length === 0) {
    errors.skills = 'Add at least one skill (type one and press Enter).'
  }

  if (!form.mode) {
    errors.mode = 'Choose an application mode.'
  }

  const quota = Number(form.weeklyQuota)
  if (form.weeklyQuota.trim() === '' || !Number.isInteger(quota) || quota < 1 || quota > 20) {
    errors.weeklyQuota = 'Weekly quota must be a whole number between 1 and 20.'
  }

  return errors
}

export default function ProfilePage() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle') // idle | submitting | success
  const [serverError, setServerError] = useState(null)
  const [createdProfile, setCreatedProfile] = useState(null)

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  // ---- Resume upload ------------------------------------------------------

  const handleResumeChange = (event) => {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      // Picker cancelled — drop any lingering resume error.
      setErrors((prev) => ({ ...prev, resume: undefined }))
      return
    }
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      // Reset the input so the same invalid file can be re-selected and retried.
      event.target.value = ''
      setErrors((prev) => ({ ...prev, resume: 'Please upload a PDF file.' }))
      return
    }
    setErrors((prev) => ({ ...prev, resume: undefined }))
    setForm((prev) => ({ ...prev, resumeFile: file }))
  }

  const handleResumeDrop = (event) => {
    event.preventDefault()
    const file = event.dataTransfer?.files?.[0] ?? null
    if (!file) return
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setErrors((prev) => ({ ...prev, resume: 'Please drop a PDF file.' }))
      return
    }
    setErrors((prev) => ({ ...prev, resume: undefined }))
    setForm((prev) => ({ ...prev, resumeFile: file }))
  }

  const clearResume = () => setForm((prev) => ({ ...prev, resumeFile: null }))

  // ---- Submit -------------------------------------------------------------

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (status === 'submitting') return

    const nextErrors = validate(form)
    setErrors(nextErrors)
    setServerError(null)

    if (Object.keys(nextErrors).length > 0) {
      setStatus('idle')
      return
    }

    setStatus('submitting')
    try {
      const profile = await createProfile({
        name: form.name.trim(),
        email: form.email.trim(),
        mode: form.mode,
        skills: form.skills,
        targetRoles: form.targetRoles,
        preferredLocations: form.preferredLocations,
        weeklyQuota: Number(form.weeklyQuota),
        resumeFile: form.resumeFile,
      })
      setCreatedProfile(profile)
      setStatus('success')
    } catch (error) {
      setServerError(error?.message ?? 'Something went wrong. Please try again.')
      setStatus('idle')
    }
  }

  const resetForm = () => {
    setForm(INITIAL_FORM)
    setErrors({})
    setServerError(null)
    setCreatedProfile(null)
    setStatus('idle')
  }

  // ---- Success view -------------------------------------------------------

  if (status === 'success') {
    return (
      <section className="panel" aria-live="polite">
        <div className="success">
          <span className="success__icon">
            <CheckIcon />
          </span>
          <h1 className="panel__title">You're all set, {createdProfile.name.split(' ')[0]}!</h1>
          <p className="success__id">
            Profile created! Your ID is <strong>#{createdProfile.id}</strong>
          </p>
          <p className="panel__desc">
            Your profile is live and the HireFlow pipeline knows exactly what to look for. Here's
            what we saved:
          </p>
          <dl className="success__details">
            <div className="success__detail">
              <dt>Mode</dt>
              <dd className="capitalize">{createdProfile.mode}</dd>
            </div>
            <div className="success__detail">
              <dt>Weekly quota</dt>
              <dd>{createdProfile.weekly_quota} applications</dd>
            </div>
          </dl>
          <div className="form__actions">
            <button type="button" className="btn btn--primary" onClick={resetForm}>
              Set up another profile
            </button>
          </div>
        </div>
      </section>
    )
  }

  // ---- Form view ----------------------------------------------------------

  return (
    <section className="panel">
      <header className="panel__header">
        <p className="panel__eyebrow">Step 1 of 1</p>
        <h1 className="panel__title">Set up your profile</h1>
        <p className="panel__desc">
          Tell us who you are and what you're hunting for. This takes about a minute and powers
          everything else in HireFlow.
        </p>
      </header>

      {serverError && (
        <div className="banner banner--error" role="alert">
          <span className="banner__icon" aria-hidden="true">
            !
          </span>
          <p>{serverError}</p>
        </div>
      )}

      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className={`field${errors.name ? ' field--has-error' : ''}`}>
          <label className="field__label" htmlFor="name">
            Full name <span className="field__req" aria-hidden="true">*</span>
          </label>
          <input
            id="name"
            className="field__control"
            type="text"
            name="name"
            autoComplete="name"
            placeholder="Ada Lovelace"
            value={form.name}
            onChange={(event) => setField('name', event.target.value)}
            aria-required="true"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'name-error' : undefined}
          />
          {errors.name && (
            <p id="name-error" className="field__error" role="alert">
              {errors.name}
            </p>
          )}
        </div>

        <div className={`field${errors.email ? ' field--has-error' : ''}`}>
          <label className="field__label" htmlFor="email">
            Email address <span className="field__req" aria-hidden="true">*</span>
          </label>
          <input
            id="email"
            className="field__control"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="ada@example.com"
            value={form.email}
            onChange={(event) => setField('email', event.target.value)}
            aria-required="true"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email && (
            <p id="email-error" className="field__error" role="alert">
              {errors.email}
            </p>
          )}
        </div>

        <TagInput
          id="skills"
          label="Skills"
          required
          chips={form.skills}
          onChange={(skills) => setField('skills', skills)}
          placeholder="Type a skill and press Enter"
          hint={
            <>
              Press Enter after each one — e.g. <SkillIcon /> Python, React, SQL
            </>
          }
          error={errors.skills}
        />

        <TagInput
          id="target-roles"
          label="Target roles"
          chips={form.targetRoles}
          onChange={(targetRoles) => setField('targetRoles', targetRoles)}
          placeholder="Type a role and press Enter"
          hint="e.g. AI Engineer Intern, ML Developer — optional"
        />

        <TagInput
          id="locations"
          label="Location preferences"
          chips={form.preferredLocations}
          onChange={(preferredLocations) => setField('preferredLocations', preferredLocations)}
          placeholder="Type a location and press Enter"
          hint="e.g. Bangalore, Remote — optional"
        />

        <div className={`field${errors.resume ? ' field--has-error' : ''}`}>
          <span className="field__label" id="resume-label">
            Resume
          </span>
          <div
            className={`file-drop${form.resumeFile ? ' has-file' : ''}${errors.resume ? ' is-error' : ''}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleResumeDrop}
          >
            <input
              id="resume"
              className="file-drop__input"
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleResumeChange}
              aria-labelledby="resume-label"
              aria-describedby={errors.resume ? 'resume-error' : 'resume-hint'}
            />
            <label htmlFor="resume" className="file-drop__label">
              {form.resumeFile ? (
                <span className="file-drop__file">
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="M6 2.5h5L15 6.5V17a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 6 17V2.5Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M11 2.5V7h4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="file-drop__meta">
                    <strong>{form.resumeFile.name}</strong>
                    <span>{formatBytes(form.resumeFile.size)} · PDF</span>
                  </span>
                </span>
              ) : (
                <span className="file-drop__prompt">
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      d="M10 13V4m0 0L6.5 7.5M10 4l3.5 3.5M4 13.5v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>
                    <strong>Upload your resume</strong>
                    <span>PDF, up to {MAX_RESUME_MB} MB — optional</span>
                  </span>
                </span>
              )}
            </label>
            {form.resumeFile && (
              <button type="button" className="file-drop__remove" onClick={clearResume}>
                Remove
              </button>
            )}
          </div>
          <p id="resume-hint" className="field__hint">
            Optional — a PDF lets us extract skills automatically, or just add them above.
          </p>
          {errors.resume && (
            <p id="resume-error" className="field__error" role="alert">
              {errors.resume}
            </p>
          )}
        </div>

        <div className={`field${errors.mode ? ' field--has-error' : ''}`}>
          <span className="field__label" id="mode-label">
            What are you looking for? <span className="field__req" aria-hidden="true">*</span>
          </span>
          <ModeSelector
            id="mode"
            name="mode"
            value={form.mode}
            onChange={(mode) => setField('mode', mode)}
          />
          {errors.mode && (
            <p id="mode-error" className="field__error" role="alert">
              {errors.mode}
            </p>
          )}
        </div>

        <div className={`field${errors.weeklyQuota ? ' field--has-error' : ''}`}>
          <label className="field__label" htmlFor="weekly-quota">
            Weekly application quota
          </label>
          <input
            id="weekly-quota"
            className="field__control field__control--number"
            type="number"
            name="weeklyQuota"
            min="1"
            max="20"
            step="1"
            inputMode="numeric"
            value={form.weeklyQuota}
            onChange={(event) => setField('weeklyQuota', event.target.value)}
            aria-invalid={Boolean(errors.weeklyQuota)}
            aria-describedby="quota-hint quota-error"
          />
          <p id="quota-hint" className="field__hint">
            How many applications we target each week — between 1 and 20.
          </p>
          {errors.weeklyQuota && (
            <p id="quota-error" className="field__error" role="alert">
              {errors.weeklyQuota}
            </p>
          )}
        </div>

        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={status === 'submitting'}>
            {status === 'submitting' ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Saving profile…
              </>
            ) : (
              'Save profile'
            )}
          </button>
          <p className="form__note">No credit card required — this is the whole setup.</p>
        </div>
      </form>
    </section>
  )
}
