import type { Household } from '@home/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { ActiveHouseholdContext } from '@/hooks/use-household'

export const TEST_USER = { id: 'u1', email: 'bola@example.com', newEmail: null }

export const TEST_HOUSEHOLD: Household = {
  id: 'h1',
  name: 'Ade home',
  currency: 'NGN',
  timezone: 'Africa/Lagos',
  created_at: '2026-01-01T00:00:00Z',
}

/**
 * Renders `ui` as if inside the signed-in app: a router (with the user the 'authed' route
 * provides), a fresh query client and the active household. Other paths render nothing, so
 * navigating away is harmless. Await something on screen before interacting: the route loads.
 */
export function renderInApp(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createMemoryRouter(
    [
      {
        id: 'authed',
        loader: () => ({ user: TEST_USER }),
        children: [
          {
            path: '/',
            element: <ActiveHouseholdContext value={TEST_HOUSEHOLD}>{ui}</ActiveHouseholdContext>,
          },
          { path: '*', element: null },
        ],
      },
    ],
    { initialEntries: ['/'] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { queryClient, router }
}
