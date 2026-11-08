import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works from any path (GitHub Pages project site, local preview).
export default defineConfig({
  base: './',
  plugins: [react()],
})
