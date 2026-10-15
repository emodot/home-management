import { describe, expect, it, vi } from 'vitest'
import type { HomeClient } from '../client.ts'
import { getOnboardingState, markOnboarding, markTour } from './onboarding-queries.ts'

describe('getOnboardingState', () => {
  it('reads the user’s rows keyed by what they are for', async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        {
          user_id: 'u1',
          key: 'tour:welcome',
          version: 1,
          status: 'dismissed',
          last_step: 2,
          updated_at: '2026-10-15T09:00:00Z',
        },
      ],
      error: null,
    })
    const from = vi.fn(() => ({ select: () => ({ eq }) }))
    const state = await getOnboardingState({ from } as unknown as HomeClient, 'u1')
    expect(from).toHaveBeenCalledWith('user_onboarding')
    expect(eq).toHaveBeenCalledWith('user_id', 'u1')
    expect(state).toEqual({
      'tour:welcome': {
        key: 'tour:welcome',
        version: 1,
        status: 'dismissed',
        lastStep: 2,
        updatedAt: '2026-10-15T09:00:00Z',
      },
    })
  })
})

describe('markTour', () => {
  it('records a skipped tour with the step it was skipped on', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    await markTour({ rpc } as unknown as HomeClient, { id: 'welcome', version: 2 }, 'dismissed', 3)
    expect(rpc).toHaveBeenCalledWith('mark_onboarding', {
      p_key: 'tour:welcome',
      p_version: 2,
      p_status: 'dismissed',
      p_last_step: 3,
    })
  })

  it('records a finished tour without a step', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    await markTour({ rpc } as unknown as HomeClient, { id: 'kitchen', version: 1 }, 'completed', 4)
    expect(rpc).toHaveBeenCalledWith('mark_onboarding', {
      p_key: 'tour:kitchen',
      p_version: 1,
      p_status: 'completed',
      p_last_step: null,
    })
  })
})

describe('markOnboarding', () => {
  it('throws what the database refused', async () => {
    const error = new Error('new row violates check constraint')
    const rpc = vi.fn().mockResolvedValue({ data: null, error })
    await expect(
      markOnboarding({ rpc } as unknown as HomeClient, 'checklist', {
        version: 1,
        status: 'dismissed',
      }),
    ).rejects.toBe(error)
  })
})
