/**
 * Returns `next` if it is a same-origin path (e.g. "/invite/abc?x=1"), otherwise `fallback`.
 * Guards post-sign-in redirects against open redirects like "//evil.com" or "https://evil.com".
 */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next?.startsWith('/')) return fallback
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback
  return next
}
