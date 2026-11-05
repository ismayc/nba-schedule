// Channels from NBA.com's schedule feed, for upcoming games ESPN has not listed yet.
//
// ESPN stays the source of record. ESPN often lists a game's channels only days ahead, while
// the league feed has them for the whole season. Its names are spelled differently ("KSBI
// OKC" for ESPN's "KSBI", "MNMT/Monumental+" for "MNMT"), so they go in their own display-only
// field, `leagueTv`, and never in `broadcast`. Merged into `broadcast`, they would add
// near-duplicates to the local-channel picker and hide these games under "On my services".
//
// The feed is optional. Every failure here returns null and the refresh carries on with the
// last committed values, so a refused request can neither fail a refresh nor churn the data.
//
// Chester chose this source on November 3, 2026, knowing that the feed answers only requests
// made to look like a browser and that nba.com's terms restrict use of its data. See
// sports-viewer-meta/scripts/probe-league-cdn.mjs for how the header set was established. A
// near-miss set gets HTTP 200 with an HTML error page, so only the parsed payload counts.
//
// It shells out to curl because the probe verified this exact request, and because fetch
// manages Accept-Encoding itself. Node built-ins only.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const FEED = 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json'

const HEADERS = [
  'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'Accept: */*',
  'Accept-Language: en-US,en;q=0.9',
  'Accept-Encoding: gzip, deflate, br',
  'Origin: https://www.nba.com',
  'Referer: https://www.nba.com/',
  'Connection: keep-alive',
  'Sec-Fetch-Dest: empty',
  'Sec-Fetch-Mode: cors',
  'Sec-Fetch-Site: same-site',
]

// The league's tricode where ESPN's abbreviation differs (checked November 5, 2026: all 1,079
// upcoming committed games joined with these six).
const TO_ESPN = { NYK: 'NY', SAS: 'SA', GSW: 'GS', NOP: 'NO', UTA: 'UTAH', WAS: 'WSH' }

// Minute-level tip plus both teams. A rescheduled game simply stops joining, which leaves it
// on "Channel TBA" rather than showing the old slot's channels.
const keyOf = (tip, away, home) => `${tip.slice(0, 16)} ${away} ${home}`

// National first, then the home feed, then the away feed. These key names are literal: there
// is no `nationalTvBroadcasters`, and reading that name returns a plausible nothing.
function channelNames(game) {
  const b = game.broadcasters ?? {}
  const entries = [
    ...(b.nationalBroadcasters ?? []),
    ...(b.homeTvBroadcasters ?? []),
    ...(b.awayTvBroadcasters ?? []),
  ]
  return [...new Set(entries.map((e) => e.broadcasterDisplay).filter(Boolean))]
}

/** The feed's JSON as a Map of game key to channel names. Throws on the wrong shape. */
export function parseLeagueFeed(json) {
  const dates = json?.leagueSchedule?.gameDates
  if (!Array.isArray(dates) || dates.length === 0) throw new Error('no leagueSchedule.gameDates')
  const channels = new Map()
  for (const date of dates) {
    for (const game of date.games ?? []) {
      const away = game.awayTeam?.teamTricode
      const home = game.homeTeam?.teamTricode
      const names = channelNames(game)
      if (!away || !home || !game.gameDateTimeUTC || !names.length) continue
      channels.set(keyOf(game.gameDateTimeUTC, TO_ESPN[away] ?? away, TO_ESPN[home] ?? home), names)
    }
  }
  return channels
}

/** `leagueTv` per game id from the committed schedule's source text. */
export function committedLeagueTv(source) {
  const known = new Map()
  for (const line of source.split('\n')) {
    const m = line.match(/^ {2}(\{"id".*\}),?$/)
    if (!m) continue
    try {
      const g = JSON.parse(m[1])
      if (g.leagueTv?.length) known.set(g.id, g.leagueTv)
    } catch {
      /* a line we can't parse simply isn't a source of truth */
    }
  }
  return known
}

/**
 * Sets `leagueTv` on each game ESPN lists no channel for, in place. `feed` is null when the
 * feed could not be read: committed values then stand. A finished game keeps its committed
 * value too, because the feed has no reason to be its record. Returns the number filled.
 */
export function applyLeagueChannels(games, feed, committed, now = new Date()) {
  let filled = 0
  for (const g of games) {
    if (g.broadcast?.length) continue
    const live = feed && !g.score && new Date(g.tip) > now
    const names = live ? feed.get(keyOf(g.tip, g.away, g.home)) : committed.get(g.id)
    if (names?.length) {
      g.leagueTv = names
      filled++
    }
  }
  return filled
}

/** The feed as a channel Map, or null after logging why it could not be read. */
export async function fetchLeagueChannels(run = promisify(execFile)) {
  const args = ['--silent', '--show-error', '--fail', '--http1.1', '--compressed', '--max-time', '30']
  for (const h of HEADERS) args.push('-H', h)
  try {
    const { stdout } = await run('curl', [...args, FEED], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    return parseLeagueFeed(JSON.parse(stdout))
  } catch (err) {
    console.warn(`  league channel feed unavailable, keeping committed values: ${String(err.message).split('\n')[0]}`)
    return null
  }
}
