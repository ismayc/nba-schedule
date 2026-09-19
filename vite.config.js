import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

const abs = (rel) => fileURLToPath(new URL(rel, import.meta.url))

// The modules the refresh workflow rewrites, each mapped to a frozen stand-in.
// test/guards.test.js asserts every file scripts/fetch-schedule.mjs writes is listed here.
const FROZEN = new Map([
  [abs('./src/data/schedule.js'), abs('./test/fixtures/frozen/schedule.js')],
  [abs('./src/data/leaders.js'), abs('./test/fixtures/frozen/leaders.js')],
  [abs('./src/data/teams.js'), abs('./test/fixtures/frozen/teams.js')],
])

// `LIVE_DATA=1` (npm run test:data) runs only test/live/ and reads the real modules.
const LIVE = Boolean(process.env.LIVE_DATA)

// Under vitest, every import of a refreshed data module resolves to its frozen stand-in,
// whoever the importer is: a test, or src/utils/stats.js three imports down. The coverage
// gate therefore cannot be moved by a refresh, by construction. Ported from the WNBA
// sibling, whose gate a refresh reddened three times in six weeks (the playoff race on
// August 10, the week view on September 5, the leaders trade arrow on September 18,
// 2026). This repo's own refresh went red the same way on September 11, when a regional
// channel appeared in the live data. Frozen here on September 19, a month before
// opening night, while the whole suite still passed against an unplayed board.
//
// Matching is on the RESOLVED path, so the spelling of the import does not matter.
// `apply` keeps this out of `vite build` and `vite dev`; vitest runs in mode "test". The
// config stays a plain object because sports-viewer-meta's rehearse-clock.mjs imports
// and extends it.
const frozenData = () => ({
  name: 'frozen-data',
  enforce: 'pre',
  apply: (_config, { mode }) => mode === 'test' && !LIVE,
  async resolveId(source, importer, options) {
    if (!/data\/\w+\.js$/.test(source)) return null
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
    return (resolved && FROZEN.get(resolved.id)) ?? null
  },
})

export default defineConfig({
  plugins: [react(), frozenData()],
  // Relative base so the same dist/ works at a domain root (Netlify) and under a
  // subpath (GitHub Pages /nba-schedule/).
  base: './',
  test: {
    environment: 'jsdom',
    globals: true,
    // Test files run one at a time. Vitest's v8 provider merges each worker's
    // coverage after the run, and with files in parallel that merge races. It has
    // surfaced three different ways in this family, all of them the same fault:
    // an ENOENT when a worker's temp JSON is read after the worker is gone
    // (premier-league), an unstable percentage between identical runs (the hub),
    // and a function reported uncovered while its own test demonstrably exercises
    // it (fiba, the-nba-schedule's App.jsx inline handlers). Every file passes in
    // isolation; only the parallel merge is unsafe.
    //
    // The cost is real but small where it matters. On a 2-core CI runner the
    // parallel run is already CPU-bound, so serialising changes the job length
    // little; on a many-core laptop it is roughly 4x (measured 2026-08-30 on
    // world-cup-viewer, the largest suite: 35s parallel, 132s serial). A
    // deterministic gate is worth that.
    //
    // All twelve app repos serialise as of 2026-08-30, and
    // sports-viewer-meta/scripts/audit-family.mjs asserts it so this stays true.
    fileParallelism: false,
    // Two suites, never mixed. The default run is everything except test/live/, against
    // frozen data, under the 100% gate. `LIVE_DATA=1` is only test/live/: invariants and
    // smoke renders against the real refreshed modules, with no coverage threshold. That
    // second suite is what a refresh has to pass.
    include: [LIVE ? 'test/live/**/*.test.{js,jsx}' : 'test/**/*.test.{js,jsx}'],
    exclude: [...configDefaults.exclude, ...(LIVE ? [] : ['test/live/**'])],
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
