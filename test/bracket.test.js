import { describe, it, expect } from 'vitest'
import { NBA_POSTSEASON } from './fixtures/postseason.js'
import { GAMES } from '../src/data/schedule.js'
import {
  buildSeries,
  buildBracket,
  buildPlayIn,
  layout,
  polar,
  CENTER,
  R1_PAIRS,
} from '../src/utils/bracket.js'
import { countsForStandings, CONFERENCE_BY_ABBR } from '../src/utils/standings.js'

// The committed 2025-26 schedule now carries a finished postseason, so the real bracket
// is the best test of the engine. Everything below the play-in resolves from those games.
const REGULAR = GAMES.filter((g) => g.seasonType !== 'playoffs')

// A synthetic set of best-of-7 series lets us pin the series engine down exactly —
// grouping, win counts, and sweep-vs-distance — without leaning on the full schedule.
describe('the series engine (buildSeries)', () => {
  const series = buildSeries(NBA_POSTSEASON)

  it('groups games into one series per round + opponent pair', () => {
    expect(series).toHaveLength(3)
    expect(series.filter((s) => s.round === 'R1')).toHaveLength(2)
    expect(series.filter((s) => s.round === 'CF')).toHaveLength(1)
  })

  it('treats every round as best-of-7 (first to four)', () => {
    for (const s of series) {
      expect(s.bestOf).toBe(7)
      expect(s.need).toBe(4)
    }
  })

  it('resolves each series to the team that actually won it', () => {
    const winners = Object.fromEntries(series.map((s) => [s.teams.join('/'), s.winner]))
    expect(winners).toMatchObject({
      'ATL/NY': 'NY', // 4-3
      'CLE/MIA': 'CLE', // 4-0
      'OKC/SA': 'SA', // 4-2
    })
  })

  it('counts a series that went the distance', () => {
    const s = series.find((x) => x.teams.includes('NY'))
    expect(s.games).toHaveLength(7)
    expect(s.wins).toEqual({ NY: 4, ATL: 3 })
    expect(s.complete).toBe(true)
  })

  it('groups a series correctly even though home/away alternates', () => {
    const s = series.find((x) => x.teams.includes('SA'))
    const hosts = new Set(s.games.map((g) => g.home))
    expect(hosts.size).toBe(2) // both teams hosted
    expect(s.wins).toEqual({ SA: 4, OKC: 2 })
  })

  it('identifies the higher seed as the game-1 host', () => {
    const ny = series.find((x) => x.teams.includes('NY'))
    expect(ny.order[0]).toBe('NY')
    const cf = series.find((x) => x.teams.includes('SA'))
    expect(cf.order[0]).toBe('OKC')
  })
})

describe('an in-progress series', () => {
  const partial = NBA_POSTSEASON.filter((g) => g.id.startsWith('e1-') && g.game <= 3)

  it('has no winner before the clinching game', () => {
    const [s] = buildSeries(partial)
    expect(s.wins).toEqual({ NY: 2, ATL: 1 })
    expect(s.winner).toBeNull()
    expect(s.complete).toBe(false)
  })

  it('ignores games with no score yet', () => {
    const withUnplayed = [...partial, { ...partial[0], id: 'x', game: 4, score: undefined }]
    const [s] = buildSeries(withUnplayed)
    expect(s.wins.NY).toBe(2)
    expect(s.games).toHaveLength(4)
  })

  it('does not count a live game’s provisional score as a series win', () => {
    const withLive = [...partial, { ...partial[0], id: 'y', game: 4, score: [100, 90], live: true }]
    const [s] = buildSeries(withLive)
    expect(s.wins).toEqual({ NY: 2, ATL: 1 })
    expect(s.winner).toBeNull()
    expect(s.live).toBe(true)
  })
})

// The finished 2025-26 postseason, as committed: New York won the East, San Antonio the
// West, and New York took the Finals 4-1.
describe('the finished 2025-26 postseason', () => {
  const b = buildBracket(GAMES)

  it('is not projected and names the champion', () => {
    expect(b.projected).toBe(false)
    expect(b.champion).toBe('NY')
  })

  it('crowns a champion in each conference', () => {
    expect(b.conferences.E.champion).toBe('NY')
    expect(b.conferences.W.champion).toBe('SA')
  })

  it('runs a fixed 1v8/4v5/2v7/3v6 first round per conference', () => {
    expect(b.conferences.E.r1).toHaveLength(4)
    expect(b.conferences.W.r1).toHaveLength(4)
    expect(b.conferences.E.r1.map((s) => s.seeds)).toEqual(R1_PAIRS)
    for (const s of b.conferences.E.r1) expect(s.complete).toBe(true)
  })

  it('sends the two conference champions into the Finals', () => {
    expect(b.final.round).toBe('Final')
    expect(b.final.teams.sort()).toEqual(['NY', 'SA'])
    expect(b.final.winner).toBe('NY')
    expect(b.final.wins).toEqual({ NY: 4, SA: 1 })
  })
})

describe('projection before the postseason exists', () => {
  const b = buildBracket(REGULAR)

  it('marks the bracket projected when no playoff games have been played', () => {
    expect(b.projected).toBe(true)
    expect(b.champion).toBeNull()
  })

  it('seeds the top 8 of each conference', () => {
    expect(b.seeds.E).toHaveLength(8)
    expect(b.seeds.W).toHaveLength(8)
    // Play-in field is seeds 7 through 10.
    expect(b.playIn.E.map((r) => r.seed)).toEqual([7, 8, 9, 10])
  })

  it('fills the first round from the current top seeds', () => {
    for (const conf of ['E', 'W']) {
      expect(b.conferences[conf].r1.map((s) => s.seeds)).toEqual(R1_PAIRS)
      for (const s of b.conferences[conf].r1) expect(s.teams).toHaveLength(2)
    }
  })

  it('leaves later rounds empty but labelled by their feeders', () => {
    const csf = b.conferences.E.csf
    expect(csf[0].teams).toHaveLength(0)
    expect(csf[0].feeders).toEqual(['Winner 1/8', 'Winner 4/5'])
    expect(b.final.teams).toHaveLength(0)
    expect(b.final.feeders).toEqual(['East champion', 'West champion'])
  })

  it('pairs the top seed against the eighth', () => {
    const top = b.conferences.E.r1[0]
    expect(top.seeds).toEqual([1, 8])
    expect(top.teams[0]).toBe(b.seeds.E[0].abbr)
  })
})

// The play-in decides seeds 7 and 8, so the strongest check is that its winners ARE the
// 7 and 8 seeds the committed first round actually used. That ties the new data to
// something already verified rather than restating the same feed twice.
describe('the 2025-26 play-in tournament', () => {
  const pi = buildPlayIn(GAMES)

  it('reads all six games, three per conference', () => {
    expect(pi.E.games).toHaveLength(3)
    expect(pi.W.games).toHaveLength(3)
    expect(pi.E.played).toBe(true)
    expect(pi.E.complete).toBe(true)
    expect(pi.W.complete).toBe(true)
  })

  it('orders each ladder 7v8, 9v10, then the 8th-seed game', () => {
    expect(pi.E.games.map((g) => g.slot)).toEqual(['7v8', '9v10', '8seed'])
    expect(pi.W.games.map((g) => g.slot)).toEqual(['7v8', '9v10', '8seed'])
  })

  it('settles the seeds the first round then used', () => {
    // East: Philadelphia beat Orlando for the 7 seed; Orlando took the 8 via Charlotte.
    expect(pi.E.seeds).toEqual({ 7: 'PHI', 8: 'ORL' })
    // West: Portland won at Phoenix for the 7 seed; Phoenix beat Golden State for the 8.
    expect(pi.W.seeds).toEqual({ 7: 'POR', 8: 'PHX' })

    // Cross-check against the real bracket: the 7 and 8 seeds of each conference's
    // first round must be exactly the teams the play-in sent through.
    const b = buildBracket(GAMES)
    for (const conf of ['E', 'W']) {
      const oneVsEight = b.conferences[conf].r1[0] // 1v8
      const twoVsSeven = b.conferences[conf].r1[2] // 2v7
      expect(oneVsEight.teams).toContain(pi[conf].seeds[8])
      expect(twoVsSeven.teams).toContain(pi[conf].seeds[7])
    }
  })

  it('records who the tournament knocked out', () => {
    // Losing 9v10 or the 8th-seed game ends the season; losing 7v8 does not.
    expect(pi.E.eliminated.sort()).toEqual(['CHA', 'MIA'])
    expect(pi.W.eliminated.sort()).toEqual(['GS', 'LAC'])
  })

  it('names a winner and a loser for every played game', () => {
    for (const g of [...pi.E.games, ...pi.W.games]) {
      expect(g.winner).toBeTruthy()
      expect(g.loser).toBeTruthy()
      expect(g.winner).not.toBe(g.loser)
      expect([g.home, g.away]).toContain(g.winner)
    }
  })

  it('keeps play-in games out of the regular-season standings', () => {
    for (const g of GAMES.filter((x) => x.seasonType === 'playin')) {
      expect(countsForStandings(g)).toBe(false)
    }
  })
})

describe('a play-in that has not finished', () => {
  const east = GAMES.filter(
    (g) => g.seasonType === 'playin' && CONFERENCE_BY_ABBR[g.home] === 'E'
  )

  it('has no seeds and no ladder at all before the games exist', () => {
    const pi = buildPlayIn(GAMES.filter((g) => g.seasonType !== 'playin'))
    expect(pi.E.played).toBe(false)
    expect(pi.E.games).toEqual([])
    expect(pi.E.seeds).toEqual({})
    expect(pi.E.complete).toBe(false)
  })

  it('leaves a game with no score yet undecided', () => {
    const pending = east.map((g) => (g.piSlot === '8seed' ? { ...g, score: undefined } : g))
    const pi = buildPlayIn(pending)
    expect(pi.E.seeds).toEqual({ 7: 'PHI' }) // 8 seed still open
    expect(pi.E.complete).toBe(false)
    expect(pi.E.games.at(-1).winner).toBeNull()
    expect(pi.E.games.at(-1).loser).toBeNull()
    // Only the 9v10 loser is out so far.
    expect(pi.E.eliminated).toEqual(['MIA'])
  })

  it('ignores a postponed or canceled shell', () => {
    const off = east.map((g) => (g.piSlot === '7v8' ? { ...g, postponed: true } : g))
    expect(buildPlayIn(off).E.seeds[7]).toBeUndefined()
    const dead = east.map((g) => (g.piSlot === '7v8' ? { ...g, canceled: true } : g))
    expect(buildPlayIn(dead).E.seeds[7]).toBeUndefined()
  })

  it('drops a game it cannot place — unknown team or unparsed slot', () => {
    const [g] = east
    expect(buildPlayIn([{ ...g, home: 'ZZZ' }]).E.games).toHaveLength(0)
    expect(buildPlayIn([{ ...g, away: 'ZZZ' }]).E.games).toHaveLength(0)
    expect(buildPlayIn([{ ...g, piSlot: undefined }]).E.games).toHaveLength(0)
    expect(buildPlayIn([{ ...g, piSlot: 'nonsense' }]).E.games).toHaveLength(0)
  })
})

describe('radial layout (whole bracket)', () => {
  const geo = layout()

  it('splits into two conference fans plus a centre for the Finals', () => {
    expect(geo.W.leaves).toHaveLength(8)
    expect(geo.E.leaves).toHaveLength(8)
    expect(geo.E.r1).toHaveLength(4)
    expect(geo.E.csf).toHaveLength(2)
    expect(geo.finals).toEqual({ angle: 0, r: 0 })
  })

  it('fans East on the right half and West on the left half', () => {
    const x = (n) => polar(n.angle, n.r).x
    for (const leaf of geo.E.leaves) expect(x(leaf)).toBeGreaterThan(CENTER)
    for (const leaf of geo.W.leaves) expect(x(leaf)).toBeLessThan(CENTER)
  })

  it('lands each conference final just off centre on its own side', () => {
    expect(Math.round(geo.E.cf.angle)).toBe(0) // right of centre
    expect(Math.round(geo.W.cf.angle)).toBe(180) // left of centre
  })

  it('advances each round inward toward the centre', () => {
    const g = geo.E
    expect(g.leaves[0].r).toBeGreaterThan(g.r1[0].r)
    expect(g.r1[0].r).toBeGreaterThan(g.csf[0].r)
    expect(g.csf[0].r).toBeGreaterThan(g.cf.r)
    expect(g.cf.r).toBeGreaterThan(geo.finals.r)
  })
})
