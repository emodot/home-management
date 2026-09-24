import { CheckIcon, ChevronsUpDownIcon, HomeIcon, PlusIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useActiveHousehold, useHouseholds, useSwitchHousehold } from '@/hooks/use-household'
import { errorMessage } from '@/lib/errors'

export function HouseholdSwitcher() {
  const households = useHouseholds()
  const active = useActiveHousehold()
  const switchHousehold = useSwitchHousehold()
  const navigate = useNavigate()

  function select(householdId: string) {
    if (householdId === active.id) return
    switchHousehold.mutate(householdId, {
      onError: (error) => toast.error(`Couldn't switch household. ${errorMessage(error)}`),
    })
    void navigate('/')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="-ml-2 max-w-[70vw] min-w-0 justify-start px-2 sm:max-w-xs"
        >
          <HomeIcon aria-hidden />
          <span className="truncate font-semibold">{active.name}</span>
          <ChevronsUpDownIcon className="text-muted-foreground" aria-hidden />
          <span className="sr-only">Switch household</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Households</DropdownMenuLabel>
        {households.map((household) => (
          <DropdownMenuItem key={household.id} onSelect={() => select(household.id)}>
            <span className="truncate">{household.name}</span>
            {household.id === active.id && <CheckIcon className="ml-auto" aria-label="Active" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate('/households/new')}>
          <PlusIcon aria-hidden />
          New household
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
