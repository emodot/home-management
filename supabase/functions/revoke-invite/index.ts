import { createDeps } from '../_shared/deps.ts'
import { handler } from './handler.ts'

const deps = createDeps()

Deno.serve((req) => handler(req, deps))
