import { budgetStatus, formatMoney, type BudgetLevel } from '@home/shared'
import { CircleAlertIcon, CircleCheckIcon, TriangleAlertIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const LEVELS: Record<
  BudgetLevel,
  { label: string; icon: typeof CircleCheckIcon; fill: string; track: string; iconClass: string }
> = {
  ok: {
    label: 'On track',
    icon: CircleCheckIcon,
    fill: 'bg-viz-bar',
    track: 'bg-viz-track/60',
    iconClass: 'text-status-good',
  },
  warning: {
    label: 'Almost at limit',
    icon: TriangleAlertIcon,
    fill: 'bg-status-warning',
    track: 'bg-status-warning/25',
    iconClass: 'text-status-warning',
  },
  over: {
    label: 'Over budget',
    icon: CircleAlertIcon,
    fill: 'bg-status-critical',
    track: 'bg-status-critical/20',
    iconClass: 'text-status-critical',
  },
}

/**
 * Spent vs budget. Severity is carried by the fill colour AND an icon + label, never colour alone.
 * The track is a light step of the fill's own hue; past 100% the fill is full and the label says by how much.
 */
export function BudgetMeter({
  spentMinor,
  budgetMinor,
  currency,
}: {
  spentMinor: number
  budgetMinor: number
  currency: string
}) {
  const status = budgetStatus(spentMinor, budgetMinor)
  const level = LEVELS[status.level]
  const percent = Math.round(status.ratio * 100)

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn('h-2.5 w-full overflow-hidden rounded-full', level.track)}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={budgetMinor}
        aria-valuenow={Math.min(spentMinor, budgetMinor)}
        aria-valuetext={`${formatMoney(spentMinor, currency)} of ${formatMoney(budgetMinor, currency)} (${percent}%)`}
      >
        <div
          className={cn('h-full rounded-r-[4px] transition-[width]', level.fill)}
          style={{ width: `${Math.min(100, status.ratio * 100)}%` }}
        />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <level.icon className={cn('size-3.5 shrink-0', level.iconClass)} aria-hidden />
        <span>
          <span className="font-medium text-foreground">{level.label}</span>
          {' · '}
          {status.remainingMinor >= 0
            ? `${formatMoney(status.remainingMinor, currency)} left`
            : `over by ${formatMoney(-status.remainingMinor, currency)}`}
          {' · '}
          {percent}%
        </span>
      </p>
    </div>
  )
}
