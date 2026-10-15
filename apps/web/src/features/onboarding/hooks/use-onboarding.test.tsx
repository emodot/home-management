import type { TourDefinition } from '@home/shared'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderInApp } from '@/test/render-app'
import { useOnboarding } from './use-onboarding'

const db = vi.hoisted(() => ({ rows: [] as unknown[], rpc: vi.fn(), enabled: true }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: db.rows, error: null }) }),
    }),
    rpc: db.rpc,
  },
}))
vi.mock('@/lib/env', () => ({
  env: {
    get VITE_ONBOARDING_ENABLED() {
      return db.enabled
    },
  },
}))

const welcome: TourDefinition = {
  id: 'welcome',
  version: 1,
  trigger: 'after-onboarding',
  steps: [{ title: 'Welcome', body: 'A quick look around.' }],
}
const kitchen: TourDefinition = {
  id: 'kitchen',
  version: 1,
  trigger: 'first-visit',
  route: '/kitchen',
  steps: [{ target: 'kitchen.quick-add', title: 'Quick add', body: 'Type an item.' }],
}

function Probe() {
  const onboarding = useOnboarding()
  return (
    <div>
      <p>{onboarding.ready ? 'ready' : 'loading'}</p>
      <p>welcome: {onboarding.shouldShowTour(welcome) ? 'show' : 'hide'}</p>
      <p>kitchen: {onboarding.shouldShowTour(kitchen) ? 'show' : 'hide'}</p>
      <p>welcome settled: {onboarding.isSettled('tour:welcome') ? 'yes' : 'no'}</p>
      <button type="button" onClick={() => onboarding.markTour(welcome, 'dismissed', 2)}>
        Skip
      </button>
    </div>
  )
}

beforeEach(() => {
  db.enabled = true
  db.rows = [
    {
      user_id: 'u1',
      key: 'tour:kitchen',
      version: 1,
      status: 'completed',
      last_step: null,
      updated_at: '2026-10-14T09:00:00Z',
    },
  ]
  db.rpc.mockReset().mockResolvedValue({ data: null, error: null })
})

describe('useOnboarding', () => {
  it('shows only the tours the user hasn’t finished or skipped, on any device', async () => {
    renderInApp(<Probe />)
    expect(await screen.findByText('ready')).toBeVisible()
    expect(screen.getByText('welcome: show')).toBeVisible()
    expect(screen.getByText('kitchen: hide')).toBeVisible()
    expect(screen.getByText('welcome settled: no')).toBeVisible()
  })

  it('remembers a skipped tour straight away and saves it', async () => {
    renderInApp(<Probe />)
    await screen.findByText('ready')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Skip' }))
    expect(await screen.findByText('welcome: hide')).toBeVisible()
    expect(screen.getByText('welcome settled: yes')).toBeVisible()
    await waitFor(() =>
      expect(db.rpc).toHaveBeenCalledWith('mark_onboarding', {
        p_key: 'tour:welcome',
        p_version: 1,
        p_status: 'dismissed',
        p_last_step: 2,
      }),
    )
  })

  it('keeps it away for now even if the save fails', async () => {
    db.rpc.mockResolvedValue({ data: null, error: new Error('offline') })
    renderInApp(<Probe />)
    await screen.findByText('ready')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(db.rpc).toHaveBeenCalled())
    expect(screen.getByText('welcome: hide')).toBeVisible()
  })

  it('shows nothing when onboarding is turned off', async () => {
    db.enabled = false
    db.rows = []
    renderInApp(<Probe />)
    expect(await screen.findByText('loading')).toBeVisible()
    expect(screen.getByText('welcome: hide')).toBeVisible()
    expect(screen.getByText('welcome settled: yes')).toBeVisible()
  })
})
