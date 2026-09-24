import { PROVIDER_TRADES, TRADE_LABELS, type ProviderTrade } from '@home/shared'
import { HardHatIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { ContactButtons } from '@/components/contact-buttons'
import { StarRating } from '@/components/star-rating'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useActiveHousehold } from '@/hooks/use-household'
import { useActiveProviders } from '@/hooks/use-providers'
import { cn } from '@/lib/utils'

export function ProvidersPage() {
  const household = useActiveHousehold()
  const providers = useActiveProviders(household.id)
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const trade = PROVIDER_TRADES.includes(params.get('trade') as ProviderTrade)
    ? (params.get('trade') as ProviderTrade)
    : null

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const needle = q.trim().toLowerCase()
  const shown = providers.filter(
    (p) => (!trade || p.trade === trade) && (!needle || p.name.toLowerCase().includes(needle)),
  )
  // Only offer trade filters that have providers.
  const trades = PROVIDER_TRADES.filter((t) => providers.some((p) => p.trade === t))

  if (providers.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Providers</h1>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
          <HardHatIcon className="size-10 text-muted-foreground" aria-hidden />
          <p className="text-lg font-medium">Keep your trusted people in one place</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Save the plumber, electrician and generator technician you rely on, call or WhatsApp
            them in one tap, and see how much you&apos;ve spent with each.
          </p>
          <Button asChild className="mt-2">
            <Link to="/providers/new">
              <PlusIcon aria-hidden />
              Add provider
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Providers</h1>
        <Button asChild size="sm">
          <Link to="/providers/new">
            <PlusIcon aria-hidden />
            Add
          </Link>
        </Button>
      </div>

      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="Search by name"
          aria-label="Search providers"
          className="pl-9"
          value={q}
          onChange={(e) => setParam('q', e.target.value)}
        />
      </div>

      {trades.length > 1 && (
        <div
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0"
          role="group"
          aria-label="Filter by trade"
        >
          {[null, ...trades].map((t) => (
            <button
              key={t ?? 'all'}
              type="button"
              aria-pressed={trade === t}
              onClick={() => setParam('trade', t)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-sm transition-colors',
                trade === t
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-muted',
              )}
            >
              {t ? TRADE_LABELS[t] : 'All'}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No providers match.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {shown.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-3">
              <Link to={`/providers/${p.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="flex items-center gap-2 truncate text-sm text-muted-foreground">
                  <span className="truncate">
                    {TRADE_LABELS[p.trade]}
                    {p.area ? ` · ${p.area}` : ''}
                  </span>
                  {p.rating !== null && <StarRating rating={p.rating} className="shrink-0" />}
                </p>
              </Link>
              <ContactButtons provider={p} iconOnly />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
