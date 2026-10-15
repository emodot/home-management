import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { useOnboarding } from '../hooks/use-onboarding'
import { useTour } from '../lib/tour-context'
import { welcomeTour } from '../tours/welcome'

/**
 * Starts the tours that show on their own: the welcome tour on the Expenses home, for anyone who
 * hasn't finished or skipped it on any device. Only there, so it never pulls someone off a form.
 */
export function AutoTours() {
  const { pathname } = useLocation()
  const onboarding = useOnboarding()
  const { start } = useTour()
  const showWelcome = pathname === welcomeTour.route && onboarding.shouldShowTour(welcomeTour)

  useEffect(() => {
    if (showWelcome) start(welcomeTour)
  }, [showWelcome, start])

  return null
}
