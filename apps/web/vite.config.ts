import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const REQUIRED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

/**
 * Receipt scanning loads the Tesseract OCR engine and English language data from our own origin
 * (src/lib/receipt-ocr.ts). This copies them from node_modules into public/ocr/<versions>/, a
 * gitignored folder named after the package versions so cached copies never go stale, and gives
 * the app that path as __OCR_ASSETS__.
 */
function ocrAssets(): Plugin {
  const require = createRequire(import.meta.url)
  const packageDir = (name: string, from = require) => dirname(from.resolve(`${name}/package.json`))
  const version = (dir: string) =>
    (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }).version

  const tesseract = packageDir('tesseract.js')
  // tesseract.js-core is a dependency of tesseract.js, not of this app.
  const core = packageDir('tesseract.js-core', createRequire(join(tesseract, 'package.json')))
  const eng = packageDir('@tesseract.js-data/eng')
  const folder = `${version(tesseract)}-${version(core)}-${version(eng)}`
  const files: [from: string, name: string][] = [
    [join(tesseract, 'dist/worker.min.js'), 'worker.min.js'],
    // The worker picks one of these by the browser's WebAssembly SIMD support.
    ...['lstm', 'simd-lstm', 'relaxedsimd-lstm'].map((variant): [string, string] => [
      join(core, `tesseract-core-${variant}.wasm.js`),
      `tesseract-core-${variant}.wasm.js`,
    ]),
    // The smaller integer model, the one tesseract.js itself defaults to.
    [join(eng, '4.0.0_best_int/eng.traineddata.gz'), 'eng.traineddata.gz'],
  ]
  const root = fileURLToPath(new URL('./public/ocr/', import.meta.url))

  return {
    name: 'ocr-assets',
    config: () => ({ define: { __OCR_ASSETS__: JSON.stringify(`/ocr/${folder}/`) } }),
    buildStart() {
      mkdirSync(join(root, folder), { recursive: true })
      for (const entry of readdirSync(root)) {
        if (entry !== folder) rmSync(join(root, entry), { recursive: true, force: true })
      }
      for (const [from, name] of files) {
        const to = join(root, folder, name)
        if (!existsSync(to)) copyFileSync(from, to)
      }
    },
  }
}

export default defineConfig(({ command, mode }) => {
  // Fail the build (e.g. on Vercel) rather than ship an app that crashes on load.
  if (command === 'build') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
    const missing = REQUIRED_ENV.filter((key) => !env[key])
    if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(', ')}`)
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      ocrAssets(),
      VitePWA({
        // A new deploy takes over as soon as it's downloaded (see src/lib/pwa.ts); there is no
        // offline data to migrate.
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
        manifest: {
          name: 'Home',
          short_name: 'Home',
          description:
            'Household expenses, tasks and service providers, shared with your household.',
          lang: 'en-NG',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#171717',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // A new version takes over as soon as it installs, instead of waiting for every tab
          // (or the installed app) to close. The plugin only does this by itself with
          // injectRegister 'auto'; src/lib/pwa.ts then reloads the page.
          skipWaiting: true,
          clientsClaim: true,
          // Precache the app shell only; household data always comes from the network.
          globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
          // Receipt scanning (the OCR engine in public/ocr/ and pdf.js) downloads on first use
          // instead of with every install and update, then is cached below.
          globIgnores: ['ocr/**', 'assets/pdf-*.js'],
          runtimeCaching: [
            {
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin &&
                (url.pathname.startsWith('/ocr/') || /^\/assets\/pdf[.-]/.test(url.pathname)),
              handler: 'CacheFirst',
              options: { cacheName: 'receipt-scan', expiration: { maxEntries: 20 } },
            },
          ],
          navigateFallback: '/index.html',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
  }
})
