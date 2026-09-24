import { formatRelativeTime, type ActivityEntry } from '@home/shared'
import { useQuery } from '@tanstack/react-query'
import { RepeatIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/user-avatar'
import { useCurrentUser } from '@/hooks/use-household'
import { useMemberNames } from '@/hooks/use-lookups'
import { activityHref } from '@/lib/activity'
import { itemHistoryQuery } from '@/lib/queries'

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** How to show who did something: "You", a member's name, or "A former member". */
function useActor(householdId: string) {
  const user = useCurrentUser()
  const memberNames = useMemberNames(householdId)
  return (actorId: string) => {
    const fullName = memberNames.get(actorId) ?? 'A former member'
    return { label: actorId === user.id ? 'You' : fullName, fullName }
  }
}

/**
 * One line of activity: who did what, and (in the household feed) to which item.
 * Entries without an actor were made by the daily job (e.g. recurring bills).
 */
export function ActivityRow({
  entry,
  householdId,
  showItem,
}: {
  entry: ActivityEntry
  householdId: string
  showItem: boolean
}) {
  const actorOf = useActor(householdId)
  const actor = entry.actorId ? actorOf(entry.actorId) : null
  const href = activityHref(entry)
  // Members and invites already name the person in the summary.
  const item = showItem && !['member', 'invite'].includes(entry.entityType) ? entry.label : null

  return (
    <li className="flex gap-3 py-3">
      {actor ? (
        <UserAvatar name={actor.fullName} />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <RepeatIcon className="size-4 text-muted-foreground" aria-label="Automatic" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm break-words">
          {actor ? (
            <>
              <span className="font-medium">{actor.label}</span> {entry.summary}
            </>
          ) : (
            capitalise(entry.summary)
          )}
        </p>
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {item && href && (
            <>
              <Link
                to={href}
                className="max-w-full truncate font-medium text-foreground underline-offset-4 hover:underline"
              >
                {item}
              </Link>
              <span aria-hidden>·</span>
            </>
          )}
          <time dateTime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString()}>
            {formatRelativeTime(entry.createdAt)}
          </time>
        </p>
      </div>
    </li>
  )
}

const COLLAPSED_COUNT = 5

/** The "Activity" section on expense, provider and task pages. Loads after the page. */
export function ItemHistory({
  householdId,
  entityType,
  entityId,
  headingClassName = 'text-sm font-semibold',
}: {
  householdId: string
  entityType: 'expense' | 'provider' | 'task'
  entityId: string
  headingClassName?: string
}) {
  const history = useQuery(itemHistoryQuery(householdId, entityType, entityId))
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? history.data : history.data?.slice(0, COLLAPSED_COUNT)

  return (
    <section className="flex flex-col gap-1" aria-labelledby="item-activity">
      <h2 id="item-activity" className={headingClassName}>
        Activity
      </h2>
      {history.isPending ? (
        <div className="flex flex-col gap-3 py-3" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : history.isError ? (
        <p className="py-3 text-sm text-muted-foreground">Couldn’t load the activity.</p>
      ) : history.data.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">No activity recorded yet.</p>
      ) : (
        <>
          <ol className="divide-y">
            {shown?.map((entry) => (
              <ActivityRow
                key={entry.id}
                entry={entry}
                householdId={householdId}
                showItem={false}
              />
            ))}
          </ol>
          {!expanded && history.data.length > COLLAPSED_COUNT && (
            <Button
              variant="link"
              size="sm"
              className="h-auto w-fit px-0"
              onClick={() => setExpanded(true)}
            >
              Show all {history.data.length}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
