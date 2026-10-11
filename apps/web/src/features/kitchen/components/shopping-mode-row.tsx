import {
  formatMoney,
  formatQuantity,
  unitLabel,
  unitPriceMinor,
  type ShoppingListItem,
} from '@home/shared'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * A big row for the market: the checkbox (or the whole row) checks it off; for a checked row,
 * the name opens the price.
 */
export function ShoppingModeRow({
  entry,
  onCheck,
  onPrice,
}: {
  entry: ShoppingListItem
  onCheck: (checked: boolean) => void
  onPrice: () => void
}) {
  // Flip at once; the list's optimistic update follows a tick later (see ListItemRow).
  const [checked, setChecked] = useState(entry.isChecked)
  const [listChecked, setListChecked] = useState(entry.isChecked)
  if (entry.isChecked !== listChecked) {
    setListChecked(entry.isChecked)
    setChecked(entry.isChecked)
  }
  const perUnit = unitPriceMinor(entry.pricePaidMinor, entry.quantity)

  function toggle(next: boolean) {
    setChecked(next)
    onCheck(next)
  }

  return (
    <li className="flex items-center gap-4 px-4">
      <input
        type="checkbox"
        className="size-6 shrink-0 accent-primary"
        checked={checked}
        onChange={(e) => toggle(e.target.checked)}
        aria-label={`Bought ${entry.name}`}
      />
      <button
        type="button"
        className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 text-left"
        onClick={() => (checked ? onPrice() : toggle(true))}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              'truncate text-lg font-medium',
              checked && 'text-muted-foreground line-through',
            )}
          >
            {entry.name}
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {formatQuantity(entry.quantity, entry.unit)}
            {entry.notes ? ` · ${entry.notes}` : ''}
          </span>
        </span>
        {checked && (
          <span className="shrink-0 text-right">
            {entry.pricePaidMinor === null ? (
              <span className="text-sm font-medium text-primary">Add price</span>
            ) : (
              <span className="flex flex-col">
                <span className="font-semibold tabular-nums">
                  {formatMoney(entry.pricePaidMinor)}
                </span>
                {perUnit !== null && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatMoney(perUnit)}/{unitLabel(entry.unit)}
                  </span>
                )}
              </span>
            )}
          </span>
        )}
      </button>
    </li>
  )
}
