import type { TourDefinition } from '@home/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { TEST_USER } from '@/test/render-app'
import { useTour } from '../lib/tour-context'
import { TourProvider } from './tour-provider'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
    rpc,
  },
}))

const tour: TourDefinition = {
  id: 'two-pages',
  version: 3,
  trigger: 'manual',
  steps: [
    { title: 'Welcome', body: 'A centred step.' },
    { target: 'nav.kitchen', title: 'Kitchen', body: 'The visible one of two.' },
    { route: '/kitchen', target: 'kitchen.tab-pantry', title: 'Pantry', body: 'On the next page.' },
    { target: 'missing.element', title: 'Never shown', body: 'Not on any page.' },
    { route: '/', title: 'Done here', body: 'Back where it started.' },
  ],
}

function StartButton() {
  const { start, activeTourId } = useTour()
  return (
    <button type="button" onClick={() => start(tour)}>
      Start {activeTourId ?? 'nothing'}
    </button>
  )
}

function renderApp() {
  const router = createMemoryRouter(
    [
      {
        id: 'authed',
        loader: () => ({ user: TEST_USER }),
        element: (
          <TourProvider>
            <StartButton />
            {/* Phones get the bottom nav, wider screens the sidebar: only one is shown. */}
            <a href="/kitchen" data-tour="nav.kitchen" hidden>
              Kitchen (bottom nav)
            </a>
            <a href="/kitchen" data-tour="nav.kitchen">
              Kitchen (sidebar)
            </a>
            <Outlet />
          </TourProvider>
        ),
        children: [
          { index: true, element: <h1>Expenses</h1> },
          {
            path: 'kitchen',
            // A page whose tabs arrive a moment after it does.
            loader: () => new Promise((resolve) => setTimeout(resolve, 50)),
            element: <span data-tour="kitchen.tab-pantry">Pantry</span>,
          },
        ],
      },
    ],
    { initialEntries: ['/'] },
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

async function popover() {
  return within(await screen.findByRole('dialog'))
}

// jsdom lays nothing out; treat everything not hidden as on screen.
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: null, error: null })
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    return (this.closest('[hidden]') ? [] : [new DOMRect(0, 0, 10, 10)]) as unknown as DOMRectList
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  document.querySelectorAll('.driver-popover').forEach((el) => el.remove())
})

describe('TourProvider', () => {
  it('runs a tour across two pages, skipping a step whose target never shows', async () => {
    const router = renderApp()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Start nothing' }))

    let step = await popover()
    expect(step.getByText('1 of 5')).toBeVisible()
    expect(step.getByText('Welcome')).toBeVisible()
    expect(screen.getByText('Start two-pages')).toBeInTheDocument()
    await waitFor(() => expect(step.getByRole('button', { name: 'Next' })).toHaveFocus())

    await user.click(step.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(document.querySelector('.driver-active-element')).toHaveTextContent(
        'Kitchen (sidebar)',
      ),
    )

    await user.click((await popover()).getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/kitchen'))
    await waitFor(() =>
      expect(document.querySelector('.driver-active-element')).toHaveTextContent('Pantry'),
    )
    step = await popover()
    expect(step.getByText('3 of 5')).toBeVisible()

    // Step 4's target never appears: after the wait, the tour moves on to step 5 back home.
    await user.click(step.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'), { timeout: 5000 })
    step = await popover()
    expect(step.getByText('5 of 5')).toBeVisible()
    expect(step.queryByRole('button', { name: 'Skip tour' })).toBeNull()

    await user.click(step.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(rpc).toHaveBeenCalledWith('mark_onboarding', {
      p_key: 'tour:two-pages',
      p_version: 3,
      p_status: 'completed',
      p_last_step: null,
    })

    // Asked for again this session, it stays away (until replayed).
    await user.click(screen.getByRole('button', { name: 'Start nothing' }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('dialog')).toBeNull()
  }, 10_000)

  it('records the step a tour was skipped on, and waits for an open dialog to close', async () => {
    renderApp()
    const user = userEvent.setup()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.dataset.state = 'open'
    document.body.append(dialog)

    await user.click(await screen.findByRole('button', { name: 'Start nothing' }))
    expect(document.querySelector('.driver-popover')).toBeNull()
    act(() => dialog.remove())

    await user.click((await popover()).getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(document.querySelector('.driver-active-element')).toHaveTextContent('Kitchen'),
    )
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('2 of 5 The visible one of two.')
    await user.click((await popover()).getByRole('button', { name: 'Skip tour' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Focus goes back to what started it.
    expect(screen.getByRole('button', { name: 'Start nothing' })).toHaveFocus()
    expect(rpc).toHaveBeenCalledWith('mark_onboarding', {
      p_key: 'tour:two-pages',
      p_version: 3,
      p_status: 'dismissed',
      p_last_step: 1,
    })
  })
})
