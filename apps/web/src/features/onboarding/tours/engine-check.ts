import type { TourDefinition } from '@home/shared'

/**
 * Development only: exercises the engine across two pages, a modal step, a target that differs
 * by screen width (bottom nav or sidebar) and a missing target that's skipped. Open /?tour=engine-check.
 */
export const engineCheckTour: TourDefinition = {
  id: 'engine-check',
  version: 1,
  trigger: 'manual',
  steps: [
    { title: 'Tour engine check', body: 'A centred step with no target.' },
    {
      target: 'nav.kitchen',
      title: 'Kitchen in the nav',
      body: 'In the bottom nav on a phone, the sidebar on a wider screen.',
    },
    {
      route: '/kitchen',
      target: 'kitchen.tab-pantry',
      title: 'On another page',
      body: 'The tour moved to the Kitchen and waited for its tabs.',
      side: 'bottom',
    },
    { target: 'missing.element', title: 'Never shown', body: 'This target never appears.' },
    { route: '/', title: 'Back home', body: 'The missing step was skipped. That’s the lot.' },
  ],
}
