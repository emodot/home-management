import {
  listItemFormSchema,
  mergeStoreTags,
  type ListItemFormInput,
  type ListItemPatch,
  type ShoppingListItem,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Trash2Icon } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useActiveHousehold } from '@/hooks/use-household'
import { useMediaQuery } from '@/hooks/use-lookups'
import { useRemoveListItem, useUpdateListItem } from '../hooks/use-shopping-list'
import { storeTagsQuery } from '../lib/queries'
import { QuantityUnitInput } from './quantity-unit-input'
import { StoreTagChips } from './store-tag-chips'

/** Edit an entry's quantity, unit, store and notes, or take it off the list. */
export function EditListItemSheet({
  entry,
  listStores,
  onClose,
}: {
  entry: ShoppingListItem | null
  /** Stores already on the list, offered first. */
  listStores: (string | null)[]
  onClose: () => void
}) {
  const wide = useMediaQuery('(min-width: 768px)')
  return (
    <Sheet open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={wide ? 'right' : 'bottom'}
        className={
          wide
            ? 'overflow-y-auto'
            : 'max-h-[90dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]'
        }
      >
        {entry && (
          // Remount per entry so the form starts from its values.
          <EditForm key={entry.id} entry={entry} listStores={listStores} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function EditForm({
  entry,
  listStores,
  onClose,
}: {
  entry: ShoppingListItem
  listStores: (string | null)[]
  onClose: () => void
}) {
  const household = useActiveHousehold()
  const update = useUpdateListItem(household.id)
  const remove = useRemoveListItem(household.id)
  const stores = useQuery(storeTagsQuery(household.id)).data ?? []
  const form = useForm<ListItemFormInput, unknown, ListItemPatch>({
    resolver: zodResolver(listItemFormSchema),
    defaultValues: {
      quantity: String(entry.quantity),
      unit: entry.unit,
      storeTag: entry.storeTag,
      notes: entry.notes ?? '',
    },
  })
  const { errors } = form.formState

  const submit = form.handleSubmit((patch) => {
    update.mutate({ entry, patch })
    onClose()
  })

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
      <SheetHeader>
        <SheetTitle>{entry.name}</SheetTitle>
        <SheetDescription>Changes show up for everyone straight away.</SheetDescription>
      </SheetHeader>
      <FieldGroup className="gap-5 px-4">
        <Field data-invalid={!!errors.quantity}>
          <FieldLabel htmlFor="list-quantity">How much</FieldLabel>
          <Controller
            control={form.control}
            name="unit"
            render={({ field: unit }) => (
              <Controller
                control={form.control}
                name="quantity"
                render={({ field: quantity }) => (
                  <QuantityUnitInput
                    id="list-quantity"
                    quantity={quantity.value}
                    unit={unit.value}
                    onQuantityChange={quantity.onChange}
                    onUnitChange={unit.onChange}
                    invalid={!!errors.quantity}
                  />
                )}
              />
            )}
          />
          <FieldError errors={[errors.quantity]} />
        </Field>
        <Field>
          <FieldLabel>Where to buy it</FieldLabel>
          <Controller
            control={form.control}
            name="storeTag"
            render={({ field }) => (
              <StoreTagChips
                value={field.value}
                onChange={field.onChange}
                suggestions={mergeStoreTags([listStores, stores])}
              />
            )}
          />
          <FieldDescription>A new unit or store is remembered for next time.</FieldDescription>
        </Field>
        <Field data-invalid={!!errors.notes}>
          <FieldLabel htmlFor="list-notes">Notes (optional)</FieldLabel>
          <Textarea
            id="list-notes"
            rows={2}
            placeholder="e.g. the big tin, not the sachet"
            {...form.register('notes')}
          />
          <FieldError errors={[errors.notes]} />
        </Field>
      </FieldGroup>
      <SheetFooter className="flex-row gap-2">
        <Button type="submit" className="flex-1">
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            remove.mutate(entry)
            onClose()
          }}
        >
          <Trash2Icon aria-hidden />
          Remove
        </Button>
      </SheetFooter>
    </form>
  )
}
