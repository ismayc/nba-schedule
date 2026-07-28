# the-nba-schedule — build notes

The 6th app in the sports-viewer family, scaffolded from `the-wnba-schedule` (the closest
sibling: basketball, quarter line scores, series bracket). Started 2026-07-20.

## Season convention

ESPN's NBA `season` is the **ending** year: `season=2026` = the **2025-26** season;
`season=2027` = the **2026-27** season (not posted yet — returns 0 events).

The committed data is the **completed 2025-26 season** (`fetch:schedule --season 2026`),
so the app is fully populated, testable, and demoable now. When the 2026-27 schedule
posts, switch with one command:

```bash
node scripts/fetch-schedule.mjs --season 2027   # regenerates teams/schedule/leaders/logos
```

(and bump `--season 2027` in package.json's `fetch:schedule`/`check:schedule`).

## Done

- **Repo scaffolded** from the WNBA snapshot; identity fully substituted (WNBA→NBA:
  storage keys `nba:*`, ESPN paths `basketball/nba`, `.ics` domain, repo/URL strings).
- **Real 2025-26 data generated**: `src/data/{teams,schedule,leaders}.js` — 30 teams,
  1320 games (1234 regular + 1 NBA Cup championship + 85 playoffs), 1316 with quarter
  line scores, 300 qualified players. 60 team logos mirrored to `public/logos/`.
- **`scripts/fetch-schedule.mjs` adapted for NBA**: `basketball/nba` feeds, NBA playoff
  headline parsing (`West 1st Round`/`Semifinals`/`Finals`, `NBA Finals`), NBA Cup
  championship exclusion (careful: "Quarter/Semifinals" contain "final"), `SEASON_LABEL`.
- **App builds** (`npm run build`). Header shows the `2025-26` label.
- **Correct 30-team `CONFERENCE_BY_ABBR`** (E/W) wired into `src/utils/standings.js`.
- Carried over from WNBA: calendar Netlify function, CI/node-guard/refresh workflows,
  netlify.toml, PWA manifest, the `Lineups` game-detail panel (summary URL now `nba`).

## Playoff model + tiebreakers — DONE (conference-based)

`standings.js` and `bracket.js` were ported from the WNBA league-wide, single-8-team model
to the real NBA conference model, verified against the committed 2025-26 postseason:

- **Per-conference seeding.** `conferenceStandings(games)` → `{ E:[15], W:[15] }`, each
  seeded 1–15 within its conference; top 8 make the field, seeds 7–10 are the play-in.
  `playoffRace` computes clinch/eliminate per conference.
- **NBA tiebreakers**, in official order: win% → head-to-head → division-leader-over-
  non-leader → division record (same division) → conference record → point differential,
  with a deterministic alphabetical tail. All 6 divisions are modelled
  (`DIVISION_BY_ABBR`). The circular "record vs playoff teams" steps fall through to point
  differential — documented, not silently dropped (cf. the NFL common-games note).
- **Two-conference bracket + play-in.** `buildBracket` builds East and West brackets
  (1v8/4v5/2v7/3v6 → CSF → CF, all best-of-7) into the NBA Finals. Real series are located
  by their **play-in-immune higher seed**, so a 7-over-2 upset resolves correctly. Verified:
  East champ NY, West champ SA, champion NY. `Bracket.jsx` renders two conference fans +
  the Finals; `RadialBracket.jsx` renders two conference wheels flanking the Finals.
- **Tests: 273/273 pass** (19 files); `npm run build` clean.

## Play-in tournament — DONE (2026-07-27)

The six play-in games were **missing from the committed data entirely**. ESPN files them
under their own season type — `seasontype=5`, *not* the postseason `3` — so fetching only
`[2, 3]` silently dropped them; the round parser already had a `PI` pattern that could
never fire. Fixed end to end:

- **Fetch** (`fetch-schedule.mjs`): season type `5` → `seasonType: 'playin'`, and the
  headline (`NBA Play-In - East - 9th Place vs 10th Place`) parses into
  `piSlot: '7v8' | '9v10' | '8seed'`. The slot has to be parsed, not inferred from dates:
  the conferences interleave, so East's 9v10 can tip before West's 7v8.
  `check-schedule.mjs` fetches `5` too, or the new games read as drift.
- **Model** (`utils/bracket.js`): `buildPlayIn(games)` → per conference the three games in
  ladder order, the seeds they settled, and who was eliminated. These are single games,
  not series, so they deliberately don't go through `buildSeries`.
- **UI**: a `Play-In Tournament` card below the bracket — each game with its score, the
  seed it produced, and the eliminations, clickable through to the game detail. It
  replaces the projected 7–10 field listing once real games exist.
- **Elsewhere**: a `⚡ Play-In` phase chip on the schedule, and the `.ics` description
  says `Play-In Tournament` rather than `Playoffs — PI`.

Verified against the real bracket: East 7 PHI / 8 ORL, West 7 POR / 8 PHX — exactly the
7 and 8 seeds the committed first round used (a test asserts that cross-check). Play-in
games do not count toward the standings, which `countsForStandings` already enforced.

## Season archive + History tab — DONE (2026-07-27)

Six completed seasons (2020-21 → 2025-26) in `src/data/history.js`, built by
`scripts/fetch-history.mjs` (`npm run fetch:history`). 2020-21 is the floor because that
is when the play-in took its current 7–10 shape — the 2020 Orlando restart ran a one-off
qualifier, so an older season would need a second format modelled.

**What's committed, and what isn't.** A full season is ~870KB of games; five more would
have quintupled the bundle. Each archived season keeps only its final conference
standings, its ~91 play-in + playoff games, its season totals, and its leader boards —
~320KB total (bundle 1.10MB → 1.40MB, 224KB → 259KB gzipped). Deliberately *not*
committed:

- **The bracket and the ladder.** Both are rebuilt at runtime by the same
  `buildBracket()` / `buildPlayIn()` the live season uses. `buildBracket(games, standings)`
  gained an optional second argument for exactly this: an archived season has no
  regular-season games to seed from, so it passes its committed table in. An archived
  bracket that rendered through a second code path could silently disagree with the live
  one.
- **Box scores.** The detail modal already fetches them from ESPN by event id, and every
  archived game has one — so a 2021 dot opens a real box score.

`scripts/fetch-schedule.mjs` grew exports (`fetchTeams`/`fetchSchedule`/`fetchLeaders`)
and a `process.argv[1]` guard so it can be imported without running its CLI. The archive
runs up to the season the app is on and drops any season with no champion, so the current
season joins by itself the week it ends.

**The History tab** (`?view=history&season=YYYY`, `season` added to urlState like the
Premier League sibling) has four modes: one season in full (bracket, ladder, both final
tables); that season's **stats**; every team that has reached the playoffs through the
play-in with its route and its run; and every champion with the Finals margin. The
qualifier table is the one that only exists because the archive starts in 2020-21 — its
best row is the 2022-23 Heat, an 8 seed out of the play-in who reached the Finals.

**Stats by season** reuses the live Stats cards rather than reimplementing them:
`StatsView` now exports `Tile`, `GameList`, `Leaders` and `MarginChart`, `Leaders` takes
its board from a `getRows(cat)` supplier, and `MarginChart` takes rows instead of games
(`stats.js` gained `rankScoring` + `seasonScoring`). So an archived season shows all nine
leaderboards with the live tie handling and volume qualifiers, and a margin chart ranked
by the same rule. Each season stores its boards as `{id, rank, value}` against a deduped
player table (~63 players, full stat lines) — smaller than inlining, and it means a
historical leader's pop-out shows *that* season's averages (Curry's 32.0 in 2020-21, not
his current line). Totals that used to be derived from 1,230 games are committed as
numbers, with the five closest and five highest-scoring games kept so the drill-downs
survive; those rows are now clickable in the live view too, which they never were.

Also: **the series dots are now buttons** onto each game's box score, across every round
and in archived seasons too. They were the only per-game handle the bracket offered and
were inert.

## Still owed (polish + a re-sync)

1. **Game-detail re-sync.** WNBA is mid-refactor replacing the `Lineups` panel with a
   broader `GameSummary`/`services/summary.js`. This snapshot has the earlier `Lineups`
   version (internally consistent). Re-sync once the WNBA refactor lands.
2. **Offseason data caveat.** The committed 2025-26 season is fully complete, so a handful
   of tests synthesise upcoming games and the two "live overlay" tests assert the idle
   (season-over) path. Revisit those if a mid-season snapshot is ever committed. When the
   2026-27 schedule posts, `fetch:schedule --season 2027` regenerates to an in-progress
   season and they should re-assert active polling.
3. **Polish:** README rewrite (NBA specifics), `public/og-image.png` (regenerate), the
   calendar name could show `2025-26` (currently `2026`), apple-touch-icon/PWA icons,
   coverage badge/thresholds.
