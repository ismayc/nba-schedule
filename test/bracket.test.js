import { describe, it, expect } from 'vitest'
import { NBA_POSTSEASON } from './fixtures/postseason.js'
import { GAMES } from '../src/data/schedule.js'
import { buildSeries, buildBracket, layout, R1_PAIRS } from '../src/utils/bracket.js'

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

describe('radial layout', () => {
  const geo = layout()

  it('places eight seeds evenly around the ring', () => {
    expect(geo.leaves).toHaveLength(8)
    const angles = geo.leaves.map((l) => l.angle).sort((a, b) => a - b)
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo(45, 5)
    }
  })

  it('puts each first-round match at the midpoint of its two children', () => {
    expect(geo.r1.map((m) => Math.round(m.angle))).toEqual([90, 0, 270, 180])
  })

  it('puts the two conference semifinals opposite each other', () => {
    const [a, b] = geo.csf.map((s) => s.angle)
    expect(Math.abs(((a - b + 360) % 360) - 180)).toBeLessThan(0.001)
  })

  it('advances each round inward', () => {
    expect(geo.leaves[0].r).toBeGreaterThan(geo.r1[0].r)
    expect(geo.r1[0].r).toBeGreaterThan(geo.csf[0].r)
  })
})
