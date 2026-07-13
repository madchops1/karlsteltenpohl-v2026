import { defineConfig } from 'vite'

// BASE_PATH is set by the deploy workflow from the Pages config: it is
// '/karlsteltenpohl-v2026' while the site is served at the github.io project
// path, and '' once the custom domain karlsteltenpohl.com is active.
const base = (process.env.BASE_PATH || '').replace(/\/$/, '') + '/'

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
  },
})
