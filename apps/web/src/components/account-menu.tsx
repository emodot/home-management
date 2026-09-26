import { useQuery } from '@tanstack/react-query'
import { LogOutIcon, ShieldIcon, UserRoundIcon } from 'lucide-react'
import { Link } from 'react-router'
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
import { ThemeSubmenu } from '@/components/theme-menu'
import { UserAvatar } from '@/components/user-avatar'
import { useCurrentUser, useProfile } from '@/hooks/use-household'
import { signOut } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { isAppAdminQuery } from '@/lib/queries'

export function AccountMenu() {
  const profile = useProfile()
  const isAdmin = useQuery(isAppAdminQuery(useCurrentUser().id)).data === true
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
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <UserRoundIcon aria-hidden />
            Profile
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/admin">
              <ShieldIcon aria-hidden />
              Admin
            </Link>
          </DropdownMenuItem>
        )}
        <ThemeSubmenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut}>
          <LogOutIcon aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
