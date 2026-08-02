import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import axios from 'axios'

/**
 * Regression test for the reported bug: POST /profile/upload returned
 * 422 "file: Field required" from the real backend.
 *
 * Root cause: the axios instance was created with a global default
 * `Content-Type: application/json` header. axios's transformRequest sees
 * `hasJSONContentType === true` and converts FormData payloads into a JSON
 * string (see node_modules/axios/lib/defaults/index.js), so the browser
 * never sends a real multipart body and the backend can't find the `file`
 * field.
 *
 * These tests never touch the network: a capture adapter (installed via
 * `axios.defaults.adapter` BEFORE the client module is imported, so the
 * instance inherits it) records exactly what the request WOULD have
 * contained, in the jsdom (browser-like) environment.
 */

let createProfile

const captureAdapter = async (config) => {
  globalThis.__capturedRequest = {
    url: config.url,
    method: config.method,
    contentType: config.headers.getContentType() ?? null,
    dataType: config.data?.constructor?.name ?? typeof config.data,
    isFormData: typeof FormData !== 'undefined' && config.data instanceof FormData,
  }
  return { data: { id: 1 }, status: 201, statusText: 'Created', headers: {}, config }
}

function capturedRequest() {
  return globalThis.__capturedRequest
}

describe('createProfile multipart upload', () => {
  beforeAll(async () => {
    // Adapter resolution reads axios defaults when the client instance is
    // created, so install the capture adapter before importing client.js.
    axios.defaults.adapter = captureAdapter
    ;({ createProfile } = await import('./client.js'))
  })

  afterAll(() => {
    delete axios.defaults.adapter
    delete globalThis.__capturedRequest
  })

  it('sends a PDF upload as real multipart FormData (not JSON)', async () => {
    const file = new File(['%PDF-1.4 fake content'], 'resume.pdf', { type: 'application/pdf' })

    await createProfile({
      name: 'Arjun',
      email: 'arjun@example.com',
      mode: 'internship',
      skills: ['Python'],
      resumeFile: file,
    })

    const captured = capturedRequest()
    expect(captured.url).toBe('/profile/upload')
    expect(captured.method).toBe('post')
    // The body must stay FormData so the browser adds the multipart boundary.
    expect(captured.isFormData).toBe(true)
    expect(captured.dataType).toBe('FormData')
    // A JSON content type is what makes axios stringify the FormData.
    expect(captured.contentType).not.toMatch(/application\/json/i)
  })

  it('still sends application/json for the plain JSON profile path', async () => {
    await createProfile({
      name: 'Arjun',
      email: 'arjun@example.com',
      mode: 'internship',
      skills: ['Python'],
      resumeFile: null,
    })

    const captured = capturedRequest()
    expect(captured.url).toBe('/profile')
    expect(captured.contentType).toMatch(/application\/json/i)
    expect(captured.isFormData).toBe(false)
  })
})
