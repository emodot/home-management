import { MutationCache, QueryClient } from '@tanstack/react-query'

export const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
  // Any change can add to the activity log, so refresh whatever activity is on screen.
  mutationCache: new MutationCache({
    onSuccess: () =>
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[2] === 'activity' }),
  }),
})
