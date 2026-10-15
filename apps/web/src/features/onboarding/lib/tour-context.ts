import type { TourDefinition } from '@home/shared'
import { createContext, useContext } from 'react'

export interface TourControls {
  /**
   * Runs a tour once no sheet, dialog or other tour is on screen. Asking again for one already
   * queued or running does nothing; so does asking again for one that ended this session, unless
   * `replay` (the user asked to see it).
   */
  start: (tour: TourDefinition, options?: { replay?: boolean }) => void
  /** The tour on screen, if any. */
  activeTourId: string | null
}

export const TourContext = createContext<TourControls | null>(null)

/** Starts tours. Only usable inside TourProvider (in AppLayout). */
export function useTour(): TourControls {
  const controls = useContext(TourContext)
  if (!controls) throw new Error('useTour must be used inside TourProvider')
  return controls
}
