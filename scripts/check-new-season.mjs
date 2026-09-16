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

import { getJson, mapLimit, CONCURRENCY } from './lib/fetch.mjs'
import { SEASON as COMMITTED_SEASON } from '../src/data/teams.js'

// site.web.api, not site.api — the latter 403s every request from a cloud IP.
// See the note in scripts/fetch-schedule.mjs.
const SITE = 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba'

const args = process.argv.slice(2)
// Watch for the season AFTER the committed one — calendar+1 re-detected the CURRENT
// season between its release and the following January (harmless thanks to the
// once-ever guards, but noisy: every daily run reported released=true).
const SEASON = Number(args[args.indexOf('--season') + 1]) || COMMITTED_SEASON + 1

// The complete INITIAL release. Since the NBA Cup era the league publishes 80 games
// per team (1200 games) in August; the Cup knockout rounds and each team's remaining
// games are scheduled in December after group play, growing the season to its full
// 1230. So 1200 is "complete" for release-day purposes — holding out for 1230 would
// report partial until December. (2026-27 released 2026-08-13 with exactly 1200 games
// on the team schedules; the scoreboard carried 1206.)
const INITIAL_RELEASE_GAMES = 1200

// ESPN season types: 1 preseason, 2 regular, 3 postseason. On the SCOREBOARD payload
// this lives only in ev.season.type — ev.seasonType does not exist here (it does on
// the team-schedule endpoint fetch-schedule.mjs uses, which is where the old
// discriminator was copied from), and competitions[0].type.id is the GAME-FORMAT
// type (1 = a standard game, even in April). Falling through to the format id is how
// the 2026-08-13 release was missed: all 1206 regular-season games counted as
// "preseason" and the watch stayed silent.
const REGULAR = 2
const typeOf = (ev) => Number(ev.season?.type ?? 0)

// ESPN dropped hyphenated date-range scoreboard queries in September 2026 (every
// `dates=A-B` now answers HTTP 400, even a same-day `A-A`), so count games one day at
// a time across the months a regular season spans. Expanding to days also removes the
// old ~1000-event range cap this used to work around.
const MONTHS = [
  [`${SEASON - 1}1001`, `${SEASON - 1}1031`],
  [`${SEASON - 1}1101`, `${SEASON - 1}1130`],
  [`${SEASON - 1}1201`, `${SEASON - 1}1231`],
  [`${SEASON}0101`, `${SEASON}0131`],
  [`${SEASON}0201`, `${SEASON}0228`],
  [`${SEASON}0301`, `${SEASON}0331`],
  [`${SEASON}0401`, `${SEASON}0430`],
]
const expandDays = (from, to) => {
  const at = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))
  const out = []
  for (let t = at(from); t <= at(to); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10).replaceAll('-', ''))
  }
  return out
}
const DAYS = MONTHS.flatMap(([from, to]) => expandDays(from, to))

// ESPN answers a scoreboard query for a season that does not exist yet with an
// HTTP 400 (it used to return 200 and an empty event list). That is exactly the
// "not published yet" signal this watch reports on, so a 400/404 on a window is
// treated as an empty month, not a failure. Anything else (a 403, a 5xx that
// outlasted the retries, a network error) is a real outage and still throws, so it
// stays visible rather than masquerading as "not yet" (see the 2026-08-16 note in
// new-season-watch.yml).
const NOT_YET = /\bHTTP 40[04]\b/

const games = new Map() // id → event, so overlapping days can't double-count
let daysMissing = 0
const pages = await mapLimit(DAYS, CONCURRENCY, async (day) => {
  try {
    return await getJson(`${SITE}/scoreboard?dates=${day}&limit=1000`)
  } catch (err) {
    if (!NOT_YET.test(err.message)) throw err
    daysMissing++
    return null
  }
})
for (const d of pages) for (const ev of d?.events || []) games.set(ev.id, ev)
if (daysMissing) {
  console.error(`Note: ${daysMissing}/${DAYS.length} scoreboard days returned no season (HTTP 400/404), which is expected before the schedule is posted.`)
}

const all = [...games.values()]
const regular = all.filter((ev) => typeOf(ev) === REGULAR).sort((a, b) => (a.date < b.date ? -1 : 1))
const preseason = all.filter((ev) => typeOf(ev) === 1)

const label = `${SEASON - 1}-${String(SEASON).slice(2)}`
const released = regular.length > 0
const partial = released && regular.length < INITIAL_RELEASE_GAMES

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
      `${partial ? ` (PARTIAL — a complete initial release is ${INITIAL_RELEASE_GAMES})` : ''}, ` +
      `opening ${when(first)} ${first.name}, through ${when(last)}.`
  )
}
