// A synthetic, fully DECIDED season — shared by the suites that need clinched /
// eliminated states, resolved brackets, or drill-down tiles after a rollover leaves
// the live schedule unplayed. Both legs of every in-conference pair are played and
// the earlier-listed team always wins, so the table is a strict gradient: top seeds
// clinched, bottom seeds eliminated, nothing left to play.
//
// Specials for the tiles: one game goes to single overtime, one to DOUBLE overtime
// (the drill notes both "OT" and "2OT"), and TWO finish inside a possession
// (margins 1 and 2 — two entries so the margin sort comparator runs).

export const EAST = ['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DET', 'IND', 'MIA', 'MIL', 'NY', 'ORL', 'PHI', 'TOR', 'WSH']
export const WEST = ['DAL', 'DEN', 'GS', 'HOU', 'LAC', 'LAL', 'MEM', 'MIN', 'NO', 'OKC', 'PHX', 'POR', 'SAC', 'SA', 'UTAH']

export const decidedSeason = () => {
  const games = []
  let n = 0
  for (const conf of [EAST, WEST]) {
    for (let i = 0; i < conf.length; i++) {
      for (let j = i + 1; j < conf.length; j++) {
        const ot = n === 0 ? 1 : n === 4 ? 2 : 0
        games.push({
          id: `d${n++}`,
          seasonType: 'regular',
          tip: '2026-01-10T00:00:00.000Z',
          home: conf[i],
          away: conf[j],
          score: ot ? [85, 80] : [80, 70],
          ot: ot || undefined,
          line:
            ot === 1
              ? { home: [20, 20, 20, 20, 5], away: [20, 20, 20, 20, 0] }
              : ot === 2
                ? { home: [15, 15, 15, 15, 10, 15], away: [15, 15, 15, 15, 10, 10] }
                : { home: [20, 20, 20, 20], away: [18, 17, 18, 17] },
        })
        const close = n === 1 ? 2 : n === 3 ? 1 : 0 // final margin, 0 = comfortable
        games.push({
          id: `d${n++}`,
          seasonType: 'regular',
          tip: '2026-03-10T00:00:00.000Z',
          home: conf[j],
          away: conf[i],
          score: close ? [80 - close, 80] : [70, 80],
          line: close
            ? { home: [20, 20, 20, 20 - close], away: [20, 20, 20, 20] }
            : { home: [18, 17, 18, 17], away: [20, 20, 20, 20] },
        })
      }
    }
  }
  return games
}

// A postseason ALIGNED with decidedSeason()'s seeding (seed k = array position k+1),
// so components that pair series to seeds — the radial wheel's inner rounds — resolve
// winners. Every series is a 4-0 sweep by the lower-seeded index; the champion is the
// East #1 (ATL).
export const alignedPlayoffs = () => {
  const games = []
  let n = 0
  const series = (round, home, away, month) => {
    for (let g = 1; g <= 4; g++) {
      games.push({
        id: `po${n++}`,
        seasonType: 'playoffs',
        tip: `2026-${month}-${String(g + 10).padStart(2, '0')}T00:00:00.000Z`,
        round,
        game: g,
        home,
        away,
        score: [100, 90],
      })
    }
  }
  for (const conf of [EAST, WEST]) {
    // R1 by the fixed 1v8 / 4v5 / 2v7 / 3v6 template (0-indexed pairs).
    for (const [a, b] of [[0, 7], [3, 4], [1, 6], [2, 5]]) series('R1', conf[a], conf[b], '04')
    series('CSF', conf[0], conf[3], '05')
    series('CSF', conf[1], conf[2], '05')
    series('CF', conf[0], conf[1], '05')
  }
  series('Final', EAST[0], WEST[0], '06')
  return games
}
