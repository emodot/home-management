import { addDays, formatDate, todayIn, type ActivityEntry } from '@home/shared'
import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { HistoryIcon } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { ActivityRow } from '@/components/activity'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { useActiveHousehold } from '@/hooks/use-household'
import { activityFeedQuery } from '@/lib/queries'

interface DayGroup {
  day: string
  entries: ActivityEntry[]
}

/** Consecutive entries grouped by their calendar day in the household's time zone. */
function groupByDay(entries: ActivityEntry[], timeZone: string): DayGroup[] {
  const groups: DayGroup[] = []
  for (const entry of entries) {
    const day = todayIn(timeZone, new Date(entry.createdAt))
    const last = groups.at(-1)
    if (last?.day === day) last.entries.push(entry)
    else groups.push({ day, entries: [entry] })
  }
  return groups
}

function dayHeading(day: string, today: string) {
  if (day === today) return 'Today'
  if (day === addDays(today, -1)) return 'Yesterday'
  return formatDate(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function ActivityPage() {
  const household = useActiveHousehold()
  const feed = useSuspenseInfiniteQuery(activityFeedQuery(household.id))
  const entries = useMemo(() => feed.data.pages.flatMap((page) => page.entries), [feed.data])
  const groups = useMemo(
    () => groupByDay(entries, household.timezone),
    [entries, household.timezone],
  )
  const today = todayIn(household.timezone)

  // Load the next page when the end of the list scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed
  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasNextPage) return
    const observer = new IntersectionObserver((observed) => {
      if (observed[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Everything added, changed or deleted in {household.name}.
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="Nothing has happened yet">
          Expenses, tasks, providers and members added or changed by anyone in the household will
          show up here.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section
              key={group.day}
              className="flex flex-col"
              aria-label={dayHeading(group.day, today)}
            >
              <h2 className="text-sm font-semibold text-muted-foreground">
                {dayHeading(group.day, today)}
              </h2>
              <ol className="divide-y">
                {group.entries.map((entry) => (
                  <ActivityRow key={entry.id} entry={entry} householdId={household.id} showItem />
                ))}
              </ol>
            </section>
          ))}
          <div ref={sentinel} />
          {hasNextPage && (
            <Button
              variant="outline"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? 'Loading…' : 'Show more'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
