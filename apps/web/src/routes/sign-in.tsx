import {
  emailSignInSchema,
  passwordSignInSchema,
  signUpSchema,
  type EmailSignInInput,
  type PasswordSignInInput,
  type SignUpInput,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheckIcon } from 'lucide-react'
import { useState } from 'react'
import {
  useForm,
  type FieldError as FieldErrorType,
  type UseFormRegisterReturn,
} from 'react-hook-form'
import { useLoaderData, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { AuthCard } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { requestPasswordReset, signInWithPassword, signUp } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import type { signInLoader } from './loaders'

type Mode = 'sign-in' | 'sign-up' | 'forgot'

/** What was emailed, for the "check your email" screen. */
interface Sent {
  kind: 'confirm' | 'reset'
  email: string
}

const SENT_COPY: Record<Sent['kind'], { title: string; body: string }> = {
  confirm: {
    title: 'Confirm your email',
    body: 'To finish creating your account, open the link we sent to',
  },
  reset: { title: 'Check your email', body: 'We sent a link to choose a new password to' },
}

export function SignInPage() {
  const { next, forInvite } = useLoaderData<typeof signInLoader>()
  // Most people opening an invite are new, so start them on "create account".
  const [mode, setMode] = useState<Mode>(forInvite ? 'sign-up' : 'sign-in')
  const [sent, setSent] = useState<Sent | null>(null)
  // Carried between modes so switching doesn't make people retype it.
  const [email, setEmail] = useState('')

  if (sent) {
    const copy = SENT_COPY[sent.kind]
    return (
      <AuthCard
        title={copy.title}
        description={
          <>
            {copy.body} <span className="font-medium text-foreground">{sent.email}</span>. Open it
            on this device to continue.
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
          <Button
            variant="outline"
            onClick={() => {
              setSent(null)
              setMode('sign-in')
            }}
          >
            Back to sign in
          </Button>
        </div>
      </AuthCard>
    )
  }

  const switchTo = (nextMode: Mode) => () => setMode(nextMode)
  const common = { email, onEmailChange: setEmail, next, onSent: setSent }

  switch (mode) {
    case 'sign-up':
      return (
        <AuthCard
          title={forInvite ? 'Create an account to join' : 'Create an account'}
          description="Manage your home's expenses, tasks and providers with your household."
        >
          <SignUpForm {...common} />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account? <LinkButton onClick={switchTo('sign-in')}>Sign in</LinkButton>
          </p>
        </AuthCard>
      )
    case 'forgot':
      return (
        <AuthCard
          title="Reset your password"
          description="We'll email you a link to choose a new one."
        >
          <EmailOnlyForm
            {...common}
            submitLabel="Email me a reset link"
            onSubmitEmail={async (address) => {
              await requestPasswordReset(address)
              setSent({ kind: 'reset', email: address })
            }}
          />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <LinkButton onClick={switchTo('sign-in')}>Back to sign in</LinkButton>
          </p>
        </AuthCard>
      )
    case 'sign-in':
      return (
        <AuthCard
          title={forInvite ? 'Sign in to join' : 'Sign in'}
          description={
            forInvite
              ? 'Sign in to accept your invite.'
              : "Manage your home's expenses, tasks and providers."
          }
        >
          <SignInForm {...common} onForgot={switchTo('forgot')} />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            New here? <LinkButton onClick={switchTo('sign-up')}>Create an account</LinkButton>
          </p>
        </AuthCard>
      )
  }
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="font-medium text-foreground underline-offset-4 hover:underline"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

interface FormProps {
  email: string
  onEmailChange: (email: string) => void
  next: string
  onSent: (sent: Sent) => void
}

function EmailField({
  registration,
  error,
}: {
  registration: UseFormRegisterReturn<'email'>
  error: FieldErrorType | undefined
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <Input
        id="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        aria-invalid={!!error}
        {...registration}
      />
      <FieldError errors={[error]} />
    </Field>
  )
}

function SignInForm({
  email,
  onEmailChange,
  next,
  onForgot,
}: FormProps & { onForgot: () => void }) {
  const navigate = useNavigate()
  const form = useForm<PasswordSignInInput>({
    resolver: zodResolver(passwordSignInSchema),
    defaultValues: { email, password: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await signInWithPassword(values.email, values.password)
      await navigate(next, { replace: true })
    } catch (error) {
      form.setError('password', { message: errorMessage(error) })
    }
  })

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <FieldGroup>
        <EmailField
          registration={form.register('email', {
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => onEmailChange(e.target.value),
          })}
          error={form.formState.errors.email}
        />
        <Field data-invalid={!!errors.password}>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={onForgot}
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
  )
}

function SignUpForm({ email, onEmailChange, next, onSent }: FormProps) {
  const navigate = useNavigate()
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email, password: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { needsConfirmation } = await signUp(values.email, values.password, next)
      if (needsConfirmation) onSent({ kind: 'confirm', email: values.email })
      else await navigate(next, { replace: true })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  })

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <FieldGroup>
        <EmailField
          registration={form.register('email', {
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => onEmailChange(e.target.value),
          })}
          error={form.formState.errors.email}
        />
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...form.register('password')}
          />
          <FieldDescription>At least 8 characters.</FieldDescription>
          <FieldError errors={[errors.password]} />
        </Field>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </Button>
      </FieldGroup>
    </form>
  )
}

function EmailOnlyForm({
  email,
  onEmailChange,
  submitLabel,
  onSubmitEmail,
}: FormProps & { submitLabel: string; onSubmitEmail: (email: string) => Promise<void> }) {
  const form = useForm<EmailSignInInput>({
    resolver: zodResolver(emailSignInSchema),
    defaultValues: { email },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await onSubmitEmail(values.email)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  })

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate>
      <FieldGroup>
        <EmailField
          registration={form.register('email', {
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => onEmailChange(e.target.value),
          })}
          error={form.formState.errors.email}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Sending…' : submitLabel}
        </Button>
      </FieldGroup>
    </form>
  )
}
