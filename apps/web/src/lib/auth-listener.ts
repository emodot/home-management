import type { QueryClient } from '@tanstack/react-query'
import type { createBrowserRouter } from 'react-router'
import { supabase } from './supabase'

type Router = ReturnType<typeof createBrowserRouter>

/**
 * Reacts to the signed-in user changing outside a route transition: signing out (here or in
 * another tab), an expired session, or a different account signing in from another tab.
 */
export function listenForAuthChanges(router: Router, queryClient: QueryClient) {
  // undefined until the initial session is known; null when signed out.
  let currentUserId: string | null | undefined

  supabase.auth.onAuthStateChange((_event, session) => {
    const nextUserId = session?.user.id ?? null
    const changed = currentUserId !== undefined && nextUserId !== currentUserId
    currentUserId = nextUserId
    if (!changed) return

    // supabase-js holds its auth lock while this callback runs, so defer the work.
    setTimeout(() => {
      queryClient.clear()
      if (nextUserId) void router.revalidate()
      else void router.navigate('/sign-in')
    }, 0)
  })
}
