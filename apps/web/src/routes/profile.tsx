import {
  changeEmailSchema,
  changePasswordSchema,
  removeAvatar,
  updateProfile,
  updateProfileSchema,
  uploadAvatar,
  type ChangeEmailInput,
  type ChangePasswordInput,
  type Profile,
  type UpdateProfileInput,
} from '@home/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CameraIcon, LogOutIcon, MonitorSmartphoneIcon, Trash2Icon } from 'lucide-react'
import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useRevalidator } from 'react-router'
import { toast } from 'sonner'
import { ThemeSwitcher } from '@/components/theme-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/user-avatar'
import { useCurrentUser, useProfile } from '@/hooks/use-household'
import {
  changeEmail,
  changePassword,
  requestPasswordReset,
  signOut,
  signOutEverywhere,
} from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { prepareAvatar } from '@/lib/images'
import { profileQuery } from '@/lib/queries'
import { supabase } from '@/lib/supabase'

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** Saves a changed profile to the cache; names and photos also show in members and activity. */
function useProfileSaved() {
  const queryClient = useQueryClient()
  const user = useCurrentUser()
  return (profile: Profile) => {
    queryClient.setQueryData(profileQuery(user.id).queryKey, profile)
    void queryClient.invalidateQueries({ predicate: (q) => q.queryKey.includes('members') })
  }
}

export function ProfilePage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">
          How you appear to your household, and how you sign in.
        </p>
      </div>
      <PhotoAndName />
      <EmailSection />
      <PasswordSection />
      <Section title="Appearance">
        <ThemeSwitcher />
      </Section>
      <SessionsSection />
    </div>
  )
}

function PhotoAndName() {
  const profile = useProfile()
  const saved = useProfileSaved()
  const fileInput = useRef<HTMLInputElement>(null)
  const displayName = profile.full_name ?? profile.email

  const photo = useMutation({
    mutationFn: async (file: File | null) =>
      file
        ? uploadAvatar(supabase, profile.id, await prepareAvatar(file))
        : removeAvatar(supabase, profile.id),
    onSuccess: (updated, file) => {
      saved(updated)
      toast.success(file ? 'Photo updated' : 'Photo removed')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { fullName: profile.full_name ?? '' },
  })
  const { errors, isSubmitting, isDirty } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const updated = await updateProfile(supabase, profile.id, values)
      saved(updated)
      form.reset({ fullName: updated.full_name ?? '' })
      toast.success('Name saved')
    } catch (error) {
      toast.error(errorMessage(error))
    }
  })

  return (
    <Section title="Photo and name" description="Everyone in your households sees these.">
      <div className="flex items-center gap-4">
        <UserAvatar name={displayName} avatarUrl={profile.avatar_url} className="size-16 text-lg" />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInput.current?.click()}
            disabled={photo.isPending}
          >
            <CameraIcon aria-hidden />
            {photo.isPending ? 'Saving…' : profile.avatar_url ? 'Change photo' : 'Add photo'}
          </Button>
          {profile.avatar_url && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => photo.mutate(null)}
              disabled={photo.isPending}
            >
              <Trash2Icon aria-hidden />
              Remove
            </Button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-label="Profile photo"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) photo.mutate(file)
          }}
        />
      </div>
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <Field data-invalid={!!errors.fullName}>
          <FieldLabel htmlFor="fullName">Name</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="fullName"
              autoComplete="name"
              aria-invalid={!!errors.fullName}
              {...form.register('fullName')}
            />
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </div>
          <FieldError errors={[errors.fullName]} />
        </Field>
      </form>
    </Section>
  )
}

function EmailSection() {
  const user = useCurrentUser()
  const revalidator = useRevalidator()
  const form = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { email: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ email }) => {
    if (email === user.email) {
      form.setError('email', { message: "That's already your email" })
      return
    }
    try {
      await changeEmail(email)
      form.reset()
      toast.success('Check your email to confirm the change')
      await revalidator.revalidate()
    } catch (error) {
      form.setError('email', { message: errorMessage(error) })
    }
  })

  return (
    <Section
      title="Email"
      description="You sign in with this address, and invites and reminders are sent to it."
    >
      <p className="text-sm">
        Current: <span className="font-medium">{user.email}</span>
      </p>
      {user.newEmail && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Waiting for you to confirm{' '}
          <span className="font-medium text-foreground">{user.newEmail}</span>. Open the link we
          emailed; you may need to confirm from your current address too.
        </p>
      )}
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="new-email">New email</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="new-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...form.register('email')}
            />
            <Button type="submit" variant="outline" disabled={isSubmitting}>
              {isSubmitting ? 'Sending…' : 'Change'}
            </Button>
          </div>
          <FieldError errors={[errors.email]} />
        </Field>
      </form>
    </Section>
  )
}

/** Change password (asks for the current one). Also used by the admin area's account page. */
export function PasswordSection({ onChanged }: { onChanged?: () => void }) {
  const user = useCurrentUser()
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: '', password: '', confirm: '' },
  })
  const { errors, isSubmitting } = form.formState

  const sendReset = useMutation({
    mutationFn: () => requestPasswordReset(user.email),
    onSuccess: () => toast.success(`We emailed a reset link to ${user.email}`),
    onError: (error) => toast.error(errorMessage(error)),
  })

  const onSubmit = form.handleSubmit(async ({ current, password }) => {
    try {
      await changePassword(user.email, current, password)
      form.reset()
      toast.success('Password changed')
      onChanged?.()
    } catch (error) {
      const message = errorMessage(error)
      form.setError(message.includes('current password') ? 'current' : 'password', { message })
    }
  })

  return (
    <Section title="Password">
      <form onSubmit={(e) => void onSubmit(e)} noValidate>
        <FieldGroup>
          <Field data-invalid={!!errors.current}>
            <FieldLabel htmlFor="current-password">Current password</FieldLabel>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.current}
              {...form.register('current')}
            />
            <FieldError errors={[errors.current]} />
            <FieldDescription>
              Don&apos;t know it, or only ever used email links?{' '}
              <button
                type="button"
                className="font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => sendReset.mutate()}
                disabled={sendReset.isPending}
              >
                Email me a reset link
              </button>
            </FieldDescription>
          </Field>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...form.register('password')}
            />
            <FieldDescription>At least 8 characters.</FieldDescription>
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={!!errors.confirm}>
            <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
              {...form.register('confirm')}
            />
            <FieldError errors={[errors.confirm]} />
          </Field>
          <Button type="submit" className="w-fit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Change password'}
          </Button>
        </FieldGroup>
      </form>
    </Section>
  )
}

function SessionsSection() {
  const everywhere = useMutation({
    // The auth listener takes you to sign-in once the session ends.
    mutationFn: signOutEverywhere,
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Section
      title="Sessions"
      description="Signed in on a phone you've lost or a shared computer? Sign out everywhere."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => void signOut().catch((error: unknown) => toast.error(errorMessage(error)))}
        >
          <LogOutIcon aria-hidden />
          Sign out
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline">
              <MonitorSmartphoneIcon aria-hidden />
              Sign out of all devices
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out of all devices?</AlertDialogTitle>
              <AlertDialogDescription>
                You&apos;ll be signed out here and on every other phone or computer, and will need
                to sign in again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => everywhere.mutate()}>
                Sign out everywhere
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Section>
  )
}
