import { formatRelativeTime, type AccessRequestStatus, type AdminAccessRequest } from '@home/shared'
import { useQuery } from '@tanstack/react-query'
import { CircleCheckIcon, CircleXIcon, MailIcon, Undo2Icon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { AdminPager } from '@/components/admin'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSetAccessRequestStatus } from '@/hooks/use-admin'
import { adminAccessRequestsQuery } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { accessRequestStatusParam } from './loaders'

const FILTERS: { status: AccessRequestStatus | 'all'; label: string }[] = [
  { status: 'new', label: 'New' },
  { status: 'invited', label: 'Invited' },
  { status: 'declined', label: 'Declined' },
  { status: 'all', label: 'All' },
]

const EMPTY: Record<AccessRequestStatus | 'all', string> = {
  new: 'No new requests',
  invited: 'Nobody marked invited yet',
  declined: 'No declined requests',
  all: 'No requests yet',
}

/**
 * The marketing site's "Get early access" requests. Letting someone in happens in Households
 * (create theirs and send the household admin invite); marking the request records that it's done.
 */
export function AdminEarlyAccessPage() {
  const [params, setParams] = useSearchParams()
  const status = accessRequestStatusParam(params)
  const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0)
  const requests = useQuery(adminAccessRequestsQuery(status, page))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Early access</h1>
        <p className="text-sm text-muted-foreground">
          Requests from the website. To let someone in,{' '}
          <Link
            to="/admin/households"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            create their household
          </Link>{' '}
          with a household admin invite to their email, then mark the request invited.
        </p>
      </div>

      <nav aria-label="Show requests" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Button
            key={f.status}
            variant={f.status === status ? 'secondary' : 'ghost'}
            size="sm"
            aria-current={f.status === status ? 'page' : undefined}
            onClick={() => setParams(f.status === 'new' ? {} : { status: f.status })}
          >
            {f.label}
          </Button>
        ))}
      </nav>

      {requests.isError ? (
        <p className="text-sm text-destructive">Couldn’t load the requests. Try again.</p>
      ) : !requests.data ? null : requests.data.items.length === 0 ? (
        <EmptyState title={EMPTY[status]} size="sm" />
      ) : (
        <>
          <ul
            className={cn(
              'divide-y rounded-xl border transition-opacity',
              requests.isPlaceholderData && 'opacity-60',
            )}
          >
            {requests.data.items.map((r) => (
              <RequestRow key={r.id} request={r} showStatus={status === 'all'} />
            ))}
          </ul>
          <AdminPager total={requests.data.total} count={requests.data.items.length} />
        </>
      )}
    </div>
  )
}

function RequestRow({ request, showStatus }: { request: AdminAccessRequest; showStatus: boolean }) {
  const setStatus = useSetAccessRequestStatus()
  const mark = (status: AccessRequestStatus) =>
    setStatus.mutate({ requestId: request.id, email: request.email, status })

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{request.name}</span>
          {showStatus && request.status !== 'new' && (
            <Badge variant="outline">{request.status === 'invited' ? 'Invited' : 'Declined'}</Badge>
          )}
        </p>
        <a
          href={`mailto:${request.email}`}
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <MailIcon className="size-3.5" aria-hidden />
          {request.email}
        </a>
        {request.note && <p className="max-w-prose text-sm whitespace-pre-line">{request.note}</p>}
        <p className="text-xs text-muted-foreground">
          Asked {formatRelativeTime(request.createdAt)}
          {request.updatedAt !== request.createdAt &&
            ` · updated ${formatRelativeTime(request.updatedAt)}`}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {request.status === 'new' ? (
          <>
            <Button size="sm" onClick={() => mark('invited')} disabled={setStatus.isPending}>
              <CircleCheckIcon aria-hidden />
              Mark invited
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => mark('declined')}
              disabled={setStatus.isPending}
            >
              <CircleXIcon aria-hidden />
              Decline
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => mark('new')}
            disabled={setStatus.isPending}
          >
            <Undo2Icon aria-hidden />
            Back to new
          </Button>
        )}
      </div>
    </li>
  )
}
