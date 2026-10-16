import { getChecklistProgress, getOnboardingState } from '@home/shared'
import { queryOptions } from '@tanstack/react-query'
import { env } from '@/lib/env'
import { householdKey } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

/** Whether tours, the checklist and hints run at all (VITE_ONBOARDING_ENABLED). */
export const onboardingEnabled = () => env.VITE_ONBOARDING_ENABLED

export const onboardingQuery = (userId: string) =>
  queryOptions({
    queryKey: ['onboarding', userId],
    queryFn: () => getOnboardingState(supabase, userId),
  })

/** What the household has done of the getting-started checklist (fresh on each visit). */
export const checklistQuery = (householdId: string) =>
  queryOptions({
    queryKey: [...householdKey(householdId), 'getting-started'],
    queryFn: () => getChecklistProgress(supabase, householdId),
  })
