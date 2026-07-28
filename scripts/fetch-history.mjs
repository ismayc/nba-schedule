#!/usr/bin/env node
// Builds src/data/history.js — one entry per completed season since the play-in took
// its current form.
//
// Node built-ins only (plus this repo's own pure modules), so the refresh workflow can
// run it on a bare checkout.
//
//   node scripts/fetch-history.mjs [--from 2021] [--to 2025]
//
// ESPN's `season` is the ENDING year, so 2021 = the 2020-21 season.
//
// WHY 2021 IS THE FLOOR: the play-in tournament reached its current shape — seeds 7–10,
// three single-elimination games per conference — in 2020-21. The 2020 Orlando restart
// ran a different, one-off qualifier (a 9th-place challenge for the 8 seed), and before
// that there was none at all. Older seasons would need a second format to be modelled,
// so this file deliberately starts where the current format does.
//
// WHAT IS COMMITTED, AND WHY IT IS SO SMALL: a full season is ~870KB of games, so five
// of them would quintuple the bundle. Instead each season keeps
//   · its final conference standings (the computed table, not a scraped one)
//   · its play-in and playoff GAMES only — ~91 rows
//   · its statistical leaders
// The bracket and the play-in ladder are then rebuilt at RUNTIME by the same
// buildBracket()/buildPlayIn() the current season uses, so a 2021 bracket and this
// season's bracket are the same code path rather than two renderers that can drift.
// Full box scores are not committed either: the game-detail modal already fetches those
// from ESPN by event id, and every historical game has one.

import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fetchTeams, fetchSchedule, fetchLeaders, seasonLabel } from './fetch-schedule.mjs'
import { conferenceStandings } from '../src/utils/standings.js'
import { SEASON } from '../src/data/teams.js'
import { buildBracket, buildPlayIn } from '../src/utils/bracket.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const flag = (name, fallback) => Number(args[args.indexOf(name) + 1]) || fallback
const FROM = flag('--from', 2021)
// Up to and including the season the app itself is on. A season still in progress has
// no champion, and summarise() drops it — so this can run any day of the year and the
// current season joins the archive by itself the week it finishes.
const TO = flag('--to', SEASON)

// Season averages worth keeping per season. The current season's Stats view has more
// categories; history keeps the ones that read as a season's story.
const LEADER_CATS = [
  { key: 'points', field: 'avgPoints', label: 'Points per game' },
  { key: 'rebounds', field: 'avgRebounds', label: 'Rebounds per game' },
  { key: 'assists', field: 'avgAssists', label: 'Assists per game' },
  { key: 'steals', field: 'avgSteals', label: 'Steals per game' },
  { key: 'blocks', field: 'avgBlocks', label: 'Blocks per game' },
  { key: 'threes', field: 'avgThreeMade', label: '3-pointers per game' },
]
const LEADERS_PER_CAT = 10

const round1 = (v) => (typeof v === 'number' ? Number(v.toFixed(1)) : null)
const round3 = (v) => (typeof v === 'number' ? Number(v.toFixed(3)) : null)

// The committed standings row: everything the history table shows, and everything
// buildBracket needs to seed a conference. `results` (a per-game array) and the resolved
// `team` object are dropped — the first is only used to derive the fields already here,
// the second is looked up from teams.js at render time.
const compactRow = (r) => ({
  abbr: r.abbr,
  seed: r.seed,
  w: r.w,
  l: r.l,
  pct: round3(r.pct),
  gb: r.gb,
  conf: [r.conf.w, r.conf.l],
  div: [r.div.w, r.div.l],
  home: [r.home.w, r.home.l],
  road: [r.road.w, r.road.l],
  // Last ten of the regular season, as a W-L pair rather than ten booleans.
  l10: [r.last10.filter(Boolean).length, r.last10.filter((x) => !x).length],
  streak: r.streak,
  pf: r.pf,
  pa: r.pa,
  diff: r.diff,
  netPpg: round1(r.netPpg),
  isDivLeader: r.isDivLeader || undefined,
})

// Play-in and playoff games only. Broadcast listings are dropped (a 2021 TV window is
// noise), and no line scores or leaders are fetched for them — the detail modal pulls
// the full box score from ESPN when a game is opened.
const compactGame = ({ broadcast, ...g }) => g

// A season is only worth committing once it's over: an unfinished postseason would
// freeze into the file as a permanently half-played bracket.
const isComplete = (bracket) => !!bracket.champion

function summarise(year, games, leaderRows) {
  const standings = conferenceStandings(games)
  const bracket = buildBracket(games)
  const playIn = buildPlayIn(games)

  const post = games
    .filter((g) => g.seasonType === 'playoffs' || g.seasonType === 'playin')
    .map(compactGame)

  const leaders = {}
  for (const cat of LEADER_CATS) {
    leaders[cat.key] = leaderRows
      .filter((p) => typeof p[cat.field] === 'number')
      .sort((a, b) => b[cat.field] - a[cat.field])
      .slice(0, LEADERS_PER_CAT)
      .map((p) => ({ name: p.name, short: p.short, team: p.team, pos: p.pos, v: p[cat.field] }))
  }

  return {
    year,
    label: seasonLabel(year),
    champion: bracket.champion,
    runnerUp: bracket.final.loser,
    // The teams that reached the field THROUGH the play-in, which is the whole reason
    // this file starts in 2021.
    viaPlayIn: {
      E: [playIn.E.seeds[7], playIn.E.seeds[8]].filter(Boolean),
      W: [playIn.W.seeds[7], playIn.W.seeds[8]].filter(Boolean),
    },
    standings: { E: standings.E.map(compactRow), W: standings.W.map(compactRow) },
    games: post,
    leaders,
    complete: isComplete(bracket),
  }
}

const serialiseSeason = (s) =>
  [
    `  {`,
    `    year: ${s.year},`,
    `    label: ${JSON.stringify(s.label)},`,
    `    champion: ${JSON.stringify(s.champion)},`,
    `    runnerUp: ${JSON.stringify(s.runnerUp)},`,
    `    viaPlayIn: ${JSON.stringify(s.viaPlayIn)},`,
    `    standings: {`,
    ...['E', 'W'].map(
      (c) =>
        `      ${c}: [\n` +
        s.standings[c].map((r) => `        ${JSON.stringify(r)},`).join('\n') +
        `\n      ],`
    ),
    `    },`,
    `    games: [`,
    ...s.games.map((g) => `      ${JSON.stringify(g)},`),
    `    ],`,
    `    leaders: {`,
    ...LEADER_CATS.map(
      (cat) =>
        `      ${cat.key}: [\n` +
        s.leaders[cat.key].map((p) => `        ${JSON.stringify(p)},`).join('\n') +
        `\n      ],`
    ),
    `    },`,
    `  },`,
  ].join('\n')

async function main() {
  if (FROM < 2021) throw new Error('the current play-in format starts at season 2021')
  if (TO < FROM) throw new Error(`--to ${TO} is before --from ${FROM}`)

  console.log(`Fetching teams…`)
  const teams = await fetchTeams()

  const seasons = []
  for (let year = TO; year >= FROM; year--) {
    console.log(`Season ${seasonLabel(year)}…`)
    const games = await fetchSchedule(teams, year)
    const leaderRows = await fetchLeaders(year)
    const s = summarise(year, games, leaderRows)

    if (!s.complete) {
      console.log(`  skipped — no champion yet (${games.length} games)`)
      continue
    }
    const pi = s.games.filter((g) => g.seasonType === 'playin').length
    console.log(
      `  ${games.length} games → ${s.games.length} postseason rows (${pi} play-in), ` +
        `champion ${s.champion}, play-in seeds ${[...s.viaPlayIn.E, ...s.viaPlayIn.W].join('/')}`
    )
    seasons.push(s)
  }

  const out =
    `// GENERATED by scripts/fetch-history.mjs — do not edit by hand.\n` +
    `// Source: https://site.api.espn.com/apis/site/v2/sports/basketball/nba\n\n` +
    `// Completed seasons since the play-in tournament took its current 7–10 format\n` +
    `// (2020-21). Each season carries its final conference standings, its play-in and\n` +
    `// playoff games, and its statistical leaders — the regular season's ~1,230 games\n` +
    `// are summarised into the standings rather than committed, which is what keeps\n` +
    `// five seasons to a couple of hundred KB. The bracket and play-in ladder are\n` +
    `// rebuilt from these games at runtime by the same code the current season uses.\n` +
    `export const HISTORY = [\n` +
    seasons.map(serialiseSeason).join('\n') +
    `\n]\n\n` +
    `export const HISTORY_BY_YEAR = Object.fromEntries(HISTORY.map((s) => [s.year, s]))\n\n` +
    `// Newest first — the order the season picker offers them in.\n` +
    `export const HISTORY_YEARS = HISTORY.map((s) => s.year)\n`

  await writeFile(join(ROOT, 'src/data/history.js'), out)
  console.log(`\nWrote src/data/history.js — ${seasons.length} seasons.`)
}

main().catch((err) => {
  console.error(`\nfetch-history failed:\n${err.message}`)
  process.exit(1)
})
