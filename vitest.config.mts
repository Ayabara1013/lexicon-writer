import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve('shared'), '@renderer': resolve('src/renderer/src') } },
  css: { postcss: {} },  // don't load postcss.config.js — tests have no CSS
  test: { include: ['src/**/*.test.ts'] },
})
