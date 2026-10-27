import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderInApp } from '@/test/render-app'
import { ProfilePage } from './profile'

vi.mock('@/lib/supabase', () => {
  const profile = {
    id: 'u1',
    email: 'bola@example.com',
    full_name: 'Bola Ade',
    avatar_url: null,
    active_household_id: 'h1',
    created_at: '',
  }
  const query: Record<string, unknown> = {
    single: () => Promise.resolve({ data: profile, error: null }),
  }
  for (const method of ['select', 'eq']) query[method] = () => query
  return { supabase: { from: () => query } }
})

describe('ProfilePage', () => {
  it('shows the sign-in email without a way to change it', async () => {
    renderInApp(<ProfilePage />, { path: '/profile', url: '/profile' })
    expect(await screen.findByRole('link', { name: 'Profile' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('heading', { name: 'Photo and name' })).toBeVisible()
    expect(screen.getByText('bola@example.com')).toBeVisible()
    expect(screen.queryByLabelText(/email/i)).toBeNull()
    expect(screen.queryByLabelText('Current password')).toBeNull()
  })

  it('keeps the password and sessions under Security', async () => {
    const { router } = renderInApp(<ProfilePage />, { path: '/profile', url: '/profile' })
    await userEvent.setup().click(await screen.findByRole('link', { name: 'Security' }))
    expect(router.state.location.search).toBe('?tab=security')
    expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByLabelText('Current password')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Sessions' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Photo and name' })).toBeNull()
  })

  it('opens a tab from the address', async () => {
    renderInApp(<ProfilePage />, { path: '/profile', url: '/profile?tab=appearance' })
    expect(await screen.findByRole('heading', { name: 'Appearance' })).toBeVisible()
  })
})
