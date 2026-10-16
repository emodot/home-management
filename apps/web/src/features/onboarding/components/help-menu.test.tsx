import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderInApp } from '@/test/render-app'
import { TourContext } from '../lib/tour-context'
import { kitchenTour } from '../tours/modules'
import { HelpMenu } from './help-menu'

describe('HelpMenu', () => {
  it('replays any tour and brings back Getting started', async () => {
    const start = vi.fn()
    const setChecklistOpen = vi.fn()
    const { router } = renderInApp(
      <TourContext value={{ start, activeTourId: null, checklistOpen: false, setChecklistOpen }}>
        <HelpMenu />
      </TourContext>,
      { path: '*', url: '/tasks' },
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Help' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'A look around',
      'Expenses',
      'Kitchen',
      'Tasks',
      'Providers',
      'Getting started',
    ])
    await user.click(screen.getByRole('menuitem', { name: 'Kitchen' }))
    expect(start).toHaveBeenCalledWith(kitchenTour, { replay: true })

    await user.click(screen.getByRole('button', { name: 'Help' }))
    await user.click(screen.getByRole('menuitem', { name: 'Getting started' }))
    expect(setChecklistOpen).toHaveBeenCalledWith(true)
    expect(router.state.location.pathname).toBe('/')
  })
})
