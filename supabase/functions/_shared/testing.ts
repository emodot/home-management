// Test helpers: fake dependencies for handlers.
import type { User } from '@supabase/supabase-js'
import type { RenderedEmail } from '../../../packages/emails/generated/index.ts'
import type { HomeClient } from '../../../packages/shared/src/client.ts'
import type { Deps } from './deps.ts'
import { HttpError } from './http.ts'

export const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'ada@example.com' } as User
export const HOUSEHOLD_ID = '0d4f3a5e-8a9b-4c6d-9e7f-1a2b3c4d5e6f'

type RpcResult = { data: unknown; error: { code: string; message: string } | null }

export interface FakeStorage {
  buckets: Record<string, string[]> // bucket -> object paths
  removed: string[]
}

export function fakeDeps(options: {
  rpc?: (fn: string, args: Record<string, unknown>) => RpcResult
  signedIn?: boolean
  sendEmail?: (to: string, email: RenderedEmail) => Promise<void>
  storage?: FakeStorage
}) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []
  const emails: { to: string; email: RenderedEmail }[] = []
  const storage = options.storage ?? { buckets: {}, removed: [] }

  const admin = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return Promise.resolve(options.rpc?.(fn, args) ?? { data: null, error: null })
    },
    storage: {
      getBucket: (bucket: string) =>
        Promise.resolve(
          bucket in storage.buckets
            ? { data: { id: bucket }, error: null }
            : { data: null, error: new Error('Bucket not found') },
        ),
      from: (bucket: string) => ({
        // Mimics Supabase: lists the direct children of a folder; folders have id null.
        list: (prefix: string, { limit, offset }: { limit: number; offset: number }) => {
          const children = new Map<string, boolean>()
          for (const path of storage.buckets[bucket] ?? []) {
            if (!path.startsWith(`${prefix}/`)) continue
            const [name, ...rest] = path.slice(prefix.length + 1).split('/')
            children.set(name!, children.get(name!) === true || rest.length > 0)
          }
          const data = [...children]
            .map(([name, isFolder]) => ({ name, id: isFolder ? null : crypto.randomUUID() }))
            .slice(offset, offset + limit)
          return Promise.resolve({ data, error: null })
        },
        remove: (paths: string[]) => {
          storage.removed.push(...paths)
          return Promise.resolve({ data: [], error: null })
        },
      }),
    },
  } as unknown as HomeClient

  const deps: Deps = {
    admin,
    appUrl: 'https://home.example',
    getUser: () =>
      options.signedIn === false
        ? Promise.reject(new HttpError(401, 'unauthorized'))
        : Promise.resolve(USER),
    sendEmail:
      options.sendEmail ??
      ((to, email) => {
        emails.push({ to, email })
        return Promise.resolve()
      }),
  }
  return { deps, rpcCalls, emails, storage }
}

export function post(body: unknown, method = 'POST'): Request {
  return new Request('http://localhost/fn', {
    method,
    headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

export function dbError(message: string) {
  return { data: null, error: { code: 'P0001', message } }
}
