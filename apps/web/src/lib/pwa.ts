import { registerSW } from 'virtual:pwa-register'

const HOUR = 60 * 60 * 1000

/**
 * Registers the service worker. In autoUpdate mode the page reloads once a new version has
 * installed, so a deploy shows up without closing the app. Installed apps can stay open for days,
 * so also look for a new version hourly and whenever the app is brought back to the foreground.
 */
export function registerServiceWorker() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) void registration.update()
      }
      setInterval(check, HOUR)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
}
