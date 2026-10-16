import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderInApp } from '@/test/render-app'
import { FeatureHint } from './feature-hint'

const db = vi.hoisted(() => ({ rows: [] as unknown[], rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: db.rows, error: null }) }),
    }),
    rpc: db.rpc,
  },
}))

const hint = (
  <div className="relative">
    <FeatureHint id="meal-plan" title="Meal planner" body="Plan the week’s meals." />
  </div>
)

beforeEach(() => {
  db.rows = []
  db.rpc.mockReset().mockResolvedValue({ data: null, error: null })
})

describe('FeatureHint', () => {
  it('points out something new once: read it, close it, and it’s gone', async () => {
    renderInApp(hint)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'New: Meal planner' }))
    expect(await screen.findByText('Plan the week’s meals.')).toBeVisible()
    expect(db.rpc).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Got it' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'New: Meal planner' })).toBeNull(),
    )
    expect(db.rpc).toHaveBeenCalledWith('mark_onboarding', {
      p_key: 'hint:meal-plan',
      p_version: 1,
      p_status: 'completed',
      p_last_step: null,
    })
  })

  it('stays away once seen, on any device', async () => {
    db.rows = [
      {
        user_id: 'u1',
        key: 'hint:meal-plan',
        version: 1,
        status: 'completed',
        last_step: null,
        updated_at: '',
      },
    ]
    renderInApp(hint)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('button', { name: 'New: Meal planner' })).toBeNull()
  })
})
