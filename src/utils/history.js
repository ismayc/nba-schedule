// Derivations over the archived seasons in data/history.js.
//
// Nothing here is committed: every season ships its final standings and its postseason
// games, and the bracket, the ladder, and the runs below are all recomputed from those
// by the same functions the current season uses. That is deliberate — an archived
// bracket that renders through a second, "historical" code path is a bracket that can
// silently disagree with the live one.

import { buildBracket, buildPlayIn } from './bracket.js'

// Rebuild one archived season. Seeding comes from the committed standings, since a
// historical season carries no regular-season games to derive it from.
export function seasonBracket(season) {
  return buildBracket(season.games, season.standings)
}

export const seasonPlayIn = (season) => buildPlayIn(season.games)

// Deepest round first: the first round a team appears in, scanning this way, is the
// furthest it reached — and since the champion is handled separately, it's the round
// they went out in.
const EXITS = [
  ['Final', 'Lost the Finals'],
  ['CF', 'Lost the conference finals'],
  ['CSF', 'Lost the conference semifinals'],
  ['R1', 'Lost in the first round'],
]

// How far a team went that season, as a label. Returns null for a team that never
// reached the bracket at all (a play-in side that lost its way out).
export function runResult(bracket, abbr) {
  if (!abbr) return null
  if (bracket.champion === abbr) return 'Won the title'

  const slotsByRound = {
    Final: [bracket.final],
    CF: [bracket.conferences.E.cf, bracket.conferences.W.cf],
    CSF: [...bracket.conferences.E.csf, ...bracket.conferences.W.csf],
    R1: [...bracket.conferences.E.r1, ...bracket.conferences.W.r1],
  }

  for (const [round, label] of EXITS) {
    if (slotsByRound[round].some((s) => s.teams.includes(abbr))) return label
  }
  return null
}

// How a team came through the play-in: winning 7v8 outright, or taking the 8 seed from
// either side of the ladder. The route matters — a team that lost 7v8 and then won the
// 8th-seed game had two chances; one that came up through 9v10 had none to spare.
export function playInPath(conf, abbr) {
  if (conf.seeds[7] === abbr) return 'Won the 7/8 game'
  if (conf.seeds[8] !== abbr) return null
  const sevenEight = conf.games.find((g) => g.slot === '7v8')
  return sevenEight?.loser === abbr
    ? 'Lost the 7/8 game, then won the 8th-seed game'
    : 'Won the 9/10 game, then the 8th-seed game'
}

// One row per team that reached the playoffs through the play-in, newest season first —
// the table that only exists because this app archives seasons from 2020-21, the year
// the format settled.
export function playInQualifiers(seasons) {
  const rows = []
  for (const season of seasons) {
    const bracket = seasonBracket(season)
    const playIn = seasonPlayIn(season)
    for (const conf of ['E', 'W']) {
      for (const seed of [7, 8]) {
        const abbr = playIn[conf].seeds[seed]
        if (!abbr) continue
        rows.push({
          year: season.year,
          label: season.label,
          conf,
          seed,
          abbr,
          path: playInPath(playIn[conf], abbr),
          // Never null here: holding the 7 or 8 seed means being in that conference's
          // first round, in a bracket built from these same games.
          result: runResult(bracket, abbr),
          champion: bracket.champion === abbr,
        })
      }
    }
  }
  return rows
}

// The Finals line for a season: who won, over whom, in how many games.
export function finalsSummary(season) {
  const bracket = seasonBracket(season)
  const { final } = bracket
  const winner = final.winner
  const loser = final.loser
  return {
    winner,
    loser,
    wins: winner ? [final.wins[winner], final.wins[loser]] : null,
  }
}

/**
 * One archived team's row in the shape the team panel expects.
 *
 * The panel is built for the live season, where every figure comes from the game
 * list. A finished season commits its standings as numbers instead (the ~1,230
 * regular-season games are summarised, not stored), so the same fields are
 * rebuilt from those: per-game scoring from points for/against, the home and
 * road splits from their compact [w, l] pairs.
 *
 * `results` is deliberately empty — the archive has no per-game regular-season
 * record, so there is no honest "last 10" to draw, and the panel omits that
 * section rather than inventing one from the play-off games it does hold.
 * `remaining` is 0 for the same reason it is true: the season is over.
 */
export function seasonTeamRow(season, abbr) {
  if (!season || !abbr) return null
  const row = Object.values(season.standings).flat().find((r) => r.abbr === abbr)
  if (!row) return null
  const gp = row.w + row.l
  const pair = ([w, l]) => ({ w, l })
  return {
    ...row,
    gp,
    ppg: gp ? row.pf / gp : 0,
    oppPpg: gp ? row.pa / gp : 0,
    netPpg: row.netPpg,
    home: pair(row.home),
    road: pair(row.road),
    remaining: 0,
    results: [],
    // A finished season has no race left to run, so neither badge applies.
    clinched: false,
    eliminated: false,
  }
}

/** That season's players, ordered for the panel's leading-scorers list. */
export function seasonPlayers(season) {
  return season?.players ? Object.values(season.players) : []
}
