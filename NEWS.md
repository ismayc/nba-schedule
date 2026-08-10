# NEWS

A dated changelog for The NBA Schedule. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

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
