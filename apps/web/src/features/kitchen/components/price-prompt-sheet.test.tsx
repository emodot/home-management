import type { ShoppingListItem } from '@home/shared'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PricePromptSheet } from './price-prompt-sheet'

const rice: ShoppingListItem = {
  id: 'e1',
  householdId: 'h1',
  itemId: 'i1',
  name: 'Rice',
  quantity: 2,
  unit: 'kg',
  storeTag: 'Mile 12',
  notes: null,
  isChecked: true,
  checkedBy: 'u1',
  pricePaidMinor: null,
  source: 'manual',
  sourceRef: null,
  addedBy: 'u1',
  createdAt: '2026-10-01T10:00:00Z',
}

function setup(entry: ShoppingListItem = rice) {
  const onSave = vi.fn()
  const onClose = vi.fn()
  render(<PricePromptSheet entry={entry} onSave={onSave} onClose={onClose} />)
  return { onSave, onClose, user: userEvent.setup() }
}

describe('PricePromptSheet', () => {
  it('asks for the price of the whole line', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Rice' })).toBeInTheDocument()
    expect(screen.getByText('2 kg. What did you pay for all of it?')).toBeInTheDocument()
  })

  it('Skip closes without saving a price', async () => {
    const { onSave, onClose, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves the price in kobo and shows the price per unit', async () => {
    const { onSave, onClose, user } = setup()
    await user.type(screen.getByLabelText('Price paid'), '5,000')
    expect(screen.getByText('₦2,500 per kg')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save price' }))
    expect(onSave).toHaveBeenCalledWith(500000)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('saving an emptied price clears it', async () => {
    const { onSave, user } = setup({ ...rice, pricePaidMinor: 500000 })
    await user.clear(screen.getByLabelText('Price paid'))
    await user.click(screen.getByRole('button', { name: 'Save price' }))
    expect(onSave).toHaveBeenCalledWith(null)
  })

  it('rejects an amount that is not a number', async () => {
    const { onSave, user } = setup()
    await user.type(screen.getByLabelText('Price paid'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Save price' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText(/Enter a valid amount/)).toBeInTheDocument()
  })
})
