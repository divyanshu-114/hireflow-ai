import axios from 'axios'

/**
 * Base URL is configurable per environment. Vite exposes VITE_* vars via
 * import.meta.env; anything else falls back to the local FastAPI backend.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

/** Consistent, UI-friendly error shape thrown by every failed request. */
export class ApiError extends Error {
  constructor(message, { status = null, detail = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  // NOTE: no global Content-Type header here on purpose. axios auto-sets
  // `application/json` for plain-object payloads, and a hardcoded JSON default
  // makes transformRequest stringify FormData uploads into a JSON body — which
  // breaks multipart PDF uploads (the backend 422s with "file: Field required").
})

/** Pull a human-readable string out of whatever `detail` shape the API sent. */
function detailToMessage(detail) {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    // FastAPI validation errors: [{ loc: [...], msg, type }]
    const first = detail[0]
    const field = first.loc?.filter((part) => part !== 'body').at(-1) ?? 'input'
    const msg = first.msg ?? 'is invalid'
    return `${field}: ${msg}`
  }
  if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
    return detail.message
  }
  return null
}

/** Normalize any axios failure into an ApiError the UI can render safely. */
function toApiError(error) {
  if (error instanceof ApiError) return error

  if (error.response) {
    // The server answered with an error status.
    const { status, data } = error.response
    const detail = data?.detail
    let message = detailToMessage(detail)

    if (status === 400) {
      message ??= "We couldn't save that. Please review the details and try again."
    } else if (status === 404) {
      message ??= "We couldn't find what you were looking for."
    } else if (status === 422) {
      message ??= 'Some of the information you entered is invalid. Please check the form.'
    } else if (status >= 500) {
      // Never leak stack traces or raw server internals to the user.
      message = 'Something went wrong on our end. Please try again in a moment.'
    }
    return new ApiError(message, { status, detail })
  }

  if (error.request) {
    // The request was sent but no response came back (e.g. backend is down).
    return new ApiError(
      `We couldn't reach the server at ${API_BASE_URL}. Make sure the backend is running and try again.`,
    )
  }

  return new ApiError(error.message ?? 'Something went wrong. Please try again.')
}

api.interceptors.response.use((response) => response, (error) => Promise.reject(toApiError(error)))

/**
 * Create a user profile.
 *
 * When a resume file is provided the request is sent as multipart/form-data to
 * POST /profile/upload (the backend's PDF intake route); otherwise it is sent
 * as JSON to POST /profile. Returns the created profile object.
 */
export async function createProfile({
  name,
  email,
  mode,
  skills,
  targetRoles = [],
  preferredLocations = [],
  weeklyQuota,
  resumeFile,
}) {
  if (resumeFile) {
    const formData = new FormData()
    formData.append('file', resumeFile)
    formData.append('name', name)
    formData.append('email', email)
    formData.append('mode', mode)
    formData.append('skills', skills.join(', '))
    formData.append('target_roles', targetRoles.join(', '))
    formData.append('preferred_locations', preferredLocations.join(', '))
    formData.append('weekly_quota', String(weeklyQuota))
    // No manual Content-Type: with no global JSON default, the FormData stays
    // intact and the browser sets multipart/form-data with the boundary.
    const { data } = await api.post('/profile/upload', formData)
    return data
  }

  const { data } = await api.post('/profile', {
    name,
    email,
    mode,
    skills,
    target_roles: targetRoles,
    preferred_locations: preferredLocations,
    weekly_quota: weeklyQuota,
    confirmation_mode: 'batch',
  })
  return data
}

/** Fetch a user profile by its database id. */
export async function getProfile(userId) {
  const { data } = await api.get(`/profile/${userId}`)
  return data
}

/**
 * Fetch (or lazily generate) the current weekly plan for a user.
 *
 * Batch mode returns the whole plan; individual mode paginates one job
 * per page — pass `page` for the latter.
 */
export async function getWeeklyPlan(userId, page = null) {
  const { data } = await api.get(`/weekly-plan/${userId}`, {
    params: page ? { page } : undefined,
  })
  return data
}

/**
 * Confirm the weekly plan — the safety gate. Only confirmed jobs trigger
 * resume generation; removed job ids are submitted here, not via swap.
 */
export async function confirmWeeklyPlan(userId, confirmedJobIds, removedJobIds = []) {
  const { data } = await api.post(`/weekly-plan/${userId}/confirm`, {
    confirmed_job_ids: confirmedJobIds,
    removed_job_ids: removedJobIds,
  })
  return data
}

/** Swap one planned job for a scored alternative (combined remove + add). */
export async function swapJob(userId, removeJobId, addJobId) {
  const { data } = await api.post(`/weekly-plan/${userId}/swap`, {
    remove_job_id: removeJobId,
    add_job_id: addJobId,
  })
  return data
}

/**
 * Fetch scored-but-not-planned jobs for a user — the candidate pool for
 * the "add the next ranked alternative" swap flow.
 */
export async function getPlanAlternatives(userId) {
  const { data } = await api.get(`/weekly-plan/${userId}/alternatives`)
  return data
}

/**
 * Fetch a user's applications, optionally filtered by status.
 *
 * The `status` query param is omitted entirely when no filter is given
 * (matching the backend contract).
 */
export async function getApplications(userId, statusFilter = null) {
  const { data } = await api.get(`/applications/${userId}`, {
    params: statusFilter ? { status: statusFilter } : undefined,
  })
  return data
}

/**
 * Construct the URL for an application's generated resume PDF.
 *
 * Not an axios call — this is used directly as an <iframe src>, so the
 * browser streams the PDF from the backend route.
 */
export function getResumePreviewUrl(userId, jobId) {
  return `${API_BASE_URL}/applications/${userId}/${jobId}/resume`
}

/**
 * Fetch the full prep guide for an application (rounds, topics, mock
 * questions, resources, company intel).
 */
export async function getPrepGuide(applicationId) {
  const { data } = await api.get(`/prep-guide/${applicationId}`)
  return data
}

/**
 * Fetch a user's resume library — every generated resume with display
 * context (company, role, version, date). The backend deliberately omits
 * server-side file paths.
 */
export async function getResumeLibrary(userId) {
  const { data } = await api.get(`/applications/${userId}/resumes`)
  return data
}

/**
 * Construct the URL used to download a resume's PDF.
 *
 * Not an axios call — this is used directly as the download link target
 * (the backend sets Content-Disposition with the versioned filename).
 */
export function getResumeDownloadUrl(userId, jobId) {
  return `${API_BASE_URL}/applications/${userId}/${jobId}/resume`
}
