import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Browser preview of the renderer (no Electron): window.api is replaced by a
 * localStorage-backed stand-in (src/renderer/src/demo/browserApi.ts).
 * `npm run build:demo` → dist-demo/demo.html + assets, deployable as static files.
 */
export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('shared'),
    },
  },
  plugins: [react()],
  build: {
    outDir: resolve('dist-demo'),
    emptyOutDir: true,
    rollupOptions: { input: resolve('src/renderer/demo.html') },
  },
})
