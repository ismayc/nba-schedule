#!/usr/bin/env node
// Has the NBA published the NEXT season's regular-season schedule yet?
//
// The league posts the new schedule in mid-August, weeks before this app switches to it
// (fetch-schedule's defaultSeason() only rolls over in September). This tells us the day it
// lands, so the rollover is a decision rather than a discovery.
//
// ESPN names a season for its ENDING year: 2026-27 is season=2027.
//
// Node built-ins only, like every script here, so CI can run it on a bare checkout.
//
//   node scripts/check-new-season.mjs [--season 2027]
//
// Exit 0 always — "not yet" is a normal answer, not a failure. The workflow reads the
// `released` line from stdout rather than an exit code.

import { getJson } from './lib/fetch.mjs'

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'

const args = process.argv.slice(2)
const SEASON = Number(args[args.indexOf('--season') + 1]) || new Date().getFullYear() + 1

// A full NBA regular season. A count well under this means a staged release.
const FULL_SEASON_GAMES = 1230

// ESPN seasonType ids: 1 preseason, 2 regular, 3 postseason, 4 all-star, 5 play-in.
const REGULAR = '2'
const typeOf = (ev) => String(ev.seasonType?.id ?? ev.competitions?.[0]?.type?.id ?? '')

// The scoreboard caps a range query around 1000 events, so walk month by month rather than
// asking for the whole season at once and silently under-counting.
const MONTHS = [
  [`${SEASON - 1}1001`, `${SEASON - 1}1031`],
  [`${SEASON - 1}1101`, `${SEASON - 1}1130`],
  [`${SEASON - 1}1201`, `${SEASON - 1}1231`],
  [`${SEASON}0101`, `${SEASON}0131`],
  [`${SEASON}0201`, `${SEASON}0228`],
  [`${SEASON}0301`, `${SEASON}0331`],
  [`${SEASON}0401`, `${SEASON}0430`],
]

const games = new Map() // id → event, so an overlapping range can't double-count
for (const [from, to] of MONTHS) {
  const d = await getJson(`${SITE}/scoreboard?dates=${from}-${to}&limit=1000`)
  for (const ev of d.events || []) games.set(ev.id, ev)
}

const all = [...games.values()]
const regular = all.filter((ev) => typeOf(ev) === REGULAR).sort((a, b) => (a.date < b.date ? -1 : 1))
const preseason = all.filter((ev) => typeOf(ev) === '1')

const label = `${SEASON - 1}-${String(SEASON).slice(2)}`
const released = regular.length > 0
const partial = released && regular.length < FULL_SEASON_GAMES

// Consumed by the workflow via $GITHUB_OUTPUT, so keep these keys stable and single-line.
console.log(`released=${released}`)
console.log(`season=${label}`)
console.log(`year=${SEASON}`) // the ESPN season id, i.e. the ENDING year
console.log(`count=${regular.length}`)
console.log(`partial=${partial}`)

if (!released) {
  console.log(`summary=Not yet — no ${label} regular-season games posted (${preseason.length} preseason).`)
} else {
  const first = regular[0]
  const last = regular[regular.length - 1]
  const when = (ev) => ev.date.slice(0, 10)
  console.log(
    `summary=${label} schedule is OUT: ${regular.length} regular-season games` +
      `${partial ? ` (PARTIAL — a full season is ${FULL_SEASON_GAMES})` : ''}, ` +
      `opening ${when(first)} ${first.name}, through ${when(last)}.`
  )
}
