import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const percent = new Intl.NumberFormat('en-NG', { style: 'percent', maximumFractionDigits: 0 })

/** "▲ 12%" in the "worse" colour, "▼ 8%" in the "better" one; the arrow and words say it too. */
export function PriceChange({ change, className }: { change: number | null; className?: string }) {
  if (change === null) return null
  if (Math.abs(change) < 0.005) {
    return <span className={cn('text-xs text-muted-foreground', className)}>Same as last time</span>
  }
  const up = change > 0
  const Icon = up ? ArrowUpIcon : ArrowDownIcon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium tabular-nums',
        up ? 'text-delta-bad' : 'text-delta-good',
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{up ? 'Up' : 'Down'}</span>
      {percent.format(Math.abs(change))}
    </span>
  )
}
