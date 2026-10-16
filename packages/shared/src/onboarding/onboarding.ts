/** Where a step's popover sits beside its target. */
export type TourSide = 'top' | 'bottom' | 'left' | 'right'

export interface TourStep {
  /** The data-tour id of the element to highlight; without one the step is a centred modal. */
  target?: string
  /** Navigate here before showing the step. */
  route?: string
  title: string
  body: string
  side?: TourSide
}

export interface TourDefinition {
  /** 'welcome', 'expenses', ... */
  id: string
  /** Bump to show the tour again after a big change. */
  version: number
  trigger: 'after-onboarding' | 'first-visit' | 'manual'
  /** The module root a first-visit tour belongs to. */
  route?: string
  steps: TourStep[]
}

export type OnboardingStatus = 'completed' | 'dismissed'

/** What a user did with a tour, the checklist or a hint. */
export interface OnboardingRecord {
  key: string
  version: number
  status: OnboardingStatus
  /** The step a tour was skipped on (0-based); null when it was finished. */
  lastStep: number | null
  updatedAt: string
}

/** Everything a user has finished or skipped, by key. */
export type OnboardingState = Readonly<Record<string, OnboardingRecord>>

export const CHECKLIST_KEY = 'checklist'

export function tourKey(tourId: string): string {
  return `tour:${tourId}`
}

export function hintKey(hintId: string): string {
  return `hint:${hintId}`
}

/**
 * Whether something should show on its own: never finished or skipped, or only an older version
 * of it was. Skipped counts the same as finished, so a skipped tour stays away until it's bumped.
 */
export function shouldShow(state: OnboardingState, key: string, version = 1): boolean {
  const record = state[key]
  return record === undefined || record.version < version
}

export function shouldShowTour(state: OnboardingState, tour: TourDefinition): boolean {
  return shouldShow(state, tourKey(tour.id), tour.version)
}

/** Finished or skipped, whatever the version. */
export function isSettled(state: OnboardingState, key: string): boolean {
  return state[key] !== undefined
}

/** The getting-started checklist's items, in order. */
export const CHECKLIST_ITEMS = [
  'expense',
  'receipt',
  'invite',
  'provider',
  'recurringTask',
  'shoppingList',
] as const

export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number]

/** Which checklist items the household has done, worked out from its own data. */
export type ChecklistProgress = Record<ChecklistItem, boolean>

export function checklistDoneCount(progress: ChecklistProgress): number {
  return CHECKLIST_ITEMS.filter((item) => progress[item]).length
}
