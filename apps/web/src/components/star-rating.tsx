import { StarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Read-only stars, e.g. "★★★★☆". */
export function StarRating({ rating, className }: { rating: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      aria-label={`${rating} out of 5 stars`}
      role="img"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon
          key={n}
          className={cn(
            'size-3.5',
            n <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
          )}
          aria-hidden
        />
      ))}
    </span>
  )
}

/** Tap a star to rate; tap the current rating again to clear it. */
export function StarRatingInput({
  value,
  onChange,
  id,
}: {
  value: number | null
  onChange: (rating: number | null) => void
  id?: string
}) {
  return (
    <div id={id} role="radiogroup" aria-label="Rating" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          onClick={() => onChange(value === n ? null : n)}
          className="rounded-md p-1 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <StarIcon
            className={cn(
              'size-6',
              value !== null && n <= value
                ? 'fill-amber-400 text-amber-400'
                : 'text-muted-foreground/50',
            )}
            aria-hidden
          />
        </button>
      ))}
    </div>
  )
}
