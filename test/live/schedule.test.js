import { describe, it, expect } from 'vitest'
import { GAMES } from '../../src/data/schedule.js'
import { ALL_ABBRS } from '../../src/data/teams.js'

// LIVE suite (npm run test:data): this file reads the real, refreshed modules. It is the
// WNBA sibling's schedule integrity check, which this repo never had; it arrived with the
// frozen-data split, because the refresh gate is now where the committed board gets
// checked at all.
//
// The committed schedule is the single source of truth for *who* plays whom. The
// live overlay only ever paints score/clock/status onto a game matched by id, and
// never rewrites the matchup. So a regenerated schedule that flips or duplicates a
// matchup would silently show the wrong game with a real live score attached. These
// are the guards that would catch that.

const known = new Set(ALL_ABBRS)

describe('committed schedule integrity', () => {
  it('has games', () => {
    expect(GAMES.length).toBeGreaterThan(0)
  })

  it('gives every game a unique id', () => {
    const ids = GAMES.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never lists a team against itself', () => {
    for (const g of GAMES) expect(g.home).not.toBe(g.away)
  })

  it('stamps every game with a parseable tip time', () => {
    for (const g of GAMES) expect(Number.isNaN(Date.parse(g.tip)), g.id).toBe(false)
  })

  it('uses only known team abbreviations for real games', () => {
    // All-Star Weekend fields squads that are not franchises (in 2025-26 a four-game
    // round robin between Team Stars, Team Stripes, and World, as STARS / STRIPES /
    // WORLD), so those rows carry homeName/awayName instead. Everything else,
    // the NBA Cup final included, must resolve to a real team.
    for (const g of GAMES) {
      if (g.seasonType === 'allstar') {
        expect(g.homeName, `${g.id} homeName`).toBeTruthy()
        expect(g.awayName, `${g.id} awayName`).toBeTruthy()
        continue
      }
      expect(known.has(g.home), `${g.id} home=${g.home}`).toBe(true)
      expect(known.has(g.away), `${g.id} away=${g.away}`).toBe(true)
    }
  })
})
