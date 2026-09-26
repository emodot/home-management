import { safeNextPath } from '@home/shared'
import type { AuthError } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Where emailed links (magic link, sign-up confirmation, password reset) return to: this same
 * site, so production and preview deployments each get their own links. `next` is where to go
 * once signed in.
 */
function callbackUrl(next: string): string {
  const url = new URL('/auth/callback', window.location.origin)
  const path = safeNextPath(next)
  if (path !== '/') url.searchParams.set('next', path)
  return url.toString()
}

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Wrong email or password.',
  user_already_exists: 'An account with this email already exists. Sign in instead.',
  email_exists: 'An account with this email already exists. Sign in instead.',
  email_not_confirmed: 'Confirm your email first: open the link we sent you.',
  weak_password: 'Choose a stronger password.',
  same_password: 'Choose a password different from your current one.',
  over_email_send_rate_limit: 'Too many emails sent. Wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a few minutes and try again.',
}

/** Supabase auth errors, reworded for people. */
function friendly(error: AuthError): Error {
  const message = error.code ? AUTH_MESSAGES[error.code] : undefined
  return message ? new Error(message) : error
}

export async function getSessionUser() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user ?? null
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw friendly(error)
}

/**
 * Creates an account. Returns whether the email must be confirmed first (when the project
 * requires confirmation there is no session yet, and a confirmation link is emailed).
 */
export async function signUp(email: string, password: string, next: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callbackUrl(next) },
  })
  if (error) throw friendly(error)
  return { needsConfirmation: data.session === null }
}

export async function sendMagicLink(email: string, next: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl(next), shouldCreateUser: true },
  })
  if (error) throw friendly(error)
}

/** Emails a link that signs the user in and opens the "choose a new password" page. */
export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl('/reset-password'),
  })
  if (error) throw friendly(error)
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw friendly(error)
}

/** Checks the current password (by signing in with it) before setting a new one. */
export async function changePassword(email: string, current: string, password: string) {
  const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: current })
  if (checkError) {
    throw checkError.code === 'invalid_credentials'
      ? new Error('Your current password is wrong.')
      : friendly(checkError)
  }
  await updatePassword(password)
}

/**
 * Starts an email change. Supabase emails a confirmation link (to both addresses when secure
 * email change is on); the new address takes effect once confirmed.
 */
export async function changeEmail(email: string) {
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: callbackUrl('/profile') },
  )
  if (error) throw friendly(error)
}

/** Ends every session for this account, on all devices. */
export async function signOutEverywhere() {
  const { error } = await supabase.auth.signOut({ scope: 'global' })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
