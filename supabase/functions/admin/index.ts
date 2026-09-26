import { createAuthAdmin } from '../_shared/auth-admin.ts'
import { createDeps } from '../_shared/deps.ts'
import { handler } from './handler.ts'

const base = createDeps()
const deps = { ...base, authAdmin: createAuthAdmin(base.admin) }

Deno.serve((req) => handler(req, deps))
