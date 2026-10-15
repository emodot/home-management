import { tourKey } from '@home/shared'
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { useOnboarding } from '../hooks/use-onboarding'
import { useTour } from '../lib/tour-context'
import { MODULE_TOURS } from '../tours/modules'
import { welcomeTour } from '../tours/welcome'

/**
 * Starts the tours that show on their own, each for anyone who hasn't finished or skipped it on
 * any device, and only on a module's own page so it never pulls someone off a form:
 * - the welcome tour, on the Expenses home;
 * - a module's tour on arriving at its page, once the welcome tour is out of the way. Not on a
 *   visit where another tour showed (e.g. right after the welcome tour, or a page a tour opened).
 */
export function AutoTours() {
  const location = useLocation()
  const onboarding = useOnboarding()
  const { start, activeTourId } = useTour()
  const showWelcome =
    location.pathname === welcomeTour.route && onboarding.shouldShowTour(welcomeTour)
  const welcomeSettled = onboarding.isSettled(tourKey(welcomeTour.id))
  const moduleTour = MODULE_TOURS.find(
    (tour) => tour.route === location.pathname && onboarding.shouldShowTour(tour),
  )
  // Visits (history entries) during which a tour was on screen or asked for.
  const visitsWithTour = useRef(new Set<string>())

  useEffect(() => {
    if (activeTourId) {
      visitsWithTour.current.add(location.key)
      return
    }
    if (showWelcome) {
      visitsWithTour.current.add(location.key)
      start(welcomeTour)
      return
    }
    if (moduleTour && welcomeSettled && !visitsWithTour.current.has(location.key)) {
      visitsWithTour.current.add(location.key)
      start(moduleTour)
    }
  }, [activeTourId, showWelcome, welcomeSettled, moduleTour, location.key, start])

  return null
}
