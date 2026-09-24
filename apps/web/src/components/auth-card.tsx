import { HomeIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/** Centered card used by sign-in, auth errors and onboarding. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-2 font-semibold">
        <HomeIcon className="size-5" aria-hidden />
        Home
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}
