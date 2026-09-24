import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Full-page by default; `inline` renders inside the app layout (e.g. an unknown expense). */
export function RouteError({ inline = false }: { inline?: boolean }) {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  const message = notFound
    ? "This page doesn't exist, or it belongs to a household you're not in."
    : isRouteErrorResponse(error)
      ? `${error.status} ${error.statusText}`
      : error instanceof Error
        ? error.message
        : 'Unknown error'

  return (
    <div
      className={cn(
        'mx-auto flex max-w-md flex-col items-center justify-center gap-4 px-4 text-center',
        inline ? 'py-16' : 'min-h-dvh',
      )}
    >
      <h1 className="text-xl font-semibold">{notFound ? 'Not found' : 'Something went wrong'}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button asChild>
        <Link to="/">Go to expenses</Link>
      </Button>
    </div>
  )
}
