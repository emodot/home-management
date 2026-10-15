import type { TourDefinition } from '@home/shared'
import { engineCheckTour } from './engine-check'
import { MODULE_TOURS } from './modules'
import { welcomeTour } from './welcome'

/** Every tour, by id. */
export const TOURS: Readonly<Record<string, TourDefinition>> = Object.fromEntries(
  [welcomeTour, ...MODULE_TOURS, ...(import.meta.env.DEV ? [engineCheckTour] : [])].map((tour) => [
    tour.id,
    tour,
  ]),
)
