/**
 * The admin dashboard has its own address: hm-amber-admin.vercel.app in production (a second
 * domain on the same Vercel project) and admin.localhost in development. It's the same build;
 * the router serves the admin routes or the household app depending on the host.
 */
const PRODUCTION = { app: 'hm-amber.vercel.app', admin: 'hm-amber-admin.vercel.app' }

export function isAdminHost(hostname = window.location.hostname) {
  return hostname === PRODUCTION.admin || hostname.startsWith('admin.')
}

function urlOnHost(hostname: string, path: string) {
  const { protocol, port } = window.location
  return `${protocol}//${hostname}${port ? `:${port}` : ''}${path}`
}

/** `path` on the admin dashboard, e.g. `adminUrl('/sign-in')`. */
export function adminUrl(path: string) {
  const { hostname } = window.location
  if (isAdminHost(hostname)) return urlOnHost(hostname, path)
  return urlOnHost(hostname === PRODUCTION.app ? PRODUCTION.admin : `admin.${hostname}`, path)
}

/** `path` in the household app, e.g. `appUrl('/sign-in')`. */
export function appUrl(path: string) {
  const { hostname } = window.location
  if (!isAdminHost(hostname)) return urlOnHost(hostname, path)
  return urlOnHost(
    hostname === PRODUCTION.admin ? PRODUCTION.app : hostname.replace(/^admin\./, ''),
    path,
  )
}
