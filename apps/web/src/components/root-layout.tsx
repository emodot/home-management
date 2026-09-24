import { Outlet, useNavigation } from 'react-router'
import { Toaster } from '@/components/ui/sonner'

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
      <Toaster position="top-center" />
    </div>
  )
}
