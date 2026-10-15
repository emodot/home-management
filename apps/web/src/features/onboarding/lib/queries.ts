import { getOnboardingState } from '@home/shared'
import { queryOptions } from '@tanstack/react-query'
import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'

/** Whether tours, the checklist and hints run at all (VITE_ONBOARDING_ENABLED). */
export const onboardingEnabled = () => env.VITE_ONBOARDING_ENABLED

export const onboardingQuery = (userId: string) =>
  queryOptions({
    queryKey: ['onboarding', userId],
    queryFn: () => getOnboardingState(supabase, userId),
  })
