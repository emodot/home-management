import type { OnboardingStatus, TourDefinition, TourStep } from '@home/shared'
import { driver, type PopoverDOM, type Side } from 'driver.js'
import 'driver.js/dist/driver.css'
import { TARGET_WAIT_MS, waitForTarget } from './targets'

export interface RunTourOptions {
  /** Moves the app to a step's route; resolves once the page has loaded. */
  navigate: (to: string) => void | Promise<void>
  /** Where the app is now. */
  pathname: () => string
  /** Called once: finished, or skipped on `step` (0-based). Not called when stopped. */
  onEnd: (status: OnboardingStatus, step: number) => void
  waitMs?: number
}

export interface RunningTour {
  /** Ends the tour without recording anything (e.g. signing out). */
  stop: () => void
}

const NAVIGATION_WAIT_MS = 15_000

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

/** The page's side gutters: driver lets a popover touch the edge of the screen. */
const GUTTER_PX = 16

function keepInGutters(popover: HTMLElement | undefined) {
  if (!popover?.isConnected) return
  const rect = popover.getBoundingClientRect()
  const furthest = Math.max(GUTTER_PX, window.innerWidth - GUTTER_PX - rect.width)
  const left = Math.min(Math.max(rect.left, GUTTER_PX), furthest)
  if (Math.abs(left - rect.left) < 0.5) return
  popover.style.left = `${String(left)}px`
  popover.style.right = 'auto'
}

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Phones keep the popover above or below its target, full width, so it never covers it. */
function sideFor(step: TourStep): Side | undefined {
  if (!window.matchMedia('(max-width: 639px)').matches) return step.side
  return step.side === 'top' || step.side === 'bottom' ? step.side : undefined
}

/**
 * Runs a tour with driver.js, one step at a time: navigates to a step's route first, waits for its
 * target to show (skipping the step if it doesn't), or shows a centred modal when it has none.
 * Driver's own step list isn't used: it would judge later steps on other pages as missing.
 */
export function runTour(tour: TourDefinition, options: RunTourOptions): RunningTour {
  const { steps } = tour
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const waits = new AbortController()
  let current = 0
  let busy = false
  let popover: PopoverDOM | undefined
  let ended = false

  const tourDriver = driver({
    animate: !reducedMotion,
    smoothScroll: !reducedMotion,
    overlayColor: 'rgb(0 0 0)',
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 10,
    popoverOffset: 12,
    popoverClass: 'lintel-tour',
    // Skipping is deliberate (×, Esc, Skip tour); a stray tap on the dimmed page does nothing.
    overlayClickBehavior: 'none',
    // Look, don't touch: the highlighted element isn't clickable mid-tour.
    disableActiveInteraction: true,
    // × and Esc.
    onDestroyStarted: () => end('dismissed'),
  })

  function end(status: OnboardingStatus | null) {
    if (ended) return
    ended = true
    waits.abort()
    window.removeEventListener('keyup', onKeyup)
    window.removeEventListener('resize', onResize)
    document.removeEventListener('animationend', refresh, true)
    tourDriver.destroy()
    if (status) options.onEnd(status, current)
    // Back where it was; or, if that's gone (the tour changed pages) or was nothing, the page's
    // main content, so keyboard users carry on from somewhere sensible.
    const focusTarget =
      returnFocus?.isConnected && returnFocus !== document.body
        ? returnFocus
        : document.getElementById('main')
    focusTarget?.focus({ preventScroll: true })
  }

  // Driver places the popover again on the next frame (on refresh or a resize); move it back
  // inside the gutters after that.
  function onResize() {
    requestAnimationFrame(() => keepInGutters(popover?.wrapper))
  }

  function refresh() {
    tourDriver.refresh()
    onResize()
  }

  function setBusy(value: boolean) {
    busy = value
    for (const button of [popover?.nextButton, popover?.previousButton]) {
      if (button) button.disabled = value
    }
  }

  async function show(index: number, direction: 1 | -1): Promise<void> {
    if (ended || busy) return
    if (index >= steps.length) {
      end('completed')
      return
    }
    // Every earlier step was skipped: stay where we are.
    const step = steps[index]
    if (!step) return
    setBusy(true)
    // A replay from elsewhere starts on the tour's own page.
    const route = step.route ?? (index === 0 ? tour.route : undefined)
    // The wait for the target starts once the page's code and data are in, not before.
    if (route && options.pathname() !== route) {
      // Not forever, though, should the navigation be interrupted.
      await Promise.race([options.navigate(route), delay(NAVIGATION_WAIT_MS)])
    }
    const element = step.target
      ? await waitForTarget(step.target, options.waitMs ?? TARGET_WAIT_MS, waits.signal)
      : undefined
    if (waits.signal.aborted) return
    setBusy(false)
    if (step.target && !element) {
      // Not on screen (e.g. a section this household doesn't have): skip the step.
      await show(index + direction, direction)
      if (index + direction < 0) await show(current, 1)
      return
    }

    current = index
    const last = index === steps.length - 1
    tourDriver.highlight({
      element,
      popover: {
        title: escapeHtml(step.title),
        description: escapeHtml(step.body),
        side: sideFor(step),
        align: 'center',
        showButtons: index === 0 ? ['next', 'close'] : ['next', 'previous', 'close'],
        showProgress: steps.length > 1,
        progressText: `${String(index + 1)} of ${String(steps.length)}`,
        nextBtnText: last ? 'Done' : 'Next',
        prevBtnText: 'Back',
        closeBtnLabel: 'Close tour',
        onNextClick: () => void show(index + 1, 1),
        onPrevClick: () => void show(index - 1, -1),
        onPopoverRender: (dom) => {
          popover = dom
          dom.wrapper.setAttribute('aria-modal', 'true')
          // The step count sits above the title; "Skip tour" takes its place in the footer.
          dom.wrapper.insertBefore(dom.progress, dom.title)
          // Screen readers hear "2 of 7" with the step's text.
          if (steps.length > 1) {
            dom.progress.id = 'driver-popover-progress'
            dom.wrapper.setAttribute(
              'aria-describedby',
              'driver-popover-progress driver-popover-description',
            )
          }
          if (!last) {
            const skip = document.createElement('button')
            skip.type = 'button'
            skip.className = 'driver-popover-footer-btn lintel-tour-skip'
            skip.textContent = 'Skip tour'
            skip.addEventListener('click', () => end('dismissed'))
            dom.footer.insertBefore(skip, dom.footerButtons)
          }
          // Driver places the popover right after this, then focuses the first button (×):
          // keep it inside the gutters, and start on Next instead, so Enter moves on.
          requestAnimationFrame(() => {
            keepInGutters(dom.wrapper)
            dom.nextButton.focus()
          })
        },
      },
    })
  }

  // Driver only handles the arrow keys for its own step list.
  function onKeyup(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') void show(current + 1, 1)
    else if (event.key === 'ArrowLeft' && current > 0) void show(current - 1, -1)
  }

  window.addEventListener('keyup', onKeyup)
  window.addEventListener('resize', onResize)
  // Pages arrive with a short rise; re-measure once it ends so the highlight sits right.
  document.addEventListener('animationend', refresh, true)
  void show(0, 1)

  return { stop: () => end(null) }
}
