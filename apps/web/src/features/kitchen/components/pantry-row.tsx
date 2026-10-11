import {
  expiryStatus,
  formatQuantity,
  isLowStock,
  isOut,
  LOCATION_LABELS,
  stepQuantity,
  type PantryItem,
} from '@home/shared'
import { EllipsisVerticalIcon, MinusIcon, PlusIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ExpiryBadge, OnListBadge, StockBadge } from './pantry-badges'

/**
 * One thing in the kitchen: its name (to its page), badges for expiry, stock and the list, and a
 * − / + stepper. When it runs out and isn't on the list, it offers to add it.
 */
export function PantryRow({
  item,
  today,
  onList,
  showLocation,
  onStep,
  onRunningLow,
  onRemove,
}: {
  item: PantryItem
  today: string
  onList: boolean
  showLocation: boolean
  onStep: (quantity: number) => void
  onRunningLow: () => void
  onRemove: () => void
}) {
  const out = isOut(item)
  const low = !out && isLowStock(item)
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Link
          to={`/kitchen/pantry/${item.itemId}`}
          className="flex min-w-0 flex-1 flex-col gap-1 py-1"
        >
          <span className="truncate font-medium">{item.name}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            {showLocation && (
              <span className="text-xs text-muted-foreground">
                {LOCATION_LABELS[item.location]}
              </span>
            )}
            <ExpiryBadge status={expiryStatus(item.expiresOn, today)} />
            <StockBadge out={out} low={low} />
            {onList && <OnListBadge />}
          </span>
        </Link>
        <div
          className="flex shrink-0 items-center rounded-full bg-background"
          role="group"
          aria-label={`How much ${item.name}`}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 rounded-full"
            disabled={out}
            onClick={() => onStep(stepQuantity(item.quantity, -1))}
            aria-label={`One less ${item.name}`}
          >
            <MinusIcon aria-hidden />
          </Button>
          <span
            className="min-w-16 text-center text-sm font-medium tabular-nums"
            aria-live="polite"
          >
            {formatQuantity(item.quantity, item.unit)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 rounded-full"
            onClick={() => onStep(stepQuantity(item.quantity, 1))}
            aria-label={`One more ${item.name}`}
          >
            <PlusIcon aria-hidden />
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mr-1 size-9 text-muted-foreground"
              aria-label={`More for ${item.name}`}
            >
              <EllipsisVerticalIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={onList} onSelect={onRunningLow}>
              {onList ? 'Already on the list' : 'Running low: add to list'}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={`/kitchen/pantry/${item.itemId}`}>Edit details</Link>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              Remove from pantry
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {out && !onList && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 text-sm">
          <span>Out. Add it to the list?</span>
          <Button type="button" size="sm" onClick={onRunningLow}>
            Add to list
          </Button>
        </div>
      )}
    </li>
  )
}
