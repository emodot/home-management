import { describe, expect, it } from 'vitest'
import { safeNextPath } from './next-path.ts'

describe('safeNextPath', () => {
  it.each(['/', '/invite/abc123', '/expenses?month=2026-09#top'])('keeps %s', (path) => {
    expect(safeNextPath(path)).toBe(path)
  })

  it.each([
    null,
    undefined,
    '',
    'invite/abc',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\tevil',
    'javascript:alert(1)',
  ])('rejects %j', (path) => {
    expect(safeNextPath(path)).toBe('/')
  })

  it('uses the fallback', () => {
    expect(safeNextPath('//evil.example', '/onboarding')).toBe('/onboarding')
  })
})
