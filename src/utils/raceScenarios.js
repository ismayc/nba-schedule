// Late-season clinch scenarios — bounded exact enumeration over the remaining
// schedule, per conference. The win-bound ranges in standings.js treat rivals
// independently, so they can miss a clinch the SCHEDULE itself guarantees: two
// chasers who still play each other cannot both win out — one of them must eat a
// loss. This engine enumerates the remaining games among the chasers that could
// still matter and asks, outcome by outcome, whether enough rivals can actually
// finish ahead.
//
// Scope and honesty:
// - CLINCH side only (the play-in cut and the top-6 cut). The ✕ / elimination flags
//   stay purely arithmetic in standings.js so they never rest on an assumption.
// - A ONE-rival tie at the team's floor is resolved by the official two-team chain's
//   step 1 — head-to-head, fully known inside a scenario. A tie of TWO OR MORE
//   rivals forms a 3+-way group, and the NBA's multi-team chain leads with
//   division-leader status — which depends on games outside the enumeration — so
//   every rival in such a group is charged AGAINST the team. Conservative, never
//   wrong. (This is the one place the NBA engine differs from the WNBA sibling,
//   whose multi-team chain also leads with head-to-head.)
// - The engine only runs when the coupled schedule is small enough to enumerate
//   (budget gate) — exactly the late-season window where it is useful. Over budget
//   it returns null and the caller keeps the arithmetic verdict.

const isRemaining = (g) =>
  g.seasonType === 'regular' && !g.postponed && !g.canceled && !g.score

const isPlayed = (g) =>
  g.seasonType === 'regular' && !g.postponed && !g.canceled && !!g.score

// 2^18 coupled-game outcomes ≈ a quarter-million leaf evaluations — unnoticeable in
// the browser, and wide enough to cover roughly the last two weeks of chasers' games.
export const MAX_COUPLED_GAMES = 18

/**
 * Is `teamAbbr` guaranteed to finish inside the top `cut` of its conference, checked
 * by enumerating the remaining coupled schedule? Returns:
 *   true  — clinched: no enumerated outcome puts `cut` rivals at or above the team
 *   false — some outcome still catches the team
 *   null  — the coupled schedule is too large to enumerate (caller keeps its verdict)
 *
 * `rows` are the team's CONFERENCE rows carrying { abbr, w, gp }; `totals` is
 * scheduledGames(games).
 */
export function scenarioClinched(teamAbbr, rows, totals, games, cut, opts = {}) {
  const maxCoupled = opts.maxCoupled ?? MAX_COUPLED_GAMES
  const team = rows.find((r) => r.abbr === teamAbbr)
  const floor = team.w // the team loses out — the adversary controls its games too
  const remaining = games.filter(isRemaining)

  // Rivals already past the floor are ahead in every scenario (wins never come off).
  // Chasers are the rest that could still reach the floor with every remaining win;
  // anyone else can never catch the team's worst case and is irrelevant.
  let ahead0 = 0
  const chasers = new Set()
  for (const r of rows) {
    if (r.abbr === teamAbbr) continue
    if (r.w > floor) ahead0++
    else if (r.w + ((totals[r.abbr] ?? 0) - r.gp) >= floor) chasers.add(r.abbr)
  }
  if (ahead0 >= cut) return false // already caught, no enumeration needed

  // Contested games: both sides are chasers, so a win for one is a loss for the
  // other — the coupling the independent bounds cannot see. Every other remaining
  // game is handed to the chaser (adversary's choice), including games vs the team.
  const coupled = remaining.filter((g) => chasers.has(g.home) && chasers.has(g.away))
  if (coupled.length > maxCoupled) return null

  // Adversary-optimal base wins: every chaser wins all of its uncoupled games.
  const wins = new Map()
  for (const abbr of chasers) {
    const r = rows.find((x) => x.abbr === abbr)
    const uncoupled = remaining.filter(
      (g) =>
        (g.home === abbr || g.away === abbr) &&
        !(chasers.has(g.home) && chasers.has(g.away))
    ).length
    wins.set(abbr, r.w + uncoupled)
  }

  // Pairwise series ledger between the team and each chaser, for the two-team
  // chain's step 1: played games, plus the team's remaining games as losses.
  const pairVs = new Map() // chaser abbr → { team: wins, rival: wins }
  for (const g of games) {
    const opp =
      g.home === teamAbbr && chasers.has(g.away)
        ? g.away
        : g.away === teamAbbr && chasers.has(g.home)
          ? g.home
          : null
    if (!opp) continue
    const e = pairVs.get(opp) ?? { team: 0, rival: 0 }
    if (isPlayed(g)) {
      const winner = g.score[0] > g.score[1] ? g.home : g.away
      e[winner === teamAbbr ? 'team' : 'rival']++
    } else if (isRemaining(g)) {
      e.rival++ // the team loses out — its side of the pair game is a loss
    }
    pairVs.set(opp, e)
  }

  const caughtAtLeaf = () => {
    let ahead = ahead0
    const tied = []
    for (const abbr of chasers) {
      const w = wins.get(abbr)
      if (w > floor) ahead++
      else if (w === floor) tied.push(abbr)
    }
    if (ahead >= cut) return true
    if (!tied.length || ahead + tied.length < cut) return false
    if (tied.length === 1) {
      // Two-team tie: official step 1 is head-to-head, and the pair's whole series
      // is known here. The rival counts ahead unless the team strictly won it.
      const e = pairVs.get(tied[0])
      const safe = e && e.team > e.rival
      return ahead + (safe ? 0 : 1) >= cut
    }
    // Three-plus-way tie: the multi-team chain opens with division-leader status,
    // which the enumeration cannot see — charge every tied rival against the team.
    return ahead + tied.length >= cut
  }

  const catches = (depth) => {
    if (depth === coupled.length) return caughtAtLeaf()
    const g = coupled[depth]
    for (const homeWins of [true, false]) {
      const winner = homeWins ? g.home : g.away
      wins.set(winner, wins.get(winner) + 1)
      const caught = catches(depth + 1)
      wins.set(winner, wins.get(winner) - 1)
      if (caught) return true
    }
    return false
  }

  return !catches(0)
}
