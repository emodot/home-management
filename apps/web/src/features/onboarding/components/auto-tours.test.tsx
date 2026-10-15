import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TEST_USER } from '@/test/render-app'
import { TourContext } from '../lib/tour-context'
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
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

beforeEach(() => {
  start.mockReset()
  db.rows = []
})

describe('AutoTours', () => {
  it('starts the welcome tour on the Expenses home for someone who hasn’t seen it', async () => {
    renderAt('/')
    await waitFor(() => expect(start).toHaveBeenCalledWith(welcomeTour))
  })

  it('waits until they are on the Expenses home', async () => {
    const router = renderAt('/kitchen/list')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(start).not.toHaveBeenCalled()
    await router.navigate('/')
    await waitFor(() => expect(start).toHaveBeenCalledWith(welcomeTour))
  })

  it('leaves it alone once it was skipped, on any device', async () => {
    db.rows = [
      {
        user_id: 'u1',
        key: 'tour:welcome',
        version: 1,
        status: 'dismissed',
        last_step: 0,
        updated_at: '2026-10-15T09:00:00Z',
      },
    ]
    renderAt('/')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(start).not.toHaveBeenCalled()
  })
})
