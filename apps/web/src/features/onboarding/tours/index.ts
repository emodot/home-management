import type { TourDefinition } from '@home/shared'
import { engineCheckTour } from './engine-check'

/** Every tour, by id. */
export const TOURS: Readonly<Record<string, TourDefinition>> = Object.fromEntries(
  (import.meta.env.DEV ? [engineCheckTour] : []).map((tour) => [tour.id, tour]),
)
