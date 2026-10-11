import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useEffectEvent } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Keeps a cached household table fresh with Supabase Realtime: any change by anyone refreshes
 * `queryKey`, except while `busy()` says our own change is on its way (it refreshes when it
 * settles; refreshing mid-change would flicker).
 */
export function useLiveTable({
  table,
  householdId,
  queryKey,
  busy,
}: {
  table: 'shopping_list_items' | 'pantry_items'
  householdId: string
  queryKey: QueryKey
  busy: () => boolean
}) {
  const queryClient = useQueryClient()
  const refresh = useEffectEvent(() => {
    if (busy()) return
    void queryClient.invalidateQueries({ queryKey })
  })
  const isOurs = useEffectEvent((id: string) => {
    const cached = queryClient.getQueryData<{ id: string }[]>(queryKey)
    return cached?.some((row) => row.id === id) ?? false
  })

  useEffect(() => {
    const channel = supabase
      .channel(`${table}:${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
        () => refresh(),
      )
      // Realtime can't filter deletes by household, so check the removed row is one of ours.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (payload) => {
        const id = (payload.old as { id?: string }).id
        if (id && isOurs(id)) refresh()
      })
      .subscribe((status) => {
        // Catch up on anything missed while disconnected (e.g. the phone was asleep).
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) refresh()
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [table, householdId])
}
