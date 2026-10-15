import type { TourDefinition } from '@home/shared'
import { engineCheckTour } from './engine-check'
import { welcomeTour } from './welcome'

/** Every tour, by id. */
export const TOURS: Readonly<Record<string, TourDefinition>> = Object.fromEntries(
  [welcomeTour, ...(import.meta.env.DEV ? [engineCheckTour] : [])].map((tour) => [tour.id, tour]),
)
