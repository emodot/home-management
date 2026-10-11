import { useMutationState } from '@tanstack/react-query'
import { CloudOffIcon, RefreshCwIcon } from 'lucide-react'
import { useIsOnline } from '../hooks/use-is-online'

/** Says when changes are waiting for a connection, and when they're being sent. */
export function OfflineBanner() {
  const online = useIsOnline()
  const waiting = useMutationState({
    filters: {
      predicate: (mutation) =>
        mutation.options.mutationKey?.[0] === 'shopping-list-change' &&
        mutation.state.status === 'pending',
    },
  }).length

  if (online && waiting === 0) return null
  const changes = `${waiting} ${waiting === 1 ? 'change' : 'changes'}`
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
    >
      {online ? (
        <RefreshCwIcon className="size-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        <CloudOffIcon className="size-4 shrink-0" aria-hidden />
      )}
      {online
        ? `Syncing ${changes}…`
        : waiting > 0
          ? `Offline. ${changes} will sync when you're back online.`
          : "Offline. Changes will sync when you're back online."}
    </p>
  )
}
