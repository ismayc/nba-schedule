import { describe, it, expect } from 'vitest'
import { HISTORY, HISTORY_BY_YEAR, HISTORY_YEARS } from '../src/data/history.js'
import {
  seasonBracket,
  seasonPlayIn,
  runResult,
  playInPath,
  playInQualifiers,
  finalsSummary,
} from '../src/utils/history.js'
import { CONFERENCE_BY_ABBR } from '../src/utils/standings.js'
import { LEADER_CATEGORIES } from '../src/utils/stats.js'
import { TEAM_BY_ABBR } from '../src/data/teams.js'

// The archived seasons are checked against the real NBA record, not against the feed
// they came from — a test that only restates ESPN would pass on garbage.
const CHAMPIONS = {
  2026: ['NY', 'SA', [4, 1]],
  2025: ['OKC', 'IND', [4, 3]],
  2024: ['BOS', 'DAL', [4, 1]],
  2023: ['DEN', 'MIA', [4, 1]],
  2022: ['GS', 'BOS', [4, 2]],
  2021: ['MIL', 'PHX', [4, 2]],
}

describe('the committed history file', () => {
  it('covers every season since the play-in took its current form, newest first', () => {
    // Every completed season in the current play-in format, including the one the rest
    // of the app is showing — otherwise the all-seasons tables would omit it.
    expect(HISTORY_YEARS).toEqual([2026, 2025, 2024, 2023, 2022, 2021])
    expect(HISTORY).toHaveLength(6)
    expect(Object.keys(HISTORY_BY_YEAR).map(Number).sort()).toEqual([
      2021, 2022, 2023, 2024, 2025, 2026,
    ])
  })

  it('seeds all 30 teams, 15 per conference, in every season', () => {
    for (const s of HISTORY) {
      expect(s.standings.E).toHaveLength(15)
      expect(s.standings.W).toHaveLength(15)
      expect(s.standings.E.map((r) => r.seed)).toEqual([...Array(15)].map((_, i) => i + 1))
      for (const conf of ['E', 'W']) {
        for (const row of s.standings[conf]) expect(CONFERENCE_BY_ABBR[row.abbr]).toBe(conf)
      }
    }
  })

  it('carries six play-in games and a full playoff field every season', () => {
    for (const s of HISTORY) {
      const playIn = s.games.filter((g) => g.seasonType === 'playin')
      const playoffs = s.games.filter((g) => g.seasonType === 'playoffs')
      expect(playIn).toHaveLength(6)
      // 15 series (8 first round + 4 semis + 2 conference finals + the Finals) run at
      // least four games each, and no season can exceed seven per series.
      expect(playoffs.length).toBeGreaterThanOrEqual(15 * 4)
      expect(playoffs.length).toBeLessThanOrEqual(15 * 7)
      for (const g of s.games) expect(g.score).toHaveLength(2)
    }
  })

  it('commits no regular-season games — that is what keeps it small', () => {
    for (const s of HISTORY) {
      expect(s.games.some((g) => g.seasonType === 'regular')).toBe(false)
    }
  })

  it('records a season total that matches the games actually played', () => {
    for (const s of HISTORY) {
      for (const conf of ['E', 'W']) {
        for (const r of s.standings[conf]) {
          expect(r.w + r.l).toBeGreaterThan(60) // 72-game 2020-21 through 82 elsewhere
          expect(r.pct).toBeCloseTo(r.w / (r.w + r.l), 2)
          expect(r.diff).toBe(r.pf - r.pa)
        }
      }
      // Every league game has one winner and one loser, so the two sum to each other.
      const all = [...s.standings.E, ...s.standings.W]
      expect(all.reduce((n, r) => n + r.w, 0)).toBe(all.reduce((n, r) => n + r.l, 0))
    }
  })
})

describe('rebuilding an archived season', () => {
  it('reproduces the real champion, runner-up and Finals margin', () => {
    for (const s of HISTORY) {
      const [champ, runnerUp, wins] = CHAMPIONS[s.year]
      const finals = finalsSummary(s)
      expect(finals.winner).toBe(champ)
      expect(finals.loser).toBe(runnerUp)
      expect(finals.wins).toEqual(wins)
      // The committed summary and the recomputed bracket must agree.
      expect(s.champion).toBe(champ)
      expect(s.runnerUp).toBe(runnerUp)
    }
  })

  it('seeds the bracket from the committed standings, not from absent regular games', () => {
    const s = HISTORY_BY_YEAR[2023]
    const b = seasonBracket(s)
    // 2022-23 East: Milwaukee were the 1 seed and lost to the 8-seed Heat.
    const oneVsEight = b.conferences.E.r1[0]
    expect(oneVsEight.seeds).toEqual([1, 8])
    expect(oneVsEight.order[0]).toBe('MIL')
    expect(oneVsEight.winner).toBe('MIA')
    expect(b.projected).toBe(false)
  })

  it('rebuilds each play-in ladder into the seeds the bracket then used', () => {
    for (const s of HISTORY) {
      const playIn = seasonPlayIn(s)
      const b = seasonBracket(s)
      for (const conf of ['E', 'W']) {
        expect(playIn[conf].games).toHaveLength(3)
        expect(playIn[conf].complete).toBe(true)
        // The 7 and 8 seeds the ladder produced are the ones in the 2v7 and 1v8 slots.
        expect(b.conferences[conf].r1[0].teams).toContain(playIn[conf].seeds[8])
        expect(b.conferences[conf].r1[2].teams).toContain(playIn[conf].seeds[7])
        expect(s.viaPlayIn[conf].sort()).toEqual(
          [playIn[conf].seeds[7], playIn[conf].seeds[8]].sort()
        )
      }
    }
  })
})

describe('how far a team went', () => {
  const b2023 = seasonBracket(HISTORY_BY_YEAR[2023])

  it('labels each exit round, and the title', () => {
    expect(runResult(b2023, 'DEN')).toBe('Won the title')
    expect(runResult(b2023, 'MIA')).toBe('Lost the Finals')
    expect(runResult(b2023, 'BOS')).toBe('Lost the conference finals')
    expect(runResult(b2023, 'PHI')).toBe('Lost the conference semifinals')
    expect(runResult(b2023, 'MIL')).toBe('Lost in the first round')
  })

  it('returns null for a team that never reached the bracket', () => {
    expect(runResult(b2023, 'SA')).toBeNull() // 2022-23: worst record in the league
    expect(runResult(b2023, null)).toBeNull()
  })
})

describe('the route through the play-in', () => {
  const east2023 = seasonPlayIn(HISTORY_BY_YEAR[2023]).E

  it('separates the three ways in', () => {
    // Atlanta won 7v8 outright; Miami lost it and came back through the 8th-seed game.
    expect(playInPath(east2023, 'ATL')).toBe('Won the 7/8 game')
    expect(playInPath(east2023, 'MIA')).toBe('Lost the 7/8 game, then won the 8th-seed game')
    // Chicago won 9v10 and then lost the 8th-seed game, so they took no seed.
    expect(playInPath(east2023, 'CHI')).toBeNull()
  })

  it('reads the 9/10 route when the 8 seed came up from below', () => {
    // 2021-22 East: Atlanta beat Charlotte in 9v10, then Cleveland for the 8 seed.
    const east2022 = seasonPlayIn(HISTORY_BY_YEAR[2022]).E
    expect(playInPath(east2022, 'ATL')).toBe('Won the 9/10 game, then the 8th-seed game')
  })
})

describe('the play-in qualifier table', () => {
  const rows = playInQualifiers(HISTORY)

  it('has one row per seed produced — four a season', () => {
    expect(rows).toHaveLength(HISTORY.length * 4)
    expect(rows.filter((r) => r.seed === 7)).toHaveLength(HISTORY.length * 2)
    expect(rows.every((r) => r.path && r.result)).toBe(true)
  })

  it('is newest first, and each row knows its conference', () => {
    expect(rows[0].year).toBe(2026)
    expect(rows.at(-1).year).toBe(2021)
    expect(new Set(rows.map((r) => r.conf))).toEqual(new Set(['E', 'W']))
  })

  it('captures the deepest run any play-in team has made', () => {
    // The 2022-23 Heat: 8 seed out of the play-in, all the way to the Finals.
    const heat = rows.find((r) => r.year === 2023 && r.abbr === 'MIA')
    expect(heat).toMatchObject({
      seed: 8,
      conf: 'E',
      path: 'Lost the 7/8 game, then won the 8th-seed game',
      result: 'Lost the Finals',
      champion: false,
    })
  })

  it('has never produced a champion — the record these rows exist to show', () => {
    expect(rows.filter((r) => r.champion)).toHaveLength(0)
  })
})

describe('an unfinished season', () => {
  // Not a shape the committed file holds, but finalsSummary has to survive one: the
  // fetch script calls the same code on a season in progress to decide whether to
  // commit it at all.
  const partial = { ...HISTORY_BY_YEAR[2026], games: [] }

  it('reports no Finals result rather than inventing one', () => {
    const finals = finalsSummary(partial)
    expect(finals.winner).toBeNull()
    expect(finals.wins).toBeNull()
  })

  it('skips a play-in that has not been played', () => {
    const playIn = seasonPlayIn(partial)
    expect(playIn.E.played).toBe(false)
    expect(playIn.W.games).toEqual([])
  })

  it('contributes no qualifier rows until its seeds are settled', () => {
    expect(playInQualifiers([partial])).toEqual([])
  })
})

describe('the leader boards', () => {
  it('covers every category the live Stats view offers', () => {
    for (const s of HISTORY) {
      for (const cat of LEADER_CATEGORIES) {
        expect(s.leaders[cat.key].length).toBeGreaterThanOrEqual(10)
      }
    }
  })

  it('joins every board row to a stat line in that season\'s player table', () => {
    for (const s of HISTORY) {
      for (const board of Object.values(s.leaders)) {
        for (const row of board) {
          const p = s.players[row.id]
          expect(p).toBeTruthy()
          expect(typeof p.gamesPlayed).toBe('number')
          expect(typeof row.value).toBe('number')
        }
      }
    }
  })

  it('ranks with ties sharing a place, as the live board does', () => {
    // 2022-23: Giddey and Westbrook tied on 4 triple-doubles, so both are 7th and the
    // next player is 9th — the standard convention, not index + 1.
    const td = HISTORY_BY_YEAR[2023].leaders.tripleDouble
    expect(td[0]).toMatchObject({ rank: 1, value: 29 }) // Jokic
    expect(td.filter((r) => r.rank === 7)).toHaveLength(2)
    expect(td[8].rank).toBe(9)
  })

  it('applies the volume qualifier to the percentage categories', () => {
    // A 1-for-1 night can't top FG%: every qualifier is a real rotation player.
    for (const s of HISTORY) {
      for (const row of s.leaders.fgPct) {
        const p = s.players[row.id]
        expect(p.avgFgAtt).toBeGreaterThanOrEqual(5)
      }
      for (const row of s.leaders.threePct) {
        expect(s.players[row.id].avgThreeAtt).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

describe('the season totals', () => {
  it('matches the games each season actually played', () => {
    for (const s of HISTORY) {
      const t = s.totals
      // Every team's games summed is two per game.
      const teamGames = [...s.standings.E, ...s.standings.W].reduce((n, r) => n + r.w + r.l, 0)
      expect(t.played).toBe(teamGames / 2)
      expect(t.combinedPpg).toBeCloseTo(t.points / t.played, 1)
      // Home teams win more than they lose, in every season on record.
      expect(t.homeWins / t.played).toBeGreaterThan(0.5)
      expect(t.closest).toHaveLength(5)
      expect(t.highest).toHaveLength(5)
      // The closest games are the closest: none can be beaten by a highest-scoring one.
      const margin = (g) => Math.abs(g.score[0] - g.score[1])
      expect(Math.max(...t.closest.map(margin))).toBeLessThanOrEqual(3)
    }
  })

  it('keeps only those ten regular-season games, each with an id to open', () => {
    for (const s of HISTORY) {
      for (const g of [...s.totals.closest, ...s.totals.highest]) {
        expect(g.id).toMatch(/^\d+$/)
        expect(g.score).toHaveLength(2)
        // They are NOT in the committed games list — that is postseason only.
        expect(s.games.some((x) => x.id === g.id)).toBe(false)
      }
    }
  })
})

describe('the team abbreviations in the archive', () => {
  it('all resolve against the current 30 franchises', () => {
    // Nothing has moved or been renamed since 2020-21, which is why the history views
    // can look a team up directly rather than carrying per-season names.
    const seen = new Set()
    for (const s of HISTORY) {
      for (const conf of ['E', 'W']) s.standings[conf].forEach((r) => seen.add(r.abbr))
      for (const g of s.games) seen.add(g.home), seen.add(g.away)
      Object.values(s.players).forEach((p) => seen.add(p.team))
    }
    expect(seen.size).toBe(30)
    for (const abbr of seen) expect(TEAM_BY_ABBR[abbr]).toBeTruthy()
  })
})
