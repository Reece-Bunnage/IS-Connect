import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves the site from https://<user>.github.io/IS-Connect/
  base: command === 'build' ? '/IS-Connect/' : '/',
}))
