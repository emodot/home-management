import {
  expenseFiltersToParams,
  monthRange,
  todayIn,
  type Category,
  type ExpenseFilters,
} from '@home/shared'
import { SlidersHorizontalIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/use-lookups'
import { PERIOD_LABELS, periodOf, periodRange, type Period } from '@/lib/expense-filter-labels'

const ANY = '__any__'

export function ExpenseFiltersSheet({
  filters,
  onApply,
  categories,
  members,
  providers,
  timezone,
}: {
  filters: ExpenseFilters
  onApply: (filters: ExpenseFilters) => void
  categories: Category[]
  members: { id: string; name: string }[]
  providers: { id: string; name: string }[]
  timezone: string
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(filters)
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const today = todayIn(timezone)
  const period = periodOf(draft, today)
  const activeCount =
    Object.keys(expenseFiltersToParams({ ...filters, q: undefined })).length -
    (filters.from && filters.to ? 1 : 0)

  function setPeriod(next: Period) {
    if (next === 'custom') {
      setDraft({ ...draft, from: draft.from ?? monthRange(today).from, to: draft.to ?? today })
    } else {
      setDraft({ ...draft, ...periodRange(next, today) })
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setDraft(filters)
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontalIcon aria-hidden />
          Filters
          {activeCount > 0 && <Badge className="ml-1 h-5 min-w-5 px-1.5">{activeCount}</Badge>}
        </Button>
      </SheetTrigger>
      <SheetContent side={isDesktop ? 'right' : 'bottom'} className="max-h-[90dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filter expenses</SheetTitle>
          <SheetDescription className="sr-only">Narrow down the expense list</SheetDescription>
        </SheetHeader>
        <FieldGroup className="px-4">
          <Field>
            <FieldLabel htmlFor="filter-period">Period</FieldLabel>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger id="filter-period" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PERIOD_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {period === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="filter-from">From</FieldLabel>
                <Input
                  id="filter-from"
                  type="date"
                  value={draft.from ?? ''}
                  onChange={(e) => setDraft({ ...draft, from: e.target.value || undefined })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="filter-to">To</FieldLabel>
                <Input
                  id="filter-to"
                  type="date"
                  value={draft.to ?? ''}
                  onChange={(e) => setDraft({ ...draft, to: e.target.value || undefined })}
                />
              </Field>
            </div>
          )}
          <Field>
            <FieldLabel htmlFor="filter-category">Category</FieldLabel>
            <Select
              value={draft.category ?? ANY}
              onValueChange={(v) => setDraft({ ...draft, category: v === ANY ? undefined : v })}
            >
              <SelectTrigger id="filter-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.is_archived ? ' (archived)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="filter-paid-by">Paid by</FieldLabel>
            <Select
              value={draft.paidBy ?? ANY}
              onValueChange={(v) => setDraft({ ...draft, paidBy: v === ANY ? undefined : v })}
            >
              <SelectTrigger id="filter-paid-by" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Anyone</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {providers.length > 0 && (
            <Field>
              <FieldLabel htmlFor="filter-provider">Provider</FieldLabel>
              <Select
                value={draft.provider ?? ANY}
                onValueChange={(v) => setDraft({ ...draft, provider: v === ANY ? undefined : v })}
              >
                <SelectTrigger id="filter-provider" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any provider</SelectItem>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="filter-receipt">Receipt</FieldLabel>
            <Select
              value={draft.receipt ?? ANY}
              onValueChange={(v) =>
                setDraft({ ...draft, receipt: v === ANY ? undefined : (v as 'with' | 'without') })
              }
            >
              <SelectTrigger id="filter-receipt" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>With or without</SelectItem>
                <SelectItem value="with">Has a receipt</SelectItem>
                <SelectItem value="without">No receipt</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <SheetFooter className="flex-row">
          <Button
            className="flex-1"
            onClick={() => {
              onApply(draft)
              setOpen(false)
            }}
          >
            Show results
          </Button>
          <Button variant="ghost" onClick={() => setDraft({ q: draft.q })}>
            Reset
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export function FilterChips({
  chips,
  onRemove,
  onClear,
}: {
  chips: { key: string; label: string }[]
  onRemove: (key: string) => void
  onClear: () => void
}) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant="secondary"
          className="gap-1 py-1 pr-1 pl-2.5 text-sm font-normal"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => onRemove(chip.key)}
            className="rounded-full p-0.5 hover:bg-background"
            aria-label={`Remove filter: ${chip.label}`}
          >
            <XIcon className="size-3.5" aria-hidden />
          </button>
        </Badge>
      ))}
      <Button variant="link" size="sm" className="h-auto px-1" onClick={onClear}>
        Clear all
      </Button>
    </div>
  )
}
