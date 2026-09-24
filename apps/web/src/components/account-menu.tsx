import { LogOutIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useProfile } from '@/hooks/use-household'
import { signOut } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'

function initials(nameOrEmail: string): string {
  const parts = nameOrEmail.split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

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
          <Avatar className="size-8">
            {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
            <AvatarFallback className="text-xs">{initials(displayName)}</AvatarFallback>
          </Avatar>
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
