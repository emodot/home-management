import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { ThemeProvider } from 'next-themes'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { listenForAuthChanges } from '@/lib/auth-listener'
import { registerOfflineListChanges } from '@/features/kitchen/lib/offline'
import { persistOptions } from '@/lib/persist'
import { registerServiceWorker } from '@/lib/pwa'
import { queryClient } from '@/lib/query-client'
import { router } from '@/router'
import './index.css'

listenForAuthChanges(router, queryClient)
registerOfflineListChanges(queryClient)
registerServiceWorker()

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
        // Send list changes saved on this device while it was offline.
        onSuccess={() => void queryClient.resumePausedMutations()}
      >
        <RouterProvider router={router} />
      </PersistQueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
