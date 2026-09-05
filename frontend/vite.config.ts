/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const CHUNK_MAP: Record<string, string[]> = {
  react: ['react', 'react-dom', 'react-router-dom'],
  query: ['@tanstack/react-query'],
  charts: ['recharts'],
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/media': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: false,
      },
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: false,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    target: ['es2020', 'edge100', 'chrome100'] as const,
    cssTarget: ['edge100', 'chrome100'] as const,
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          for (const [name, pkgs] of Object.entries(CHUNK_MAP)) {
            for (const pkg of pkgs) {
              const marker = `node_modules/${pkg}`
              const altMarker = `node_modules\\${pkg}`
              if (id.includes(marker) || id.includes(altMarker)) {
                return name
              }
            }
          }
          return undefined
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      'axios',
      'zustand',
      'recharts',
    ],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
