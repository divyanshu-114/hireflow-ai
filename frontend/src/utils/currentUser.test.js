import { describe, it, expect, beforeEach } from 'vitest'
import { setCurrentUserId, getCurrentUserId, clearCurrentUserId } from './currentUser.js'

describe('currentUser identity helper', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null when nothing has been stored', () => {
    expect(getCurrentUserId()).toBeNull()
  })

  it('round-trips an id set via setCurrentUserId', () => {
    setCurrentUserId(42)
    expect(getCurrentUserId()).toBe(42)
  })

  it('parses string ids from storage', () => {
    localStorage.setItem('hireflow_user_id', '7')
    expect(getCurrentUserId()).toBe(7)
  })

  it('returns null for invalid stored values', () => {
    localStorage.setItem('hireflow_user_id', 'abc')
    expect(getCurrentUserId()).toBeNull()
    localStorage.setItem('hireflow_user_id', '-3')
    expect(getCurrentUserId()).toBeNull()
  })

  it('clears the stored id', () => {
    setCurrentUserId(42)
    clearCurrentUserId()
    expect(getCurrentUserId()).toBeNull()
  })

  it('ignores null/NaN input to setCurrentUserId', () => {
    setCurrentUserId(null)
    expect(getCurrentUserId()).toBeNull()
  })
})
