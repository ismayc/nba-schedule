// A FROZEN copy of src/data/leaders.js as committed on September 11, 2026 (5ce1b57): the
// 2026-27 preseason, before opening night, when the table is empty.
//
// WHY IT EXISTS. The refresh workflow rewrites src/data/leaders.js twice a day, and
// src/utils/stats.js imports it directly, so once the season starts every StatsView render
// in the suite would read whoever led the league that afternoon. The WNBA sibling lost its
// 100% gate exactly that way on September 18, 2026: the one traded player in the PPG top
// ten dropped off the board and a branch went uncovered. Under vitest every import of
// src/data/leaders.js resolves here instead; see the frozenData plugin in vite.config.js.
//
// Empty on purpose. It is what the suite already read when it was frozen, so freezing it
// changed no coverage. The stats code is covered by tests that pass their own players
// (test/fixtures/season2526.js), not by this table.
//
// This board is never regenerated. The LIVE board has its own gate in test/live/.
export const PLAYERS = [

]
