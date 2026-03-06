import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cssInjectedByJsPlugin()],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  build: {
    lib: {
      entry: 'src/main.tsx',
      name: 'MocaReactChart',
      fileName: 'moca-react-chart',
      formats: ['iife'],
    },
    cssCodeSplit: false,
  },
})
