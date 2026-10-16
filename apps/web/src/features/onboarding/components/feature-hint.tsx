import { hintKey } from '@home/shared'
import { useContext, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useOnboarding } from '../hooks/use-onboarding'
import { TourContext } from '../lib/tour-context'

/**
 * A pulsing dot that points out something new, once: open it to read the tip, and once it's
 * closed it's gone for good, on every device. Place it inside a positioned element (`relative`);
 * it sits in the top right corner. Hidden while a tour is on screen.
 */
export function FeatureHint({
  id,
  version = 1,
  title,
  body,
  className,
}: {
  /** hint:<id> in the user's onboarding progress. */
  id: string
  version?: number
  title: string
  body: string
  className?: string
}) {
  const { shouldShow, mark } = useOnboarding()
  const tours = useContext(TourContext)
  const [open, setOpen] = useState(false)

  if (!shouldShow(hintKey(id), version) || tours?.activeTourId) return null

  function onOpenChange(next: boolean) {
    setOpen(next)
    // Read and closed: remembered.
    if (!next) mark(hintKey(id), { version, status: 'completed' })
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`New: ${title}`}
          className={cn(
            'absolute top-1 right-0 grid size-5 place-items-center rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
            className,
          )}
        >
          <span className="relative flex size-2.5" aria-hidden>
            <span className="absolute inline-flex size-full rounded-full bg-primary opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2.5 rounded-full bg-primary ring-2 ring-background" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PopoverHeader>
          <PopoverTitle className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              New
            </span>
            {title}
          </PopoverTitle>
          <PopoverDescription>{body}</PopoverDescription>
        </PopoverHeader>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
