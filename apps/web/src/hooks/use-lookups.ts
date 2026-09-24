import { useSuspenseQuery } from '@tanstack/react-query'
import { useMemo, useSyncExternalStore } from 'react'
import { categoriesQuery, membersQuery } from '@/lib/queries'

/** Categories by id (archived included, since old expenses still use them). */
export function useCategoryLookup(householdId: string) {
  const categories = useSuspenseQuery(categoriesQuery(householdId)).data
  return useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
}

/** Display names of current members by user id. Former members are not in the map. */
export function useMemberNames(householdId: string) {
  const members = useSuspenseQuery(membersQuery(householdId)).data
  return useMemo(
    () => new Map(members.map((m) => [m.user_id, m.profile.full_name ?? m.profile.email])),
    [members],
  )
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}
