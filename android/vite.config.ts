import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const demo = process.env.VITE_DEMO === 'true'

export default defineConfig({
  base: demo ? '/vendas/' : '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
})
