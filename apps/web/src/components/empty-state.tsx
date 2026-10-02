import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** "Nothing here yet": what the page is for and how to start, on a soft tinted panel. */
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
        'animate-rise flex flex-col items-center rounded-xl bg-muted px-6 text-center',
        size === 'sm' ? 'gap-2 py-10' : 'gap-3 py-14',
      )}
    >
      {Icon && (
        <span
          className={cn(
            'mb-1 flex items-center justify-center rounded-2xl bg-primary/10 text-primary',
            size === 'sm' ? 'size-12' : 'size-14',
          )}
        >
          <Icon className={size === 'sm' ? 'size-6' : 'size-7'} aria-hidden />
        </span>
      )}
      <p className={cn('font-semibold tracking-tight', size === 'default' && 'text-lg')}>{title}</p>
      {children && <p className="max-w-sm text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
