import {
  convert,
  DuplicateKitchenItemError,
  formatQuantity,
  itemConversionFormSchema,
  kitchenItemInputSchema,
  KITCHEN_UNITS,
  unitLabel,
  type CatalogItem,
  type KitchenItem,
  type KitchenItemInput,
  type KitchenItemValues,
  type KitchenUnit,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ChartLineIcon, PackageIcon, PlusIcon, XIcon } from 'lucide-react'
import { useState, type ReactNode, type SyntheticEvent } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useActiveHousehold } from '@/hooks/use-household'
import { errorMessage } from '@/lib/errors'
import { ItemHeading } from '../components/item-heading'
import { OnListBadge } from '../components/pantry-badges'
import { StoreTagChips } from '../components/store-tag-chips'
import {
  useAddItemConversion,
  useMergeKitchenItems,
  useRemoveItemConversion,
  useUpdateKitchenItem,
} from '../hooks/use-catalog'
import { useCatalogItem } from '../hooks/use-catalog-item'
import {
  catalogQuery,
  conversionsQuery,
  pantryQuery,
  shoppingListQuery,
  storeTagsQuery,
} from '../lib/queries'

/** One catalogue item: its name and usual unit and store, how its units relate, and merging. */
export function CatalogItemPage() {
  const household = useActiveHousehold()
  const { itemId, item } = useCatalogItem()
  const catalog = useSuspenseQuery(catalogQuery(household.id)).data
  const list = useSuspenseQuery(shoppingListQuery(household.id)).data
  const pantry = useSuspenseQuery(pantryQuery(household.id)).data
  // A merge to make, picked from the Items page or after renaming to a name that's taken.
  const [merging, setMerging] = useState<{ keep: CatalogItem; merge: CatalogItem } | null>(null)

  if (!item) return null
  const self = catalog.find((c) => c.id === itemId) ?? { ...item, priceCount: 0 }
  const stock = pantry.find((p) => p.itemId === itemId)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <ItemHeading name={item.name} back="/kitchen/items" backLabel="Back to items" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {list.some((e) => e.itemId === itemId) && <OnListBadge />}
          <Button asChild variant="outline" size="sm">
            <Link to={`/kitchen/pantry/${itemId}`}>
              <PackageIcon aria-hidden />
              {stock ? `In the pantry: ${formatQuantity(stock.quantity, stock.unit)}` : 'Pantry'}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/kitchen/prices/${itemId}`}>
              <ChartLineIcon aria-hidden />
              {self.priceCount > 0
                ? `${self.priceCount} ${self.priceCount === 1 ? 'price' : 'prices'}`
                : 'Prices'}
            </Link>
          </Button>
        </div>
      </div>

      <DetailsForm
        key={`${item.id}:${item.name}`}
        item={item}
        onTaken={(existing) => {
          const keep = catalog.find((c) => c.id === existing.id)
          if (keep) setMerging({ keep, merge: self })
        }}
      />
      <UnitsSection key={`units:${item.id}`} item={item} />
      <MergeSection
        key={`merge:${item.id}`}
        item={self}
        others={catalog.filter((c) => c.id !== itemId)}
        onMerge={(merge) => setMerging({ keep: self, merge })}
      />

      {merging && <MergeDialog {...merging} onClose={() => setMerging(null)} />}
    </div>
  )
}

function SectionHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="font-semibold">{title}</h3>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
    </div>
  )
}

function UnitSelect({
  id,
  value,
  onChange,
  label,
  count = 1,
}: {
  id?: string
  value: KitchenUnit
  onChange: (unit: KitchenUnit) => void
  label?: string
  count?: number
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as KitchenUnit)}>
      <SelectTrigger id={id} className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {KITCHEN_UNITS.map((u) => (
          <SelectItem key={u} value={u}>
            {unitLabel(u, count)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Name, usual unit and usual store. A name another item has offers to merge the two. */
function DetailsForm({
  item,
  onTaken,
}: {
  item: KitchenItem
  onTaken: (existing: KitchenItem) => void
}) {
  const household = useActiveHousehold()
  const stores = useSuspenseQuery(storeTagsQuery(household.id)).data
  const update = useUpdateKitchenItem(household.id)
  const [taken, setTaken] = useState<KitchenItem | null>(null)
  const form = useForm<KitchenItemInput, unknown, KitchenItemValues>({
    resolver: zodResolver(kitchenItemInputSchema),
    defaultValues: {
      name: item.name,
      defaultUnit: item.defaultUnit,
      defaultStoreTag: item.defaultStoreTag,
    },
  })
  const { errors, isDirty } = form.formState

  const submit = form.handleSubmit((values) => {
    setTaken(null)
    update.mutate(
      { item, input: values },
      {
        onSuccess: () => {
          toast.success('Saved')
          form.reset(values)
        },
        onError: (error) => {
          if (error instanceof DuplicateKitchenItemError) setTaken(error.existing)
          else toast.error(`Couldn't save it. ${errorMessage(error)}`)
        },
      },
    )
  })

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
      <FieldGroup className="gap-5">
        <Field data-invalid={!!errors.name || !!taken}>
          <FieldLabel htmlFor="item-name">Name</FieldLabel>
          <Input
            id="item-name"
            autoComplete="off"
            maxLength={80}
            aria-invalid={!!errors.name || !!taken}
            {...form.register('name', { onChange: () => setTaken(null) })}
          />
          <FieldError errors={[errors.name]} />
          {taken && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-destructive">There's already an item called {taken.name}.</span>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={() => onTaken(taken)}
              >
                Merge this into {taken.name}
              </Button>
            </div>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="item-unit">Usually bought by the</FieldLabel>
            <Controller
              control={form.control}
              name="defaultUnit"
              render={({ field }) => (
                <UnitSelect id="item-unit" value={field.value ?? 'pcs'} onChange={field.onChange} />
              )}
            />
          </Field>
        </div>
        <Field>
          <FieldTitle>Usual store</FieldTitle>
          <Controller
            control={form.control}
            name="defaultStoreTag"
            render={({ field }) => (
              <StoreTagChips
                value={field.value ?? null}
                onChange={(store) => field.onChange(store)}
                suggestions={stores}
              />
            )}
          />
        </Field>
      </FieldGroup>
      <div>
        <Button type="submit" disabled={!isDirty || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

const METRIC: readonly KitchenUnit[] = ['kg', 'g', 'litre', 'ml']

/** "1 bag = 50 kg": how the item's units relate, so stock adds up and prices compare. */
function UnitsSection({ item }: { item: KitchenItem }) {
  const household = useActiveHousehold()
  const conversions = useSuspenseQuery(conversionsQuery(household.id)).data.filter(
    (c) => c.itemId === item.id,
  )
  const add = useAddItemConversion(household.id, item)
  const remove = useRemoveItemConversion(household.id)
  const initialUnit = METRIC.includes(item.defaultUnit) ? 'bag' : item.defaultUnit
  const [unit, setUnit] = useState<KitchenUnit>(initialUnit)
  const [factor, setFactor] = useState('')
  const [toUnit, setToUnit] = useState<KitchenUnit>(initialUnit === 'kg' ? 'pcs' : 'kg')
  const [error, setError] = useState<string | null>(null)

  function submit(e: SyntheticEvent) {
    e.preventDefault()
    const parsed = itemConversionFormSchema.safeParse({ unit, factor, toUnit })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the conversion')
      return
    }
    if (conversions.some((c) => c.unit === parsed.data.unit)) {
      setError(`${item.name} already has a size for 1 ${unitLabel(parsed.data.unit)}`)
      return
    }
    if (convert(1, parsed.data.unit, parsed.data.toUnit, conversions) !== null) {
      setError('These already convert through the units below')
      return
    }
    setError(null)
    add.mutate(parsed.data, {
      onSuccess: () => setFactor(''),
      onError: (err) => setError(`Couldn't add it. ${errorMessage(err)}`),
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading title="Units">
        Say how {item.name} is sold, so stock bought by the bag and by the kg adds up in the pantry
        and prices compare. Grams, kg, ml and litres already convert.
      </SectionHeading>
      {conversions.length > 0 && (
        <ul className="list-surface">
          {conversions.map((c) => {
            const text = `1 ${unitLabel(c.unit)} = ${formatQuantity(c.factor, c.toUnit)}`
            return (
              <li key={c.id} className="flex items-center gap-3 py-1 pr-1 pl-3 text-sm">
                <span className="min-w-0 flex-1 tabular-nums">{text}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${text}`}
                  onClick={() => remove.mutate(c.id)}
                  disabled={remove.isPending}
                >
                  <XIcon aria-hidden />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <form onSubmit={submit} noValidate className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 basis-48 items-center gap-2">
            <span className="text-sm text-muted-foreground">1</span>
            <div className="min-w-0 flex-1">
              <UnitSelect value={unit} onChange={setUnit} label="Unit" />
            </div>
            <span className="text-sm text-muted-foreground">=</span>
          </div>
          <div className="flex min-w-0 flex-1 basis-64 items-center gap-2">
            <Input
              inputMode="decimal"
              autoComplete="off"
              aria-label={`How many in 1 ${unitLabel(unit)}`}
              aria-invalid={!!error}
              placeholder="50"
              className="w-20 shrink-0 tabular-nums"
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
            />
            <div className="min-w-0 flex-1">
              <UnitSelect value={toUnit} onChange={setToUnit} label="In units of" count={2} />
            </div>
            <Button type="submit" variant="outline" disabled={add.isPending}>
              <PlusIcon aria-hidden />
              Add
            </Button>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </section>
  )
}

/** Picks another item that's really this one, to fold into it. */
function MergeSection({
  item,
  others,
  onMerge,
}: {
  item: CatalogItem
  others: CatalogItem[]
  onMerge: (merge: CatalogItem) => void
}) {
  const [params] = useSearchParams()
  const [picked, setPicked] = useState(params.get('merge') ?? '')
  const merge = others.find((o) => o.id === picked)
  if (others.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading title="Merge a duplicate">
        If another item is really {item.name}, merge it in: its prices, pantry stock and list entry
        move here.
      </SectionHeading>
      <div className="flex gap-2">
        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger
            className="min-w-0 flex-1 sm:w-64 sm:flex-none"
            aria-label="Item to merge in"
          >
            <SelectValue placeholder="Choose an item" />
          </SelectTrigger>
          <SelectContent>
            {others.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={!merge}
          onClick={() => merge && onMerge(merge)}
        >
          Merge…
        </Button>
      </div>
    </section>
  )
}

function MergeDialog({
  keep,
  merge,
  onClose,
}: {
  keep: CatalogItem
  merge: CatalogItem
  onClose: () => void
}) {
  const household = useActiveHousehold()
  const navigate = useNavigate()
  const mergeItems = useMergeKitchenItems(household.id)
  const list = useSuspenseQuery(shoppingListQuery(household.id)).data
  const pantry = useSuspenseQuery(pantryQuery(household.id)).data

  const moves = [
    merge.priceCount > 0 &&
      (merge.priceCount === 1 ? 'its price' : `its ${merge.priceCount} prices`),
    pantry.some((p) => p.itemId === merge.id) && 'its pantry stock',
    list.some((e) => e.itemId === merge.id) && 'its list entry',
  ].filter((m): m is string => !!m)
  const what =
    moves.length === 0
      ? ''
      : moves.length === 1
        ? `${moves[0]} moves`
        : `${moves.slice(0, -1).join(', ')} and ${moves.at(-1)} move`

  return (
    <AlertDialog open onOpenChange={(open) => !open && !mergeItems.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Merge {merge.name} into {keep.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {what &&
              `${what[0]?.toUpperCase()}${what.slice(1)} to ${keep.name}, adding up where the units convert. `}
            {merge.name} is then deleted. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mergeItems.isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={mergeItems.isPending}
            onClick={() =>
              mergeItems.mutate(
                { keep, merge },
                {
                  onSuccess: () => {
                    onClose()
                    void navigate(`/kitchen/items/${keep.id}`, { replace: true })
                  },
                  onError: (error) => toast.error(`Couldn't merge them. ${errorMessage(error)}`),
                },
              )
            }
          >
            {mergeItems.isPending ? 'Merging…' : 'Merge'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
