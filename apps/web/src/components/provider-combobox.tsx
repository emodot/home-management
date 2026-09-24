import { TRADE_LABELS } from '@home/shared'
import { CheckIcon, ChevronsUpDownIcon, PlusIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ProviderForm } from '@/components/provider-fields'
import { EMPTY_PROVIDER } from '@/lib/providers'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useActiveProviders, useCreateProvider, useProviderLookup } from '@/hooks/use-providers'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

/** Searchable provider picker with "Add new provider" inline. `null` means no provider. */
export function ProviderCombobox({
  householdId,
  value,
  onChange,
  id,
}: {
  householdId: string
  value: string | null
  onChange: (providerId: string | null) => void
  id?: string
}) {
  const providers = useActiveProviders(householdId)
  const lookup = useProviderLookup(householdId)
  const create = useCreateProvider(householdId)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const selected = value ? lookup.get(value) : undefined

  return (
    <>
      <div className="flex gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="min-w-0 flex-1 justify-between font-normal"
            >
              <span className={cn('truncate', !selected && 'text-muted-foreground')}>
                {selected
                  ? `${selected.name}${selected.deleted_at ? ' (deleted)' : ''}`
                  : 'Choose a provider'}
              </span>
              <ChevronsUpDownIcon className="opacity-50" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search providers…"
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>No provider found.</CommandEmpty>
                <CommandGroup>
                  {providers.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`${p.name} ${TRADE_LABELS[p.trade]} ${p.id}`}
                      onSelect={() => {
                        onChange(p.id)
                        setOpen(false)
                      }}
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{p.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {TRADE_LABELS[p.trade]}
                          {p.area ? ` · ${p.area}` : ''}
                        </span>
                      </div>
                      <CheckIcon
                        className={cn('ml-auto', value === p.id ? 'opacity-100' : 'opacity-0')}
                        aria-hidden
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup>
                  <CommandItem
                    value={`__add__ ${search}`}
                    onSelect={() => {
                      setOpen(false)
                      setAdding(search.trim())
                    }}
                  >
                    <PlusIcon aria-hidden />
                    {search.trim()
                      ? `Add “${search.trim()}” as a new provider`
                      : 'Add new provider'}
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(null)}
            aria-label="Remove provider"
          >
            <XIcon aria-hidden />
          </Button>
        )}
      </div>

      <Dialog open={adding !== null} onOpenChange={(next) => !next && setAdding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New provider</DialogTitle>
            <DialogDescription>Add the basics now; you can fill in more later.</DialogDescription>
          </DialogHeader>
          {adding !== null && (
            <ProviderForm
              compact
              defaultValues={{ ...EMPTY_PROVIDER, name: adding }}
              submitLabel="Add provider"
              onCancel={() => setAdding(null)}
              onSubmit={async (values) => {
                try {
                  const provider = await create.mutateAsync(values)
                  onChange(provider.id)
                  setAdding(null)
                  setSearch('')
                  toast.success(`Added ${provider.name}`)
                } catch (error) {
                  toast.error(`Couldn't add the provider. ${errorMessage(error)}`)
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
