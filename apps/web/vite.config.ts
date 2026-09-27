import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const REQUIRED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

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
