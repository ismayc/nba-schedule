// The FROZEN stand-in for src/data/schedule.js. Under vitest every import of the live
// module resolves here instead; see the frozenData plugin in vite.config.js.
//
// The board itself is test/fixtures/preseason-2627.js (all 1200 regular-season games of
// 2026-27, none played), re-exported under the live module's name. That fixture was frozen
// on September 5, 2026; the live board of September 11 differs from it only in the
// broadcast field of 29 games. The constants below are copied from the live module, and
// test/live/parity.test.js fails if they ever differ or if the live module grows an export
// this file lacks.
export { GAMES_2627_PRESEASON as GAMES } from '../preseason-2627.js'

export const SEASON_TYPES = ['regular', 'allstar', 'playin', 'playoffs']

export const PLAYOFF_ROUNDS = { PI: 'Play-In', R1: 'First Round', CSF: 'Conference Semifinals', CF: 'Conference Finals', Final: 'NBA Finals' }

export const SERIES_LENGTH = { R1: 7, CSF: 7, CF: 7, Final: 7 }
