import { groupByStore, type ShoppingListItem } from '@home/shared'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ShoppingBasketIcon, StoreIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { useActiveHousehold, useCurrentUser } from '@/hooks/use-household'
import { membersQuery } from '@/lib/queries'
import { EditListItemSheet } from '../components/edit-list-item-sheet'
import { ListItemRow } from '../components/list-item-row'
import { QuickAddBar } from '../components/quick-add-bar'
import { useShoppingList, useToggleListItem } from '../hooks/use-shopping-list'

export function ShoppingListPage() {
  const household = useActiveHousehold()
  const user = useCurrentUser()
  const list = useShoppingList(household.id)
  const members = useSuspenseQuery(membersQuery(household.id)).data
  const toggle = useToggleListItem(household.id)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)

  // Point at an entry that was added again: scroll to it and outline it briefly.
  useEffect(() => {
    if (!highlighted) return
    document
      .getElementById(`entry-${highlighted}`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const timer = setTimeout(() => setHighlighted(null), 2000)
    return () => clearTimeout(timer)
  }, [highlighted])

  const firstName = (id: string | null) => {
    if (!id) return null
    if (id === user.id) return 'you'
    const profile = members.find((m) => m.user_id === id)?.profile
    return (profile?.full_name ?? profile?.email)?.split(/[\s@]/)[0] ?? null
  }
  const editing: ShoppingListItem | null = list.find((e) => e.id === editingId) ?? null
  const groups = groupByStore(list)
  const toBuy = list.filter((e) => !e.isChecked).length

  return (
    <div className="flex flex-col gap-4">
      <QuickAddBar onExisting={setHighlighted} />

      {list.length === 0 ? (
        <EmptyState icon={ShoppingBasketIcon} title="Your list is empty">
          Add what you need. Everyone in the household sees the same list, as it changes.
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {toBuy === 0
              ? 'Everything is checked off.'
              : `${toBuy} ${toBuy === 1 ? 'thing' : 'things'} to buy`}
          </p>
          {groups.map((group) => (
            <section key={group.store ?? ''} className="flex flex-col gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <StoreIcon className="size-4 text-muted-foreground" aria-hidden />
                {group.store ?? 'Anywhere'}
              </h2>
              <ul className="stagger list-surface">
                {group.items.map((entry) => (
                  <ListItemRow
                    key={entry.id}
                    entry={entry}
                    addedBy={firstName(entry.addedBy)}
                    highlighted={entry.id === highlighted}
                    onToggle={(isChecked) => toggle.mutate({ id: entry.id, isChecked })}
                    onEdit={() => setEditingId(entry.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <EditListItemSheet
        entry={editing}
        listStores={list.map((e) => e.storeTag)}
        onClose={() => setEditingId(null)}
      />
    </div>
  )
}
