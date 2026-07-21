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
