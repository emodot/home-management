import { CircleHelpIcon, ListChecksIcon, MapIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTour } from '../lib/tour-context'
import { expensesTour, kitchenTour, providersTour, tasksTour } from '../tours/modules'
import { welcomeTour } from '../tours/welcome'

const REPLAYS = [
  { tour: welcomeTour, label: 'A look around' },
  { tour: expensesTour, label: 'Expenses' },
  { tour: kitchenTour, label: 'Kitchen' },
  { tour: tasksTour, label: 'Tasks' },
  { tour: providersTour, label: 'Providers' },
]

/** Help, in the header: replay any tour, or bring back the getting-started checklist. */
export function HelpMenu() {
  const navigate = useNavigate()
  const { start, setChecklistOpen } = useTour()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full text-muted-foreground"
          data-tour="help.menu"
        >
          <CircleHelpIcon aria-hidden />
          <span className="sr-only">Help</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Take a tour</DropdownMenuLabel>
        {REPLAYS.map(({ tour, label }) => (
          // Starts once the menu has closed (tours wait for a clear screen).
          <DropdownMenuItem key={tour.id} onSelect={() => start(tour, { replay: true })}>
            <MapIcon aria-hidden />
            {label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            setChecklistOpen(true)
            void navigate('/')
          }}
        >
          <ListChecksIcon aria-hidden />
          Getting started
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
