import { ADMIN_PAGE_SIZE } from '@home/shared'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'

/** Search box for the admin lists; the search lives in `?q=` and resets to the first page. */
export function AdminSearch({ label }: { label: string }) {
  const [params, setParams] = useSearchParams()
  const [text, setText] = useDebouncedSearch(params.get('q') ?? '', (q) =>
    setParams(q.trim() ? { q: q.trim() } : {}, { replace: true }),
  )
  return (
    <div className="relative">
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={label}
        aria-label={label}
        className="pl-9"
      />
    </div>
  )
}

/** "26–50 of 60" with previous/next, kept in `?page=` (0-based). */
export function AdminPager({ total, count }: { total: number; count: number }) {
  const [params, setParams] = useSearchParams()
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)
  if (total <= ADMIN_PAGE_SIZE) return null

  const go = (next: number) => {
    const updated = new URLSearchParams(params)
    if (next === 0) updated.delete('page')
    else updated.set('page', String(next))
    setParams(updated)
  }
  const from = page * ADMIN_PAGE_SIZE + 1
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {count === 0 ? 0 : from}–{from + count - 1} of {total}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" onClick={() => go(page - 1)} disabled={page === 0}>
          <ChevronLeftIcon aria-hidden />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => go(page + 1)}
          disabled={(page + 1) * ADMIN_PAGE_SIZE >= total}
        >
          Next
          <ChevronRightIcon aria-hidden />
        </Button>
      </div>
    </div>
  )
}

/** One headline number. */
export function StatTile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value.toLocaleString('en-NG')}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  )
}
