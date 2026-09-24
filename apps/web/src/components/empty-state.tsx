import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** The dashed "nothing here yet" panel: what the page is for and how to start. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  size = 'default',
}: {
  icon?: LucideIcon
  title: string
  /** One or two sentences on what will show up here. */
  children?: ReactNode
  action?: ReactNode
  /** `sm` for secondary states such as "no results". */
  size?: 'default' | 'sm'
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-xl border border-dashed px-6 text-center',
        size === 'sm' ? 'gap-2 py-10' : 'gap-3 py-14',
      )}
    >
      {Icon && (
        <Icon
          className={cn('text-muted-foreground', size === 'sm' ? 'size-8' : 'size-10')}
          aria-hidden
        />
      )}
      <p className={cn('font-medium', size === 'default' && 'text-lg')}>{title}</p>
      {children && <p className="max-w-sm text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
