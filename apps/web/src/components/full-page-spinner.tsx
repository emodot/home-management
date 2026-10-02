import { HomeIcon } from 'lucide-react'

/** The first-load screen: the app mark with a quiet progress line, not a lone spinner. */
export function FullPageSpinner() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5" role="status">
      <div className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <HomeIcon className="size-5" aria-hidden />
        </span>
        Home
      </div>
      <div className="h-0.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-[loading-slide_1.1s_ease-in-out_infinite] rounded-full bg-primary motion-reduce:animate-none" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  )
}
