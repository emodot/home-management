import { LogOutIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UserAvatar } from '@/components/user-avatar'
import { useProfile } from '@/hooks/use-household'
import { signOut } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'

export function AccountMenu() {
  const profile = useProfile()
  const displayName = profile.full_name ?? profile.email

  function handleSignOut() {
    // The auth listener clears cached data and returns to /sign-in.
    signOut().catch((error: unknown) => toast.error(errorMessage(error)))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <UserAvatar name={displayName} avatarUrl={profile.avatar_url} />
          <span className="sr-only">Account</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate">{displayName}</span>
          {profile.full_name && (
            <span className="truncate text-xs font-normal text-muted-foreground">
              {profile.email}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut}>
          <LogOutIcon aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
