import type { PreparedReceipt } from '@/lib/images'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { Worker as OcrWorker } from 'tesseract.js'

/** A receipt this browser can't turn into text (e.g. HEIC outside Safari). */
export class UnreadableReceiptError extends Error {}

/** Enough characters that a PDF's text layer is the receipt, not a stray page number. */
const MIN_PDF_TEXT = 20
/** Tesseract reads small photos better once they're enlarged a bit. */
const MIN_OCR_EDGE = 1600
const MAX_OCR_EDGE = 2000

interface ReadOptions {
  /** 0–1, for a progress indicator. */
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

function abortError() {
  return new DOMException('Scan cancelled', 'AbortError')
}

/** The engine files are copied into public/ocr/ by the ocr-assets plugin in vite.config.ts. */
const ocrAsset = (path: string) => new URL(`${__OCR_ASSETS__}${path}`, window.location.origin).href

// Tesseract's own loading steps, then recognition, as shares of the whole scan.
const LOADING_SHARE = 0.3

/** Rejects with an AbortError when `signal` aborts (terminating a worker doesn't settle its jobs). */
function whenAborted(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => {
    if (signal?.aborted) reject(abortError())
    signal?.addEventListener('abort', () => reject(abortError()), { once: true })
  })
}

/**
 * A Tesseract worker that's loaded once and reused, so a batch of receipts doesn't pay the
 * engine's start-up time per file. Jobs must run one at a time (progress goes to the current one).
 */
class OcrEngine {
  private starting: Promise<OcrWorker> | null = null
  private report: ((progress: number) => void) | undefined

  async recognise(canvas: HTMLCanvasElement, { onProgress, signal }: ReadOptions) {
    const aborted = whenAborted(signal)
    aborted.catch(() => undefined) // only awaited through the races below
    this.report = onProgress
    try {
      const worker = await Promise.race([this.start(), aborted])
      onProgress?.(LOADING_SHARE)
      const { data } = await Promise.race([worker.recognize(canvas), aborted])
      return data.text
    } catch (error) {
      // A cancelled job can't be stopped inside the worker, so drop the worker with it.
      if (signal?.aborted) this.close()
      throw error
    } finally {
      this.report = undefined
    }
  }

  private start(): Promise<OcrWorker> {
    this.starting ??= import('tesseract.js').then(({ createWorker, OEM }) =>
      createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: ocrAsset('worker.min.js'),
        corePath: ocrAsset(''),
        langPath: ocrAsset(''),
        logger: ({ status, progress }) => {
          this.report?.(
            status === 'recognizing text'
              ? LOADING_SHARE + progress * (1 - LOADING_SHARE)
              : Math.min(LOADING_SHARE, progress * LOADING_SHARE),
          )
        },
      }),
    )
    const starting = this.starting
    starting.catch(() => {
      if (this.starting === starting) this.starting = null
    })
    return starting
  }

  /** Stops the worker, including one that's still loading. */
  close() {
    const starting = this.starting
    this.starting = null
    void starting?.then((worker) => worker.terminate()).catch(() => undefined)
  }
}

async function imageToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob) // applies EXIF orientation
  } catch {
    throw new UnreadableReceiptError("This browser can't read that photo format")
  }
  const longEdge = Math.max(bitmap.width, bitmap.height)
  const scale =
    longEdge < MIN_OCR_EDGE ? MIN_OCR_EDGE / longEdge : Math.min(1, MAX_OCR_EDGE / longEdge)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new UnreadableReceiptError("Couldn't read that photo")
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas
}

async function readPdf(blob: Blob, options: ReadOptions, ocr: OcrEngine): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const loading = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
  const pdf = await loading.promise
  try {
    const page = await pdf.getPage(1)
    // Digital receipts (bank transfers, e-receipts) carry their text: rebuild it line by line.
    const content = await page.getTextContent()
    const rows = new Map<number, { x: number; text: string }[]>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const [, , , , x = 0, y = 0] = item.transform as number[]
      const key = Math.round(y / 3) // items within ~3pt vertically share a line
      const row = rows.get(key) ?? []
      row.push({ x, text: item.str })
      rows.set(key, row)
    }
    const text = [...rows.entries()]
      .sort(([a], [b]) => b - a) // PDF y grows upwards
      .map(([, row]) =>
        row
          .sort((a, b) => a.x - b.x)
          .map((r) => r.text)
          .join(' '),
      )
      .join('\n')
    if (text.replace(/\s/g, '').length >= MIN_PDF_TEXT) return text

    // A scanned PDF: render page 1 and read it like a photo.
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport, background: '#ffffff' }).promise
    return await ocr.recognise(canvas, options)
  } finally {
    void loading.destroy()
  }
}

async function readWith(
  ocr: OcrEngine,
  file: PreparedReceipt,
  options: ReadOptions,
): Promise<string> {
  if (file.mimeType === 'application/pdf') {
    try {
      return await readPdf(file.data, options, ocr)
    } catch (error) {
      if (options.signal?.aborted || error instanceof UnreadableReceiptError) throw error
      throw new UnreadableReceiptError("Couldn't open that PDF")
    }
  }
  return ocr.recognise(await imageToCanvas(file.data), options)
}

/**
 * The text on a receipt, read on this device: a PDF's own text when it has some, otherwise OCR.
 * Throws UnreadableReceiptError for files this browser can't decode, and an AbortError when
 * `signal` aborts.
 */
export async function readReceiptText(
  file: PreparedReceipt,
  options: ReadOptions = {},
): Promise<string> {
  const ocr = new OcrEngine()
  try {
    return await readWith(ocr, file, options)
  } finally {
    ocr.close()
  }
}

export interface ReceiptReader {
  /** Like readReceiptText. Call it for one receipt at a time. */
  read: (file: PreparedReceipt, options?: ReadOptions) => Promise<string>
  /** Frees the OCR engine. */
  close: () => void
}

/** Reads several receipts in turn, loading the OCR engine once (and only if a photo needs it). */
export function createReceiptReader(): ReceiptReader {
  const ocr = new OcrEngine()
  return {
    read: (file, options = {}) => readWith(ocr, file, options),
    close: () => ocr.close(),
  }
}
