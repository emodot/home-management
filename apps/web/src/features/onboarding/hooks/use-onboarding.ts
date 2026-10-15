import {
  isSettled,
  markOnboarding,
  shouldShow,
  shouldShowTour,
  tourKey,
  type MarkOnboardingInput,
  type OnboardingState,
  type OnboardingStatus,
  type TourDefinition,
} from '@home/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentUser } from '@/hooks/use-household'
import { supabase } from '@/lib/supabase'
import { onboardingEnabled, onboardingQuery } from '../lib/queries'

type MarkVariables = MarkOnboardingInput & { key: string }

/**
 * The signed-in user's tours, checklist and hints: what should show, and recording what they
 * finished or skipped. Until their progress has loaded (or when it can't be, or onboarding is
 * turned off) nothing shows, so a tour never flashes up for someone who has already seen it.
 */
export function useOnboarding() {
  const user = useCurrentUser()
  const queryClient = useQueryClient()
  const enabled = onboardingEnabled()
  const { queryKey } = onboardingQuery(user.id)
  const state = useQuery({ ...onboardingQuery(user.id), enabled }).data

  const mark = useMutation({
    mutationFn: ({ key, ...input }: MarkVariables) => markOnboarding(supabase, key, input),
    // Settled straight away, so the tour closes for good even before the save lands. If the save
    // fails it isn't rolled back: the tour stays away for now and comes back next session.
    onMutate: async ({ key, version, status, lastStep = null }) => {
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData(queryKey, (previous: OnboardingState | undefined) => ({
        ...previous,
        [key]: {
          key,
          version,
          status,
          lastStep: status === 'dismissed' ? lastStep : null,
          updatedAt: new Date().toISOString(),
        },
      }))
    },
  })

  const ready = enabled && state !== undefined
  return {
    /** Progress has loaded and onboarding is on. */
    ready,
    state: state ?? {},
    shouldShowTour: (tour: TourDefinition) => ready && shouldShowTour(state, tour),
    shouldShow: (key: string, version?: number) => ready && shouldShow(state, key, version),
    /** Finished or skipped. Everything counts as settled while nothing can show. */
    isSettled: (key: string) => !ready || isSettled(state, key),
    markTour: (
      tour: Pick<TourDefinition, 'id' | 'version'>,
      status: OnboardingStatus,
      lastStep?: number,
    ) => mark.mutate({ key: tourKey(tour.id), version: tour.version, status, lastStep }),
    mark: (key: string, input: MarkOnboardingInput) => mark.mutate({ key, ...input }),
  }
}
