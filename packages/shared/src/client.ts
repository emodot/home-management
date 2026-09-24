import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types.ts'

/** A Supabase client typed with this project's schema. Web and mobile both pass one in. */
export type HomeClient = SupabaseClient<Database>

interface Result {
  data: unknown
  error: Error | null
}

/** Throws the Supabase/PostgREST error, otherwise returns the data typed from the success case. */
export function unwrap<R extends Result>(result: R): Extract<R, { error: null }>['data'] {
  if (result.error) throw result.error
  return result.data
}
