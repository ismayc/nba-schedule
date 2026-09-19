import { describe, it, expect } from 'vitest'
import { GAMES } from '../../src/data/schedule.js'
import { TEAMS } from '../../src/data/teams.js'
import {
  conferenceStandings,
  playoffRace,
  countsForStandings,
  CONFERENCE_BY_ABBR,
  PLAYOFF_SPOTS,
  PLAYIN_SEEDS,
} from '../../src/utils/standings.js'

// LIVE suite (npm run test:data): the tables the site derives from the refreshed scores.
// Invariants only; see test/live/players.test.js for why. The NBA seeds within each
// conference, so every check here is per conference: there is no league-wide seed.
// Each one also holds on opening night, when nobody has played and every team is 0-0.

describe('standings derived from the refreshed schedule', () => {
  const byConf = conferenceStandings(GAMES)
  const all = [...byConf.E, ...byConf.W]

  it('puts every team in exactly one conference', () => {
    expect(all).toHaveLength(TEAMS.length)
    expect(new Set(all.map((r) => r.abbr)).size).toBe(TEAMS.length)
    expect(TEAMS.every((t) => CONFERENCE_BY_ABBR[t.abbr])).toBe(true)
  })

  it.each(['E', 'W'])('seeds conference %s 1 through N with no gaps', (conf) => {
    const rows = byConf[conf]
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.map((r) => r.seed)).toEqual(rows.map((_, i) => i + 1))
    for (const r of rows) expect(CONFERENCE_BY_ABBR[r.abbr], r.abbr).toBe(conf)
  })

  it('gives every team a record that independently recounts the committed games', () => {
    // A different code path than computeStandings: catches a miscounted or
    // home/away-swapped record without naming a number the refresh moves.
    for (const row of all) {
      let w = 0
      let l = 0
      for (const g of GAMES) {
        if (!countsForStandings(g) || (g.home !== row.abbr && g.away !== row.abbr)) continue
        const won = g.home === row.abbr ? g.score[0] > g.score[1] : g.score[1] > g.score[0]
        won ? w++ : l++
      }
      expect({ abbr: row.abbr, w: row.w, l: row.l }).toEqual({ abbr: row.abbr, w, l })
    }
  })

  it.each(['E', 'W'])('orders conference %s by win percentage before tiebreakers', (conf) => {
    const rows = byConf[conf]
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].pct).toBeGreaterThanOrEqual(rows[i].pct)
    }
  })

  it.each(['E', 'W'])('marks exactly the playoff spots and the play-in seeds in %s', (conf) => {
    const rows = byConf[conf]
    expect(rows.filter((r) => r.inPlayoffs)).toHaveLength(PLAYOFF_SPOTS)
    expect(rows.filter((r) => r.playIn).map((r) => r.seed)).toEqual(PLAYIN_SEEDS)
  })

  it('never lets a team play more games than it is scheduled for', () => {
    for (const row of playoffRace(GAMES)) expect(row.remaining, row.abbr).toBeGreaterThanOrEqual(0)
  })

  it('never commits a tied or half-scored final', () => {
    // Basketball has no draws, and the snapshot holds a score only for a completed game.
    // All-Star games are excluded only from the tie rule; they still need a full score.
    for (const g of GAMES) {
      if (!g.score) continue
      expect(g.score, g.id).toHaveLength(2)
      expect(g.score.every(Number.isFinite), g.id).toBe(true)
      if (g.seasonType !== 'allstar') expect(g.score[0], g.id).not.toBe(g.score[1])
    }
  })
})
