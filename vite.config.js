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
    // Raised to 120s on 2026-07-27: one full-app test tripped 90s under a fully loaded
    // parallel coverage run and passed on rerun, the same flake shape as the netlify
    // mirror job.
    testTimeout: 120000,
    hookTimeout: 120000,
    // Pin the suite's timezone so any test asserting a day heading, or what counts
    // as "today", is runner-independent. UTC is what these tests were already
    // written against: CI's runners sit in UTC, so this changes nothing there. What
    // it fixes is the LOCAL run, which until now needed an explicit `TZ=UTC` prefix
    // and failed in a confusing way without one. test/guards.test.js asserts the pin
    // so it cannot be dropped unnoticed on an already-UTC runner.
    env: { TZ: 'UTC' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      // netlify/functions is inside the gate as well as src. The subscription
      // endpoint is real shipped code that a subscriber's calendar hits directly,
      // and it sat outside coverage.include with no tests at all while the badge
      // read 100%. See sports-viewer-meta/docs/LINEAGES.md section 5.
      include: ['src/**/*.{js,jsx}', 'netlify/functions/**/*.mjs'],
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
