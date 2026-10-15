/** How long a step waits for its target to appear (e.g. a page still loading) before it's skipped. */
export const TARGET_WAIT_MS = 3000

/** Whether an element takes up space on screen: not display:none, not visibility:hidden. */
function isShown(element: Element): boolean {
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
}

/**
 * The element a step points at: the shown one carrying data-tour="<id>". The same id can sit on
 * more than one element, e.g. the bottom nav on phones and the sidebar on wider screens.
 */
export function findTarget(id: string): Element | undefined {
  const candidates = document.querySelectorAll(`[data-tour="${CSS.escape(id)}"]`)
  return Array.from(candidates).find(isShown)
}

/**
 * Resolves when something in the document changes until `ready` returns a value, or with
 * undefined after `timeoutMs` (or straight away when `signal` aborts).
 */
function waitFor<T>(
  ready: () => T | undefined,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T | undefined> {
  const now = ready()
  if (now !== undefined || signal?.aborted) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = (value: T | undefined) => {
      observer.disconnect()
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      resolve(value)
    }
    const abort = () => done(undefined)
    const observer = new MutationObserver(() => {
      const value = ready()
      if (value !== undefined) done(value)
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
    // No timer for Infinity: setTimeout would fire it straight away.
    const timer = Number.isFinite(timeoutMs) ? window.setTimeout(abort, timeoutMs) : undefined
    signal?.addEventListener('abort', abort)
  })
}

/** The step's target once it's on screen, or undefined if it doesn't appear in time. */
export function waitForTarget(id: string, timeoutMs = TARGET_WAIT_MS, signal?: AbortSignal) {
  return waitFor(() => findTarget(id), timeoutMs, signal)
}

/** An open sheet, dialog or menu, which a tour mustn't cover. */
function isScreenClear(): boolean {
  return !document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]',
  )
}

/** Resolves true once no sheet or dialog is open, or false if `signal` aborts first. */
export async function waitForClearScreen(signal?: AbortSignal): Promise<boolean> {
  const clear = await waitFor(() => (isScreenClear() ? true : undefined), Infinity, signal)
  return clear === true
}
