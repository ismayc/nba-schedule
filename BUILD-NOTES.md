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

## Owed (the NBA-specific work still to do)

1. **Playoff model is the big one.** The WNBA seeds its 8 playoff teams **league-wide**
   (single bracket, rounds R1/SF/Final, best-of 3/5/7). The NBA is **conference-based**:
   8 teams per conference, a **play-in** (seeds 7–10), two 1v8/4v5/2v7/3v6 brackets, and
   4 best-of-7 rounds (R1/CSF/CF/Final) → Finals. `seedings`/`playoffRace` in
   `standings.js` and `buildBracket`/`Bracket.jsx`/`RadialBracket.jsx` still carry the
   WNBA league-wide model — flagged with a `TODO(nba-playoffs)`. **The bracket is a
   known-wrong placeholder until this is ported** (deliberately not shipped as correct).
   `src/data/schedule.js` already exports the right NBA `PLAYOFF_ROUNDS`/`SERIES_LENGTH`.
2. **Tests: 204/262 pass.** The 58 failures are the sport divergences — WNBA team abbrs
   in fixtures/assertions, data counts, and the bracket model above. Need adapting to NBA
   data + the conference bracket. `test/fixtures/playoffs-2025.js` is a WNBA fixture to
   replace with an NBA conference-bracket fixture (the committed 2025-26 playoffs are real
   and can seed it).
3. **Game-detail re-sync.** WNBA is mid-refactor replacing the `Lineups` panel with a
   broader `GameSummary`/`services/summary.js`. This snapshot has the earlier `Lineups`
   version (internally consistent). Re-sync once the WNBA refactor lands.
4. **Polish:** README rewrite (NBA specifics), `public/og-image.png` (regenerate), verify
   the calendar function against NBA data, apple-touch-icon/PWA icons, coverage badge.
