import { describe, it, expect } from 'vitest'
import { GAMES } from '../src/data/schedule.js'
import {
  computeStandings,
  playoffRace,
  headToHead,
  gamesBehind,
  countsForStandings,
  conferenceStandings,
  CONFERENCE_BY_ABBR,
  DIVISION_BY_ABBR,
  PLAYOFF_SPOTS,
} from '../src/utils/standings.js'
import { TEAMS } from '../src/data/teams.js'

let seq = 0
const game = (over) => ({
  id: String(seq++),
  seasonType: 'regular',
  tip: '2026-05-10T00:00:00.000Z',
  home: 'MIN',
  away: 'DAL',
  score: [90, 80],
  ...over,
})

// n completed games in which `w` beats `l`, alternating who hosts so home/road splits
// stay balanced and nothing depends on venue.
const wins = (w, l, n = 1) =>
  Array.from({ length: n }, (_, i) =>
    i % 2 === 0 ? game({ home: w, away: l, score: [100, 90] }) : game({ home: l, away: w, score: [90, 100] })
  )

const seedOf = (conf, abbr) => conf.find((r) => r.abbr === abbr)?.seed

describe('countsForStandings', () => {
  it('counts a completed regular-season game', () => {
    expect(countsForStandings(game())).toBe(true)
  })

  it('excludes the NBA Cup championship', () => {
    expect(countsForStandings(game({ seasonType: 'cup' }))).toBe(false)
  })

  it('excludes postponed shells and unplayed games', () => {
    expect(countsForStandings(game({ postponed: true }))).toBe(false)
    expect(countsForStandings(game({ score: undefined }))).toBe(false)
  })
})

describe('computeStandings', () => {
  it('splits home and road records by side', () => {
    const t = computeStandings([game(), game({ home: 'DAL', away: 'MIN', score: [70, 95] })])
    expect(t.MIN).toMatchObject({ w: 2, l: 0, home: { w: 1, l: 0 }, road: { w: 1, l: 0 } })
    expect(t.DAL).toMatchObject({ w: 0, l: 2, home: { w: 0, l: 1 }, road: { w: 0, l: 1 } })
  })

  it('tracks streak sign and magnitude', () => {
    const t = computeStandings([
      game({ tip: '2026-05-01T00:00:00.000Z', score: [80, 90] }), // MIN loss
      game({ tip: '2026-05-02T00:00:00.000Z', score: [95, 80] }), // MIN win
      game({ tip: '2026-05-03T00:00:00.000Z', score: [99, 80] }), // MIN win
    ])
    expect(t.MIN.streak).toBe(2)
    expect(t.DAL.streak).toBe(-2)
  })

  it('counts conference games only against same-conference opponents', () => {
    const t = computeStandings([
      game({ home: 'NY', away: 'ATL' }), // both East
      game({ home: 'NY', away: 'MIN' }), // cross-conference (East v West)
    ])
    expect(t.NY.conf).toEqual({ w: 1, l: 0 })
  })

  it('counts division games only against divisional opponents', () => {
    const t = computeStandings([
      game({ home: 'BOS', away: 'NY' }), // both Atlantic
      game({ home: 'BOS', away: 'MIL' }), // East but Central — not divisional
    ])
    expect(t.BOS.div).toEqual({ w: 1, l: 0 })
    expect(t.BOS.conf).toEqual({ w: 2, l: 0 })
  })
})

describe('headToHead', () => {
  it('returns null when two teams have not met', () => {
    expect(headToHead([game()], 'NY', 'ATL')).toBeNull()
  })

  it('tallies the season series', () => {
    const h2h = headToHead(
      [game(), game({ home: 'DAL', away: 'MIN', score: [99, 80] })],
      'MIN',
      'DAL'
    )
    expect(h2h).toMatchObject({ aw: 1, bw: 1 })
  })
})

describe('gamesBehind', () => {
  it('is zero for the leader and half a game per split result', () => {
    const leader = { w: 20, l: 6 }
    expect(gamesBehind(leader, { w: 20, l: 6 })).toBe(0)
    expect(gamesBehind(leader, { w: 19, l: 7 })).toBe(1)
    expect(gamesBehind(leader, { w: 19, l: 6 })).toBe(0.5)
  })
})

// The NBA two-team tiebreaker chain, one step at a time. Each scenario equalises
// everything above the step under test so the named tiebreaker is what actually
// decides the order.
describe('seeding tiebreakers', () => {
  it('1. orders by winning percentage first', () => {
    const E = conferenceStandings([...wins('BOS', 'NY', 3), ...wins('NY', 'BOS', 1)]).E
    expect(seedOf(E, 'BOS')).toBeLessThan(seedOf(E, 'NY')) // BOS 3-1 over NY 1-3
  })

  it('2. breaks an equal record on head-to-head', () => {
    // BOS and PHI both 2-2, but BOS swept the season series.
    const E = conferenceStandings([
      ...wins('BOS', 'PHI', 2), // BOS beats PHI twice (h2h 2-0)
      ...wins('TOR', 'BOS', 2), // BOS drops two to a divisionmate
      ...wins('PHI', 'WSH', 2), // PHI wins two of its own
    ]).E
    expect(seedOf(E, 'BOS')).toBeLessThan(seedOf(E, 'PHI'))
  })

  it('3. favours a division leader over a non-leader at equal record', () => {
    // ATL leads the Southeast; NY (3-1) trails BOS (4-0) in the Atlantic, so NY is a
    // non-leader on the same .750 record — and the two never meet.
    const E = conferenceStandings([
      ...wins('BOS', 'CHI', 4), // BOS 4-0, Atlantic leader
      ...wins('NY', 'TOR', 3), ...wins('TOR', 'NY', 1), // NY 3-1, non-leader
      ...wins('ATL', 'MIA', 3), ...wins('MIA', 'ATL', 1), // ATL 3-1, Southeast leader
    ]).E
    expect(seedOf(E, 'ATL')).toBeLessThan(seedOf(E, 'NY'))
  })

  it('4. uses division record between two same-division non-leaders', () => {
    // TOR runs away with the Atlantic. BOS and PHI both finish 4-4 and never play each
    // other, but BOS went 3-1 inside the division to PHI's 1-3.
    const E = conferenceStandings([
      ...wins('TOR', 'HOU', 5), // TOR 5-0, Atlantic leader (non-conf wins)
      // BOS: division 3-1, non-division 1-3 -> 4-4
      ...wins('BOS', 'NY', 2), ...wins('BOS', 'BKN', 1), ...wins('BKN', 'BOS', 1),
      ...wins('BOS', 'DEN', 1), ...wins('DEN', 'BOS', 3),
      // PHI: division 1-3, non-division 3-1 -> 4-4
      ...wins('NY', 'PHI', 2), ...wins('PHI', 'BKN', 1), ...wins('BKN', 'PHI', 1),
      ...wins('PHI', 'DEN', 3), ...wins('DEN', 'PHI', 1),
    ]).E
    const bos = E.find((r) => r.abbr === 'BOS')
    const phi = E.find((r) => r.abbr === 'PHI')
    expect(bos.pct).toBe(phi.pct) // equal record
    expect(seedOf(E, 'BOS')).toBeLessThan(seedOf(E, 'PHI')) // decided on division record
  })

  it('5. uses conference record between division leaders in different divisions', () => {
    // CLE (Central) and ATL (Southeast) each lead their division at 5-3 and never meet;
    // CLE went 4-0 in conference to ATL's 2-2.
    const E = conferenceStandings([
      ...wins('CLE', 'DET', 2), ...wins('CLE', 'IND', 2), // CLE conf 4-0
      ...wins('CLE', 'DEN', 1), ...wins('DEN', 'CLE', 3), // CLE non-conf 1-3 -> 5-3
      ...wins('ATL', 'ORL', 2), ...wins('ORL', 'ATL', 2), // ATL conf 2-2
      ...wins('ATL', 'HOU', 3), ...wins('HOU', 'ATL', 1), // ATL non-conf 3-1 -> 5-3
    ]).E
    expect(seedOf(E, 'CLE')).toBeLessThan(seedOf(E, 'ATL'))
  })

  it('6. falls through to point differential as the deterministic tail', () => {
    // BOS and DET each go 2-0 with a 1-0 conference record and no common opponent; the
    // only thing that separates them is scoring margin.
    const E = conferenceStandings([
      game({ home: 'BOS', away: 'DEN', score: [130, 90] }),
      game({ home: 'BOS', away: 'MIA', score: [101, 100] }),
      game({ home: 'DET', away: 'DEN', score: [120, 90] }),
      game({ home: 'DET', away: 'ORL', score: [101, 100] }),
    ]).E
    expect(seedOf(E, 'BOS')).toBeLessThan(seedOf(E, 'DET')) // +41 diff beats +31
  })
})

describe('per-conference seeding', () => {
  it('seeds each conference independently, 1..15', () => {
    const { E, W } = conferenceStandings(GAMES)
    expect(E).toHaveLength(15)
    expect(W).toHaveLength(15)
    expect(E.map((r) => r.seed)).toEqual([...Array(15)].map((_, i) => i + 1))
    expect(W.map((r) => r.seed)).toEqual([...Array(15)].map((_, i) => i + 1))
  })

  it('keeps every East team East and every West team West', () => {
    const { E, W } = conferenceStandings(GAMES)
    expect(E.every((r) => CONFERENCE_BY_ABBR[r.abbr] === 'E')).toBe(true)
    expect(W.every((r) => CONFERENCE_BY_ABBR[r.abbr] === 'W')).toBe(true)
    expect(E.length + W.length).toBe(TEAMS.length)
  })

  it('lets a conference lead its own field regardless of the other conference', () => {
    // A West team can hold the best record in the league without touching East seeding:
    // Oklahoma City tops the West, Detroit tops the East, each seeded #1 in its own group.
    const { E, W } = conferenceStandings(GAMES)
    expect(W[0]).toMatchObject({ abbr: 'OKC', seed: 1, gb: 0 })
    expect(E[0]).toMatchObject({ abbr: 'DET', seed: 1, gb: 0 })
    expect(W[0].w).toBeGreaterThan(E[0].w) // OKC has more wins but East seeds off DET
  })

  it('orders each conference by win percentage before tiebreakers', () => {
    for (const rows of Object.values(conferenceStandings(GAMES))) {
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].pct).toBeGreaterThanOrEqual(rows[i].pct)
      }
    }
  })

  it('marks the top 8 of each conference as the playoff field, 7–10 as the play-in', () => {
    const { E, W } = conferenceStandings(GAMES)
    for (const rows of [E, W]) {
      expect(rows.filter((r) => r.inPlayoffs)).toHaveLength(PLAYOFF_SPOTS)
      expect(rows.filter((r) => r.playIn).map((r) => r.seed)).toEqual([7, 8, 9, 10])
    }
  })
})

// The real 2025-26 data is the strongest fixture there is: these numbers can be checked
// against ESPN's published conference standings.
describe('the committed 2025-26 season', () => {
  const { E, W } = conferenceStandings(GAMES)

  it('matches ESPN: Oklahoma City tops the West and Detroit tops the East', () => {
    expect(W[0]).toMatchObject({ abbr: 'OKC', w: 64, l: 18 })
    expect(E[0]).toMatchObject({ abbr: 'DET', w: 60, l: 22 })
  })

  it('assigns every team to a conference and a division', () => {
    expect(TEAMS.every((t) => CONFERENCE_BY_ABBR[t.abbr])).toBe(true)
    expect(TEAMS.every((t) => DIVISION_BY_ABBR[t.abbr])).toBe(true)
  })

  it('never lets a team play more games than it is scheduled for', () => {
    for (const row of playoffRace(GAMES)) {
      expect(row.remaining).toBeGreaterThanOrEqual(0)
    }
  })

  it('runs the clinch/eliminate race inside each conference', () => {
    const race = playoffRace(GAMES)
    expect(race).toHaveLength(TEAMS.length)
    expect(race.filter((r) => r.playIn)).toHaveLength(8) // 4 per conference
    // A full completed season resolves every seed.
    const det = race.find((r) => r.abbr === 'DET')
    const wsh = race.find((r) => r.abbr === 'WSH')
    expect(det).toMatchObject({ conf: 'E', clinched: true, eliminated: false })
    expect(wsh).toMatchObject({ conf: 'E', clinched: false, eliminated: true })
  })
})
