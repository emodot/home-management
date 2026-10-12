import { Outlet, ScrollRestoration, useNavigation } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { isFromTheTop } from '@/lib/scroll'

export function RootLayout() {
  const navigation = useNavigation()

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {navigation.state !== 'idle' && (
        <div
          className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-primary"
          role="progressbar"
          aria-label="Loading"
        />
      )}
      <Outlet />
      {/* New pages open at the top and Back returns to where you were. Keyed by path, so changing
          a filter or the servings (search params) doesn't jump the page; a navigation with
          FROM_THE_TOP state starts at the top even on a page seen before. */}
      <ScrollRestoration
        getKey={(location) => (isFromTheTop(location.state) ? location.key : location.pathname)}
      />
      <Toaster position="top-center" />
    </div>
  )
}
