import { emailSignInSchema } from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheckIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useLoaderData } from 'react-router'
import { toast } from 'sonner'
import { AuthCard } from '@/components/auth-card'
import { GoogleIcon } from '@/components/google-icon'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { sendMagicLink, signInWithGoogle } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import type { signInLoader } from './loaders'

export function SignInPage() {
  const { next, forInvite } = useLoaderData<typeof signInLoader>()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [googlePending, setGooglePending] = useState(false)

  const form = useForm({
    resolver: zodResolver(emailSignInSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      await sendMagicLink(email, next)
      setSentTo(email)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  })

  async function handleGoogle() {
    setGooglePending(true)
    try {
      await signInWithGoogle(next) // navigates away on success
    } catch (error) {
      toast.error(errorMessage(error))
      setGooglePending(false)
    }
  }

  if (sentTo) {
    return (
      <AuthCard
        title="Check your email"
        description={
          <>
            We sent a sign-in link to <span className="font-medium text-foreground">{sentTo}</span>.
            Open it on this device to continue.
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <MailCheckIcon className="size-10 text-muted-foreground" aria-hidden />
          {import.meta.env.DEV && (
            <p className="text-sm text-muted-foreground">
              Local dev: emails are caught at{' '}
              <a
                className="underline"
                href="http://127.0.0.1:54324"
                target="_blank"
                rel="noreferrer"
              >
                127.0.0.1:54324
              </a>
              .
            </p>
          )}
          <Button variant="outline" onClick={() => setSentTo(null)}>
            Use a different email
          </Button>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={forInvite ? 'Sign in to accept your invite' : 'Sign in'}
      description={
        forInvite
          ? 'Use the email address your invite was sent to.'
          : "Manage your home's expenses, tasks and providers."
      }
    >
      <FieldGroup>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => void handleGoogle()}
          disabled={googlePending}
        >
          <GoogleIcon />
          Continue with Google
        </Button>

        <FieldSeparator>or</FieldSeparator>

        <form onSubmit={(e) => void onSubmit(e)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!form.formState.errors.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                aria-invalid={!!form.formState.errors.email}
                {...form.register('email')}
              />
              <FieldError errors={[form.formState.errors.email]} />
            </Field>
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
          </FieldGroup>
        </form>
      </FieldGroup>
    </AuthCard>
  )
}
