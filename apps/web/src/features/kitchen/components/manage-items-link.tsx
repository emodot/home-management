import { ListIcon } from 'lucide-react'
import { Link } from 'react-router'

/** The way to the catalogue (rename, units, merge duplicates), at the foot of Pantry and Prices. */
export function ManageItemsLink() {
  return (
    <Link
      to="/kitchen/items"
      className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      <ListIcon className="size-4" aria-hidden />
      Manage items
    </Link>
  )
}
