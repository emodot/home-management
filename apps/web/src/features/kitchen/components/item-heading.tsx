import { ArrowLeftIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

/** An item page's name, with a way back to the section it came from. */
export function ItemHeading({
  name,
  back,
  backLabel,
}: {
  name: string
  back: string
  backLabel: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="ghost" size="icon" className="-ml-2">
        <Link to={back} aria-label={backLabel}>
          <ArrowLeftIcon aria-hidden />
        </Link>
      </Button>
      <h2 className="min-w-0 truncate text-xl font-semibold tracking-tight">{name}</h2>
    </div>
  )
}
