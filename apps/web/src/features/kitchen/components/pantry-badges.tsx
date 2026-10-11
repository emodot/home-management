import { expiryLabel, type ExpiryStatus } from '@home/shared'
import { ShoppingBasketIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const badge =
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap'

export function ExpiryBadge({ status }: { status: ExpiryStatus }) {
  const label = expiryLabel(status)
  if (!label) return null
  return (
    <span
      className={cn(
        badge,
        status.kind === 'expired' && 'bg-destructive/10 text-destructive',
        status.kind === 'soon' && 'bg-status-warning/20 text-foreground',
        status.kind === 'later' && 'bg-background text-muted-foreground',
      )}
    >
      {label}
    </span>
  )
}

export function StockBadge({ out, low }: { out: boolean; low: boolean }) {
  if (!out && !low) return null
  return (
    <span
      className={cn(
        badge,
        out ? 'bg-destructive/10 text-destructive' : 'bg-status-warning/20 text-foreground',
      )}
    >
      {out ? 'Out' : 'Running low'}
    </span>
  )
}

export function OnListBadge() {
  return (
    <span className={cn(badge, 'bg-primary/10 text-primary')}>
      <ShoppingBasketIcon className="size-3" aria-hidden />
      On the list
    </span>
  )
}
