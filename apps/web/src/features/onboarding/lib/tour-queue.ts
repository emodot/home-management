import type { OnboardingStatus, TourDefinition } from '@home/shared'
import { runTour, type RunTourOptions } from './run-tour'
import { waitForClearScreen } from './targets'

/** What a running tour needs from the app; set from the latest render. */
export interface TourAppHandlers {
  navigate: (to: string) => void | Promise<void>
  pathname: () => string
  /** A tour was finished or skipped (on `step`). */
  record: (tour: TourDefinition, status: OnboardingStatus, step: number) => void
}

/**
 * Tours waiting their turn: one runs at a time, each once no sheet or dialog is open.
 */
export class TourQueue {
  private readonly waitingTours: TourDefinition[] = []
  private active: { id: string; stop: () => void } | null = null
  private clearing: AbortController | null = null
  private handlers: TourAppHandlers | null = null
  private readonly onActiveChange: (tourId: string | null) => void
  private readonly run: typeof runTour

  constructor(onActiveChange: (tourId: string | null) => void, run = runTour) {
    this.onActiveChange = onActiveChange
    this.run = run
  }

  setHandlers(handlers: TourAppHandlers) {
    this.handlers = handlers
    void this.next()
  }

  /** Queues a tour. Asking again for one already queued or on screen does nothing. */
  start(tour: TourDefinition) {
    if (this.active?.id === tour.id || this.waitingTours.some((t) => t.id === tour.id)) return
    this.waitingTours.push(tour)
    void this.next()
  }

  /** Ends everything without recording it (e.g. signing out). */
  stop() {
    this.waitingTours.length = 0
    this.clearing?.abort()
    this.active?.stop()
    this.active = null
  }

  private async next() {
    if (!this.handlers || this.active || this.clearing || this.waitingTours.length === 0) return
    const clearing = new AbortController()
    this.clearing = clearing
    const clear = await waitForClearScreen(clearing.signal)
    this.clearing = null
    const tour = this.waitingTours.shift()
    if (!clear || !tour) return
    const options: RunTourOptions = {
      navigate: (to) => this.handlers?.navigate(to),
      pathname: () => this.handlers?.pathname() ?? '',
      onEnd: (status, step) => {
        this.active = null
        this.onActiveChange(null)
        this.handlers?.record(tour, status, step)
        void this.next()
      },
    }
    this.onActiveChange(tour.id)
    this.active = { id: tour.id, ...this.run(tour, options) }
  }
}
