import type { KitchenItem } from '@home/shared'
import { toast } from 'sonner'
import { useActiveHousehold } from '@/hooks/use-household'
import { useAddListItem } from '../hooks/use-shopping-list'
import { ItemAutocomplete } from './item-autocomplete'

/** Sticky "Add an item…" field at the top of the list. Enter adds with the usual unit and store. */
export function QuickAddBar({ onExisting }: { onExisting: (entryId: string) => void }) {
  const household = useActiveHousehold()
  const add = useAddListItem(household.id)

  function onSelect(item: KitchenItem) {
    add.mutate(item, {
      onSuccess: ({ status, entry }) => {
        if (status === 'exists') {
          toast(`${entry.name} is already on the list`)
          onExisting(entry.id)
        } else if (status === 'unchecked') {
          toast(`${entry.name} is back on the list`)
          onExisting(entry.id)
        }
      },
    })
  }

  return (
    <div
      className="sticky top-14 z-20 -mx-4 bg-background/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
      data-tour="kitchen.quick-add"
    >
      <ItemAutocomplete onSelect={onSelect} label="Add to the list" placeholder="Add an item…" />
    </div>
  )
}
