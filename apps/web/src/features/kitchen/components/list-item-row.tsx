import { formatQuantity, type ShoppingListItem } from '@home/shared'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/** An entry on the list: a real checkbox, and the rest opens the editor. */
export function ListItemRow({
  entry,
  addedBy,
  highlighted,
  onToggle,
  onEdit,
}: {
  entry: ShoppingListItem
  /** "you", "Chi"… or null when unknown. */
  addedBy: string | null
  highlighted: boolean
  onToggle: (checked: boolean) => void
  onEdit: () => void
}) {
  const pending = entry.id.startsWith('pending-')
  // The box flips the moment it's tapped; the list's optimistic update lands a tick later, and a
  // controlled checkbox would otherwise spring back in between. Later changes from the list
  // (someone else, or a rollback) still win.
  const [checked, setChecked] = useState(entry.isChecked)
  const [listChecked, setListChecked] = useState(entry.isChecked)
  if (entry.isChecked !== listChecked) {
    setListChecked(entry.isChecked)
    setChecked(entry.isChecked)
  }
  const details = [
    formatQuantity(entry.quantity, entry.unit),
    entry.source === 'pantry' ? 'from pantry' : addedBy && `added by ${addedBy}`,
    entry.notes,
  ].filter(Boolean)

  return (
    <li
      id={`entry-${entry.id}`}
      className={cn(
        'flex items-center gap-3 px-3 transition-shadow',
        highlighted && 'ring-2 ring-primary ring-inset',
      )}
    >
      <input
        type="checkbox"
        className="size-5 shrink-0 accent-primary"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          setChecked(e.target.checked)
          onToggle(e.target.checked)
        }}
        aria-label={`Bought ${entry.name}`}
      />
      <button
        type="button"
        className="flex min-h-14 min-w-0 flex-1 flex-col justify-center py-2 text-left disabled:opacity-60"
        onClick={onEdit}
        disabled={pending}
      >
        <span
          className={cn('truncate font-medium', checked && 'text-muted-foreground line-through')}
        >
          {entry.name}
        </span>
        <span className="truncate text-xs text-muted-foreground">{details.join(' · ')}</span>
      </button>
    </li>
  )
}
