import { onboardingSchema, updateProfile, type OnboardingInput } from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { AuthCard } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useCreateHousehold } from '@/hooks/use-create-household'
import { useProfile } from '@/hooks/use-household'
import { signOut } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { profileQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

export function OnboardingPage() {
  const profile = useProfile()
  const queryClient = useQueryClient()
  const createHousehold = useCreateHousehold()
  const navigate = useNavigate()

  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { fullName: profile.full_name ?? '', householdName: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ fullName, householdName }) => {
    try {
      if (fullName !== profile.full_name) {
        const updated = await updateProfile(supabase, profile.id, { fullName })
        queryClient.setQueryData(profileQuery(profile.id).queryKey, updated)
      }
      await createHousehold.mutateAsync({ name: householdName })
      await navigate('/', { replace: true })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  })

  return (
    <AuthCard
      title="Set up your household"
      description="Everyone you invite later can see and edit everything in it."
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <FieldGroup>
          <Field data-invalid={!!errors.fullName}>
            <FieldLabel htmlFor="fullName">Your name</FieldLabel>
            <Input
              id="fullName"
              autoComplete="name"
              aria-invalid={!!errors.fullName}
              {...form.register('fullName')}
            />
            <FieldError errors={[errors.fullName]} />
          </Field>
          <Field data-invalid={!!errors.householdName}>
            <FieldLabel htmlFor="householdName">Household name</FieldLabel>
            <Input
              id="householdName"
              placeholder="e.g. Lekki flat"
              autoFocus={!!profile.full_name}
              aria-invalid={!!errors.householdName}
              {...form.register('householdName')}
            />
            <FieldError errors={[errors.householdName]} />
          </Field>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create household'}
          </Button>
        </FieldGroup>
      </form>

      <Separator className="my-6" />

      <FieldDescription className="text-center">
        Joining someone else&apos;s household? Ask them to invite{' '}
        <span className="font-medium text-foreground">{profile.email}</span>, then open the link in
        the email.
      </FieldDescription>
      <Button
        variant="link"
        className="mt-2 w-full"
        onClick={() => void signOut().catch((error: unknown) => toast.error(errorMessage(error)))}
      >
        Sign out
      </Button>
    </AuthCard>
  )
}
