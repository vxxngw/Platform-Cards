import path from 'path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `vite dev` serves /api from the same Express app Vercel runs as a function (api/[...path].js): no separate backend port.
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      for (const [k, v] of Object.entries(env)) if (!(k in process.env)) process.env[k] = v // PINATA_JWT, RENAISS_* … from .env
      let app: ((req: unknown, res: unknown, next: (e?: unknown) => void) => void) | undefined
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api')) return next()
        try {
          app ??= (await server.ssrLoadModule('/api/_lib/app.js')).createApp()
          app!(req, res, next)
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const port = Number.parseInt(process.env.PORT || '', 10)
  return {
    cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
    plugins: [react(), tailwindcss(), devApi(loadEnv(mode, process.cwd(), ''))],
    server: { port: port || undefined },
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
      dedupe: ['react', 'react-dom'],
      preserveSymlinks: true,
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'react/jsx-runtime', '@tanstack/react-query', '@tanstack/query-core'],
    },
    base: process.env.BASE_PATH || './',
  }
})
