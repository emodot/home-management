/** Navigation state for opening a page at the top, e.g. a record just saved (see RootLayout). */
export const FROM_THE_TOP = { fromTheTop: true } as const

export function isFromTheTop(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'fromTheTop' in state
}
