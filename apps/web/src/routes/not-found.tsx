import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <section className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <Button asChild variant="outline">
        <Link to="/">Go home</Link>
      </Button>
    </section>
  )
}
