import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildSeries } from '../src/utils/bracket.js'
import {
  computeStandings,
  compareTeams,
  magicNumber,
  playoffRace,
  conferenceStandings,
} from '../src/utils/standings.js'
import { seasonTotals, playersByTeam } from '../src/utils/stats.js'
import {
  detectTimezone,
  timezoneOptions,
  formatZoneAbbr,
  dayLabel,
  countdown,
  liveState,
  TIMEZONES,
} from '../src/utils/time.js'
import { writeState } from '../src/utils/urlState.js'
import { broadcastNotBadged } from '../src/utils/watch.js'

// ── bracket.js remaining branches ─────────────────────────────────────────
describe('buildSeries fallbacks', () => {
  const pg = (over) => ({ seasonType: 'playoffs', ...over })

  it('defaults an unknown round to a best-of-7 (lines 31, 68)', () => {
    // Round 'X' is not in SERIES_LENGTH → both `?? 7` fallbacks fire.
    const games = [1, 2, 3, 4].map((n) =>
      pg({
        round: 'X',
        home: n % 2 ? 'BOS' : 'NY',
        away: n % 2 ? 'NY' : 'BOS',
        game: n,
        tip: `2026-05-0${n}T00:00:00Z`,
        score: n % 2 ? [110, 100] : [100, 110], // BOS wins every game
      })
    )
    const [s] = buildSeries(games)
    expect(s.bestOf).toBe(7)
    expect(s.need).toBe(4)
    expect(s.winner).toBe('BOS') // 4-0
  })

  it('orders games by tip when game numbers are absent, and hosts from the earliest game (line 50)', () => {
    const [s] = buildSeries([
      pg({ round: 'R1', home: 'BOS', away: 'NY', tip: '2026-05-02T00:00:00Z', score: [110, 100] }),
      pg({ round: 'R1', home: 'NY', away: 'BOS', tip: '2026-05-01T00:00:00Z', score: [90, 110] }),
    ])
    // Both games lack a `game` number → sorted purely by tip, ascending.
    expect(s.games.map((g) => g.tip)).toEqual(['2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z'])
    // With no game-1 marker, the host is taken from the first (earliest) game's home team.
    expect(s.order[0]).toBe(s.games[0].home)
    expect(s.order[0]).toBe('NY')
  })
})

// ── standings.js remaining branches ───────────────────────────────────────
describe('standings edge cases', () => {
  const game = (over) => ({
    id: String(Math.random()),
    seasonType: 'regular',
    tip: '2026-01-10T00:00:00.000Z',
    home: 'BOS',
    away: 'NY',
    score: [110, 100],
    ...over,
  })

  it('skips a game row for an unrecognized team abbreviation (line 79)', () => {
    // A stray abbr has no table row; that side is skipped while the real opponent counts.
    const t = computeStandings([game({ home: 'ZZZ', away: 'NY', score: [110, 100] })])
    expect(t.ZZZ).toBeUndefined()
    expect(t.NY).toMatchObject({ l: 1, road: { w: 0, l: 1 } })
  })

  it('compares two teams, computing the table and division leaders on demand (line 171)', () => {
    const games = [game({ home: 'BOS', away: 'NY', score: [110, 100] })]
    const table = computeStandings(games)
    // BOS 1-0, NY 0-1 → BOS's higher win% ranks it ahead (negative comparator).
    // With `table` supplied but no `divLeaders` → the `?? divisionLeaders(...)` fallback fires.
    expect(compareTeams(table.BOS, table.NY, games, table)).toBeLessThan(0)
    // With both `table` and `divLeaders` omitted → the `table ?? computeStandings(games)`
    // fallback also fires.
    expect(compareTeams(table.BOS, table.NY, games)).toBeLessThan(0)
  })

  it('computes a magic number and returns null once catching up is impossible (lines 240-243)', () => {
    // Positive: a chaser with games left and a small deficit.
    expect(magicNumber({ w: 3 }, { abbr: 'X', gp: 5, w: 2 }, { X: 20 })).toBe(15)
    // Null: the chaser has no remaining games recorded and is already far back.
    expect(magicNumber({ w: 10 }, { abbr: 'X', gp: 5, w: 2 }, {})).toBeNull()
  })

  it('handles clinch and elimination with teams that have no scheduled games (lines 263, 266, 269, 276)', () => {
    // Ten Eastern teams each beat WSH once; WSH loses out with nothing left → eliminated,
    // and the top seeds clinch a play-in berth over an 11th team that has no schedule.
    const winners = ['ATL', 'BKN', 'BOS', 'CHA', 'CHI', 'CLE', 'DET', 'IND', 'MIA', 'MIL']
    const games = winners.map((w) =>
      game({ id: `${w}-WSH`, home: w, away: 'WSH', score: [110, 100] })
    )
    const race = playoffRace(games)
    const wsh = race.find((r) => r.abbr === 'WSH')
    expect(wsh.eliminated).toBe(true)
    // A winner sits comfortably above the 11th-placed team (which has no schedule) → clinched.
    expect(race.find((r) => r.abbr === 'BOS').clinched).toBe(true)
    // Teams with no games at all report zero remaining rather than NaN.
    const idle = race.find((r) => r.abbr === 'NY')
    expect(idle.remaining).toBe(0)
    expect(Number.isFinite(idle.gbCut)).toBe(true)
  })

  it('reports a magic number for an in-race team with games still to play (line 277)', () => {
    // BOS wins one; a slate of scheduled (unplayed) games gives the chasers remaining
    // games, so the 11th seed can still catch BOS → BOS has not clinched and carries a
    // live magic number rather than null.
    const pairs = [
      ['ATL', 'CHA'], ['CHI', 'CLE'], ['DET', 'IND'], ['MIA', 'MIL'],
      ['ORL', 'PHI'], ['TOR', 'BKN'],
    ]
    const games = [
      game({ home: 'BOS', away: 'NY', score: [110, 100] }),
      ...pairs.map(([h, a], i) =>
        game({ id: `sch-${i}`, home: h, away: a, score: undefined, tip: '2026-04-01T00:00:00.000Z' })
      ),
    ]
    const race = playoffRace(games)
    const bos = race.find((r) => r.abbr === 'BOS')
    expect(bos.clinched).toBe(false)
    expect(typeof bos.magic).toBe('number')
  })

  it('still assigns every seeded team to a conference bucket', () => {
    const conf = conferenceStandings([game()])
    // 30 NBA teams split 15 East / 15 West.
    expect(conf.E.length).toBe(15)
    expect(conf.W.length).toBe(15)
  })
})

// ── stats.js remaining branches ───────────────────────────────────────────
describe('stats edge cases', () => {
  it('reports zeroed averages for an empty season (lines 22, 23, 28)', () => {
    const t = seasonTotals([])
    expect(t.ppg).toBe(0)
    expect(t.combinedPpg).toBe(0)
    expect(t.homeWinPct).toBe(0)
  })

  it('sorts a team roster with missing scoring averages last (line 102)', () => {
    // Two players with no average get compared to each other, exercising the ?? 0 on
    // both sides of the comparator.
    const roster = playersByTeam('X', [
      { team: 'X', name: 'Scorer', avgPoints: 28 },
      { team: 'X', name: 'Alice', avgPoints: null },
      { team: 'X', name: 'Bob', avgPoints: null },
      { team: 'Y', name: 'Other', avgPoints: 99 },
    ])
    expect(roster).toHaveLength(3)
    expect(roster[0].name).toBe('Scorer')
    expect(roster.slice(1).map((p) => p.name).sort()).toEqual(['Alice', 'Bob'])
  })
})

// ── time.js remaining branches ────────────────────────────────────────────
describe('time zone detection and formatting edge cases', () => {
  afterEach(() => vi.restoreAllMocks())

  it('detects the platform zone when available', () => {
    expect(typeof detectTimezone()).toBe('string')
  })

  it('falls back to Eastern when the platform reports no zone', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
      resolvedOptions: () => ({ timeZone: undefined }),
    }))
    expect(detectTimezone()).toBe('America/New_York')
  })

  it('falls back to Eastern when zone detection throws (lines 9-11)', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl')
    })
    expect(detectTimezone()).toBe('America/New_York')
  })

  it('prepends an unknown current zone to the picker options (line 31)', () => {
    expect(timezoneOptions('UTC')).toBe(TIMEZONES) // known → the list as-is
    const opts = timezoneOptions('Pacific/Pago_Pago') // unknown → prepended, underscores cleaned
    expect(opts[0]).toEqual({ id: 'Pacific/Pago_Pago', label: 'Pago Pago' })
    expect(opts).toHaveLength(TIMEZONES.length + 1)
  })

  it('returns an empty abbreviation when no timeZoneName part is present (line 46)', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => ({
      formatToParts: () => [{ type: 'literal', value: 'x' }],
    }))
    expect(formatZoneAbbr('2026-01-01T00:00:00Z', 'UTC')).toBe('')
  })

  it('labels adjacent days relatively and distant days in full (lines 69, 70)', () => {
    const now = new Date('2026-01-20T12:00:00Z')
    expect(dayLabel('2026-01-20', 'UTC', now)).toBe('Today')
    expect(dayLabel('2026-01-21', 'UTC', now)).toBe('Tomorrow')
    expect(dayLabel('2026-01-19', 'UTC', now)).toBe('Yesterday')
    expect(dayLabel('2026-02-01', 'UTC', now)).toMatch(/February/)
  })

  it('formats a countdown across days, hours, and minutes (lines 99-101)', () => {
    const now = Date.parse('2026-01-20T00:00:00Z')
    expect(countdown('2026-01-19T00:00:00Z', now)).toBeNull() // already started
    expect(countdown('2026-01-20T00:30:00Z', now)).toBe('30m')
    expect(countdown('2026-01-20T02:30:00Z', now)).toBe('2h 30m')
    expect(countdown('2026-01-22T02:00:00Z', now)).toBe('2d 2h')
  })
})

describe('liveState with an explicit clock (line 89)', () => {
  // Pinned with an explicit `now` so both the 'likely-live' and 'past' arms are covered
  // deterministically — otherwise coverage of this branch drifts with the wall-clock.
  const TIP = '2026-01-23T02:00:00.000Z'
  const at = (iso) => new Date(iso).getTime()
  const GAME_MS = 2.25 * 60 * 60 * 1000

  it('flags postponed/canceled games void', () => {
    expect(liveState({ postponed: true }, at(TIP))).toBe('void')
    expect(liveState({ canceled: true }, at(TIP))).toBe('void')
  })

  it('flags a live game live and a scored game final', () => {
    expect(liveState({ live: true, tip: TIP }, at(TIP))).toBe('live')
    expect(liveState({ score: [110, 100], tip: TIP }, at(TIP))).toBe('final')
  })

  it('is upcoming before tip, likely-live inside the window, and past once it closes', () => {
    expect(liveState({ tip: TIP }, at(TIP) - 60_000)).toBe('upcoming')
    expect(liveState({ tip: TIP }, at(TIP) + 60_000)).toBe('likely-live')
    expect(liveState({ tip: TIP }, at(TIP) + GAME_MS + 1)).toBe('past')
  })
})

// ── urlState.js remaining branch ──────────────────────────────────────────
describe('writeState SSR guard', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does nothing when there is no window (line 76)', () => {
    vi.stubGlobal('window', undefined)
    expect(() => writeState({ view: 'stats' }, 'America/New_York')).not.toThrow()
  })
})

// ── watch.js remaining branch ─────────────────────────────────────────────
describe('broadcastNotBadged with no watched list', () => {
  it('treats an absent watched list as empty (line 56)', () => {
    expect(broadcastNotBadged(['ESPN'], undefined)).toEqual(['ESPN'])
    expect(broadcastNotBadged(['ESPN', 'ABC'], null)).toEqual(['ESPN', 'ABC'])
  })
})
