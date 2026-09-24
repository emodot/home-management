import { unwrap, type HomeClient } from '../client.ts'
import type { Tables } from '../database.types.ts'
import { RECEIPT_MIME_TYPES, receiptFileSchema, type ReceiptMimeType } from '../schemas/expenses.ts'

export type Receipt = Tables<'expense_receipts'>

export const RECEIPTS_BUCKET = 'receipts'
/** Signed URLs are short-lived; refetch rather than store them. */
export const RECEIPT_URL_TTL_SECONDS = 600

export async function listReceipts(client: HomeClient, expenseId: string): Promise<Receipt[]> {
  return unwrap(
    await client
      .from('expense_receipts')
      .select('*')
      .eq('expense_id', expenseId)
      .is('deleted_at', null)
      .order('created_at'),
  )
}

/** `{householdId}/{expenseId}/{fileId}.{ext}` */
export function receiptPath(
  householdId: string,
  expenseId: string,
  fileId: string,
  mimeType: ReceiptMimeType,
): string {
  return `${householdId}/${expenseId}/${fileId}.${RECEIPT_MIME_TYPES[mimeType]}`
}

/**
 * Uploads a receipt file and records it. If recording fails the uploaded object is removed.
 * `data` is a Blob on the web; React Native can pass an ArrayBuffer.
 */
export async function uploadReceipt(
  client: HomeClient,
  params: {
    householdId: string
    expenseId: string
    data: Blob | ArrayBuffer
    fileName: string
    mimeType: string
    size: number
    fileId?: string
  },
): Promise<Receipt> {
  const { fileName, mimeType, size } = receiptFileSchema.parse(params)
  const path = receiptPath(
    params.householdId,
    params.expenseId,
    params.fileId ?? crypto.randomUUID(),
    mimeType,
  )

  // storage-js sends Blobs as multipart and the server uses the blob's own type (ignoring
  // contentType), so make sure it's the validated one: File.type is often empty for HEIC.
  const body =
    typeof Blob !== 'undefined' && params.data instanceof Blob && params.data.type !== mimeType
      ? new Blob([params.data], { type: mimeType })
      : params.data
  const { error: uploadError } = await client.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, body, { contentType: mimeType, upsert: false })
  if (uploadError) throw uploadError

  const { data, error } = await client
    .from('expense_receipts')
    .insert({
      household_id: params.householdId,
      expense_id: params.expenseId,
      storage_path: path,
      file_name: fileName,
      mime_type: mimeType,
      size_bytes: size,
    })
    .select('*')
    .single()
  if (error) {
    await client.storage.from(RECEIPTS_BUCKET).remove([path])
    throw error
  }
  return data
}

/** Soft delete (deleted = true) or restore a receipt. Files are purged with the row after 30 days. */
export async function setReceiptDeleted(
  client: HomeClient,
  id: string,
  deleted: boolean,
): Promise<void> {
  unwrap(
    await client
      .from('expense_receipts')
      .update({ deleted_at: deleted ? new Date().toISOString() : null })
      .eq('id', id),
  )
}

/** Signed URLs by storage path. */
export async function getReceiptUrls(
  client: HomeClient,
  paths: string[],
  expiresIn: number = RECEIPT_URL_TTL_SECONDS,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const data = unwrap(await client.storage.from(RECEIPTS_BUCKET).createSignedUrls(paths, expiresIn))
  const urls: Record<string, string> = {}
  for (const item of data) {
    if (item.path && item.signedUrl) urls[item.path] = item.signedUrl
  }
  return urls
}
