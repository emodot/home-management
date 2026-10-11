import { CheckIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const chipClass =
  'inline-flex h-9 items-center rounded-full border px-3 text-sm transition-colors hover:bg-accent'

/**
 * Where to buy it: the household's usual stores and markets as chips (tap again to clear), plus
 * "Add store" for a new one.
 */
export function StoreTagChips({
  value,
  onChange,
  suggestions,
}: {
  value: string | null
  onChange: (store: string | null) => void
  suggestions: string[]
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const stores =
    value && !suggestions.some((s) => s.toLowerCase() === value.toLowerCase())
      ? [value, ...suggestions]
      : suggestions

  function addDraft() {
    const store = draft.trim().slice(0, 40)
    if (store) onChange(store)
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Store">
      {stores.map((store) => {
        const selected = value?.toLowerCase() === store.toLowerCase()
        return (
          <button
            key={store}
            type="button"
            aria-pressed={selected}
            className={cn(
              chipClass,
              selected && 'border-primary bg-primary/10 text-primary hover:bg-primary/15',
            )}
            onClick={() => onChange(selected ? null : store)}
          >
            {selected && <CheckIcon className="mr-1 size-4" aria-hidden />}
            {store}
          </button>
        )
      })}
      {adding ? (
        <div className="flex gap-2">
          <Input
            autoFocus
            aria-label="New store"
            placeholder="e.g. Mile 12"
            maxLength={40}
            className="h-9 w-40"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addDraft()
              }
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <Button type="button" size="sm" className="h-9" onClick={addDraft}>
            Add
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className={cn(chipClass, 'border-dashed text-muted-foreground')}
          onClick={() => setAdding(true)}
        >
          <PlusIcon className="mr-1 size-4" aria-hidden />
          Add store
        </button>
      )}
    </div>
  )
}
