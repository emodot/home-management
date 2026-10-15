import { describe, expect, it } from 'vitest'
import {
  hintKey,
  isSettled,
  shouldShow,
  shouldShowTour,
  tourKey,
  type OnboardingRecord,
  type OnboardingState,
  type TourDefinition,
} from './onboarding.ts'

const kitchen: TourDefinition = {
  id: 'kitchen',
  version: 2,
  trigger: 'first-visit',
  route: '/kitchen',
  steps: [{ target: 'kitchen.quick-add', title: 'Quick add', body: 'Type an item.' }],
}

function record(key: string, version: number, status: OnboardingRecord['status']) {
  return { key, version, status, lastStep: null, updatedAt: '2026-10-15T09:00:00Z' }
}

function stateOf(...records: OnboardingRecord[]): OnboardingState {
  return Object.fromEntries(records.map((r) => [r.key, r]))
}

describe('shouldShowTour', () => {
  it('shows a tour the user has never seen', () => {
    expect(shouldShowTour({}, kitchen)).toBe(true)
    expect(shouldShowTour(stateOf(record('tour:welcome', 1, 'completed')), kitchen)).toBe(true)
  })

  it('shows it again when only an older version was seen', () => {
    expect(shouldShowTour(stateOf(record('tour:kitchen', 1, 'completed')), kitchen)).toBe(true)
    expect(shouldShowTour(stateOf(record('tour:kitchen', 1, 'dismissed')), kitchen)).toBe(true)
  })

  it('does not show a tour that was skipped', () => {
    expect(shouldShowTour(stateOf(record('tour:kitchen', 2, 'dismissed')), kitchen)).toBe(false)
  })

  it('does not show a tour that was finished', () => {
    expect(shouldShowTour(stateOf(record('tour:kitchen', 2, 'completed')), kitchen)).toBe(false)
    // Seen in a later version (e.g. on a newer build on another device).
    expect(shouldShowTour(stateOf(record('tour:kitchen', 3, 'completed')), kitchen)).toBe(false)
  })
})

describe('shouldShow', () => {
  it('treats the checklist and hints as version 1 unless told otherwise', () => {
    expect(shouldShow({}, 'checklist')).toBe(true)
    expect(
      shouldShow(stateOf(record('hint:price-tracker', 1, 'completed')), hintKey('price-tracker')),
    ).toBe(false)
    expect(
      shouldShow(
        stateOf(record('hint:price-tracker', 1, 'completed')),
        hintKey('price-tracker'),
        2,
      ),
    ).toBe(true)
  })
})

describe('isSettled', () => {
  it('is true once finished or skipped, whatever the version', () => {
    expect(isSettled({}, tourKey('welcome'))).toBe(false)
    expect(isSettled(stateOf(record('tour:welcome', 1, 'dismissed')), tourKey('welcome'))).toBe(
      true,
    )
    expect(isSettled(stateOf(record('tour:welcome', 1, 'completed')), tourKey('welcome'))).toBe(
      true,
    )
  })
})
