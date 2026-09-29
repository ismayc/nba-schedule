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

  it('does not bank a head-to-head series while its last game is still live', () => {
    const liveFinale = [
      game({ id: 'l1', home: 'BOS', away: 'NY' }),
      game({ id: 'l2', home: 'NY', away: 'BOS', score: [100, 110], live: true, tip: '2026-01-20T00:00:00.000Z' }),
    ]
    const rows = eastRows(liveFinale)
    const ranges = seedRanges(rows, scheduledGames(liveFinale), liveFinale)
    // BOS leads the live rematch, but a live score is provisional: the series is not
    // banked, NY can still tie BOS's floor, so the top rank must stay open.
    expect(ranges.BOS).toEqual({ bestRank: 1, worstRank: 2 })
  })

  it('treats a live score as provisional — no clinch off a game still in progress', () => {
    // BOS leads NY in a LIVE head-to-head. Banking that provisional score would put
    // BOS out of reach; the game must stay open, and open it hands NY the win — NY
    // draws level and owns the head-to-head, so no clinch.
    const g = [
      game({ id: 'v1', home: 'BOS', away: 'PHI' }),
      game({ id: 'v2', home: 'BOS', away: 'TOR' }),
      game({ id: 'v3', home: 'NY', away: 'DET' }),
      game({ id: 'v4', home: 'BOS', away: 'NY', score: [60, 50], live: true, tip: '2026-01-20T00:00:00.000Z' }),
    ]
    expect(scenarioClinched('BOS', eastRows(g), scheduledGames(g), g, 1)).toBe(false)
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

// `w` beats `l` (the home side wins by default); `open` is a game still to play.
const beat = (w, l) => game({ home: w, away: l })
const open = (home, away) => game({ home, away, score: null, tip: '2026-02-01T00:00:00.000Z' })
const seedIn = (games, abbr) => eastRows(games).find((r) => r.abbr === abbr)

// Reduced from a random late-season board where the Standings tab showed LAC ✓ (play-in)
// at 36-44 and exact enumeration put it 11th: LAC had banked its series over MEM, the
// one rival that could only tie it, but HOU could land on 36-44 as well, and the
// three-team chain (record among the tied) sank LAC. Same shape here at the top-6 line.
describe('seedRanges: a banked series does not settle a tie a third club can join', () => {
  // Four contenders sit above BOS for good (PHI leads the Atlantic, so none of BOS,
  // NY, or BKN is a division leader). BOS is 3-2, done, and beat NY in their only
  // meeting, so NY (3-2, done) can only tie BOS and that series is banked. BKN (2-2)
  // beat BOS twice, lost to NY, and still plays IND.
  const board = () => {
    const games = []
    const pool = ['DET', 'ORL', 'WSH', 'CHA', 'IND', 'TOR']
    for (const c of ['MIL', 'CLE', 'PHI', 'MIA']) for (const p of pool.slice(0, 5)) games.push(beat(c, p))
    games.push(beat('BOS', 'NY'), beat('BKN', 'BOS'), beat('BKN', 'BOS'), beat('BOS', 'DET'), beat('BOS', 'ORL'))
    games.push(beat('NY', 'BKN'), beat('NY', 'WSH'), beat('NY', 'CHA'), beat('MIL', 'NY'))
    games.push(beat('CLE', 'BKN'))
    return games
  }

  it('the miss is real: BKN winning out leaves BOS 7th in a three-team tie at 3-2', () => {
    const final = [...board(), beat('BKN', 'IND')]
    const at = (abbr) => seedIn(final, abbr)
    expect(['BOS', 'NY', 'BKN'].map((a) => `${at(a).w}-${at(a).l}`)).toEqual(['3-2', '3-2', '3-2'])
    // Record among the tied: BKN 2-1, NY 1-1, BOS 1-2. BOS's win over NY is outvoted.
    expect(at('BOS').seed).toBe(7)
  })

  it('so BOS has not clinched the top 6: NY stays a threat and the worst seed is 7', () => {
    const games = [...board(), open('BKN', 'IND')]
    const rows = eastRows(games)
    expect(seedRanges(rows, scheduledGames(games), games).BOS.worstRank).toBe(7)
    const bos = playoffRace(games).find((r) => r.abbr === 'BOS')
    expect(bos.clinchedTop6).toBe(false)
    expect(bos.clinched).toBe(true) // the play-in line is still safe
  })

  it('the discount still applies once no third club can reach the record', () => {
    // BKN lost to IND: it can no longer reach 3 wins, so a BOS-NY tie can only be a
    // two-team tie, which head-to-head settles for BOS: NY is not counted, so the worst
    // seed is 5 (the four contenders), not 6.
    const games = [...board(), beat('IND', 'BKN')]
    const rows = eastRows(games)
    expect(seedRanges(rows, scheduledGames(games), games).BOS.worstRank).toBe(5)
    expect(playoffRace(games).find((r) => r.abbr === 'BOS').clinchedTop6).toBe(true)
    expect(seedIn(games, 'BOS').seed).toBe(5)
  })
})

// Reduced from a random late-season board where BKN showed top 6 ✓ at 41-39: WSH could
// only tie BKN and BKN owned that series, while NY (41-38) had one game left against a
// club outside the race. NY winning it passes BKN; NY LOSING it lands on 41-39 too,
// and the three-team tie put BKN 7th. The leaf only ever tried NY winning out.
describe('scenarioClinched: a chaser above the floor can drop onto it', () => {
  // PHI and CLE lead their divisions from above. BOS, CHI, and MIL play four games
  // each and beat one another in a cycle; BOS lost to PHI and beat GS (West), so its
  // conference record is the worst of the three. CHI can only tie BOS, and BOS won
  // their only meeting.
  const base = () => [
    beat('PHI', 'BOS'), beat('PHI', 'WSH'), beat('PHI', 'CHA'),
    beat('CLE', 'CHI'), beat('CLE', 'IND'), beat('CLE', 'ATL'),
    beat('BOS', 'CHI'), beat('BOS', 'GS'),
    beat('CHI', 'MIL'), beat('CHI', 'DET'),
    beat('MIL', 'ORL'),
  ]

  it('a banked lone tie is no clinch when a chaser above could drop onto the floor', () => {
    // MIL (2-1) beat BOS and still plays DEN (West, outside the race). Win it and MIL
    // passes BOS, leaving one banked tie (CHI) behind PHI, CLE, and MIL: 4th. Lose it
    // and it is 2-2 with BOS and CHI, where BOS has the worst conference record: 5th.
    const games = [...base(), beat('MIL', 'BOS'), open('MIL', 'DEN')]
    const rows = eastRows(games)
    expect(scenarioClinched('BOS', rows, scheduledGames(games), games, 4)).toBe(false)
    const lost = [...base(), beat('MIL', 'BOS'), beat('DEN', 'MIL')]
    expect(['BOS', 'CHI', 'MIL'].map((a) => seedIn(lost, a).w)).toEqual([2, 2, 2])
    expect(seedIn(lost, 'BOS').seed).toBe(5)
  })

  it('still clinches when that chaser can only drop by beating the team', () => {
    // Same records, but MIL's open game is against BOS. The team losing out means
    // MIL wins it and stays above, so the tie with CHI stays two-team and banked;
    // if BOS wins instead, BOS finishes 3-1, above CHI and MIL outright.
    const games = [...base(), beat('MIL', 'DEN'), open('MIL', 'BOS')]
    const rows = eastRows(games)
    expect(scenarioClinched('BOS', rows, scheduledGames(games), games, 4)).toBe(true)
    const lost = [...base(), beat('MIL', 'DEN'), beat('MIL', 'BOS')]
    expect(seedIn(lost, 'BOS').seed).toBe(4)
  })
})
