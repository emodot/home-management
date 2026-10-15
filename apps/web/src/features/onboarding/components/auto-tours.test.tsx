import type { OnboardingState } from '@home/shared'
import { act, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TEST_USER } from '@/test/render-app'
import { onboardingQuery } from '../lib/queries'
import { TourContext } from '../lib/tour-context'
import { expensesTour, kitchenTour } from '../tours/modules'
import { welcomeTour } from '../tours/welcome'
import { AutoTours } from './auto-tours'

const db = vi.hoisted(() => ({ rows: [] as unknown[] }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: db.rows, error: null }) }),
    }),
  },
}))

const start = vi.fn()

function row(key: string) {
  return {
    user_id: 'u1',
    key,
    version: 1,
    status: 'dismissed',
    last_step: 0,
    updated_at: '2026-10-15T09:00:00Z',
  }
}

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      {
        id: 'authed',
        loader: () => ({ user: TEST_USER }),
        path: '*',
        element: (
          <TourContext value={{ start, activeTourId: null }}>
            <AutoTours />
          </TourContext>
        ),
      },
    ],
    { initialEntries: [url] },
  )
  const queryClient = new QueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

beforeEach(() => {
  start.mockReset()
  db.rows = []
})

describe('AutoTours', () => {
  it('starts the welcome tour on the Expenses home for someone who hasn’t seen it', async () => {
    renderAt('/')
    await waitFor(() => expect(start).toHaveBeenCalledWith(welcomeTour))
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('waits until they are on the Expenses home, with no module tour before it', async () => {
    const { router } = renderAt('/kitchen')
    await settle()
    expect(start).not.toHaveBeenCalled()
    await act(() => router.navigate('/'))
    await waitFor(() => expect(start).toHaveBeenCalledWith(welcomeTour))
  })

  it('leaves the welcome tour alone once it was skipped, on any device', async () => {
    db.rows = [row('tour:welcome'), row('tour:expenses')]
    renderAt('/')
    await settle()
    expect(start).not.toHaveBeenCalled()
  })

  it('starts a module’s tour on arriving at its page, once the welcome tour is done', async () => {
    db.rows = [row('tour:welcome')]
    const { router } = renderAt('/kitchen/pantry')
    await settle()
    expect(start).not.toHaveBeenCalled()
    await act(() => router.navigate('/kitchen'))
    await waitFor(() => expect(start).toHaveBeenCalledWith(kitchenTour))
  })

  it('doesn’t follow the welcome tour with the Expenses tour on the same visit', async () => {
    const { router, queryClient } = renderAt('/')
    await waitFor(() => expect(start).toHaveBeenCalledWith(welcomeTour))
    // The welcome tour is skipped.
    await act(() =>
      queryClient.setQueryData<OnboardingState>(onboardingQuery(TEST_USER.id).queryKey, {
        'tour:welcome': {
          key: 'tour:welcome',
          version: 1,
          status: 'dismissed',
          lastStep: 2,
          updatedAt: '',
        },
      }),
    )
    await settle()
    expect(start).toHaveBeenCalledTimes(1)

    // Coming back to the Expenses home later is a new visit.
    await act(() => router.navigate('/tasks/new'))
    await act(() => router.navigate('/'))
    await waitFor(() => expect(start).toHaveBeenCalledWith(expensesTour))
  })
})
