import { isAppAdmin, passwordSignInSchema, type PasswordSignInInput } from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { ShieldIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLoaderData, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { AuthCard } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { getSessionUser, requestPasswordReset, signInWithPassword, signOut } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { adminSignInLoader } from './loaders'

/** The admin area's own entrance. Only admin accounts get in; household members are sent back. */
export function AdminSignInPage() {
  const { next } = useLoaderData<typeof adminSignInLoader>()
  const navigate = useNavigate()
  const [notAdmin, setNotAdmin] = useState(false)
  const form = useForm<PasswordSignInInput>({
    resolver: zodResolver(passwordSignInSchema),
    defaultValues: { email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    setNotAdmin(false)
    try {
      await signInWithPassword(email, password)
      const user = await getSessionUser()
      if (!user || !(await isAppAdmin(supabase, user.id))) {
        await signOut()
        setNotAdmin(true)
        return
      }
      await navigate(next, { replace: true })
    } catch (error) {
      form.setError('password', { message: errorMessage(error) })
    }
  })

  async function forgotPassword() {
    const valid = await form.trigger('email')
    if (!valid) return
    const email = form.getValues('email')
    try {
      await requestPasswordReset(email)
      toast.success(`If ${email} is an account, we've emailed it a reset link.`)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <AuthCard
      title="Admin sign in"
      description={
        <span className="flex items-center gap-1.5">
          <ShieldIcon className="size-4" aria-hidden />
          For Home administrators only.
        </span>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <FieldGroup>
          {notAdmin && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
            >
              That isn&apos;t an admin account. Household members sign in on the{' '}
              <Link to="/sign-in" className="font-medium underline underline-offset-4">
                main sign-in page
              </Link>
              .
            </p>
          )}
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              aria-invalid={!!errors.email}
              {...form.register('email')}
            />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={!!errors.password}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => void forgotPassword()}
              >
                Forgot password?
              </button>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...form.register('password')}
            />
            <FieldError errors={[errors.password]} />
          </Field>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  )
}
