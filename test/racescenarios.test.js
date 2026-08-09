import { describe, it, expect } from 'vitest'
import { scenarioClinched, MAX_COUPLED_GAMES } from '../src/utils/raceScenarios.js'
import {
  conferenceStandings,
  seedRanges,
  scheduledGames,
  playoffRace,
  PLAYOFF_SEEDS,
} from '../src/utils/standings.js'

const game = (over) => ({
  id: String(Math.random()),
  seasonType: 'regular',
  tip: '2026-01-10T00:00:00.000Z',
  home: 'BOS',
  away: 'NY',
  score: [110, 100],
  ...over,
})

const eastRows = (games) => conferenceStandings(games).E

// The coupling the independent bounds cannot see: BOS is 2-0 (beat both chasers);
// NY and BKN are 2-1 with ONE remaining game — against each other. Each could pass
// BOS's floor of 2 by winning out, but not both: the rematch loser stays level with
// BOS, and BOS owns both head-to-heads.
const COUPLED = [
  game({ id: 'a1', home: 'BOS', away: 'NY' }),
  game({ id: 'a2', home: 'BOS', away: 'BKN' }),
  game({ id: 'a3', home: 'NY', away: 'PHI' }),
  game({ id: 'a4', home: 'NY', away: 'TOR' }),
  game({ id: 'a5', home: 'BKN', away: 'DET' }),
  game({ id: 'a6', home: 'BKN', away: 'CLE' }),
  game({ id: 'a7', home: 'NY', away: 'BKN', score: null, tip: '2026-01-20T00:00:00.000Z' }),
]

describe('scenarioClinched', () => {
  const rows = eastRows(COUPLED)
  const totals = scheduledGames(COUPLED)

  it('sees a clinch the independent bounds miss when chasers still play each other', () => {
    const ranges = seedRanges(rows, totals, COUPLED)
    expect(ranges.BOS.worstRank).toBe(3) // both ceilings strictly clear the floor
    expect(scenarioClinched('BOS', rows, totals, COUPLED, 2)).toBe(true)
  })

  it('still reports catchable when one rival ahead is enough', () => {
    expect(scenarioClinched('BOS', rows, totals, COUPLED, 1)).toBe(false)
  })

  it('declines (null) when the coupled schedule exceeds the budget', () => {
    expect(scenarioClinched('BOS', rows, totals, COUPLED, 2, { maxCoupled: 0 })).toBeNull()
    expect(MAX_COUPLED_GAMES).toBeGreaterThan(0)
  })

  it('settles a two-team floor tie by the banked head-to-head series', () => {
    // CLE can only reach BOS's floor of 2 exactly, and BOS strictly won their
    // finished series — the two-team chain's step 1 keeps BOS ahead of that tie.
    const g = [
      game({ id: 'b1', home: 'BOS', away: 'CLE' }),
      game({ id: 'b2', home: 'BOS', away: 'DET' }),
      game({ id: 'b3', home: 'CLE', away: 'MIA' }),
      game({ id: 'b4', home: 'CLE', away: 'MIA', score: null, tip: '2026-01-21T00:00:00.000Z' }),
      // A postponed rematch is out of the schedule — it must NOT reopen the series.
      game({ id: 'b5', home: 'CLE', away: 'BOS', score: null, postponed: true }),
    ]
    expect(scenarioClinched('BOS', eastRows(g), scheduledGames(g), g, 1)).toBe(true)
  })

  it('charges a two-team floor tie when the finished series was split', () => {
    const g = [
      game({ id: 'c1', home: 'BOS', away: 'CLE' }),
      game({ id: 'c2', home: 'BOS', away: 'CLE', score: [100, 110] }), // split (away win), series over
      game({ id: 'c3', home: 'BOS', away: 'DET' }), // BOS floor 2
      game({ id: 'c4', home: 'CLE', away: 'MIA' }),
      game({ id: 'c5', home: 'CLE', away: 'MIA', score: null, tip: '2026-01-22T00:00:00.000Z' }),
    ]
    expect(scenarioClinched('BOS', eastRows(g), scheduledGames(g), g, 1)).toBe(false)
  })

  it('charges a THREE-plus-way floor tie even with both series banked (NBA multi chain)', () => {
    // BOS beat NY and BKN head-to-head, series over — but if both reach the floor
    // TOGETHER, the multi-team chain applies, and it opens with division-leader
    // status the enumeration cannot see. Both are charged; the WNBA sibling (whose
    // multi chain also opens with head-to-head) would clear this same shape.
    const g = [
      game({ id: 'd1', home: 'BOS', away: 'NY' }),
      game({ id: 'd2', home: 'BOS', away: 'BKN' }),
      game({ id: 'd3', home: 'NY', away: 'MIA', score: null, tip: '2026-01-23T00:00:00.000Z' }),
      game({ id: 'd4', home: 'BKN', away: 'ORL', score: null, tip: '2026-01-23T00:00:00.000Z' }),
      game({ id: 'd5', home: 'NY', away: 'PHI' }),
      game({ id: 'd6', home: 'BKN', away: 'DET' }),
    ]
    // NY and BKN sit at 1 win with one uncoupled game each: both can reach 2 = floor.
    expect(scenarioClinched('BOS', eastRows(g), scheduledGames(g), g, 2)).toBe(false)
  })
})

describe('scenarioClinched — home-and-home coupling', () => {
  it('still charges a split that forms a three-way tie (and clears the sweeps)', () => {
    // NY and BKN sit one win under BOS's floor with a home-and-home left. A sweep
    // sends exactly one of them past the floor (the other finishes BELOW it); a
    // split lands BOTH on the floor — a three-way group the NBA multi chain opens
    // with division-leader status, so both are charged. Top-2 is therefore NOT safe
    // here, even though BOS banked both season series.
    const g = [
      game({ id: 'h1', home: 'BOS', away: 'NY' }),
      game({ id: 'h2', home: 'BOS', away: 'BKN' }),
      game({ id: 'h3', home: 'NY', away: 'PHI' }),
      game({ id: 'h4', home: 'BKN', away: 'DET' }),
      game({ id: 'h5', home: 'NY', away: 'BKN', score: null, tip: '2026-01-26T00:00:00.000Z' }),
      game({ id: 'h6', home: 'BKN', away: 'NY', score: null, tip: '2026-01-28T00:00:00.000Z' }),
    ]
    expect(scenarioClinched('BOS', eastRows(g), scheduledGames(g), g, 2)).toBe(false)
    // At cut 3 no leaf catches: a sweep puts one rival ahead (the other finishes
    // BELOW the floor — no tie at all), a split charges two. Max ahead is 2 < 3, so
    // the full enumeration — sweep leaves included — clears.
    expect(scenarioClinched('BOS', eastRows(g), scheduledGames(g), g, 3)).toBe(true)
  })
})

describe('playoffRace × scenario engine', () => {
  it('upgrades the top-6 flag when the schedule guarantees it', () => {
    // Four settled contenders sit above BOS's floor forever; NY and BKN are the only
    // other Eastern teams able to reach it, and they still play each other. Bounds
    // count 4 + 2 = 6 possible passers (worst rank 7 → no top-6); the engine proves
    // at most 4 + 1 can actually finish ahead → the bracket is locked outright.
    const contenders = ['MIL', 'CLE', 'PHI', 'MIA']
    const pool = ['DET', 'ORL', 'WSH', 'CHA', 'IND', 'TOR']
    const games = []
    let n = 0
    for (const c of contenders) {
      for (let i = 0; i < 5; i++) {
        games.push(game({ id: `w${n++}`, home: c, away: pool[(n + i) % pool.length] }))
      }
    }
    games.push(game({ id: 'm1', home: 'BOS', away: 'NY' }))
    games.push(game({ id: 'm2', home: 'BOS', away: 'BKN' }))
    games.push(game({ id: 'm3', home: 'NY', away: 'TOR' }))
    games.push(game({ id: 'm4', home: 'NY', away: 'DET' }))
    games.push(game({ id: 'm5', home: 'BKN', away: 'CHA' }))
    games.push(game({ id: 'm6', home: 'BKN', away: 'WSH' }))
    games.push(game({ id: 'm7', home: 'NY', away: 'BKN', score: null, tip: '2026-01-25T00:00:00.000Z' }))

    const bos = playoffRace(games).find((r) => r.abbr === 'BOS')
    expect(bos.worstRank).toBeGreaterThan(PLAYOFF_SEEDS) // bounds alone say no…
    expect(bos.clinchedTop6).toBe(true) // …the schedule locks the top 6
    expect(bos.lockedPlayin).toBe(false)
  })
})
