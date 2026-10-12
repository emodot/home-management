import { ArrowLeftIcon, PencilIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

/**
 * An item page's name, with a way back to the section it came from and, optionally, to the item's
 * own page (rename, units, merge).
 */
export function ItemHeading({
  name,
  back,
  backLabel,
  itemId,
}: {
  name: string
  back: string
  backLabel: string
  itemId?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="ghost" size="icon" className="-ml-2">
        <Link to={back} aria-label={backLabel}>
          <ArrowLeftIcon aria-hidden />
        </Link>
      </Button>
      <h2 className="min-w-0 truncate text-xl font-semibold tracking-tight">{name}</h2>
      {itemId && (
        <Button asChild variant="ghost" size="sm" className="ml-auto text-muted-foreground">
          <Link to={`/kitchen/items/${itemId}`}>
            <PencilIcon aria-hidden />
            Edit item
          </Link>
        </Button>
      )}
    </div>
  )
}
