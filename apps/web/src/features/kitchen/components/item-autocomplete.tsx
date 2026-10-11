import { normalizeItemName, unitLabel, type KitchenItem } from '@home/shared'
import { Command as CommandPrimitive } from 'cmdk'
import { LoaderCircleIcon, PlusIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useActiveHousehold } from '@/hooks/use-household'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { useCreateKitchenItem, useKitchenItems } from '../hooks/use-kitchen-items'
import { kitchenItemSearchQuery } from '../lib/queries'

/**
 * A text field that searches the household's item catalogue as you type. Enter picks the
 * highlighted suggestion; a name that isn't in the catalogue yet is offered as "Add …" and
 * created on the spot. Clears itself after each pick, ready for the next item.
 */
export function ItemAutocomplete({
  onSelect,
  placeholder = 'Add an item…',
  autoFocus,
  id,
  label = 'Item',
  className,
}: {
  onSelect: (item: KitchenItem) => void
  placeholder?: string
  autoFocus?: boolean
  id?: string
  /** Accessible name for the field. */
  label?: string
  className?: string
}) {
  const household = useActiveHousehold()
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const items = useKitchenItems(household.id, search)
  const create = useCreateKitchenItem(household.id)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(text), 150)
    return () => clearTimeout(timer)
  }, [text])

  const typed = text.trim()
  const key = normalizeItemName(typed)
  // Results for an older search are kept while the new one loads; don't offer those, and don't
  // offer "Add …" until we know the name isn't there already.
  const ready = search === text && !items.isPlaceholderData && items.isSuccess
  const current = ready ? items.data : []
  const exact = current.some((item) => item.normalizedName === key)

  function clear() {
    setText('')
    setSearch('')
  }

  function pick(item: KitchenItem) {
    onSelect(item)
    clear()
  }

  // The field clears as soon as Enter is pressed, ready for the next item; adding (and, for an
  // early Enter, looking the name up) finishes in the background.
  async function add(name = typed) {
    clear()
    try {
      onSelect(await create.mutateAsync({ name }))
    } catch (error) {
      toast.error(`Couldn't add “${name}”. ${errorMessage(error)}`)
    }
  }

  /**
   * Enter before the suggestions for what's typed have arrived (fast typing, slow signal): look
   * them up, then do what Enter would have done, i.e. take the top one or add the name.
   */
  async function enterEarly() {
    const name = typed
    const searched = text
    clear()
    try {
      const [top] = await queryClient.query(kitchenItemSearchQuery(household.id, searched))
      onSelect(top ?? (await create.mutateAsync({ name })))
    } catch (error) {
      toast.error(`Couldn't add “${name}”. ${errorMessage(error)}`)
    }
  }

  const showList = open && typed !== '' && key !== ''

  return (
    <CommandPrimitive
      // cmdk names its input with this (a visually hidden label), not the input's aria-label.
      label={label}
      shouldFilter={false}
      loop
      className={cn('relative', className)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
        if (e.key === 'Enter' && !ready && key !== '') {
          e.preventDefault()
          void enterEarly()
        }
      }}
    >
      <div className="relative">
        <CommandPrimitive.Input
          id={id}
          value={text}
          onValueChange={(value) => {
            setText(value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm"
        />
        {create.isPending && (
          <LoaderCircleIcon
            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
      </div>
      {showList && (
        <CommandPrimitive.List
          // Keeps focus in the field when a suggestion is clicked.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {current.map((item) => (
            <CommandPrimitive.Item
              key={item.id}
              value={item.id}
              onSelect={() => pick(item)}
              className="flex cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm outline-hidden select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
            >
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {unitLabel(item.defaultUnit, 2)}
                {item.defaultStoreTag ? ` · ${item.defaultStoreTag}` : ''}
              </span>
            </CommandPrimitive.Item>
          ))}
          {!ready && (
            <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
              Searching…
            </div>
          )}
          {ready && !exact && (
            <CommandPrimitive.Item
              value="__add__"
              onSelect={() => void add()}
              className="flex cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm outline-hidden select-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
            >
              <PlusIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">Add “{typed}”</span>
            </CommandPrimitive.Item>
          )}
        </CommandPrimitive.List>
      )}
    </CommandPrimitive>
  )
}
