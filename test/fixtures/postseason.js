// A small, self-contained NBA-style postseason used to unit-test the series engine
// (buildSeries) directly, independent of the committed schedule. Every round is
// best-of-7. Home/away alternates between games on purpose, so the tests prove series
// are grouped by round+opponent pair rather than by venue.
//
// Series in this fixture:
//   E R1  NY vs ATL  — NY wins 4-3 (goes the distance, 7 games)
//   E R1  CLE vs MIA — CLE wins 4-0 (sweep)
//   W CF  OKC vs SA  — SA wins 4-2

const g = (id, round, game, home, away, hs, as) => ({
  id,
  tip: `2026-05-${String(game + 10).padStart(2, '0')}T23:00:00.000Z`,
  seasonType: 'playoffs',
  home,
  away,
  score: [hs, as],
  round,
  game,
})

export const NBA_POSTSEASON = [
  // East First Round — NY over ATL 4-3, higher seed NY hosts game 1.
  g('e1-1', 'R1', 1, 'NY', 'ATL', 112, 100), // NY 1-0
  g('e1-2', 'R1', 2, 'NY', 'ATL', 108, 104), // NY 2-0
  g('e1-3', 'R1', 3, 'ATL', 'NY', 99, 90), //   ATL 2-1
  g('e1-4', 'R1', 4, 'ATL', 'NY', 105, 101), // ATL 2-2
  g('e1-5', 'R1', 5, 'NY', 'ATL', 118, 111), // NY 3-2
  g('e1-6', 'R1', 6, 'ATL', 'NY', 96, 88), //   ATL 3-3
  g('e1-7', 'R1', 7, 'NY', 'ATL', 103, 97), //  NY 4-3

  // East First Round — CLE sweeps MIA 4-0.
  g('e2-1', 'R1', 1, 'CLE', 'MIA', 120, 101),
  g('e2-2', 'R1', 2, 'CLE', 'MIA', 111, 98),
  g('e2-3', 'R1', 3, 'MIA', 'CLE', 95, 108),
  g('e2-4', 'R1', 4, 'MIA', 'CLE', 100, 112),

  // West Conference Finals — SA over OKC 4-2, higher seed OKC hosts game 1.
  g('w1-1', 'CF', 1, 'OKC', 'SA', 110, 104), // OKC 1-0
  g('w1-2', 'CF', 2, 'OKC', 'SA', 99, 107), //  SA 1-1
  g('w1-3', 'CF', 3, 'SA', 'OKC', 115, 102), // SA 2-1
  g('w1-4', 'CF', 4, 'SA', 'OKC', 109, 100), // SA 3-1
  g('w1-5', 'CF', 5, 'OKC', 'SA', 105, 98), //  OKC 2-3
  g('w1-6', 'CF', 6, 'SA', 'OKC', 111, 106), // SA 4-2
]
