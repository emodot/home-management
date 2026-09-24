import { assertEquals, assertMatch, assertNotEquals } from '@std/assert'
import { generateToken, hashToken } from './tokens.ts'

Deno.test('tokens are 43-character base64url strings', () => {
  const token = generateToken()
  assertMatch(token, /^[A-Za-z0-9_-]{43}$/)
  assertNotEquals(token, generateToken())
})

Deno.test('hashToken is SHA-256 hex', async () => {
  assertEquals(
    await hashToken('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  )
})
