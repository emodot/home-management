import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useOnboarding } from '../hooks/use-onboarding'
import { TourContext, type TourControls } from '../lib/tour-context'
import { TourQueue } from '../lib/tour-queue'
import { TOURS } from '../tours'

/**
 * Runs product tours one at a time, each once the screen is clear of sheets and dialogs, and
 * records whether it was finished or skipped. `?tour=<id>` in the address starts that tour.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { markTour } = useOnboarding()
  const [activeTourId, setActiveTourId] = useState<string | null>(null)
  const [queue] = useState(() => new TourQueue(setActiveTourId))

  // The running tour reads the app as it is now, not as it was when the tour started.
  const { pathname } = location
  useEffect(() => {
    queue.setHandlers({
      navigate: (to) => navigate(to),
      pathname: () => pathname,
      record: markTour,
    })
  })
  // Leaving the signed-in app (e.g. signing out) ends a tour without recording it.
  useEffect(() => () => queue.stop(), [queue])

  // /anything?tour=<id>: run it, and take the parameter out of the address.
  const requested = new URLSearchParams(location.search).get('tour')
  useEffect(() => {
    if (!requested) return
    const params = new URLSearchParams(location.search)
    params.delete('tour')
    const search = params.toString()
    void navigate({ search: search ? `?${search}` : '' }, { replace: true })
    const tour = TOURS[requested]
    if (tour) queue.start(tour, { replay: true })
  }, [requested, location.search, navigate, queue])

  const controls = useMemo<TourControls>(
    () => ({ start: (tour, options) => queue.start(tour, options), activeTourId }),
    [queue, activeTourId],
  )
  return <TourContext value={controls}>{children}</TourContext>
}
