import {
  formatDate,
  formatMoney,
  formatQuantity,
  LOCATION_LABELS,
  PANTRY_LOCATIONS,
  pantryItemFormSchema,
  unitLabel,
  type PantryItem,
  type PantryItemFormInput,
  type PantryItemFormValues,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { PackageOpenIcon, ShoppingBasketIcon, Trash2Icon } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useActiveHousehold } from '@/hooks/use-household'
import { ItemHeading } from '../components/item-heading'
import { OnListBadge } from '../components/pantry-badges'
import { QuantityUnitInput } from '../components/quantity-unit-input'
import { useCatalogItem } from '../hooks/use-catalog-item'
import {
  useAddToPantry,
  useMarkRunningLow,
  usePantry,
  useRemovePantryItem,
  useUpdatePantryItem,
} from '../hooks/use-pantry'
import { itemPricesQuery, shoppingListQuery } from '../lib/queries'

export function PantryItemPage() {
  const household = useActiveHousehold()
  const { itemId, item } = useCatalogItem()
  const pantry = usePantry(household.id)
  const list = useSuspenseQuery(shoppingListQuery(household.id)).data
  const add = useAddToPantry(household.id)
  const entry = pantry.find((p) => p.itemId === itemId)
  const name = item?.name ?? 'Item'

  return (
    <div className="flex flex-col gap-6">
      <ItemHeading
        name={name}
        back="/kitchen/pantry"
        backLabel="Back to the pantry"
        itemId={itemId}
      />
      {entry ? (
        <PantryItemForm
          key={entry.id}
          entry={entry}
          onList={list.some((e) => e.itemId === itemId)}
        />
      ) : (
        <EmptyState
          icon={PackageOpenIcon}
          title="Not in the pantry"
          size="sm"
          action={
            item && (
              <Button
                onClick={() => add.mutate({ item, location: 'pantry' })}
                disabled={add.isPending}
              >
                Add to the pantry
              </Button>
            )
          }
        >
          Shopping trips add it when you buy it, or add it now to keep track of what you have.
        </EmptyState>
      )}
      <RecentPrices itemId={itemId} />
    </div>
  )
}

function PantryItemForm({ entry, onList }: { entry: PantryItem; onList: boolean }) {
  const household = useActiveHousehold()
  const navigate = useNavigate()
  const update = useUpdatePantryItem(household.id)
  const remove = useRemovePantryItem(household.id)
  const runningLow = useMarkRunningLow(household.id)
  const form = useForm<PantryItemFormInput, unknown, PantryItemFormValues>({
    resolver: zodResolver(pantryItemFormSchema),
    defaultValues: {
      quantity: String(entry.quantity),
      unit: entry.unit,
      location: entry.location,
      expiresOn: entry.expiresOn ?? '',
      lowStockThreshold: entry.lowStockThreshold === null ? '' : String(entry.lowStockThreshold),
    },
  })
  const { errors, isDirty } = form.formState
  const unit = useWatch({ control: form.control, name: 'unit' })

  const submit = form.handleSubmit((values) => {
    update.mutate(
      { item: entry, patch: values },
      {
        onSuccess: () => {
          toast.success('Saved')
          form.reset(form.getValues())
        },
      },
    )
  })

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-6">
      <FieldGroup className="gap-5">
        <Field data-invalid={!!errors.quantity}>
          <FieldLabel htmlFor="pantry-quantity">How much there is</FieldLabel>
          <Controller
            control={form.control}
            name="unit"
            render={({ field: unitField }) => (
              <Controller
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <QuantityUnitInput
                    id="pantry-quantity"
                    quantity={field.value}
                    unit={unitField.value}
                    onQuantityChange={field.onChange}
                    onUnitChange={unitField.onChange}
                    invalid={!!errors.quantity}
                  />
                )}
              />
            )}
          />
          <FieldError errors={[errors.quantity]} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="pantry-location">Kept in</FieldLabel>
            <Controller
              control={form.control}
              name="location"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="pantry-location" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PANTRY_LOCATIONS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {LOCATION_LABELS[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field data-invalid={!!errors.expiresOn}>
            <FieldLabel htmlFor="pantry-expires">Use by (optional)</FieldLabel>
            <Input id="pantry-expires" type="date" {...form.register('expiresOn')} />
            <FieldError errors={[errors.expiresOn]} />
          </Field>
        </div>

        <Field data-invalid={!!errors.lowStockThreshold}>
          <FieldLabel htmlFor="pantry-threshold">Running low at (optional)</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id="pantry-threshold"
              inputMode="decimal"
              autoComplete="off"
              className="w-28 tabular-nums"
              placeholder="e.g. 1"
              aria-invalid={!!errors.lowStockThreshold}
              {...form.register('lowStockThreshold')}
            />
            <span className="text-sm text-muted-foreground">{unitLabel(unit, 2)}</span>
          </div>
          <FieldDescription>
            At or below this, it goes on the shopping list by itself.
          </FieldDescription>
          <FieldError errors={[errors.lowStockThreshold]} />
        </Field>
      </FieldGroup>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!isDirty || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
        {onList ? (
          <OnListBadge />
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => runningLow.mutate(entry)}
            disabled={runningLow.isPending}
          >
            <ShoppingBasketIcon aria-hidden />
            Running low: add to list
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          className="ml-auto text-destructive hover:text-destructive"
          onClick={() => {
            remove.mutate(entry)
            void navigate('/kitchen/pantry')
          }}
        >
          <Trash2Icon aria-hidden />
          Remove
        </Button>
      </div>
    </form>
  )
}

/** The last few times it was bought, with a link to the full price history. */
function RecentPrices({ itemId }: { itemId: string }) {
  const household = useActiveHousehold()
  const prices = useQuery(itemPricesQuery(household.id, itemId)).data ?? []
  if (prices.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">Recent prices</h3>
        <Link
          to={`/kitchen/prices/${itemId}`}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Price history
        </Link>
      </div>
      <ul className="list-surface">
        {prices.slice(0, 5).map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block">{formatDate(p.boughtOn)}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {formatQuantity(p.quantity, p.unit)}
                {p.storeTag ? ` · ${p.storeTag}` : ''}
              </span>
            </span>
            <span className="text-right tabular-nums">
              <span className="block font-medium">{formatMoney(p.priceMinor)}</span>
              {p.quantity !== 1 && (
                <span className="block text-xs text-muted-foreground">
                  {formatMoney(p.unitPriceMinor)}/{unitLabel(p.unit)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
