import {
  formatDate,
  formatMoney,
  formatPhone,
  TRADE_LABELS,
  todayIn,
  yearRange,
} from '@home/shared'
import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import {
  ArrowLeftIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { CategoryIcon } from '@/components/category-icon'
import { ContactButtons } from '@/components/contact-buttons'
import { StarRating } from '@/components/star-rating'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useActiveHousehold } from '@/hooks/use-household'
import { useCategoryLookup } from '@/hooks/use-lookups'
import { useDeleteProvider, useProviderLookup, useRestoreProvider } from '@/hooks/use-providers'
import { expenseListQuery, providerTotalsQuery } from '@/lib/queries'

export function ProviderDetailPage() {
  const { providerId = '' } = useParams()
  const household = useActiveHousehold()
  const provider = useProviderLookup(household.id).get(providerId)
  const thisYear = yearRange(todayIn(household.timezone))
  const allTime = useSuspenseQuery(providerTotalsQuery(household.id)).data.find(
    (t) => t.providerId === providerId,
  )
  const yearTotal = useSuspenseQuery(providerTotalsQuery(household.id, thisYear)).data.find(
    (t) => t.providerId === providerId,
  )
  const recent =
    useSuspenseInfiniteQuery(expenseListQuery(household.id, { provider: providerId })).data
      .pages[0] ?? []
  const categories = useCategoryLookup(household.id)
  const remove = useDeleteProvider(household.id)
  const restore = useRestoreProvider(household.id)
  const navigate = useNavigate()

  if (!provider) throw new Response('Not found', { status: 404, statusText: 'Not found' })
  const deleted = provider.deleted_at !== null

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link to="/providers">
            <ArrowLeftIcon aria-hidden />
            Providers
          </Link>
        </Button>
        {!deleted && (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/providers/${provider.id}/edit`}>
                <PencilIcon aria-hidden />
                Edit
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                remove.mutate(provider)
                void navigate('/providers', { replace: true })
              }}
            >
              <Trash2Icon aria-hidden />
              Delete
            </Button>
          </div>
        )}
      </div>

      {deleted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm">This provider was deleted. Their past expenses are kept.</p>
          <Button size="sm" variant="outline" onClick={() => restore.mutate(provider)}>
            <RotateCcwIcon aria-hidden />
            Restore
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{provider.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{TRADE_LABELS[provider.trade]}</Badge>
            {provider.rating !== null && <StarRating rating={provider.rating} />}
          </div>
        </div>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          {provider.phone && (
            <p className="flex items-center gap-2">
              <PhoneIcon className="size-4" aria-hidden />
              {formatPhone(provider.phone)}
              {provider.whatsapp &&
                provider.whatsapp !== provider.phone &&
                ` · WhatsApp ${formatPhone(provider.whatsapp)}`}
            </p>
          )}
          {provider.area && (
            <p className="flex items-center gap-2">
              <MapPinIcon className="size-4" aria-hidden />
              {provider.area}
            </p>
          )}
        </div>
        <ContactButtons provider={provider} size="default" />
      </div>

      {provider.notes && (
        <section className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">Notes</h2>
          <p className="text-sm whitespace-pre-wrap">{provider.notes}</p>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">Spent this year</p>
          <p className="text-2xl font-semibold tracking-tight">
            {formatMoney(yearTotal?.totalMinor ?? 0, household.currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            {yearTotal?.expenseCount ?? 0} {yearTotal?.expenseCount === 1 ? 'expense' : 'expenses'}
          </p>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border p-4">
          <p className="text-sm text-muted-foreground">All time</p>
          <p className="text-2xl font-semibold tracking-tight">
            {formatMoney(allTime?.totalMinor ?? 0, household.currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            {allTime?.expenseCount ?? 0} {allTime?.expenseCount === 1 ? 'expense' : 'expenses'}
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Expenses</h2>
          {recent.length > 0 && (
            <Link
              to={`/?provider=${provider.id}`}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              See all
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No expenses with {provider.name} yet. Choose them as the provider when you add one.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {recent.slice(0, 10).map((e) => {
              const category = categories.get(e.categoryId)
              return (
                <li key={e.id}>
                  <Link
                    to={`/expenses/${e.id}`}
                    className="flex items-center gap-3 px-3 py-3 hover:bg-muted/50"
                  >
                    <CategoryIcon icon={category?.icon} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.description}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {formatDate(e.occurredOn)}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">
                      {formatMoney(e.amountMinor, e.currency)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      {/* Tasks linked to this provider are added with tasks (M7). */}
    </div>
  )
}
