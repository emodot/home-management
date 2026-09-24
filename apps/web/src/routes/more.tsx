import { ChevronRightIcon, LogOutIcon, PlusIcon } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { SIDEBAR_ITEMS } from '@/lib/nav'
import { signOut } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'

const rowClass =
  'flex w-full items-center gap-3 px-4 py-3.5 text-left font-medium transition-colors hover:bg-muted/50'

export function MorePage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">More</h1>
      <ul className="divide-y rounded-xl border">
        {SIDEBAR_ITEMS.filter((item) => !['/', '/tasks', '/providers'].includes(item.to)).map(
          (item) => (
            <li key={item.to}>
              <Link to={item.to} className={rowClass}>
                <item.icon className="size-5 text-muted-foreground" aria-hidden />
                <span className="flex-1">{item.label}</span>
                <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ),
        )}
        <li>
          <Link to="/households/new" className={rowClass}>
            <PlusIcon className="size-5 text-muted-foreground" aria-hidden />
            <span className="flex-1">New household</span>
            <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      </ul>
      <ul className="rounded-xl border">
        <li>
          <button
            type="button"
            className={rowClass}
            onClick={() =>
              void signOut().catch((error: unknown) => toast.error(errorMessage(error)))
            }
          >
            <LogOutIcon className="size-5 text-muted-foreground" aria-hidden />
            Sign out
          </button>
        </li>
      </ul>
    </div>
  )
}
