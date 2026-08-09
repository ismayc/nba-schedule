# NEWS

A dated changelog for The NBA Schedule. Each heading is a calendar
day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

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
