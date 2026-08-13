# NEWS

A dated changelog for The NBA Schedule. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-08-13

- **CI's concurrency group no longer lets a PR branch cancel main's runs.** The
  whole CI workflow (including `pull_request` runs) shared one static `pages`
  group, and GitHub keeps only one pending run per group, each new arrival
  cancelling the previous pending one — invisible until today, when the repo had
  its first busy PR (the rollover) and main's CI runs kept dying "cancelled"
  before their deploy could start. CI now groups per ref, refresh-data got its
  own group, and the only genuinely shared lock — the Pages deploy — moved to a
  job-level `pages` group on both deploy jobs.
- **The season watch missed the release — detector fixed.** The 2026-27
  schedule dropped today and every watch run (including the release-day burst)
  reported "not yet": the check read `ev.seasonType?.id` — which does not exist
  on the scoreboard payload — and fell through to `competitions[0].type.id`,
  the *game-format* type (1 = a standard game, even in April), so all 1206
  posted regular-season games were counted as preseason. The discriminator had
  been copied from `fetch-schedule.mjs`, whose team-schedule endpoint really
  does carry `ev.seasonType`. The check now reads `ev.season.type`, the field
  the scoreboard actually provides. Verified live: `released=true, count=1206`.
- **The completeness floor now matches the Cup-era initial release.** The
  league publishes 80 games per team (1200) in August and schedules the Cup
  knockout rounds plus each team's remaining games in December — so holding out
  for the full 1230 would have reported "partial" (issue only, no rollover PR)
  until December. A release of 1200+ now counts as complete.
- The rollover itself was done by hand today on the `season-2026-27` branch
  (draft PR #3), since the watch had missed its moment.

## 2026-08-12

- **The season watch now runs just after the league's 3 pm ET release slot.**
  The daily cron moved from 11:05 am ET to 3:05 pm ET, and a release-day burst
  polls every 10 minutes from 3:00 to 7:50 pm ET on Aug 13 — the 2026-27
  schedule drops at 3 pm ET that day, GitHub's scheduler routinely delays a
  single cron by up to an hour, and ESPN takes a while to ingest the release
  (today it posted the 80-game marquee slate hours after the morning watch had
  already reported "not yet"). A concurrency group queues bunched-up runs so
  the once-ever issue/branch guards can't race.

## 2026-08-11

- **A daily watch for next season's schedule.** The NBA posts it in mid-August,
  weeks before this app rolls over (`defaultSeason()` only switches in
  September), so `scripts/check-new-season.mjs` and a `New season watch` workflow
  check each morning and open an issue the day it lands. Quiet otherwise — a
  "not yet" run writes one line to the job summary and nothing else, and the
  issue search covers closed issues so it can only ever file once per season.

  It lives in Actions rather than a scheduled cloud agent because ESPN is not
  reachable from that sandbox — its egress proxy answers `EGRESS_BLOCKED` for
  `site.api.espn.com`. GitHub's runners reach it fine, as the twice-daily
  refresh already proves.

- **The watch now drafts the rollover PR too.** On a complete release it also
  branches `season-<label>`, runs `fetch-history.mjs` (archiving the finished
  season while `teams.js` still names it) then
  `fetch-schedule.mjs --season <year> --allow-shrink`, and opens a **draft** PR —
  the mechanical half of the rollover done, leaving the judgement half. A
  *partial* release only files the issue and waits, so a staged schedule can
  never commit half a season. One PR per season ever: an existing branch, open
  or merged or abandoned, stops it. Expect the suite to fail on that branch —
  the pinned data tests are the annual chore, not a regression.

## 2026-08-10

- **League leaders now use the NBA's published qualification minimums.** The
  per-game boards ranked anyone with a stat line, so 2025-26's rebounding
  leaders read Jokić, Towns, Clingan, Wembanyama, Gobert, then Sabonis (19
  games), Davis (20) and Edey (11) — and the steals board was topped by Kadary
  Richmond at 2.7 in *three* games. The percentage boards had their own version
  of the problem: they qualified on attempts per game, so a 46-game Jakob Poeltl
  led FG% and a 37-game Tidjane Salaun made the 3P% board.

  `leaderboard()` now applies the real minimums, as published at
  basketball-reference.com/about/rate_stat_req.html for 2021-22 onward: **58
  games** for a per-game average, **300 made field goals** for FG%, **82 made
  threes** for 3P%. Each is scaled by how much of the season has been played
  (capped at a full 82), so a board in December ranks who has been available
  instead of sitting empty until March.

  Verified across all six archived seasons × seven categories: **40 of 42 boards
  now reproduce Basketball-Reference's published leaders exactly, in order.**
  The two that don't are both blocks boards where BBRef lists a player below its
  own stated 58-game minimum — 2024-25 Wembanyama (46 games) and 2020-21 Myles
  Turner (47) — and BBRef is not self-consistent there, since the same 2024-25
  board omits Anthony Davis at 51 games and 112 blocks. We follow the documented
  rule.

  Note that this deliberately will *not* match BBRef during a season in
  progress: their in-season leaders page applies no games minimum at all (their
  2026 WNBA points board currently ranks a 16-game player third).
- **Leaders show the team(s) a player actually played for that season.** ESPN
  answers a season-scoped stats query with the player's *current* club, and only
  for players who later moved — Anthony Davis played 20 games for Dallas and
  read as a Wizard, Walker Kessler as a Laker. The fetch now takes season
  membership from the per-team splits, which are chronological and carry the
  games with each, so a traded player carries a badge per club, oldest first
  (Zubac: LAC 43 → IND 5, verified against Basketball-Reference). Archived
  History boards carry the same field and show badges for the first time — they
  previously hid them because the data was anachronistic.
- **Per-game averages are shown at two decimals, and sorted at four.** ESPN
  publishes them at full precision (Dončić 33.484375 PPG) and the boards sort on
  the stored value, so one decimal was manufacturing ties and breaking them
  alphabetically: 16 ties across the five per-game top tens, against two at 2dp.
  Jokić now reads 12.86 RPG rather than a shared-looking 12.9. The two decimals
  behind the display are never shown; they exist so a pair that reads the same
  still sorts in the right order — which is how Basketball-Reference orders its
  own boards (2023-24's Wembanyama and Capela both show 10.63, and 10.6338 vs
  10.6301 is why Wembanyama is listed first).
- **The refresh gate is now CI's own gate.** The twice-daily refresh ran plain
  `npm test` before committing, but a bot push triggers no CI — so refreshed
  data could break the 100% coverage invariant invisibly until the next human
  push (exactly what happened with the WNBA race engine this morning). The
  refresh workflow now runs the same coverage command CI runs.
- **The ESPN fetch layer is now vendored, not copy-pasted.** The hardened
  transport (5 retries with exponential backoff + jitter, retry only on
  5xx/429/network errors, a 6-request concurrency cap) previously lived as an
  inline copy in each data script; it now lives in `scripts/lib/fetch.mjs`,
  vendored byte-for-byte from the canonical copy in `sports-viewer-meta`
  (which diffs every repo's copy via `check-fetch-sync`). No behavior change
  to the refresh pipeline.

## 2026-08-09

- **All-Star weekend is on the schedule.** The 2026 mini-tournament (Team
  Stars / Team Stripes / World, three round-robin games and a championship)
  never appeared: the drafted sides aren't franchises, so the per-team
  schedule fetch can't see them, and a month-wide scoreboard query silently
  truncated at its event cap before mid-February. The fetch now pulls the
  All-Star-break window explicitly, and the UI gained the WNBA sibling's
  event treatment — gold event cards with drafted-side names, a compact
  week-strip row, and a detail modal with no Matchup tab (the sides aren't
  in the standings) that surfaces the injury report beside the box score.
- **Refresh hardening: logo retries + a self-naming season.** Logo mirroring
  now uses the same retry/backoff and concurrency cap as every data call (the
  WNBA lost a whole refresh to one transient logo fetch), and the season
  number derives from the date — rolling to the upcoming season each
  September — instead of a hardcoded `--season 2026` that would silently
  refresh the archived season forever.
- **Live window anchors on the Eastern day.** The scoreboard poll's three-day
  window was computed in UTC, but ESPN buckets `dates=` by the US-Eastern day —
  every US evening the window slid to {today, +1, +2} and dropped yesterday's
  finals from the overlay. The window now converts each offset to its Eastern
  day.
- **Leaderboards now cover all 578 qualified players.** The `byathlete` feed
  paginates at 300 and `fetchLeaders` read only page 1, so 278 players were
  missing from the committed pool — including the real FG% leaders (Poeltl
  70.0 tops the 2025-26 archive board now; Lively 74.7 and Allen 70.6 head
  the earlier seasons, matching the record). The fetch follows
  `pagination.pages`, resolves each stat by category NAME per athlete (the
  positional category read was one missing category away from misreading
  every column), and `leaders.js` plus all six archived seasons are
  regenerated.
- **Live scores no longer count as final.** The live overlay's provisional
  score was being banked everywhere a result matters: standings absorbed
  in-progress leads, the bracket could crown a series winner mid-game, the
  race engine treated a live head-to-head as settled, and the season's last
  game going live read as "season over" — killing the live polling exactly
  when it mattered. Every consumer now requires score-and-not-live (the
  soccer viewers' provisional-score convention). The refresh script's
  box-score enrichment gets the same guard: only completed scoreboard events
  contribute line scores and star leaders (the WNBA sibling caught a partial
  mid-game line attaching to a final score today).

- **Sharper clinch math: banked ties + a late-season scenario engine.** A
  chaser who can only TIE a team's lose-out floor stops counting once their
  season series is finished and won (head-to-head leads the two-team chain);
  and once the remaining coupled schedule is enumerable, a scenario engine
  checks every outcome — chasers who still play each other can't all win out —
  upgrading both the play-in and top-6 clinches. Three-plus-way floor ties stay
  charged (the NBA's multi-team chain opens with division-leader status, which
  a scenario can't know). Elimination stays purely arithmetic.

## 2026-08-08

- **Official tiebreakers, play-in tiers, and a Finish column.** Conference
  seeding now applies the NBA's official tiebreak criteria exactly — the
  seven-step two-team chain and the DIFFERENT six-step multi-team chain (with
  its restart rule and isolated division-title ties), including the records-vs-
  playoff-eligible-teams steps; "playoff-eligible" is read as the top 10 plus
  ties, documented as the play-in-era interpretation. The race badges grew
  tiers — ✓ top 6 (skips the play-in), amber play-in lock, bare ✓, ✕ — and
  every row shows a **Finish** range of the seeds still arithmetically open.
- **Standings legend.** The Regular Season tab now spells out its markers below
  the tables — ✓ clinched at least a play-in berth (top-10 guaranteed),
  ✕ eliminated (row dims), ★ a followed team — instead of relying on hover-only
  tooltips. The ✓ tooltip itself now says "play-in berth" rather than
  overclaiming a playoff spot.
- **Condensed view strip.** Once the tab nav scrolls out of view, a slim fixed
  strip pins to the top showing the current view; tapping it drops down the
  full tab set, so switching views never means scrolling back to the top.
  The sticky filter bar and month jump-bar offset beneath it, and jump/landing scrolls reserve for its height.
  Rolled out family-wide.
- **Changelog started.** Earlier history lives in the git log.
