import { isReceiptMimeType, MAX_RECEIPT_BYTES } from '@home/shared'

export interface PreparedReceipt {
  data: Blob
  fileName: string
  mimeType: string
  size: number
}

const MAX_EDGE = 2000
const JPEG_QUALITY = 0.82
// Browsers can decode these into a canvas. HEIC generally can't be, so it's uploaded as-is.
const DOWNSCALABLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
}

/** Some browsers leave File.type empty for HEIC; fall back to the extension. */
function mimeTypeOf(file: File): string {
  if (file.type) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_TYPES[extension] ?? ''
}

async function downscaleToJpeg(file: Blob): Promise<{ blob: Blob; resized: boolean } | null> {
  const bitmap = await createImageBitmap(file) // applies EXIF orientation
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#ffffff' // transparent PNG areas become white, not black
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  })
  return blob ? { blob, resized: scale < 1 } : null
}

/**
 * Validates a picked file and shrinks photos to at most 2000px on the long edge (as JPEG).
 * Throws an Error with a user-facing message for unsupported or oversized files.
 */
export async function prepareReceiptFile(file: File): Promise<PreparedReceipt> {
  const mimeType = mimeTypeOf(file)
  if (!isReceiptMimeType(mimeType)) {
    throw new Error(`${file.name}: receipts must be photos (JPEG, PNG, WebP, HEIC) or PDFs`)
  }

  if (DOWNSCALABLE.has(mimeType)) {
    try {
      const result = await downscaleToJpeg(file)
      if (result && (result.resized || result.blob.size < file.size)) {
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'receipt'
        return {
          data: result.blob,
          fileName: `${baseName}.jpg`,
          mimeType: 'image/jpeg',
          size: result.blob.size,
        }
      }
    } catch {
      // Fall through and upload the original.
    }
  }

  if (file.size > MAX_RECEIPT_BYTES) throw new Error(`${file.name} is larger than 10 MB`)
  return { data: file, fileName: file.name, mimeType, size: file.size }
}
