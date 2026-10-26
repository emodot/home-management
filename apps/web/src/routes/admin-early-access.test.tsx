import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderInApp } from '@/test/render-app'
import { AdminEarlyAccessPage } from './admin-early-access'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }))

const request = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Bola Ade',
  email: 'bola@example.com',
  note: 'Four of us in Lekki.',
  status: 'new',
  createdAt: '2026-10-26T08:00:00Z',
  updatedAt: '2026-10-26T08:00:00Z',
}

beforeEach(() => {
  invoke.mockReset().mockImplementation((_name: string, { body }: { body: { action: string } }) =>
    Promise.resolve({
      data: body.action === 'listAccessRequests' ? { total: 1, items: [request] } : { ok: true },
      error: null,
    }),
  )
})

describe('AdminEarlyAccessPage', () => {
  it('lists new requests and marks one invited', async () => {
    renderInApp(<AdminEarlyAccessPage />, {
      path: '/admin/early-access',
      url: '/admin/early-access',
    })
    await screen.findByText('Bola Ade')
    const row = screen.getByRole('listitem')
    expect(row).toHaveTextContent('Four of us in Lekki.')
    expect(within(row).getByRole('link', { name: 'bola@example.com' })).toHaveAttribute(
      'href',
      'mailto:bola@example.com',
    )
    expect(invoke).toHaveBeenCalledWith('admin', {
      body: { action: 'listAccessRequests', status: 'new', page: 0 },
    })

    await userEvent.setup().click(within(row).getByRole('button', { name: 'Mark invited' }))
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('admin', {
        body: {
          action: 'setAccessRequestStatus',
          requestId: '11111111-1111-4111-8111-111111111111',
          status: 'invited',
        },
      }),
    )
  })

  it('shows the other statuses from the filter', async () => {
    renderInApp(<AdminEarlyAccessPage />, {
      path: '/admin/early-access',
      url: '/admin/early-access?status=all',
    })
    await screen.findByText('Bola Ade')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-current', 'page')
    expect(invoke).toHaveBeenCalledWith('admin', {
      body: { action: 'listAccessRequests', status: 'all', page: 0 },
    })
  })
})
