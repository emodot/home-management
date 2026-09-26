import { useNavigate, useRevalidator, useRouteLoaderData } from 'react-router'
import type { adminLoader } from './loaders'
import { PasswordSection } from './profile'

/** The signed-in admin's own account: for now, their password. */
export function AdminAccountPage() {
  const admin = useRouteLoaderData<typeof adminLoader>('admin')
  const navigate = useNavigate()
  const revalidator = useRevalidator()

  async function passwordChanged() {
    // Reload the admin area's data so it drops the temporary-password lock.
    await revalidator.revalidate()
    await navigate('/admin', { replace: true })
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your admin account</h1>
        <p className="text-sm text-muted-foreground">Signed in as {admin?.email}.</p>
      </div>
      {admin?.mustChangePassword && (
        <p
          role="status"
          className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground"
        >
          You signed in with a temporary password. Choose your own to continue: enter the temporary
          one as your current password.
        </p>
      )}
      <PasswordSection onChanged={() => void passwordChanged()} />
    </div>
  )
}
