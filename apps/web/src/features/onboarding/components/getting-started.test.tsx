import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderInApp } from '@/test/render-app'
import { TourContext } from '../lib/tour-context'
import { GettingStarted } from './getting-started'

const db = vi.hoisted(() => ({
  rows: [] as unknown[],
  progress: {},
  rpc: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: db.rows, error: null }) }),
    }),
    rpc: db.rpc,
  },
}))

function progress(done: string[]) {
  const all = ['expense', 'receipt', 'invited', 'provider', 'recurring_task', 'shopping_list']
  return Object.fromEntries(all.map((k) => [`has_${k}`, done.includes(k)]))
}

beforeEach(() => {
  db.rows = []
  db.progress = progress(['expense', 'invited'])
  db.rpc
    .mockReset()
    .mockImplementation((fn: string) =>
      fn === 'getting_started'
        ? { single: () => Promise.resolve({ data: db.progress, error: null }) }
        : Promise.resolve({ data: null, error: null }),
    )
})

describe('GettingStarted', () => {
  it('ticks what the household has done and links to the rest', async () => {
    renderInApp(<GettingStarted />)
    const card = await screen.findByRole('region', { name: 'Get your home set up' })
    expect(card).toHaveTextContent('2 of 6 done')
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
    expect(within(card).getByText('Add your first expense')).toHaveTextContent('(done)')
    expect(within(card).queryByRole('link', { name: 'Add expense' })).toBeNull()
    expect(within(card).getByText('Attach a receipt')).toHaveTextContent('(to do)')
    expect(within(card).getByRole('link', { name: 'Snap a receipt' })).toHaveAttribute(
      'href',
      '/expenses/new',
    )
    expect(within(card).getByRole('link', { name: 'Add provider' })).toHaveAttribute(
      'href',
      '/providers/new',
    )
    expect(within(card).getByRole('link', { name: 'Add task' })).toHaveAttribute(
      'href',
      '/tasks/new',
    )
    expect(within(card).getByRole('link', { name: 'Open the list' })).toHaveAttribute(
      'href',
      '/kitchen/list',
    )
  })

  it('can be hidden, for good', async () => {
    renderInApp(<GettingStarted />)
    await screen.findByRole('region', { name: 'Get your home set up' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Hide getting started' }))
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
    expect(db.rpc).toHaveBeenCalledWith('mark_onboarding', {
      p_key: 'checklist',
      p_version: 1,
      p_status: 'dismissed',
      p_last_step: null,
    })
  })

  it('stays hidden once hidden or finished', async () => {
    db.rows = [
      {
        user_id: 'u1',
        key: 'checklist',
        version: 1,
        status: 'dismissed',
        last_step: null,
        updated_at: '',
      },
    ]
    renderInApp(<GettingStarted />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('region')).toBeNull()
    expect(db.rpc).not.toHaveBeenCalledWith('getting_started', expect.anything())
  })

  it('comes back from Help after being hidden', async () => {
    db.rows = [
      {
        user_id: 'u1',
        key: 'checklist',
        version: 1,
        status: 'dismissed',
        last_step: null,
        updated_at: '',
      },
    ]
    const setChecklistOpen = vi.fn()
    renderInApp(
      <TourContext
        value={{ start: vi.fn(), activeTourId: null, checklistOpen: true, setChecklistOpen }}
      >
        <GettingStarted />
      </TourContext>,
    )
    await screen.findByRole('region', { name: 'Get your home set up' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Hide getting started' }))
    expect(setChecklistOpen).toHaveBeenCalledWith(false)
  })

  it('says when everything is done, then goes once they leave the page', async () => {
    db.progress = progress([
      'expense',
      'receipt',
      'invited',
      'provider',
      'recurring_task',
      'shopping_list',
    ])
    const { router } = renderInApp(<GettingStarted />)
    const card = await screen.findByRole('region', { name: 'You’re all set' })
    expect(card).toHaveTextContent('Ade home is ready to run on Lintel.')
    expect(db.rpc).not.toHaveBeenCalledWith('mark_onboarding', expect.anything())

    await router.navigate('/elsewhere')
    await waitFor(() =>
      expect(db.rpc).toHaveBeenCalledWith('mark_onboarding', {
        p_key: 'checklist',
        p_version: 1,
        p_status: 'completed',
        p_last_step: null,
      }),
    )
  })
})
