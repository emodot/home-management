import { formatMoney } from '@home/shared'
import { HomeIcon } from 'lucide-react'
import { BudgetMeter } from '@/components/budget-meter'
import { CategoryIcon } from '@/components/category-icon'
import { cn } from '@/lib/utils'

/** The app mark: a cobalt tile with the house, beside the name. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5 text-base font-semibold', className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <HomeIcon className="size-4.5" aria-hidden />
      </span>
      Home
    </div>
  )
}

// Illustrative rows for the preview panel (sample data, not the user's).
const SAMPLE_ROWS = [
  { icon: 'fuel', description: 'Diesel, 50L', meta: 'Fuel & Generator · 1 Oct', minor: 4_250_000 },
  {
    icon: 'zap',
    description: 'Prepaid meter token',
    meta: 'Electricity · 3 Oct',
    minor: 2_000_000,
  },
  {
    icon: 'shopping-basket',
    description: 'Shoprite Lekki',
    meta: 'Groceries · 5 Oct',
    minor: 1_830_000,
  },
] as const

/**
 * A small preview of the app, built from its real components with sample data. Decorative: the
 * headline beside it carries the message for screen readers.
 */
function ProductPreview() {
  return (
    <div
      className="w-full max-w-sm rounded-2xl bg-background p-5 text-foreground shadow-[0_24px_60px_-20px_oklch(0.25_0.12_258/0.55)]"
      aria-hidden
    >
      <p className="text-sm text-muted-foreground">Spent in October</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{formatMoney(40_280_000)}</p>
      <ul className="stagger mt-5 list-surface">
        {SAMPLE_ROWS.map((row) => (
          <li key={row.description} className="flex items-center gap-3 px-3 py-2.5">
            <CategoryIcon icon={row.icon} className="size-8 bg-background" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.description}</p>
              <p className="truncate text-xs text-muted-foreground">{row.meta}</p>
            </div>
            <span className="text-sm font-semibold">{formatMoney(row.minor)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Utilities</span>
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{formatMoney(7_000_000)}</span> of{' '}
            {formatMoney(10_000_000)}
          </span>
        </div>
        <BudgetMeter spentMinor={7_000_000} budgetMinor={10_000_000} currency="NGN" />
      </div>
    </div>
  )
}

/**
 * The layout for sign-in, sign-up, invites and onboarding: the form on the left and, on wide
 * screens, a cobalt panel with what the app does and a preview of it. `aside={false}` (the admin
 * sign-in) keeps the form alone.
 */
export function AuthCard({
  title,
  description,
  children,
  aside = true,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  aside?: boolean
}) {
  return (
    <div className={cn('min-h-dvh', aside && 'lg:grid lg:grid-cols-[1fr_minmax(0,1.05fr)]')}>
      <main className="flex min-h-dvh flex-col px-6 py-8 sm:px-10">
        <BrandMark />
        <div className="animate-rise mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</div>
          )}
          <div className="mt-8">{children}</div>
        </div>
      </main>
      {aside && (
        <aside className="relative hidden overflow-hidden bg-brand-panel text-brand-panel-foreground lg:flex lg:flex-col lg:justify-center lg:gap-10 lg:p-14">
          {/* Depth without a gradient blob: a soft light from the top corner. */}
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_100%_0%,oklch(1_0_0/0.14),transparent_60%)]"
            aria-hidden
          />
          <p className="relative max-w-md text-4xl font-semibold tracking-tight">
            Every naira your household spends, in one place.
          </p>
          <div className="relative">
            <ProductPreview />
          </div>
        </aside>
      )}
    </div>
  )
}
