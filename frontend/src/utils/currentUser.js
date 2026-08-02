/**
 * User identity helper (Issue 24).
 *
 * The project has no auth system yet, so the "current user" is whoever
 * created a profile in this browser. After a successful profile creation
 * the returned user id is persisted here so the Weekly Plan and
 * Applications pages know whose data to fetch across navigations.
 */

const USER_ID_KEY = 'hireflow_user_id'

/** Persist the current user's id after profile creation. */
export function setCurrentUserId(userId) {
  if (userId == null || Number.isNaN(Number(userId))) {
    localStorage.removeItem(USER_ID_KEY)
    return
  }
  localStorage.setItem(USER_ID_KEY, String(userId))
}

/**
 * Read the current user's id back from localStorage.
 *
 * Returns `null` when no profile has been created in this browser yet —
 * callers should render a friendly "create a profile first" state rather
 * than crash (or silently fetch for a user id of undefined).
 */
export function getCurrentUserId() {
  const raw = localStorage.getItem(USER_ID_KEY)
  if (raw == null || raw.trim() === '') return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/** Forget the stored user id (e.g. when resetting the profile flow). */
export function clearCurrentUserId() {
  localStorage.removeItem(USER_ID_KEY)
}
