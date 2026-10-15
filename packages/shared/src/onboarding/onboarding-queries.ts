import { unwrap, type HomeClient } from '../client.ts'
import type { Tables } from '../database.types.ts'
import {
  tourKey,
  type OnboardingRecord,
  type OnboardingState,
  type OnboardingStatus,
  type TourDefinition,
} from './onboarding.ts'

export function toOnboardingRecord(row: Tables<'user_onboarding'>): OnboardingRecord {
  return {
    key: row.key,
    version: row.version,
    status: row.status as OnboardingStatus,
    lastStep: row.last_step,
    updatedAt: row.updated_at,
  }
}

/** The tours, checklist and hints the user has finished or skipped, on any device. */
export async function getOnboardingState(
  client: HomeClient,
  userId: string,
): Promise<OnboardingState> {
  const rows = unwrap(await client.from('user_onboarding').select('*').eq('user_id', userId))
  return Object.fromEntries(rows.map((row) => [row.key, toOnboardingRecord(row)]))
}

export interface MarkOnboardingInput {
  version: number
  status: OnboardingStatus
  /** The step a tour was skipped on; ignored when it was finished. */
  lastStep?: number | null
}

/** Records that the signed-in user finished or skipped something, replacing what was there. */
export async function markOnboarding(
  client: HomeClient,
  key: string,
  { version, status, lastStep = null }: MarkOnboardingInput,
): Promise<void> {
  unwrap(
    await client.rpc('mark_onboarding', {
      p_key: key,
      p_version: version,
      p_status: status,
      p_last_step: status === 'dismissed' ? lastStep : null,
    }),
  )
}

export function markTour(
  client: HomeClient,
  tour: Pick<TourDefinition, 'id' | 'version'>,
  status: OnboardingStatus,
  lastStep?: number,
): Promise<void> {
  return markOnboarding(client, tourKey(tour.id), { version: tour.version, status, lastStep })
}
