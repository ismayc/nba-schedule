// Standings, seeding, and playoff-race math — all pure functions over the merged
// game list, so they can be unit-tested with synthetic arrays and no DOM.

import { TEAMS, TEAM_BY_ABBR } from '../data/teams.js'

export const CONFERENCES = { E: 'Eastern Conference', W: 'Western Conference' }

// The NBA playoff field is CONFERENCE-BASED: the top 8 in each conference qualify
// (seeds 7–8 via a play-in among 7–10), each conference plays its own 1v8/4v5/2v7/3v6
// bracket, and the two conference champions meet in the Finals. Seeding is therefore
// PER CONFERENCE, not league-wide — the defining structural difference from the WNBA
// sibling this app was templated from.
//
// TODO(nba-playoffs): `seedings`/`playoffRace`/`buildBracket` below still carry the
// WNBA league-wide, single-8-team-bracket model. They need porting to the conference
// model above (per-conference seeds, play-in, two brackets → Finals, rounds
// R1/CSF/CF/Final) before the Playoffs view is correct. Until then the bracket is a
// known-wrong placeholder, deliberately not shipped as if it were right.
export const PLAYOFF_SPOTS = 8

// Conference assignment isn't in ESPN's team feed, so it lives here — the authoritative
// 30-team E/W split (matches the standings endpoint's grouping and adapters/nba.js).
export const CONFERENCE_BY_ABBR = {
  ATL: 'E', BKN: 'E', BOS: 'E', CHA: 'E', CHI: 'E', CLE: 'E', DET: 'E', IND: 'E',
  MIA: 'E', MIL: 'E', NY: 'E', ORL: 'E', PHI: 'E', TOR: 'E', WSH: 'E',
  DAL: 'W', DEN: 'W', GS: 'W', HOU: 'W', LAC: 'W', LAL: 'W', MEM: 'W', MIN: 'W',
  NO: 'W', OKC: 'W', PHX: 'W', POR: 'W', SA: 'W', SAC: 'W', UTAH: 'W',
}

// A game only counts toward the standings if it is a completed regular-season game.
// The Commissioner's Cup Championship and postponed shells are explicitly excluded —
// this is what makes derived records match the official ones exactly.
export const countsForStandings = (g) =>
  g.seasonType === 'regular' && !!g.score && !g.postponed && !g.canceled

const blankRecord = (abbr) => ({
  abbr,
  team: TEAM_BY_ABBR[abbr],
  w: 0,
  l: 0,
  pf: 0,
  pa: 0,
  home: { w: 0, l: 0 },
  road: { w: 0, l: 0 },
  conf: { w: 0, l: 0 },
  last10: [],
  streak: 0,
  results: [],
})

export function computeStandings(games) {
  const table = Object.fromEntries(TEAMS.map((t) => [t.abbr, blankRecord(t.abbr)]))

  const played = games.filter(countsForStandings).sort((a, b) => a.tip.localeCompare(b.tip))

  for (const g of played) {
    const [hs, as] = g.score
    const homeWon = hs > as
    const rows = [
      [table[g.home], homeWon, hs, as, 'home', g.away],
      [table[g.away], !homeWon, as, hs, 'road', g.home],
    ]
    for (const [row, won, pf, pa, side, opp] of rows) {
      if (!row) continue
      row[won ? 'w' : 'l']++
      row.pf += pf
      row.pa += pa
      row[side][won ? 'w' : 'l']++
      if (CONFERENCE_BY_ABBR[opp] === CONFERENCE_BY_ABBR[row.abbr]) row.conf[won ? 'w' : 'l']++
      row.results.push({ id: g.id, won, opp, side, pf, pa, tip: g.tip })
    }
  }

  for (const row of Object.values(table)) {
    row.gp = row.w + row.l
    row.pct = row.gp ? row.w / row.gp : 0
    row.diff = row.pf - row.pa
    row.ppg = row.gp ? row.pf / row.gp : 0
    row.oppPpg = row.gp ? row.pa / row.gp : 0
    row.netPpg = row.ppg - row.oppPpg
    row.last10 = row.results.slice(-10).map((r) => r.won)
    // Positive = win streak, negative = loss streak.
    row.streak = row.results.reduceRight((acc, r, i, arr) => {
      if (acc !== null) return acc
      const dir = r.won
      let n = 0
      for (let j = arr.length - 1; j >= 0 && arr[j].won === dir; j--) n++
      return dir ? n : -n
    }, null) ?? 0
  }

  return table
}

// Head-to-head win% between two teams, or null when they haven't met.
export function headToHead(games, a, b) {
  let aw = 0
  let bw = 0
  for (const g of games) {
    if (!countsForStandings(g)) continue
    const pair = [g.home, g.away]
    if (!pair.includes(a) || !pair.includes(b)) continue
    const winner = g.score[0] > g.score[1] ? g.home : g.away
    if (winner === a) aw++
    else bw++
  }
  if (!aw && !bw) return null
  return { aw, bw, pct: aw / (aw + bw) }
}

// NBA tiebreakers, in order: head-to-head win%, then win% against teams .500 or
// better, then point differential. (The official chain has further steps that have
// never been reached in practice.)
export function compareTeams(a, b, games, table) {
  if (b.pct !== a.pct) return b.pct - a.pct

  const h2h = headToHead(games, a.abbr, b.abbr)
  if (h2h && h2h.aw !== h2h.bw) return h2h.bw - h2h.aw

  const vsWinning = (row) => {
    const rel = row.results.filter((r) => (table[r.opp]?.pct ?? 0) >= 0.5)
    return rel.length ? rel.filter((r) => r.won).length / rel.length : 0
  }
  const va = vsWinning(a)
  const vb = vsWinning(b)
  if (va !== vb) return vb - va

  return b.diff - a.diff
}

// Games behind the leader: the standard (leadΔwins + leadΔlosses) / 2.
export const gamesBehind = (leader, row) =>
  ((leader.w - row.w) + (row.l - leader.l)) / 2

export function seedings(games) {
  const table = computeStandings(games)
  const rows = Object.values(table).sort((a, b) => compareTeams(a, b, games, table))
  const leader = rows[0]
  return rows.map((row, i) => ({
    ...row,
    seed: i + 1,
    gb: gamesBehind(leader, row),
    inPlayoffs: i < PLAYOFF_SPOTS,
  }))
}

export function conferenceStandings(games) {
  const seeded = seedings(games)
  const byConf = { E: [], W: [] }
  for (const row of seeded) byConf[CONFERENCE_BY_ABBR[row.abbr]]?.push(row)
  for (const conf of Object.keys(byConf)) {
    const leader = byConf[conf][0]
    byConf[conf] = byConf[conf].map((row, i) => ({
      ...row,
      confRank: i + 1,
      confGb: leader ? gamesBehind(leader, row) : 0,
    }))
  }
  return byConf
}

// ── Playoff race ─────────────────────────────────────────────────────────────
// Total regular-season games each team plays, from the schedule itself rather than a
// hard-coded 44 — expansion years and makeup games move this number.
export function scheduledGames(games) {
  const total = {}
  for (const g of games) {
    if (g.seasonType !== 'regular' || g.postponed || g.canceled) continue
    total[g.home] = (total[g.home] || 0) + 1
    total[g.away] = (total[g.away] || 0) + 1
  }
  return total
}

// Magic number to clinch a spot ahead of a chaser: the wins-plus-chaser-losses needed
// to make catching up arithmetically impossible. Null once already clinched.
export function magicNumber(row, chaser, totals) {
  const chaserRemaining = (totals[chaser.abbr] ?? 0) - chaser.gp
  const n = chaserRemaining - (row.w - chaser.w) + 1
  return n <= 0 ? null : n
}

export function playoffRace(games) {
  const seeded = seedings(games)
  const totals = scheduledGames(games)
  const cut = seeded[PLAYOFF_SPOTS - 1]
  const firstOut = seeded[PLAYOFF_SPOTS]

  return seeded.map((row) => {
    const remaining = (totals[row.abbr] ?? 0) - row.gp
    // Clinched when even losing out still leaves the 9th-place team short.
    const clinched = firstOut ? row.w > firstOut.w + ((totals[firstOut.abbr] ?? 0) - firstOut.gp) : false
    // Eliminated when winning out still cannot reach the current 8th seed.
    const eliminated = cut ? row.w + remaining < cut.w : false
    return {
      ...row,
      remaining,
      clinched,
      eliminated,
      gbCut: cut ? gamesBehind(cut, row) : 0,
      magic: row.inPlayoffs && firstOut && !clinched ? magicNumber(row, firstOut, totals) : null,
    }
  })
}
