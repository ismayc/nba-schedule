// Standings, seeding, and playoff-race math — all pure functions over the merged
// game list, so they can be unit-tested with synthetic arrays and no DOM.

import { TEAMS, TEAM_BY_ABBR } from '../data/teams.js'
import { scenarioClinched } from './raceScenarios.js'

export const CONFERENCES = { E: 'Eastern Conference', W: 'Western Conference' }

// The NBA playoff field is CONFERENCE-BASED: the top 8 in each conference qualify —
// seeds 1–6 outright, seeds 7–8 via a play-in among 7–10 — and each conference plays
// its own fixed 1v8/4v5/2v7/3v6 bracket to a conference champion; the two champions
// meet in the Finals. Seeding is therefore PER CONFERENCE, not league-wide. This is the
// defining structural difference from the WNBA sibling this app was templated from.
export const PLAYOFF_SPOTS = 8 // per conference
export const PLAYIN_SEEDS = [7, 8, 9, 10] // per conference; 7–8 host, 9–10 visit
export const PLAYOFF_SEEDS = 6 // seeds 1–6 skip the play-in and go straight to the bracket
const PLAYIN_CUT_SEED = PLAYIN_SEEDS[PLAYIN_SEEDS.length - 1] // 10 — last seed still alive

// Conference and division are not in ESPN's team feed, so they live here — the
// authoritative 30-team split (matches the standings endpoint's grouping).
export const CONFERENCE_BY_ABBR = {
  ATL: 'E', BKN: 'E', BOS: 'E', CHA: 'E', CHI: 'E', CLE: 'E', DET: 'E', IND: 'E',
  MIA: 'E', MIL: 'E', NY: 'E', ORL: 'E', PHI: 'E', TOR: 'E', WSH: 'E',
  DAL: 'W', DEN: 'W', GS: 'W', HOU: 'W', LAC: 'W', LAL: 'W', MEM: 'W', MIN: 'W',
  NO: 'W', OKC: 'W', PHX: 'W', POR: 'W', SA: 'W', SAC: 'W', UTAH: 'W',
}

export const DIVISIONS = {
  Atlantic: 'Atlantic', Central: 'Central', Southeast: 'Southeast',
  Northwest: 'Northwest', Pacific: 'Pacific', Southwest: 'Southwest',
}

// Division membership drives two NBA tiebreakers (division-leader status, division
// record), so it has to be modelled even though the app groups the standings display
// by conference rather than division.
export const DIVISION_BY_ABBR = {
  // Eastern
  BOS: 'Atlantic', BKN: 'Atlantic', NY: 'Atlantic', PHI: 'Atlantic', TOR: 'Atlantic',
  CHI: 'Central', CLE: 'Central', DET: 'Central', IND: 'Central', MIL: 'Central',
  ATL: 'Southeast', CHA: 'Southeast', MIA: 'Southeast', ORL: 'Southeast', WSH: 'Southeast',
  // Western
  DEN: 'Northwest', MIN: 'Northwest', OKC: 'Northwest', POR: 'Northwest', UTAH: 'Northwest',
  GS: 'Pacific', LAC: 'Pacific', LAL: 'Pacific', PHX: 'Pacific', SAC: 'Pacific',
  DAL: 'Southwest', HOU: 'Southwest', MEM: 'Southwest', NO: 'Southwest', SA: 'Southwest',
}

// A game only counts toward the standings if it is a completed regular-season game.
// The NBA Cup championship and postponed shells are explicitly excluded — this is what
// makes derived records match the official ones exactly.
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
  div: { w: 0, l: 0 },
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
      if (DIVISION_BY_ABBR[opp] === DIVISION_BY_ABBR[row.abbr]) row.div[won ? 'w' : 'l']++
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

const pctOf = (rec) => (rec.w + rec.l ? rec.w / (rec.w + rec.l) : 0)

// W-L against a set of opponent abbreviations, read from the per-game `results` a row
// already carries. Follows the file's pct convention: no games against the set → 0
// (in a real 82-game season every team meets every conference opponent, so the empty
// case only appears in synthetic mid-season fixtures).
const recordVs = (row, opponents) => {
  const rec = { w: 0, l: 0 }
  for (const r of row.results) if (opponents.has(r.opp)) rec[r.won ? 'w' : 'l']++
  return rec
}

const otherConf = (row) => (CONFERENCE_BY_ABBR[row.abbr] === 'E' ? 'W' : 'E')

// "Playoff-eligible" teams per conference, for the tiebreaker steps that compare
// records against them. INTERPRETATION: the official pre-play-in text reads "teams
// eligible for the playoffs … including teams that finished tied for a playoff
// position", and the league never restated it after the play-in arrived (2020). We
// read it as the top 10 of each conference (the play-in field) by winning percentage
// PLUS any team tied (equal pct) with the 10th. Eligibility is computed from raw pct
// ranking ONLY — no tiebreakers — because using tiebreakers to decide eligibility
// would make the tiebreakers that consume it circular.
export function playoffEligible(table) {
  const byConf = { E: [], W: [] }
  for (const row of Object.values(table)) byConf[CONFERENCE_BY_ABBR[row.abbr]]?.push(row)
  const out = {}
  for (const conf of Object.keys(byConf)) {
    const rows = byConf[conf].sort((a, b) => b.pct - a.pct)
    const cutPct = rows[PLAYIN_CUT_SEED - 1].pct
    out[conf] = new Set(
      rows.filter((r, i) => i < PLAYIN_CUT_SEED || r.pct === cutPct).map((r) => r.abbr)
    )
  }
  return out
}

// The two chain flavours. The official criteria for a DIVISION-TITLE tie are the same
// lists minus the division-leader step — that step would be circular while deciding
// who the division leader is.
const SEEDING_CHAIN = { divLeaderStep: true }
const DIVISION_TITLE_CHAIN = { divLeaderStep: false }

// Division leaders (the best record in each division) — a set of abbreviations.
// Official rule: a tie for a division title is broken BEFORE any other tie, in
// isolation, with the reduced chain; the outcome decides ONLY who the division winner
// is and is never reused for seeding — the conference tie groups below re-run their
// own chains from scratch (where the winner merely carries division-leader status).
export function divisionLeaders(table, games) {
  const byDiv = {}
  for (const row of Object.values(table)) {
    ;(byDiv[DIVISION_BY_ABBR[row.abbr]] ??= []).push(row)
  }
  // `leaders` stays empty during title resolution — the title chain never reads it.
  const ctx = { games, leaders: new Set(), eligible: playoffEligible(table) }
  const leaders = new Set()
  for (const rows of Object.values(byDiv)) {
    const best = Math.max(...rows.map((r) => r.pct))
    const tied = rows.filter((r) => r.pct === best)
    leaders.add(orderTied(tied, ctx, DIVISION_TITLE_CHAIN)[0].abbr)
  }
  return leaders
}

// The official TWO-team tiebreaker chain (verified 2026-08-08 against the NBA's
// published tiebreaker procedures). Negative → a ahead, positive → b ahead. Winning
// percentage itself is handled by the callers: it defines the tie groups
// (compareTeams checks it first). Steps are numbered by their official position.
function breakPair(a, b, ctx, chain) {
  // Two-team step 1: head-to-head winning percentage between the two — decisive only
  // when one of them won the season series.
  const h2h = headToHead(ctx.games, a.abbr, b.abbr)
  if (h2h && h2h.aw !== h2h.bw) return h2h.bw - h2h.aw

  // Two-team step 2: a division leader wins the tie over a non-leader — this applies
  // even when the two are in DIFFERENT divisions. Skipped for division-title ties.
  if (chain.divLeaderStep) {
    const al = ctx.leaders.has(a.abbr)
    const bl = ctx.leaders.has(b.abbr)
    if (al !== bl) return al ? -1 : 1
  }

  // Two-team step 3: division won-lost percentage — the official gate: this step
  // exists only when both teams are in the SAME division.
  if (DIVISION_BY_ABBR[a.abbr] === DIVISION_BY_ABBR[b.abbr] && pctOf(b.div) !== pctOf(a.div)) {
    return pctOf(b.div) - pctOf(a.div)
  }

  // Two-team step 4: conference won-lost percentage.
  if (pctOf(b.conf) !== pctOf(a.conf)) return pctOf(b.conf) - pctOf(a.conf)

  // Two-team step 5: W-L% against playoff-eligible teams in the team's OWN conference.
  const aOwn = pctOf(recordVs(a, ctx.eligible[CONFERENCE_BY_ABBR[a.abbr]]))
  const bOwn = pctOf(recordVs(b, ctx.eligible[CONFERENCE_BY_ABBR[b.abbr]]))
  if (aOwn !== bOwn) return bOwn - aOwn

  // Two-team step 6: W-L% against playoff-eligible teams in the OTHER conference.
  // This step exists only in the two-team chain — the multi-team chain officially
  // omits it.
  const aOther = pctOf(recordVs(a, ctx.eligible[otherConf(a)]))
  const bOther = pctOf(recordVs(b, ctx.eligible[otherConf(b)]))
  if (aOther !== bOther) return bOther - aOther

  // Two-team step 7: net points, all games.
  if (b.diff !== a.diff) return b.diff - a.diff

  // Official final fallback is a RANDOM DRAWING; we substitute deterministic
  // alphabetical order so seeding is reproducible — clearly a stand-in, not official.
  return a.abbr < b.abbr ? -1 : 1
}

// The official THREE-OR-MORE-team chain — a DIFFERENT list from the two-team chain,
// not a generalisation of it. Each entry yields a sortable key (higher = better) for
// one criterion; keys make multi-way separation and the restart rule direct.
function multiChainSteps(group, ctx, chain) {
  const steps = []
  // Multi step 1: division leader over non-leader (skipped for division-title ties).
  if (chain.divLeaderStep) steps.push((t) => (ctx.leaders.has(t.abbr) ? 1 : 0))
  // Multi step 2: winning percentage in games AMONG the tied teams.
  const tied = new Set(group.map((t) => t.abbr))
  steps.push((t) => pctOf(recordVs(t, tied)))
  // Multi step 3: division won-lost percentage — only if ALL tied teams share a
  // division (the official gate).
  if (group.every((t) => DIVISION_BY_ABBR[t.abbr] === DIVISION_BY_ABBR[group[0].abbr])) {
    steps.push((t) => pctOf(t.div))
  }
  // Multi step 4: conference won-lost percentage.
  steps.push((t) => pctOf(t.conf))
  // Multi step 5: W-L% vs playoff-eligible teams in the team's own conference. There
  // is NO other-conference step in the multi-team chain — that is the official list,
  // not an omission here.
  steps.push((t) => pctOf(recordVs(t, ctx.eligible[CONFERENCE_BY_ABBR[t.abbr]])))
  // Multi step 6: net points, all games.
  steps.push((t) => t.diff)
  return steps
}

// Order one exact-pct tie group by the official chain for its SIZE, with the official
// RESTART rule: the first criterion that creates differentiation splits the group,
// separated teams take their seeds, and any block still tied re-enters from step 1 of
// the chain appropriate to the block's NEW size — a 3-way tie collapsing to 2
// continues under the TWO-team chain from ITS step 1, not where the 3-way chain left
// off. Recursion terminates: a differentiating criterion always yields strictly
// smaller blocks, and an undifferentiated group falls to the deterministic stand-in.
function orderTied(group, ctx, chain) {
  if (group.length === 1) return group
  if (group.length === 2) {
    return breakPair(group[0], group[1], ctx, chain) <= 0 ? group : [group[1], group[0]]
  }
  for (const key of multiChainSteps(group, ctx, chain)) {
    const val = new Map(group.map((t) => [t.abbr, key(t)]))
    const distinct = [...new Set(val.values())]
    if (distinct.length === 1) continue // no differentiation — try the next criterion
    return distinct
      .sort((x, y) => y - x)
      .flatMap((v) => orderTied(group.filter((t) => val.get(t.abbr) === v), ctx, chain))
  }
  // Every multi-team criterion exhausted with the whole group still tied. Official:
  // random drawing — deterministic alphabetical stand-in.
  return [...group].sort((x, y) => (x.abbr < y.abbr ? -1 : 1))
}

// Backward-compatible pairwise comparator over the FULL official two-team chain.
// `table`, `divLeaders`, and `eligible` are derived on demand when not supplied, so
// existing callers that only hold `games` keep working. NOTE: correct only for
// comparing two teams — ordering a conference must go through the tie-GROUP resolver
// (conferenceStandings), because the multi-team chain is not pairwise-decomposable.
export function compareTeams(a, b, games, table, divLeaders, eligible) {
  const t = table ?? computeStandings(games)
  const ctx = {
    games,
    leaders: divLeaders ?? divisionLeaders(t, games),
    eligible: eligible ?? playoffEligible(t),
  }
  // Winning percentage is the standings order itself; exact ties fall to the chain.
  if (b.pct !== a.pct) return b.pct - a.pct
  return breakPair(a, b, ctx, SEEDING_CHAIN)
}

// Games behind the leader: the standard (leadΔwins + leadΔlosses) / 2.
export const gamesBehind = (leader, row) =>
  ((leader.w - row.w) + (row.l - leader.l)) / 2

// Seed every team within its own conference (1..15). inPlayoffs = top 8; playIn =
// seeds 7–10 (the play-in field). This is the NBA's real seeding — there is no
// meaningful league-wide seed, so there is no league-wide `seedings` export.
export function conferenceStandings(games) {
  const table = computeStandings(games)
  const divLeaders = divisionLeaders(table, games)
  const ctx = { games, leaders: divLeaders, eligible: playoffEligible(table) }

  const byConf = { E: [], W: [] }
  for (const row of Object.values(table)) byConf[CONFERENCE_BY_ABBR[row.abbr]]?.push(row)

  for (const conf of Object.keys(byConf)) {
    // Rank by winning percentage, then resolve each EXACT-pct tie GROUP with the
    // official chain for its size. Deliberately NOT a pairwise sort: the multi-team
    // chain (record among the tied, restarts) is not decomposable into pairwise
    // comparisons — three teams can legitimately order differently under the two
    // chains, so a comparator sort would seed them wrong.
    const byPct = [...byConf[conf]].sort((a, b) => b.pct - a.pct)
    const rows = []
    for (let i = 0; i < byPct.length; ) {
      let j = i + 1
      while (j < byPct.length && byPct[j].pct === byPct[i].pct) j++
      rows.push(...orderTied(byPct.slice(i, j), ctx, SEEDING_CHAIN))
      i = j
    }
    const leader = rows[0]
    byConf[conf] = rows.map((row, i) => ({
      ...row,
      seed: i + 1,
      confRank: i + 1,
      /* v8 ignore next -- `: 0` is unreachable: both conferences always contain teams, so `leader` is always defined */
      confGb: leader ? gamesBehind(leader, row) : 0,
      /* v8 ignore next -- `: 0` is unreachable: both conferences always contain teams, so `leader` is always defined */
      gb: leader ? gamesBehind(leader, row) : 0,
      inPlayoffs: i < PLAYOFF_SPOTS,
      playIn: i + 1 >= 7 && i + 1 <= 10,
      isDivLeader: divLeaders.has(row.abbr),
    }))
  }

  return byConf
}

// ── Playoff race ─────────────────────────────────────────────────────────────
// Total regular-season games each team plays, from the schedule itself rather than a
// hard-coded 82 — makeup games and cancellations move this number.
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

// Clinch/eliminate math, computed PER CONFERENCE (a team races its own conference, not
// the league). The elimination boundary is the PLAY-IN field — the top 10, not the top 8
// — because seeds 9 and 10 also play in and are not "out". Returns a flat list of every
// team with its conference seed and race status.

// The window of final CONFERENCE seeds still arithmetically open to each team, from
// win bounds alone: a rival can still finish ahead of you only if its ceiling (win
// out) reaches your floor (lose out). Ties are charged AGAINST the team for the worst
// bound and FOR it for the best bound, so the range is sound regardless of how
// tiebreakers fall — it may be conservative, never wrong. bestRank === worstRank
// therefore means the seed is truly locked.
// Season series ledger for every pair that has met or will meet: wins each way plus
// how many of their scheduled meetings are still unplayed. Keyed "A|B" with the abbrs
// sorted, so either team can look the pair up.
function seriesLedger(games) {
  const ledger = new Map()
  const at = (a, b) => {
    const key = [a, b].sort().join('|')
    let e = ledger.get(key)
    if (!e) ledger.set(key, (e = { wins: {}, remaining: 0 }))
    return e
  }
  for (const g of games) {
    if (g.seasonType !== 'regular' || g.postponed || g.canceled) continue
    const e = at(g.home, g.away)
    if (!g.score) e.remaining++
    else {
      const winner = g.score[0] > g.score[1] ? g.home : g.away
      e.wins[winner] = (e.wins[winner] ?? 0) + 1
    }
  }
  return ledger
}

// One refinement over pure arithmetic: a rival who can only TIE the floor (never
// strictly pass it) stops counting once the season series between the pair is complete
// and won — head-to-head is step 1 of the official TWO-team chain, so a banked series
// settles a two-team tie immutably. (A multi-way tie could still reorder via the
// division-leader-first multi-team chain — the exotic case this refinement accepts.)
// bestRank stays purely arithmetic, so elimination is never declared off a tiebreaker
// assumption. bestRank === worstRank therefore means the seed is truly locked.
export function seedRanges(rows, totals, games) {
  const ledger = seriesLedger(games)
  const bounds = rows.map((row) => ({
    abbr: row.abbr,
    floor: row.w,
    ceiling: row.w + ((totals[row.abbr] ?? 0) - row.gp),
  }))
  const out = {}
  for (const b of bounds) {
    let ahead = 0 // rivals guaranteed to finish strictly ahead
    let couldPass = 0 // rivals that could still finish ahead of (or tied with) us
    for (const r of bounds) {
      if (r.abbr === b.abbr) continue
      if (r.floor > b.ceiling) ahead++
      if (r.ceiling > b.floor) couldPass++
      else if (r.ceiling === b.floor) {
        // Tie-only threat: discounted when the pair's series is finished and ours.
        const e = ledger.get([b.abbr, r.abbr].sort().join('|'))
        const banked = e && e.remaining === 0 && (e.wins[b.abbr] ?? 0) > (e.wins[r.abbr] ?? 0)
        if (!banked) couldPass++
      }
    }
    out[b.abbr] = { bestRank: 1 + ahead, worstRank: 1 + couldPass }
  }
  return out
}

export function playoffRace(games) {
  const byConf = conferenceStandings(games)
  const totals = scheduledGames(games)
  const out = []

  for (const conf of ['E', 'W']) {
    const rows = byConf[conf]
    const cut = rows[PLAYIN_CUT_SEED - 1] // 10th seed — last team in the play-in field
    const firstOut = rows[PLAYIN_CUT_SEED] // 11th seed — first team out
    const ranges = seedRanges(rows, totals, games)

    for (const row of rows) {
      const remaining = (totals[row.abbr] ?? 0) - row.gp
      const { bestRank, worstRank } = ranges[row.abbr]
      // Range-derived race states — strictly stronger than comparing against the
      // current 11th/10th seed alone, and they compose into the play-in tiers:
      // clinched = no outcome leaves the team below the play-in cut; top-6 = skips
      // the play-in outright; lockedPlayin = the play-in is now the only path (safe
      // from 11th, but 7th is the best still reachable).
      const eliminated = bestRank > PLAYIN_CUT_SEED
      // Clinch flags: the win-bound ranges first (with banked head-to-head ties
      // discounted), then — once the coupled late-season schedule is enumerable —
      // the exact scenario check, which also sees that chasers who still play each
      // other can't all win out. Elimination stays purely arithmetic.
      const clinched =
        worstRank <= PLAYIN_CUT_SEED ||
        (!eliminated &&
          scenarioClinched(row.abbr, rows, totals, games, PLAYIN_CUT_SEED) === true)
      const clinchedTop6 =
        worstRank <= PLAYOFF_SEEDS ||
        (clinched && scenarioClinched(row.abbr, rows, totals, games, PLAYOFF_SEEDS) === true)
      const lockedPlayin = clinched && !clinchedTop6 && bestRank > PLAYOFF_SEEDS
      out.push({
        ...row,
        conf,
        remaining,
        bestRank,
        worstRank,
        clinched,
        eliminated,
        clinchedTop6,
        lockedPlayin,
        /* v8 ignore next -- `: 0` is unreachable: a 15-team conference always yields a 10th seed, so `cut` is always defined */
        gbCut: cut ? gamesBehind(cut, row) : 0,
        magic: row.seed <= PLAYIN_CUT_SEED && firstOut && !clinched ? magicNumber(row, firstOut, totals) : null,
      })
    }
  }

  return out
}
