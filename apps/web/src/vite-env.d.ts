/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Where the receipt-scanning OCR files are served from, e.g. "/ocr/7.0.0-7.0.0-1.0.0/". */
declare const __OCR_ASSETS__: string
