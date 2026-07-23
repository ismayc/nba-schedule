import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative base so the same dist/ works at a domain root (Netlify) and under a
  // subpath (GitHub Pages /nba-schedule/).
  base: './',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    // The committed 2025-26 season is ~1,320 games, so a few App integration tests
    // render well over a thousand cards *twice* (filter toggles) under coverage
    // instrumentation. On a loaded CI runner one such test was seen at ~53s, so give
    // generous headroom — locally they run in <10s; this only guards runner variance.
    testTimeout: 90000,
    hookTimeout: 90000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/data/**'],
      // Enforced gate: the suite (and CI's coverage:badge step) fails if any metric
      // slips below 100%. Genuinely unreachable defensive arms carry an inline
      // `/* v8 ignore next */` with a justification rather than lowering these.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
