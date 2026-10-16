import {
  CHECKLIST_ITEMS,
  CHECKLIST_KEY,
  checklistDoneCount,
  type ChecklistItem,
} from '@home/shared'
import { useQuery } from '@tanstack/react-query'
import { CircleCheckIcon, CircleIcon, PartyPopperIcon, XIcon } from 'lucide-react'
import { useContext, useEffect } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { useActiveHousehold } from '@/hooks/use-household'
import { cn } from '@/lib/utils'
import { useOnboarding } from '../hooks/use-onboarding'
import { checklistQuery } from '../lib/queries'
import { TourContext } from '../lib/tour-context'

const ITEMS: Record<ChecklistItem, { label: string; action: string; to: string }> = {
  expense: { label: 'Add your first expense', action: 'Add expense', to: '/expenses/new' },
  receipt: { label: 'Attach a receipt', action: 'Snap a receipt', to: '/expenses/new' },
  invite: { label: 'Invite someone you live with', action: 'Invite', to: '/members' },
  provider: { label: 'Add a service provider', action: 'Add provider', to: '/providers/new' },
  recurringTask: { label: 'Create a recurring task', action: 'Add task', to: '/tasks/new' },
  shoppingList: { label: 'Start a shopping list', action: 'Open the list', to: '/kitchen/list' },
}

/**
 * "Get your home set up": first things to do, each ticked from the household's own data (so it's
 * right for members who join later too), until all are done or the user hides it.
 */
export function GettingStarted() {
  const household = useActiveHousehold()
  const { shouldShow, mark } = useOnboarding()
  const tours = useContext(TourContext)
  // Reopened from Help, it shows whatever happened to it before.
  const reopened = tours?.checklistOpen ?? false
  const visible = shouldShow(CHECKLIST_KEY) || reopened
  const progress = useQuery({ ...checklistQuery(household.id), enabled: visible }).data
  const done = progress ? checklistDoneCount(progress) : 0
  const allDone = done === CHECKLIST_ITEMS.length

  // Everything done: the card says so this once, and is gone for good once they leave the page.
  useEffect(() => {
    if (!allDone) return
    return () => mark(CHECKLIST_KEY, { version: 1, status: 'completed' })
  }, [allDone, mark])

  if (!visible || !progress) return null

  const hide = () => {
    tours?.setChecklistOpen(false)
    mark(CHECKLIST_KEY, { version: 1, status: allDone ? 'completed' : 'dismissed' })
  }

  return (
    <section
      aria-labelledby="getting-started-heading"
      className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="getting-started-heading" className="font-semibold">
            {allDone ? 'You’re all set' : 'Get your home set up'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {allDone
              ? 'Everything’s in place. Help → Getting started brings this back.'
              : `${String(done)} of ${String(CHECKLIST_ITEMS.length)} done`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mt-1 -mr-2 text-muted-foreground"
          onClick={hide}
          aria-label="Hide getting started"
        >
          <XIcon aria-hidden />
        </Button>
      </div>

      <div
        role="progressbar"
        aria-label="Getting started"
        aria-valuemin={0}
        aria-valuemax={CHECKLIST_ITEMS.length}
        aria-valuenow={done}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${String((done / CHECKLIST_ITEMS.length) * 100)}%` }}
        />
      </div>

      {allDone ? (
        <p className="flex items-center gap-2 text-sm">
          <PartyPopperIcon className="size-4 text-primary" aria-hidden />
          {household.name} is ready to run on Lintel.
        </p>
      ) : (
        <ul className="flex flex-col">
          {CHECKLIST_ITEMS.map((item) => {
            const { label, action, to } = ITEMS[item]
            const isDone = progress[item]
            return (
              <li key={item} className="flex min-h-11 items-center gap-3 py-1">
                {isDone ? (
                  <CircleCheckIcon className="size-5 shrink-0 text-primary" aria-hidden />
                ) : (
                  <CircleIcon className="size-5 shrink-0 text-muted-foreground/50" aria-hidden />
                )}
                <span
                  className={cn(
                    'min-w-0 flex-1 text-sm',
                    isDone && 'text-muted-foreground line-through',
                  )}
                >
                  {label}
                  <span className="sr-only">{isDone ? ' (done)' : ' (to do)'}</span>
                </span>
                {!isDone && (
                  <Button asChild variant="outline" size="sm">
                    <Link to={to}>{action}</Link>
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
