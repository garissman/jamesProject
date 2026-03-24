import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/**
 * Create a mock fetch that responds based on URL patterns.
 * Usage: mockFetch({ '/api/pipetting/status': { initialized: true, ... } })
 */
export function mockFetch(responses = {}) {
  return vi.fn((url, options) => {
    const path = typeof url === 'string' ? url : url.toString()
    for (const [pattern, data] of Object.entries(responses)) {
      if (path.includes(pattern)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(data),
          text: () => Promise.resolve(JSON.stringify(data)),
        })
      }
    }
    // Default: return empty success
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: 'success' }),
      text: () => Promise.resolve('{}'),
    })
  })
}
