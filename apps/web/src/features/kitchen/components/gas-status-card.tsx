import { formatDate, gasStatus, type GasPrediction, type GasRefillRecord } from '@home/shared'
import { FlameIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const days = (n: number) => `${n} ${Math.abs(n) === 1 ? 'day' : 'days'}`

/**
 * Where the gas stands: the last refill, and once there are two, how long a cylinder lasts, the
 * predicted next refill and a bar of how much of this cylinder is left.
 */
export function GasStatusCard({
  last,
  prediction,
  today,
}: {
  last: GasRefillRecord
  prediction: GasPrediction | null
  today: string
}) {
  const status = prediction ? gasStatus(prediction, today) : null
  const overdue = status !== null && status.daysLeft < 0
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-muted p-4" aria-label="Cooking gas">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background text-primary">
          <FlameIcon className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          {status ? (
            <>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {overdue
                  ? `${days(-status.daysLeft)} overdue`
                  : status.daysLeft === 0
                    ? 'Due today'
                    : `${days(status.daysLeft)} left`}
              </p>
              <p className="text-sm text-muted-foreground">
                Next refill around {formatDate(prediction?.nextOn ?? today)}
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold tracking-tight">
                Last refilled {formatDate(last.refilledOn)}
              </p>
              <p className="text-sm text-muted-foreground">
                Log the next refill too, and you'll see how long a cylinder lasts and when the next
                one is due.
              </p>
            </>
          )}
        </div>
      </div>

      {status && prediction && (
        <>
          <div
            className="h-2 overflow-hidden rounded-full bg-viz-track"
            role="meter"
            aria-label="Gas left in this cylinder (predicted)"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(status.fractionLeft * 100)}
          >
            <div
              className={cn(
                'animate-grow-x h-full origin-left rounded-full',
                overdue || status.fractionLeft < 0.15 ? 'bg-status-critical' : 'bg-viz-bar',
              )}
              style={{ width: `${Math.max(2, status.fractionLeft * 100)}%` }}
            />
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Last refill</dt>
              <dd className="font-medium">{formatDate(last.refilledOn)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">A cylinder lasts</dt>
              <dd className="font-medium">about {days(Math.round(prediction.daysPerCylinder))}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  )
}
