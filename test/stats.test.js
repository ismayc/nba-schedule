import { describe, it, expect } from 'vitest'
import { GAMES } from '../src/data/schedule.js'
import { PLAYERS } from '../src/data/leaders.js'
import {
  seasonTotals,
  teamScoring,
  leaderboard,
  playersByTeam,
  teamLabel,
} from '../src/utils/stats.js'

const game = (over) => ({
  id: String(Math.random()),
  seasonType: 'regular',
  tip: '2026-05-10T00:00:00.000Z',
  home: 'MIN',
  away: 'LAL',
  score: [90, 80],
  ...over,
})

describe('seasonTotals', () => {
  it('sums points across both teams', () => {
    const t = seasonTotals([game({ score: [90, 80] }), game({ score: [100, 70] })])
    expect(t.totalPoints).toBe(340)
    expect(t.combinedPpg).toBe(170)
  })

  it('measures home win rate rather than assuming it', () => {
    const t = seasonTotals([
      game({ score: [90, 80] }), // home win
      game({ score: [70, 80] }), // road win
    ])
    expect(t.homeWins).toBe(1)
    expect(t.homeWinPct).toBe(0.5)
  })

  it('classifies one-possession games and blowouts by margin', () => {
    const t = seasonTotals([
      game({ score: [90, 88] }), // margin 2
      game({ score: [90, 87] }), // margin 3 — still one possession
      game({ score: [90, 86] }), // margin 4
      game({ score: [110, 80] }), // margin 30
    ])
    expect(t.nailbiters).toHaveLength(2)
    expect(t.blowouts).toHaveLength(1)
  })

  it('excludes the Cup final from season totals', () => {
    const t = seasonTotals([game(), game({ seasonType: 'cup', score: [200, 200] })])
    expect(t.played).toBe(1)
    expect(t.totalPoints).toBe(170)
  })

  it('counts remaining games from the schedule, not a fixed season length', () => {
    const t = seasonTotals([game(), game({ score: undefined }), game({ score: undefined })])
    expect(t.played).toBe(1)
    expect(t.remaining).toBe(2)
  })
})

describe('teamScoring', () => {
  it('ranks defense by fewest points allowed', () => {
    const rows = teamScoring([
      game({ home: 'MIN', away: 'LAL', score: [90, 70] }),
      game({ home: 'NY', away: 'ATL', score: [100, 99] }),
    ])
    const min = rows.find((r) => r.abbr === 'MIN')
    const ny = rows.find((r) => r.abbr === 'NY')
    // MIN allowed 70, NY allowed 99 — MIN must rank better defensively.
    expect(min.defRank).toBeLessThan(ny.defRank)
  })

  it('sorts by net margin, best first', () => {
    const rows = teamScoring(GAMES)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].netPpg).toBeGreaterThanOrEqual(rows[i].netPpg)
    }
  })

  it('omits teams that have not played', () => {
    const rows = teamScoring([game({ home: 'MIN', away: 'LAL' })])
    expect(rows.map((r) => r.abbr).sort()).toEqual(['LAL', 'MIN'])
  })
})

describe('leaderboard', () => {
  const players = [
    { id: '1', name: 'A', avgPoints: 20 },
    { id: '2', name: 'B', avgPoints: 15 },
    { id: '3', name: 'C', avgPoints: 15 },
    { id: '4', name: 'D', avgPoints: 10 },
  ]

  it('gives tied players a shared rank and skips the consumed slot', () => {
    const rows = leaderboard('avgPoints', { players, limit: 10 })
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, 4])
  })

  it('keeps everyone tied at the cutoff rather than truncating mid-tie', () => {
    const rows = leaderboard('avgPoints', { players, limit: 2 })
    // Rank 2 is a two-way tie, so a limit of 2 still returns three rows.
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.rank <= 2)).toBe(true)
  })

  it('drops players missing the stat instead of ranking them zero', () => {
    const rows = leaderboard('threePct', {
      players: [...players, { id: '5', name: 'E', threePct: 50, avgThreeMade: 2, gamesPlayed: 60 }],
      limit: 10,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('E')
  })

  // The NBA qualifies a 3P% leader on threes MADE — 82 of them — not on attempts. An
  // attempts-per-game floor let a 37-game shooter onto 2025-26's board where
  // basketball-reference had none.
  it('drops percentage leaders who lack the made shots to qualify', () => {
    const rows = leaderboard('threePct', {
      players: [
        // 82 games at 1.5 made = 123 threes, clear of the 82 minimum.
        { id: '1', name: 'Sharpshooter', threePct: 40, avgThreeMade: 1.5, gamesPlayed: 82 },
        { id: '2', name: 'Fluke Center', threePct: 100, avgThreeMade: 0.02, gamesPlayed: 82 }, // 2 made
        { id: '3', name: 'Small Sample', threePct: 55, avgThreeMade: 3, gamesPlayed: 10 }, // 30 made
        { id: '4', name: 'No Volume Data', threePct: 99 }, // no made/games fields at all
        { id: '5', name: 'Made No Games', threePct: 60, avgThreeMade: 5 }, // no games field
      ],
      limit: 10,
    })
    expect(rows.map((r) => r.name)).toEqual(['Sharpshooter'])
  })

  it('qualifies a field goal percentage leader on 300 made', () => {
    const rows = leaderboard('fgPct', {
      players: [
        { id: '1', name: 'Rim Runner', fgPct: 65, avgFgMade: 6, gamesPlayed: 82 }, // 492 made
        { id: '2', name: 'Perfect Cameo', fgPct: 100, avgFgMade: 1, gamesPlayed: 82 }, // 82 made
        { id: '3', name: 'Just Short', fgPct: 70, avgFgMade: 5, gamesPlayed: 59 }, // 295 made
      ],
      limit: 10,
    })
    expect(rows.map((r) => r.name)).toEqual(['Rim Runner'])
  })

  it('lists only players who recorded a counting stat, not everyone on zero', () => {
    const rows = leaderboard('tripleDouble', {
      players: [
        { id: '1', name: 'Triple Threat', tripleDouble: 5 },
        { id: '2', name: 'One Timer', tripleDouble: 1 },
        { id: '3', name: 'Never', tripleDouble: 0 },
        { id: '4', name: 'Also Never', tripleDouble: 0 },
      ],
      limit: 10,
    })
    expect(rows.map((r) => r.name)).toEqual(['Triple Threat', 'One Timer'])
  })

  // The bug this rule exists for: unfiltered, 2025-26's rebounding board ran Sabonis
  // (19 games), Davis (20) and Edey (11) above players who went the distance, and the
  // steals board was topped by a three-game cameo. basketball-reference applies the NBA's
  // 58-game minimum and ours did not, which is why the two disagreed.
  it('drops per-game leaders who played too little of the season', () => {
    const rows = leaderboard('avgRebounds', {
      players: [
        { id: '1', name: 'Iron Man', avgRebounds: 10, gamesPlayed: 82 },
        { id: '2', name: 'Cameo', avgRebounds: 20, gamesPlayed: 5 },
        { id: '3', name: 'Half Season', avgRebounds: 15, gamesPlayed: 41 },
        // The NBA's line is exactly 58 in a full season: 58 clears it, 57 does not.
        { id: '4', name: 'Just Qualified', avgRebounds: 9, gamesPlayed: 58 },
        { id: '5', name: 'Just Missed', avgRebounds: 19, gamesPlayed: 57 },
      ],
      limit: 10,
    })
    expect(rows.map((r) => r.name)).toEqual(['Iron Man', 'Just Qualified'])
  })

  // Mid-season the 58 scales to how much has been played, so a January board ranks who has
  // been available instead of sitting empty until March.
  it('scales the games floor to the season so far', () => {
    const rows = leaderboard('avgPoints', {
      players: [
        // Busiest player has 41 of 82, so the floor is half of 58 — 29 games.
        { id: '1', name: 'Ever Present', avgPoints: 20, gamesPlayed: 41 },
        { id: '2', name: 'Mostly There', avgPoints: 25, gamesPlayed: 29 },
        { id: '3', name: 'Just Under', avgPoints: 40, gamesPlayed: 28 },
        { id: '4', name: 'Two Games', avgPoints: 50, gamesPlayed: 2 },
      ],
      limit: 10,
    })
    expect(rows.map((r) => r.name)).toEqual(['Mostly There', 'Ever Present'])
  })

  // An 83rd game (a rescheduled makeup) must not push the bar above the NBA's actual rule.
  it('never scales the floor past a full season', () => {
    const rows = leaderboard('avgPoints', {
      players: [
        { id: '1', name: 'Played 83', avgPoints: 10, gamesPlayed: 83 },
        { id: '2', name: 'Played 58', avgPoints: 30, gamesPlayed: 58 },
      ],
      limit: 10,
    })
    expect(rows.map((r) => r.name)).toEqual(['Played 58', 'Played 83'])
  })

  it('ranks on stored precision rather than the two decimals it displays', () => {
    const rows = leaderboard('avgRebounds', {
      players: [
        // Both display as 10.63; basketball-reference orders this exact pair (2023-24's
        // Wembanyama over Capela) on the digits behind the rounding, and so does this.
        { id: '1', name: 'Capela', avgRebounds: 10.6301, gamesPlayed: 73 },
        { id: '2', name: 'Wembanyama', avgRebounds: 10.6338, gamesPlayed: 71 },
      ],
      limit: 10,
    })
    expect(rows.map((r) => r.name)).toEqual(['Wembanyama', 'Capela'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2])
  })
})

describe('teamLabel', () => {
  it('names the team and the games played with it', () => {
    expect(teamLabel({ abbr: 'LAC', gp: 43 })).toBe('LAC · 43 games')
  })

  it('omits the count when the split could not be resolved', () => {
    expect(teamLabel({ abbr: 'LAC', gp: null })).toBe('LAC')
  })
})

describe('the committed player table', () => {
  it('has qualified players with the stats the leaderboards use', () => {
    expect(PLAYERS.length).toBeGreaterThan(50)
    for (const key of ['avgPoints', 'avgRebounds', 'avgAssists']) {
      expect(leaderboard(key, { limit: 5 }).length).toBeGreaterThanOrEqual(5)
    }
  })

  it('assigns every player to a real team', () => {
    const teams = new Set(PLAYERS.map((p) => p.team))
    expect(teams.size).toBe(30)
    expect(playersByTeam('MIN').length).toBeGreaterThan(0)
  })

  it('sorts a team roster by scoring', () => {
    const roster = playersByTeam('MIN')
    for (let i = 1; i < roster.length; i++) {
      expect(roster[i - 1].avgPoints).toBeGreaterThanOrEqual(roster[i].avgPoints)
    }
  })
})
