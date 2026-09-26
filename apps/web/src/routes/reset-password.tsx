import { newPasswordSchema, type NewPasswordInput } from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { AuthCard } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { updatePassword } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'

/** Where the password-reset email lands (already signed in by the link). */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const form = useForm<NewPasswordInput>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      await updatePassword(password)
      toast.success('Password updated')
      await navigate('/', { replace: true })
    } catch (error) {
      form.setError('password', { message: errorMessage(error) })
    }
  })

  return (
    <AuthCard title="Choose a new password" description="You'll use it to sign in from now on.">
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <FieldGroup>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              aria-invalid={!!errors.password}
              {...form.register('password')}
            />
            <FieldDescription>At least 8 characters.</FieldDescription>
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={!!errors.confirm}>
            <FieldLabel htmlFor="confirm">Confirm new password</FieldLabel>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
              {...form.register('confirm')}
            />
            <FieldError errors={[errors.confirm]} />
          </Field>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save password'}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  )
}
