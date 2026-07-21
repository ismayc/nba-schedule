// Playoff bracket.
//
// Two structural facts drive this:
//   1. Every slot is a best-of-SEVEN SERIES, not a single game — so a slot is derived by
//      grouping games by round + opponent pair and counting wins.
//   2. The NBA runs TWO conference brackets (East and West) into the Finals, each fixed
//      by seed and NOT re-seeded between rounds:
//         R1:   1v8   4v5   2v7   3v6
//         CSF:  winner(1v8) vs winner(4v5)  |  winner(2v7) vs winner(3v6)
//         CF:   the two conference-semifinal winners
//      then Final: East champion vs West champion.
//
// Seeds 7–8 in each conference are settled by a play-in (7–10), so the ACTUAL lower seed
// in an R1 series can differ from the regular-season standings. Real series are therefore
// located by their play-in-IMMUNE higher seed (1/2/3/4), never by the lower one.

import { conferenceStandings } from './standings.js'
import { SERIES_LENGTH, PLAYOFF_ROUNDS } from '../data/schedule.js'

export { PLAYOFF_ROUNDS, SERIES_LENGTH }

// First-round seed pairings, in bracket order (top half then bottom half). The first
// entry of each pair is the higher (host) seed.
export const R1_PAIRS = [
  [1, 8],
  [4, 5],
  [2, 7],
  [3, 6],
]

const winsNeeded = (round) => Math.ceil((SERIES_LENGTH[round] ?? 7) / 2)

const pairKey = (a, b) => [a, b].sort().join('|')

// Group playoff games into series. A series is keyed by round + opponent pair, so it
// survives home/away alternating between games.
export function buildSeries(games) {
  const byKey = new Map()

  for (const g of games) {
    if (g.seasonType !== 'playoffs' || !g.round) continue
    const key = `${g.round}:${pairKey(g.home, g.away)}`
    if (!byKey.has(key)) {
      byKey.set(key, { key, round: g.round, teams: [g.home, g.away].sort(), games: [] })
    }
    byKey.get(key).games.push(g)
  }

  return [...byKey.values()].map((s) => {
    s.games.sort((a, b) => (a.game ?? 0) - (b.game ?? 0) || a.tip.localeCompare(b.tip))

    const wins = Object.fromEntries(s.teams.map((t) => [t, 0]))
    for (const g of s.games) {
      if (!g.score || g.postponed || g.canceled) continue
      const winner = g.score[0] > g.score[1] ? g.home : g.away
      if (winner in wins) wins[winner]++
    }

    const need = winsNeeded(s.round)
    const winner = s.teams.find((t) => wins[t] >= need) || null
    // Higher seed hosts game 1, so game 1's home team identifies the favoured side.
    const host = s.games.find((g) => g.game === 1)?.home ?? s.games[0]?.home ?? s.teams[0]

    return {
      ...s,
      wins,
      need,
      bestOf: SERIES_LENGTH[s.round] ?? 7,
      winner,
      loser: winner ? s.teams.find((t) => t !== winner) : null,
      // Ordered [higher seed, lower seed] for display.
      order: [host, s.teams.find((t) => t !== host)].filter(Boolean),
      complete: !!winner,
      live: s.games.some((g) => g.live),
    }
  })
}

const winnerOf = (slotObj) => slotObj?.winner ?? null

// The one series in `round` that includes `abbr` — used to locate a slot by a participant
// we already know (a higher seed, or a resolved winner feeding the next round).
const findContaining = (series, round, abbr) =>
  abbr ? series.find((s) => s.round === round && s.teams.includes(abbr)) : undefined

// An empty slot shell carrying whatever labels feed it, when no real series exists yet.
const emptySlot = (round, a, b, meta = {}) => ({
  key: `${round}:${a || '?'}|${b || '?'}`,
  round,
  teams: [a, b].filter(Boolean),
  order: [a, b],
  games: [],
  wins: Object.fromEntries([a, b].filter(Boolean).map((t) => [t, 0])),
  need: winsNeeded(round),
  bestOf: SERIES_LENGTH[round] ?? 7,
  winner: null,
  loser: null,
  complete: false,
  live: false,
  projected: true,
  ...meta,
})

// Resolve one slot: a real series if one exists for the anchor team, otherwise a
// projected shell of `a` vs `b`.
function resolveSlot(series, round, anchor, a, b, meta = {}) {
  const real = findContaining(series, round, anchor)
  if (real) return { ...real, ...meta, projected: false }
  return emptySlot(round, a, b, meta)
}

// Build one conference's bracket (R1 → CSF → CF) from its top-8 seeds and the real
// series. Slots resolve to real series when the games exist, and project from seeding
// otherwise — which is what makes this view useful in October, not only in April.
function buildConferenceBracket(conf, seeds, series) {
  const bySeed = Object.fromEntries(seeds.map((r) => [r.seed, r]))
  const feeder = (seed) => `${seed} seed`

  const r1 = R1_PAIRS.map(([hi, lo], i) => {
    const anchor = bySeed[hi]?.abbr // higher seed is play-in-immune
    return resolveSlot(series, 'R1', anchor, bySeed[hi]?.abbr, bySeed[lo]?.abbr, {
      conf,
      index: i,
      seeds: [hi, lo],
      feeders: [feeder(hi), feeder(lo)],
    })
  })

  const label = (s) => (s.seeds ? `Winner ${s.seeds[0]}/${s.seeds[1]}` : 'Winner')
  const csfPairs = [
    [0, 1],
    [2, 3],
  ]
  const csf = csfPairs.map(([i, j], k) => {
    const a = winnerOf(r1[i])
    const b = winnerOf(r1[j])
    const anchor = a ?? b // whichever winner is known locates the series
    return resolveSlot(series, 'CSF', anchor, a, b, {
      conf,
      index: k,
      from: [r1[i], r1[j]],
      feeders: [label(r1[i]), label(r1[j])],
      hiSeed: r1[i].seeds?.[0],
    })
  })

  const a = winnerOf(csf[0])
  const b = winnerOf(csf[1])
  const cf = resolveSlot(series, 'CF', a ?? b, a, b, {
    conf,
    index: 0,
    from: csf,
    feeders: ['Conf. semifinal winner', 'Conf. semifinal winner'],
  })

  return { conf, seeds, r1, csf, cf, champion: cf.winner }
}

// The whole postseason: two conference brackets and the Finals between their champions.
// `playIn` carries seeds 7–10 of each conference for the play-in display.
export function buildBracket(games) {
  const byConf = conferenceStandings(games)
  const series = buildSeries(games)
  const projected = series.length === 0

  const E = buildConferenceBracket('E', byConf.E.slice(0, 8), series)
  const W = buildConferenceBracket('W', byConf.W.slice(0, 8), series)

  const a = E.champion
  const b = W.champion
  const final = resolveSlot(series, 'Final', a ?? b, a, b, {
    index: 0,
    from: [E.cf, W.cf],
    feeders: ['East champion', 'West champion'],
  })

  return {
    projected,
    conferences: { E, W },
    final,
    champion: final.winner,
    playIn: { E: byConf.E.slice(6, 10), W: byConf.W.slice(6, 10) },
    seeds: { E: byConf.E.slice(0, 8), W: byConf.W.slice(0, 8) },
  }
}

// ── Radial geometry ──────────────────────────────────────────────────────────
// Kept here rather than in the component so it can be tested without a DOM. The WHOLE
// bracket is one wheel: West fills the LEFT half, East fills the RIGHT half, and the two
// conference champions sit on either side of the Finals at the centre. Each side runs
// 8 seeds → 4 → 2 → 1, converging inward:
//
//   East seeds fan the right semicircle (+75°…−75°); West mirrors on the left
//   (105°…255°). A side's conference-final lands at 0° (East) / 180° (West), just off
//   centre; the Finals is the centre itself.

export const CENTER = 50
export const RING = { leaf: 45, r1: 34, csf: 23, cf: 12 }

// Seed order around a side, matching the fixed bracket: 1v8, 4v5 | 2v7, 3v6.
export const LEAF_SEEDS = [1, 8, 4, 5, 2, 7, 3, 6]

export const polar = (deg, r) => {
  const rad = (deg * Math.PI) / 180
  return { x: CENTER + r * Math.cos(rad), y: CENTER - r * Math.sin(rad) }
}

// Circular midpoint — a plain average breaks across the 180°/-180° seam.
export function midAngle(a, b) {
  const diff = ((b - a + 540) % 360) - 180
  return (a + diff / 2 + 360) % 360
}

const norm = (deg) => ((deg % 360) + 360) % 360
const LEAF_SPAN = 150 // degrees the eight seeds of one conference span
const LEAF_START = 75 // East's top seed at +75°, bottom at −75°; West mirrors

function sideLayout(side) {
  const step = LEAF_SPAN / 7
  // East runs +75°→−75° down the right side; West mirrors across the vertical axis.
  const place = (deg) => norm(side === 'W' ? 180 - deg : deg)
  const leaves = LEAF_SEEDS.map((seed, i) => ({
    seed,
    angle: place(LEAF_START - i * step),
    r: RING.leaf,
  }))
  const r1 = [0, 1, 2, 3].map((i) => ({
    angle: midAngle(leaves[i * 2].angle, leaves[i * 2 + 1].angle),
    r: RING.r1,
    children: [leaves[i * 2], leaves[i * 2 + 1]],
  }))
  const csf = [0, 1].map((i) => ({
    angle: midAngle(r1[i * 2].angle, r1[i * 2 + 1].angle),
    r: RING.csf,
    children: [r1[i * 2], r1[i * 2 + 1]],
  }))
  const cf = {
    angle: midAngle(csf[0].angle, csf[1].angle),
    r: RING.cf,
    children: [csf[0], csf[1]],
  }
  return { side, leaves, r1, csf, cf }
}

// The whole postseason as one wheel: West (left), East (right), Finals at the centre.
export function layout() {
  return { W: sideLayout('W'), E: sideLayout('E'), finals: { angle: 0, r: 0 } }
}
