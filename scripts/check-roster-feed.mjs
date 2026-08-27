#!/usr/bin/env node
// Has ESPN's team list for the COMMITTED season come back?
//
// On 2026-08-26 ESPN rebuilt its 2026-27 team collection and it went from 30 franchises
// to 12, where it stayed. fetch-schedule's roster guard refuses to publish that, so the
// twice-daily refresh has been failing ever since, correctly and by design. Nothing on
// our side can fix it and nothing needs to: the day ESPN finishes repopulating, the next
// refresh goes green on its own.
//
// The risk is the opposite one. A refresh that is EXPECTED to be red trains you to ignore
// it, so a different failure arriving later would sit unnoticed. This answers the one
// question that separates the two: would the roster guard pass right now?
//
// It asks by calling the refresh's own fetchTeams and applying the guard's own
// comparison, so the watch cannot drift from the thing it is watching.
//
// Node built-ins only, like every script here, so CI can run it on a bare checkout.
//
//   node scripts/check-roster-feed.mjs
//
// Exit 0 always: "still short" is a normal answer, not a failure. The workflow reads the
// `recovered` line from stdout rather than an exit code.

import { fetchTeams, seasonLabel } from './fetch-schedule.mjs'
import { SEASON, TEAMS } from '../src/data/teams.js'

// fetchTeams narrates what it drops ("ignored 1 non-franchise: LON"), which is worth
// having in the job log but must not reach stdout: the workflow tees stdout straight into
// $GITHUB_OUTPUT, where a line without an `=` is not a key/value pair. Send its notes to
// stderr for the duration, so this script's stdout carries only the output keys.
const stdoutLog = console.log
console.log = console.error
let teams
try {
  teams = await fetchTeams(SEASON)
} finally {
  console.log = stdoutLog
}

const fetched = new Set(teams.map((t) => t.abbr))
const committed = new Set(TEAMS.map((t) => t.abbr))
const missing = [...committed].filter((a) => !fetched.has(a))
const extra = [...fetched].filter((a) => !committed.has(a))
const recovered = !missing.length && !extra.length

const label = seasonLabel(SEASON)

// Consumed by the workflow via $GITHUB_OUTPUT, so keep these keys stable and single-line.
console.log(`recovered=${recovered}`)
console.log(`season=${label}`)
console.log(`count=${fetched.size}`)
console.log(`expected=${committed.size}`)

if (recovered) {
  console.log(
    `summary=ESPN's ${label} team list is whole again: all ${committed.size} franchises present. ` +
      `The refresh should go green on its next run.`
  )
} else {
  console.log(
    `summary=ESPN's ${label} team list is still short: ${fetched.size} of ${committed.size} franchises` +
      `${missing.length ? `, missing ${missing.join(' ')}` : ''}` +
      `${extra.length ? `, unexpected ${extra.join(' ')}` : ''}. ` +
      `A failing refresh is expected until this reads ${committed.size}.`
  )
}
