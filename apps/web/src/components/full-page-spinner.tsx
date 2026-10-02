import { BrandMark } from '@/components/auth-card'

/** The first-load screen: the app mark with a quiet progress line, not a lone spinner. */
export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5" role="status">
      <BrandMark />
      <div className="h-0.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 rounded-full bg-primary motion-safe:animate-[loading-slide_1.1s_ease-in-out_infinite]" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  )
}
