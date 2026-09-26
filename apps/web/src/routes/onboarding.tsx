import { updateProfile, updateProfileSchema, type UpdateProfileInput } from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { MailQuestionIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { AuthCard } from '@/components/auth-card'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useProfile } from '@/hooks/use-household'
import { signOut } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { profileQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

/**
 * Signed in but in no household. Households are created by super-admins and joined through an
 * invite link, so this page only explains that (and lets people set their name meanwhile).
 */
export function OnboardingPage() {
  const profile = useProfile()
  const queryClient = useQueryClient()
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { fullName: profile.full_name ?? '' },
  })
  const { errors, isSubmitting, isDirty } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const updated = await updateProfile(supabase, profile.id, values)
      queryClient.setQueryData(profileQuery(profile.id).queryKey, updated)
      form.reset({ fullName: updated.full_name ?? '' })
      toast.success('Name saved')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  })

  return (
    <AuthCard
      title="You're not in a household yet"
      description="Ask your household admin for an invite link, then open it on this device to join."
    >
      <div className="flex flex-col gap-4">
        <MailQuestionIcon className="size-10 text-muted-foreground" aria-hidden />
        <form onSubmit={(e) => void onSubmit(e)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.fullName}>
              <FieldLabel htmlFor="fullName">Your name</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="fullName"
                  autoComplete="name"
                  aria-invalid={!!errors.fullName}
                  {...form.register('fullName')}
                />
                <Button type="submit" variant="outline" disabled={isSubmitting || !isDirty}>
                  {isSubmitting ? 'Saving…' : 'Save'}
                </Button>
              </div>
              <FieldDescription>
                So your household knows who you are when you join.
              </FieldDescription>
              <FieldError errors={[errors.fullName]} />
            </Field>
          </FieldGroup>
        </form>
      </div>

      <Separator className="my-6" />

      <FieldDescription className="text-center">
        Signed in as <span className="font-medium text-foreground">{profile.email}</span>.
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
