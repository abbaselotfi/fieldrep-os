import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const appBase = process.env.VITE_APP_BASE ?? '/'

export default defineConfig({
  base: appBase,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@fieldrep/domain': fileURLToPath(new URL('../../packages/domain/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
