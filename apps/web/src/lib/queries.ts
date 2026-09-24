import { getProfile, listMyHouseholds } from '@home/shared'
import { queryOptions } from '@tanstack/react-query'
import { supabase } from './supabase'

export const profileQuery = (userId: string) =>
  queryOptions({
    queryKey: ['profile', userId],
    queryFn: () => getProfile(supabase, userId),
  })

export const householdsQuery = (userId: string) =>
  queryOptions({
    queryKey: ['households', userId],
    queryFn: () => listMyHouseholds(supabase),
  })
