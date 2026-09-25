import { safeNextPath } from '@home/shared'
import { supabase } from './supabase'

/**
 * Where magic links and OAuth return to: this same site, so production and preview deployments
 * each get their own links. `next` is where to go once signed in.
 */
function callbackUrl(next: string): string {
  const url = new URL('/auth/callback', window.location.origin)
  const path = safeNextPath(next)
  if (path !== '/') url.searchParams.set('next', path)
  return url.toString()
}

export async function getSessionUser() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user ?? null
}

export async function sendMagicLink(email: string, next: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl(next), shouldCreateUser: true },
  })
  if (error) throw error
}

export async function signInWithGoogle(next: string) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl(next) },
  })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
