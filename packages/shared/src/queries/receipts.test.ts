import { describe, expect, it } from 'vitest'
import type { HomeClient } from '../client.ts'
import { receiptPath, uploadReceipt } from './receipts.ts'

const householdId = '0d4f3a5e-8a9b-4c6d-9e7f-1a2b3c4d5e6f'
const expenseId = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'

function fakeClient(options: { insertError?: { message: string } } = {}) {
  const calls = { uploads: [] as { path: string; body: unknown }[], removed: [] as string[][] }
  const client = {
    storage: {
      from: () => ({
        upload: (path: string, body: unknown) => {
          calls.uploads.push({ path, body })
          return Promise.resolve({ data: { path }, error: null })
        },
        remove: (paths: string[]) => {
          calls.removed.push(paths)
          return Promise.resolve({ data: [], error: null })
        },
      }),
    },
    from: () => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: () =>
            Promise.resolve(
              options.insertError
                ? { data: null, error: options.insertError }
                : { data: { id: 'r1', ...row }, error: null },
            ),
        }),
      }),
    }),
  } as unknown as HomeClient
  return { client, calls }
}

describe('receiptPath', () => {
  it('follows {household}/{expense}/{file}.{ext}', () => {
    expect(receiptPath(householdId, expenseId, 'f1', 'application/pdf')).toBe(
      `${householdId}/${expenseId}/f1.pdf`,
    )
    expect(receiptPath(householdId, expenseId, 'f1', 'image/jpeg')).toBe(
      `${householdId}/${expenseId}/f1.jpg`,
    )
  })
})

describe('uploadReceipt', () => {
  it('uploads, records the receipt and labels untyped blobs with the validated type', async () => {
    const { client, calls } = fakeClient()
    const receipt = await uploadReceipt(client, {
      householdId,
      expenseId,
      data: new Blob(['x']), // e.g. a HEIC File with an empty type
      fileName: 'IMG_1.heic',
      mimeType: 'image/heic',
      size: 1,
      fileId: 'f1',
    })
    expect(calls.uploads[0]?.path).toBe(`${householdId}/${expenseId}/f1.heic`)
    expect((calls.uploads[0]?.body as Blob).type).toBe('image/heic')
    expect(receipt).toMatchObject({
      storage_path: `${householdId}/${expenseId}/f1.heic`,
      mime_type: 'image/heic',
    })
  })

  it('removes the uploaded file if recording fails', async () => {
    const { client, calls } = fakeClient({ insertError: { message: 'nope' } })
    await expect(
      uploadReceipt(client, {
        householdId,
        expenseId,
        data: new Blob(['x'], { type: 'image/jpeg' }),
        fileName: 'r.jpg',
        mimeType: 'image/jpeg',
        size: 1,
        fileId: 'f1',
      }),
    ).rejects.toMatchObject({ message: 'nope' })
    expect(calls.removed).toEqual([[`${householdId}/${expenseId}/f1.jpg`]])
  })

  it('rejects unsupported files before uploading', async () => {
    const { client, calls } = fakeClient()
    await expect(
      uploadReceipt(client, {
        householdId,
        expenseId,
        data: new Blob(['x']),
        fileName: 'r.gif',
        mimeType: 'image/gif',
        size: 1,
      }),
    ).rejects.toThrow()
    expect(calls.uploads).toHaveLength(0)
  })
})
