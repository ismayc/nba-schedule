# The NBA Schedule

[![CI](https://github.com/ismayc/nba-schedule/actions/workflows/ci.yml/badge.svg)](https://github.com/ismayc/nba-schedule/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/endpoint?url=https://ismayc.github.io/nba-schedule/coverage.json)](https://github.com/ismayc/nba-schedule/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

🔗 **Live:** [ismayc.github.io/nba-schedule](https://ismayc.github.io/nba-schedule/) ·
[the-nba-schedule.netlify.app](https://the-nba-schedule.netlify.app)

A React + Vite web app showing every game of the NBA season in **your** timezone —
with live scores, where to watch on your streaming services, conference standings, the
playoff bracket, and league leaders.

No backend, no API keys, no tracking. The whole app is a static bundle plus a committed
snapshot of the season.

---

## Views

| View | What it does |
|---|---|
| 📋 **Schedule** | Every game grouped by the calendar day *you* see, opening on today — previous days are hidden behind a toggle. Filter by team or by the teams you follow. |
| 📆 **Week** | A Sun–Sat grid you can page through, collapsing to a two-column agenda on a phone. |
| 📊 **Regular Season** | Both conference tables side by side, with the playoff cut and the play-in band marked. W/L, PCT, GB, home/road splits, last-10, streak, net rating. |
| 🏆 **Playoffs** | Two conference brackets (East and West) into the Finals, where each slot is a best-of-seven series. Projected from current seeding until the real field is set. |
| 🎯 **Radial** | The same brackets as concentric rings — one wheel per conference, seeds outside and the conference champion in the middle — flanking the Finals. |
| 📈 **Stats** | Season averages, league leaders across 8 categories, scoring margin, and the playoff race — by conference — with magic numbers. |

**Star a team** from any game card, standings row, or team panel to highlight it
across every view, filter the schedule to "My teams", and scope live alerts to it.
Clicking any team opens a **team panel** — splits, form, leading scorers, and what's
next. Each game card also flags **where to watch** — a 📺 badge naming the streaming
services that carry it (YouTube TV, Prime Video, Peacock). Plus: light/dark themes,
spoiler-free mode, shareable URLs, live alerts for notable moments, a game-detail modal
with a quarter line score, starting lineups, and season series, an auto-updating
`webcal://` **calendar subscription** (plus one-time `.ics` download, whole season or your
teams), and installable-PWA support.

## Data

Everything comes from ESPN's public, keyless, CORS-open feeds.

**The season is committed, not fetched.** `scripts/fetch-schedule.mjs` generates
`src/data/schedule.js`, `src/data/teams.js`, and `src/data/leaders.js`, and mirrors team
logos into `public/logos/`. The app therefore renders a complete season — including
every result so far — with **zero requests on load**. At runtime, ESPN's scoreboard is
polled only to overlay games that are live or just finished (every 30s while a game is
in progress, 2 min otherwise, never once the season ends).

That snapshot is refreshed twice daily by `.github/workflows/refresh-data.yml`, which
regenerates the data, runs the test suite against it, and opens a PR. Standings are
*derived* from the committed scores, so a bad refresh surfaces as a failing test rather
than a quietly wrong table.

> **NBA seasons span two calendar years, and ESPN keys them by the *ending* year.**
> `--season 2026` is the **2025-26** season; `--season 2027` is 2026-27. The committed
> data is the most recent complete season; swap seasons with a single
> `npm run fetch:schedule -- --season <year>`.

### Three feed quirks worth knowing

These are the difference between "looks about right" and matching the official
standings exactly:

1. **The NBA Cup championship is not a regular-season game.** The In-Season Tournament's
   group and knockout games all count toward the standings — *except* the championship,
   which is an 83rd game for the two finalists. It appears in the schedule feed like any
   other but is reclassified as `seasonType: 'cup'` and excluded. (Careful: the knockout
   round names "Quarterfinals"/"Semifinals" contain the substring "final", so only a
   headline containing "championship" is reclassified.)
2. **A postponed game appears twice** — the original slot *and* its makeup date, both
   live in the feed. The dead one is flagged and skipped.
3. **Broadcast data has two shapes.** The team-schedule feed uses `media.shortName`;
   the scoreboard uses `names[]`. Both are accepted.

With those handled, derived W-L, home/road splits, last-10, and streaks match ESPN's
published standings exactly for all 30 teams.

### Scoring frequency: why there are no per-basket events

The biggest structural difference from a soccer viewer. Goals are rare enough to
enumerate as events — scorer, minute, penalty — and a scoring table can be *derived*
from them. Basketball can't work that way: ~50 scoring plays per game, tens of thousands
across an 82-game, 1,230-game season.

So the model inverts. Games store a final score, and player leaderboards come from
**pre-aggregated season stat lines** rather than being summed from events. Two things
fill the gap that losing the event stream would otherwise leave:

- **Quarter line scores** are the analogue of a goal timeline. A final score of 112–104
  hides whether a team led by 20 or trailed all night; the quarter breakdown shows it,
  with the higher scorer of each quarter marked. Committed for every played game, and
  every one is asserted to sum to its final score.
- **Per-game leaders** (points/rebounds/assists) answer "who did it" without an event
  list. The game detail also fetches the **starting lineups** on demand.

Frequency also changes the *live* display. A soccer app can show a goal the moment it
lands and be right for the next ten minutes; a basketball score is stale within seconds.
So the live badge shows the **period** (`Q3`, `HALF`, `OT`) rather than a running game
clock, which would imply a precision a 30-second poll can't deliver. The exact feed
status stays in the tooltip.

And it rules out goal-style alerts. One notification per basket would fire ~50 times a
game. The 🔔 toggle instead surfaces the moments that change how a game *feels* —
tipoff, a lead change, a one-possession fourth quarter, and the final — detected by
diffing poll snapshots, so no play-by-play feed is needed. A close fourth quarter
alerts once on entering that state, not every 30 seconds while it holds, and a
buzzer-beater that both flips the lead and ends the game is reported as one moment
rather than three.

### Format notes

The NBA is conference-based, and a few details drive most of the app's playoff logic:

- **Seeding is per conference.** Each conference (East, West) seeds its own field; the
  top 8 make the playoffs. Two seeding tiebreakers depend on divisions, so all six
  divisions are modelled even though the standings display groups by conference.
- **Tiebreakers follow the NBA order:** winning percentage, then head-to-head, then a
  division leader over a non-leader, then division record, then conference record, then
  point differential. (The circular "record vs playoff teams" steps fall through to
  point differential — the deterministic tail.)
- **Seeds 7–10 play a play-in** to settle the 7 and 8 seeds; 1–6 are set outright.
- **A playoff slot is a series, not a game** — best-of-seven every round — and the
  bracket is *fixed by seed*: 1v8/4v5/2v7/3v6, no re-seeding. The two conference
  champions meet in the Finals.

## Develop

```bash
npm install
npm run dev              # local dev server
npm test                 # unit + render tests
npm run build            # production bundle
npm run coverage:badge   # tests with coverage, writes public/coverage.json

npm run fetch:schedule   # regenerate committed data from ESPN
npm run check:schedule   # report drift between committed data and the live feed
npm run verify:live      # check the live overlay's assumptions against a game in progress
```

`scripts/` uses **Node built-ins only** — no imports from `node_modules` — so CI can run
the data jobs on a bare checkout with no install step. A CI job enforces this.

### Testing approach

The suite leans on real data rather than hand-made fixtures, because real data contains
the edge cases you wouldn't think to invent.

- **Standings and tiebreakers** are checked against the committed 2025-26 season — the
  per-conference seeds are independently verifiable against ESPN's published standings.
- **The bracket** is tested against the committed 2025-26 postseason, reproducing the
  real two-conference outcome all the way to the Finals, plus a compact synthetic
  best-of-seven fixture (`test/fixtures/postseason.js`) for the series engine. Series are
  located by their play-in-immune higher seed, so a lower seed that advanced through the
  play-in (a 7-over-2 upset) still slots correctly.
- **Format invariants** that would otherwise depend on this week's results (like the
  tiebreaker order, or per-conference seeding) are tested with synthetic data that
  equalises everything above the step under test, so they don't break when standings
  shift.

Two things the suite structurally cannot close on committed data:

- The committed season is *complete*, so the "live overlay" tests assert the idle
  (season-over) path; a mid-season snapshot would re-assert active polling.
- The live overlay's field mapping was inferred from completed and scheduled games, and
  the tests mock ESPN using the same inferences — so they agree by construction.
  `npm run verify:live`, run while a game is actually in progress, is the only check that
  compares those assumptions to reality.

## Deploy

Built with `base: './'`, so the same `dist/` works at a domain root (Netlify) and under
a subpath (GitHub Pages `/nba-schedule/`) with no separate build.

- **GitHub Pages** deploys automatically from `ci.yml` on every push to `main`, gated on
  tests passing.
- **Netlify** deploys from the same workflow, but only once `NETLIFY_AUTH_TOKEN` is set
  as a repository secret (`NETLIFY_SITE_ID` is already stored as a repo variable). Until
  then that step is skipped and Netlify can be updated with
  `npx netlify-cli deploy --prod --dir dist`. The `webcal://` calendar feed is a Netlify
  function, so it only resolves on the Netlify host.

## Credits

Created by [Chester Ismay](https://chester.rbind.io). Source on
[GitHub](https://github.com/ismayc/nba-schedule).

Unofficial fan project. Not affiliated with, endorsed by, or sponsored by the NBA.
Team names and logos are trademarks of their respective owners. Schedule, results, and
player data via ESPN's public feeds.

MIT licensed.
