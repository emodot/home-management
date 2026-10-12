import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

// jsdom doesn't implement these; Radix (sheets, selects) and useMediaQuery use them.
vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })),
)
vi.stubGlobal(
  'ResizeObserver',
  vi.fn(() => ({ observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() })),
)
Object.assign(Element.prototype, {
  scrollIntoView: vi.fn(),
  hasPointerCapture: vi.fn(() => false),
  releasePointerCapture: vi.fn(),
})
