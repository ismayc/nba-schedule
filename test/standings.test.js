import { describe, it, expect } from 'vitest'
import { GAMES } from '../src/data/schedule.js'
import {
  computeStandings,
  compareTeams,
  divisionLeaders,
  playoffEligible,
  playoffRace,
  headToHead,
  gamesBehind,
  countsForStandings,
  conferenceStandings,
  CONFERENCE_BY_ABBR,
  DIVISION_BY_ABBR,
  PLAYOFF_SPOTS,
} from '../src/utils/standings.js'
import { TEAMS } from '../src/data/teams.js'
import { HISTORY_BY_YEAR } from '../src/data/history.js'

let seq = 0
const game = (over) => ({
  id: String(seq++),
  seasonType: 'regular',
  tip: '2026-05-10T00:00:00.000Z',
  home: 'MIN',
  away: 'DAL',
  score: [90, 80],
  ...over,
})

// n completed games in which `w` beats `l`, alternating who hosts so home/road splits
// stay balanced and nothing depends on venue.
const wins = (w, l, n = 1) =>
  Array.from({ length: n }, (_, i) =>
    i % 2 === 0 ? game({ home: w, away: l, score: [100, 90] }) : game({ home: l, away: w, score: [90, 100] })
  )

const seedOf = (conf, abbr) => conf.find((r) => r.abbr === abbr)?.seed

describe('countsForStandings', () => {
  it('counts a completed regular-season game', () => {
    expect(countsForStandings(game())).toBe(true)
  })

  it('excludes the NBA Cup championship', () => {
    expect(countsForStandings(game({ seasonType: 'cup' }))).toBe(false)
  })

  it('excludes postponed shells and unplayed games', () => {
    expect(countsForStandings(game({ postponed: true }))).toBe(false)
    expect(countsForStandings(game({ score: undefined }))).toBe(false)
  })

  it('treats a live score as provisional — an in-progress game does not count', () => {
    expect(countsForStandings(game({ live: true }))).toBe(false)
  })
})

describe('computeStandings', () => {
  it('splits home and road records by side', () => {
    const t = computeStandings([game(), game({ home: 'DAL', away: 'MIN', score: [70, 95] })])
    expect(t.MIN).toMatchObject({ w: 2, l: 0, home: { w: 1, l: 0 }, road: { w: 1, l: 0 } })
    expect(t.DAL).toMatchObject({ w: 0, l: 2, home: { w: 0, l: 1 }, road: { w: 0, l: 1 } })
  })

  it('tracks streak sign and magnitude', () => {
    const t = computeStandings([
      game({ tip: '2026-05-01T00:00:00.000Z', score: [80, 90] }), // MIN loss
      game({ tip: '2026-05-02T00:00:00.000Z', score: [95, 80] }), // MIN win
      game({ tip: '2026-05-03T00:00:00.000Z', score: [99, 80] }), // MIN win
    ])
    expect(t.MIN.streak).toBe(2)
    expect(t.DAL.streak).toBe(-2)
  })

  it('counts conference games only against same-conference opponents', () => {
    const t = computeStandings([
      game({ home: 'NY', away: 'ATL' }), // both East
      game({ home: 'NY', away: 'MIN' }), // cross-conference (East v West)
    ])
    expect(t.NY.conf).toEqual({ w: 1, l: 0 })
  })

  it('counts division games only against divisional opponents', () => {
    const t = computeStandings([
      game({ home: 'BOS', away: 'NY' }), // both Atlantic
      game({ home: 'BOS', away: 'MIL' }), // East but Central — not divisional
    ])
    expect(t.BOS.div).toEqual({ w: 1, l: 0 })
    expect(t.BOS.conf).toEqual({ w: 2, l: 0 })
  })
})

describe('headToHead', () => {
  it('returns null when two teams have not met', () => {
    expect(headToHead([game()], 'NY', 'ATL')).toBeNull()
  })

  it('tallies the season series', () => {
    const h2h = headToHead(
      [game(), game({ home: 'DAL', away: 'MIN', score: [99, 80] })],
      'MIN',
      'DAL'
    )
    expect(h2h).toMatchObject({ aw: 1, bw: 1 })
  })
})

describe('gamesBehind', () => {
  it('is zero for the leader and half a game per split result', () => {
    const leader = { w: 20, l: 6 }
    expect(gamesBehind(leader, { w: 20, l: 6 })).toBe(0)
    expect(gamesBehind(leader, { w: 19, l: 7 })).toBe(1)
    expect(gamesBehind(leader, { w: 19, l: 6 })).toBe(0.5)
  })
})

// `w` beats `l` at home by `by` points — for fixtures where the margin (net points)
// has to be controlled, unlike wins() which fixes it at +10.
const beat = (w, l, by = 10) => game({ home: w, away: l, score: [100 + by, 100] })

// ── The official TWO-team tiebreaker chain, one step at a time ───────────────
// Each fixture equalises everything ABOVE the step under test (and makes the steps
// BELOW it point the other way where possible), so the named step is what actually
// decides — remove that step from the chain and the fixture fails.
describe('two-team seeding tiebreakers', () => {
  it('orders by winning percentage before any tiebreaker', () => {
    const E = conferenceStandings([...wins('BOS', 'NY', 3), ...wins('NY', 'BOS', 1)]).E
    expect(seedOf(E, 'BOS')).toBeLessThan(seedOf(E, 'NY')) // BOS 3-1 over NY 1-3
  })

  it('step 1: breaks an equal record on head-to-head', () => {
    // BOS and PHI both 2-2, but BOS swept the season series.
    const E = conferenceStandings([
      ...wins('BOS', 'PHI', 2), // BOS beats PHI twice (h2h 2-0)
      ...wins('TOR', 'BOS', 2), // BOS drops two to a divisionmate
      ...wins('PHI', 'WSH', 2), // PHI wins two of its own
    ]).E
    expect(seedOf(E, 'BOS')).toBeLessThan(seedOf(E, 'PHI'))
  })

  it('step 2: favours a division leader over a non-leader, across divisions', () => {
    // ATL leads the Southeast; NY (3-1) trails BOS (4-0) in the Atlantic, so NY is a
    // non-leader on the same .750 record — and the two never meet. NY's much better
    // net points (+85 vs +20) would win every later step, so only the leader step
    // can produce this order.
    const E = conferenceStandings([
      ...wins('BOS', 'CHI', 4), // BOS 4-0, Atlantic leader
      beat('NY', 'TOR', 30), beat('NY', 'TOR', 30), beat('NY', 'TOR', 30),
      beat('TOR', 'NY', 5), // NY 3-1, non-leader, fat margins
      ...wins('ATL', 'MIA', 3), ...wins('MIA', 'ATL', 1), // ATL 3-1, Southeast leader
    ]).E
    expect(seedOf(E, 'ATL')).toBeLessThan(seedOf(E, 'NY'))
  })

  it('step 3: uses division record between two same-division non-leaders', () => {
    // Rewritten for the group resolver: the old fixture's opponents (NY, BKN, DEN)
    // themselves landed on .500, forming a FOUR-way pct group that the official
    // multi-team chain decides by record-among-tied — not the two-team division step
    // it meant to test. This fixture keeps the .500 group to exactly {BOS, PHI}.
    // BOS and PHI both 2-2, never meet, conference records level at 1-1; BOS is 1-0
    // in the Atlantic to PHI's 0-1. PHI's fat +30 net points must NOT save it.
    const E = conferenceStandings([
      beat('BOS', 'NY', 5), // division win
      beat('MIA', 'BOS', 5), // conference (non-division) loss
      beat('BOS', 'LAL', 5), beat('SAC', 'BOS', 5), // 1-1 out west
      beat('BKN', 'PHI', 5), // division loss (also makes BKN the Atlantic leader)
      beat('PHI', 'ORL', 20), // conference (non-division) win
      beat('PHI', 'SAC', 20), beat('LAL', 'PHI', 5), // 1-1 out west, big margins
    ]).E
    const bos = E.find((r) => r.abbr === 'BOS')
    const phi = E.find((r) => r.abbr === 'PHI')
    expect(bos.pct).toBe(phi.pct) // equal record
    expect(phi.diff).toBeGreaterThan(bos.diff) // net points would flip it — div record must decide
    expect(seedOf(E, 'BOS')).toBeLessThan(seedOf(E, 'PHI'))
  })

  it('step 4: uses conference record for a cross-division pair when records vs eligible teams are level', () => {
    // The eight-team East ladder keeps eligibility a strict subset (PHI, ORL, BKN,
    // WSH, DET fall below the .500 cut). BOS and CHI (different divisions, neither a
    // leader, never met) are both 2-2; both went 0-0 against ELIGIBLE East teams —
    // every conference game they played was against an ineligible one — so step 5 is
    // level and cannot shadow step 4. Conference record 2-0 vs 1-1 gives it to BOS;
    // CHI's better net points (+30 vs -30) and better record vs eligible WEST teams
    // (step 6) would flip it if the conference step were dropped early or late.
    const E = conferenceStandings([
      ...wins('TOR', 'PHI', 2), ...wins('ATL', 'ORL', 2), ...wins('MIL', 'BKN', 2),
      ...wins('CHA', 'ORL', 2), ...wins('NY', 'BKN', 2), ...wins('MIA', 'WSH', 2),
      ...wins('IND', 'DET', 2), ...wins('CLE', 'DET', 2),
      beat('BOS', 'PHI', 5), beat('BOS', 'ORL', 5), // conference 2-0, both ineligible opponents
      beat('LAL', 'BOS', 20), beat('SAC', 'BOS', 20),
      beat('CHI', 'DET', 20), beat('PHI', 'CHI', 5), // conference 1-1, both ineligible opponents
      beat('CHI', 'SAC', 20), beat('LAL', 'CHI', 5),
    ]).E
    const bos = E.find((r) => r.abbr === 'BOS')
    const chi = E.find((r) => r.abbr === 'CHI')
    expect(bos.pct).toBe(chi.pct)
    expect(chi.diff).toBeGreaterThan(bos.diff)
    expect(seedOf(E, 'BOS')).toBeLessThan(seedOf(E, 'CHI'))
  })

  it('step 3 gate: division record is SKIPPED for a cross-division pair; step 5 (record vs own-conference playoff-eligible teams) decides', () => {
    // A ladder of eight East teams above .500 makes eligibility a real subset: the top
    // 10 by raw pct are TOR ATL MIL CHA NY MIA IND CLE + BOS CHI (both .500); PHI,
    // WSH, BKN, ORL, DET fall below the cut. BOS (Atlantic) and CHI (Central) are
    // level on record (2-2), h2h (never met), and conference record (1-1). BOS beat
    // an ELIGIBLE team (CLE) and lost to an ineligible one (PHI); CHI did the reverse
    // (beat DET, lost to NY) — so BOS wins step 5. Two deliberate traps: CHI's
    // division record (1-0) is BETTER than BOS's (0-1) — if the same-division gate
    // were missing, step 3 would wrongly hand the tie to CHI — and CHI's net points
    // (+30 vs -30) would hand it step 7 if step 5 were dropped.
    const games = [
      ...wins('TOR', 'PHI', 2), ...wins('ATL', 'WSH', 2), ...wins('MIL', 'BKN', 2),
      ...wins('CHA', 'WSH', 2), ...wins('NY', 'ORL', 2), ...wins('MIA', 'BKN', 2),
      ...wins('IND', 'ORL', 2), ...wins('CLE', 'DET', 3),
      beat('BOS', 'CLE', 5), beat('PHI', 'BOS', 20), // vs eligible 1-0, division 0-1
      beat('BOS', 'LAL', 5), beat('SAC', 'BOS', 20),
      beat('CHI', 'DET', 20), beat('NY', 'CHI', 5), // vs eligible 0-1, division 1-0
      beat('CHI', 'SAC', 20), beat('LAL', 'CHI', 5),
    ]
    const table = computeStandings(games)
    const eligible = playoffEligible(table)
    expect([...eligible.E].sort()).toEqual(
      ['ATL', 'BOS', 'CHA', 'CHI', 'CLE', 'IND', 'MIA', 'MIL', 'NY', 'TOR'].sort()
    )
    const E = conferenceStandings(games).E
    const bos = E.find((r) => r.abbr === 'BOS')
    const chi = E.find((r) => r.abbr === 'CHI')
    expect(bos.pct).toBe(chi.pct)
    expect(chi.diff).toBeGreaterThan(bos.diff) // step 7 would flip it
    expect(seedOf(E, 'BOS')).toBeLessThan(seedOf(E, 'CHI'))
  })

  it('step 6: record vs playoff-eligible teams in the OTHER conference decides a West pair', () => {
    // Ten East teams sit above the cut (nine 1.000 + MIA .667); WSH, PHI, BKN, ORL,
    // DET are ineligible. LAL and DEN (different West divisions, non-leaders behind
    // GS/OKC) are level on record, h2h, conference record, and — since every West
    // team is eligible (the cut pct is 0.000 and all fifteen tie it) — on step 5 too.
    // LAL beat eligible MIA and lost to ineligible WSH; DEN beat ineligible ORL and
    // lost to eligible NY, so LAL wins step 6 despite DEN's +30 net points.
    const games = [
      ...wins('TOR', 'PHI', 2), ...wins('ATL', 'WSH', 2), ...wins('MIL', 'BKN', 2),
      ...wins('CHA', 'WSH', 2), ...wins('NY', 'BKN', 2), ...wins('MIA', 'PHI', 2),
      ...wins('IND', 'DET', 2), ...wins('CLE', 'DET', 2),
      beat('BOS', 'DET', 10), beat('CHI', 'DET', 10), // 9th/10th eligible East teams
      ...wins('GS', 'SAC', 2), // Pacific leader over LAL
      beat('LAL', 'MIA', 5), beat('WSH', 'LAL', 20), // vs eligible East 1-0
      beat('LAL', 'POR', 5), beat('OKC', 'LAL', 20), // conference 1-1; OKC leads NW
      beat('DEN', 'ORL', 20), beat('NY', 'DEN', 5), // vs eligible East 0-1
      beat('DEN', 'UTAH', 20), beat('OKC', 'DEN', 5), // conference 1-1
    ]
    const W = conferenceStandings(games).W
    const lal = W.find((r) => r.abbr === 'LAL')
    const den = W.find((r) => r.abbr === 'DEN')
    expect(lal.pct).toBe(den.pct)
    expect(den.diff).toBeGreaterThan(lal.diff) // step 7 would flip it
    expect(seedOf(W, 'LAL')).toBeLessThan(seedOf(W, 'DEN'))
  })

  it('step 7: net points decides when everything above is level', () => {
    // BOS and DET each go 2-0 with a 1-0 conference record and no common opponent;
    // both lead their divisions and both conferences are fully eligible (all-tied
    // cut), so steps 5 and 6 are level and scoring margin decides. DET carries the
    // bigger margin so the alphabetical fallback (BOS first) cannot be what passes.
    const E = conferenceStandings([
      game({ home: 'BOS', away: 'DEN', score: [120, 90] }),
      game({ home: 'BOS', away: 'MIA', score: [101, 100] }),
      game({ home: 'DET', away: 'DEN', score: [130, 90] }),
      game({ home: 'DET', away: 'ORL', score: [101, 100] }),
    ]).E
    expect(seedOf(E, 'DET')).toBeLessThan(seedOf(E, 'BOS')) // +41 diff beats +31
  })

  it('final fallback: alphabetical stand-in for the official random drawing', () => {
    // Identical records, margins, and profiles all the way down the chain — the
    // official rule ends in a random drawing; the implementation substitutes a
    // deterministic alphabetical order so seeding is reproducible.
    const E = conferenceStandings([
      beat('BOS', 'DEN', 20), beat('BOS', 'MIA', 1),
      beat('DET', 'DEN', 20), beat('DET', 'ORL', 1),
    ]).E
    expect(seedOf(E, 'BOS')).toBe(1)
    expect(seedOf(E, 'DET')).toBe(2)
  })

  it('accepts precomputed table, division leaders, and eligibility sets', () => {
    const games = [beat('BOS', 'NY', 5)]
    const table = computeStandings(games)
    const leaders = divisionLeaders(table, games)
    const eligible = playoffEligible(table)
    expect(compareTeams(table.BOS, table.NY, games, table, leaders, eligible)).toBeLessThan(0)
  })
})

// ── The official THREE-OR-MORE-team chain (a different list, with restarts) ──
describe('multi-team seeding tiebreakers', () => {
  it('step 1: a division leader separates first; the survivors RESTART on the two-team chain from ITS step 1', () => {
    // ATL (Southeast leader), NY, and BOS all finish 3-1. Multi step 1 lifts ATL out.
    // {NY, BOS} then restart under the TWO-team chain: head-to-head (NY beat BOS)
    // decides — NOT a continuation from where the three-way chain stopped, and NOT
    // net points, where BOS (+88 vs +12) would win instead.
    const E = conferenceStandings([
      ...wins('TOR', 'CHA', 4), // TOR 4-0 keeps the Atlantic title from NY/BOS
      ...wins('ATL', 'MIA', 3), ...wins('MIA', 'ATL', 1), // ATL 3-1, Southeast leader
      beat('NY', 'BOS', 2), beat('NY', 'CHI', 10), beat('NY', 'DET', 10), beat('CLE', 'NY', 10),
      beat('BOS', 'WSH', 30), beat('BOS', 'WSH', 30), beat('BOS', 'CHI', 30),
    ]).E
    expect(seedOf(E, 'ATL')).toBeLessThan(seedOf(E, 'NY'))
    expect(seedOf(E, 'NY')).toBeLessThan(seedOf(E, 'BOS'))
  })

  it('step 2: record among the tied teams — and it can disagree with the two-team chain', () => {
    // BOS, CHI, MIA (three divisions, no leaders among them) all 2-2. Among the tied:
    // BOS 2-1 (.667) > MIA 2-2 (.500) > CHI 1-2 (.333). But PAIRWISE, CHI beat BOS
    // head-to-head — the two chains give different orders, which is why the resolver
    // must work on groups, not pairwise comparisons.
    const games = [
      beat('CHI', 'BOS', 5), beat('BOS', 'MIA', 5), beat('BOS', 'MIA', 5),
      beat('MIA', 'CHI', 5), beat('MIA', 'CHI', 5), beat('CHI', 'DET', 5),
      beat('TOR', 'BOS', 5), // TOR takes the Atlantic title
      ...wins('CLE', 'DET', 2), // CLE takes the Central
      ...wins('ATL', 'ORL', 2), // ATL takes the Southeast
    ]
    const E = conferenceStandings(games).E
    expect(seedOf(E, 'BOS')).toBeLessThan(seedOf(E, 'MIA'))
    expect(seedOf(E, 'MIA')).toBeLessThan(seedOf(E, 'CHI'))
    // The exported two-team comparator, asked about the same pair, answers CHI > BOS.
    const table = computeStandings(games)
    expect(compareTeams(table.CHI, table.BOS, games, table)).toBeLessThan(0)
  })

  it('step 3: division record applies only when ALL tied teams share a division', () => {
    // BOS, NY, BKN — all Atlantic non-leaders (TOR leads), all 2-2, and a perfect
    // head-to-head cycle (BOS>NY>BKN>BOS) leaves record-among-tied level at 1-1 each.
    // Division records split them: BOS 2-1 > BKN 1-1 > NY 1-2 — against the net-points
    // order (NY +28 > BKN 0 > BOS -28), so dropping the division step fails this.
    const E = conferenceStandings([
      beat('BOS', 'NY', 2), beat('NY', 'BKN', 2), beat('BKN', 'BOS', 2), // the cycle
      beat('BOS', 'PHI', 2), beat('MIA', 'BOS', 30), // BOS division 2-1
      beat('PHI', 'NY', 2), beat('NY', 'MIA', 30), // NY division 1-2
      beat('BKN', 'ORL', 10), beat('WSH', 'BKN', 10), // BKN division 1-1
      ...wins('TOR', 'CHA', 3), // Atlantic title stays clear of the trio
      ...wins('MIA', 'PHI', 2), // keeps PHI (1-4) off the trio's .500 line
    ]).E
    expect(seedOf(E, 'BOS')).toBeLessThan(seedOf(E, 'BKN'))
    expect(seedOf(E, 'BKN')).toBeLessThan(seedOf(E, 'NY'))
  })

  it('step 4: conference record decides a cross-division trio', () => {
    // BOS, CHI, WSH (three divisions, no leaders, never meet) all 2-2. Conference
    // records: BOS 2-0 > CHI 1-1 > WSH 0-2. Records vs eligible teams are all 0.000
    // (each eligible-set win/loss profile is empty or losses only), and net points
    // run the OTHER way (WSH +30 > CHI 0 > BOS -30) — only step 4 gives this order.
    const games = [
      ...wins('TOR', 'PHI', 2), ...wins('ATL', 'ORL', 2), ...wins('MIL', 'BKN', 2),
      ...wins('CHA', 'ORL', 2), ...wins('NY', 'BKN', 2), ...wins('MIA', 'PHI', 2),
      ...wins('IND', 'DET', 2), ...wins('CLE', 'DET', 2),
      beat('BOS', 'PHI', 5), beat('BOS', 'ORL', 5), // conference 2-0, vs ineligibles
      beat('LAL', 'BOS', 20), beat('SAC', 'BOS', 20),
      beat('CHI', 'DET', 10), beat('NY', 'CHI', 10), // conference 1-1
      beat('CHI', 'SAC', 10), beat('LAL', 'CHI', 10),
      beat('MIA', 'WSH', 5), beat('CLE', 'WSH', 5), // conference 0-2
      beat('WSH', 'POR', 20), beat('WSH', 'UTAH', 20),
    ]
    // The tie at the cut line makes all three .500 teams eligible — 11 East teams.
    const eligible = playoffEligible(computeStandings(games))
    expect(eligible.E.size).toBe(11)
    for (const abbr of ['BOS', 'CHI', 'WSH']) expect(eligible.E.has(abbr)).toBe(true)
    const E = conferenceStandings(games).E
    expect(seedOf(E, 'BOS')).toBeLessThan(seedOf(E, 'CHI'))
    expect(seedOf(E, 'CHI')).toBeLessThan(seedOf(E, 'WSH'))
  })

  it('step 5: record vs own-conference playoff-eligible teams (the multi chain has NO other-conference step)', () => {
    // Same ladder shape, but the trio's conference records are level at 1-1 and their
    // records vs ELIGIBLE opponents differ: BOS beat eligible CLE (1-0), CHI split
    // against eligible IND/NY (1-1), WSH lost its only eligible matchup (0-1).
    // Net points again point the other way (WSH +30 > CHI 0 > BOS -30).
    const E = conferenceStandings([
      ...wins('TOR', 'PHI', 2), ...wins('ATL', 'ORL', 2), ...wins('MIL', 'BKN', 2),
      ...wins('CHA', 'ORL', 2), ...wins('NY', 'BKN', 2), ...wins('MIA', 'PHI', 2),
      ...wins('IND', 'DET', 2), ...wins('CLE', 'DET', 2),
      beat('BOS', 'CLE', 5), beat('PHI', 'BOS', 20), // vs eligible 1-0
      beat('BOS', 'LAL', 5), beat('SAC', 'BOS', 20),
      beat('CHI', 'IND', 10), beat('NY', 'CHI', 10), // vs eligible 1-1
      beat('CHI', 'SAC', 10), beat('LAL', 'CHI', 10),
      beat('WSH', 'ORL', 20), beat('MIA', 'WSH', 5), // vs eligible 0-1
      beat('WSH', 'POR', 20), beat('UTAH', 'WSH', 5),
    ]).E
    expect(seedOf(E, 'BOS')).toBeLessThan(seedOf(E, 'CHI'))
    expect(seedOf(E, 'CHI')).toBeLessThan(seedOf(E, 'WSH'))
  })

  it('step 6: net points orders a trio that is level through step 5', () => {
    // Three 2-0 division leaders with no conference games and no meetings — every
    // criterion above net points is level. Margins order MIA > CHI > BOS, the
    // REVERSE of alphabetical, so the fallback cannot be what passes this.
    const E = conferenceStandings([
      beat('MIA', 'LAL', 25), beat('MIA', 'POR', 25),
      beat('CHI', 'SAC', 15), beat('CHI', 'UTAH', 15),
      beat('BOS', 'DEN', 5), beat('BOS', 'GS', 5),
    ]).E
    expect(seedOf(E, 'MIA')).toBeLessThan(seedOf(E, 'CHI'))
    expect(seedOf(E, 'CHI')).toBeLessThan(seedOf(E, 'BOS'))
  })

  it('final fallback: alphabetical stand-in when a whole group exhausts the chain', () => {
    // As above but with identical margins — nothing in the official multi chain
    // separates them, so the deterministic random-drawing stand-in orders them.
    const E = conferenceStandings([
      beat('MIA', 'LAL', 20), beat('MIA', 'POR', 20),
      beat('CHI', 'SAC', 20), beat('CHI', 'UTAH', 20),
      beat('BOS', 'DEN', 20), beat('BOS', 'GS', 20),
    ]).E
    expect(seedOf(E, 'BOS')).toBeLessThan(seedOf(E, 'CHI'))
    expect(seedOf(E, 'CHI')).toBeLessThan(seedOf(E, 'MIA'))
  })
})

// ── Division-title ties: broken first, in isolation, without the leader step ──
describe('division-title ties', () => {
  it('breaks a two-way title tie by division record when the season series splits', () => {
    // BOS and NY tie the Atlantic at 3-1 with a 1-1 head-to-head. Division record
    // (BOS 3-1 vs NY 1-1... i.e. .750 vs .500) awards BOS the title; NY's far better
    // net points (+55 vs -5) must not — the title chain runs h2h → division record.
    // The winner then also takes the seeding pair via the division-leader step.
    const games = [
      beat('BOS', 'NY', 5), beat('NY', 'BOS', 20),
      beat('BOS', 'TOR', 5), beat('BOS', 'TOR', 5),
      beat('NY', 'CHI', 20), beat('NY', 'DET', 20),
    ]
    const table = computeStandings(games)
    const leaders = divisionLeaders(table, games)
    expect(leaders.has('BOS')).toBe(true)
    expect(leaders.has('NY')).toBe(false)
    const E = conferenceStandings(games).E
    expect(E[0]).toMatchObject({ abbr: 'BOS', isDivLeader: true })
    expect(E[1]).toMatchObject({ abbr: 'NY', isDivLeader: false })
  })

  it('breaks a three-way title tie by record among the tied — not by division record', () => {
    // BOS, NY, TOR tie the Atlantic at .500. Among the tied: BOS 2-0, NY 1-1, TOR
    // 0-2 → BOS. Division records would say NY (.750 vs BOS's .500) — proving the
    // multi-team title chain runs record-among-tied BEFORE division record, and that
    // the title is resolved in isolation (BOS's leader badge then wins the seeding
    // group's step 1, and {NY, TOR} restart on head-to-head).
    const games = [
      beat('BOS', 'NY', 5), beat('BOS', 'TOR', 5), beat('NY', 'TOR', 5),
      beat('BKN', 'BOS', 5), beat('BKN', 'BOS', 5), // BOS division 2-2 overall
      beat('NY', 'BKN', 5), beat('NY', 'PHI', 5), // NY division 3-1
      beat('CLE', 'NY', 5), beat('MIA', 'NY', 5),
      beat('TOR', 'ORL', 5), beat('TOR', 'ORL', 5), // TOR division 0-2
      ...wins('MIA', 'BKN', 2), ...wins('CLE', 'BKN', 2), // keep BKN (2-5) below .500
    ]
    const table = computeStandings(games)
    const leaders = divisionLeaders(table, games)
    expect(leaders.has('BOS')).toBe(true)
    expect(leaders.has('NY')).toBe(false)
    expect(leaders.has('TOR')).toBe(false)
    const E = conferenceStandings(games).E
    expect(seedOf(E, 'BOS')).toBeLessThan(seedOf(E, 'NY'))
    expect(seedOf(E, 'NY')).toBeLessThan(seedOf(E, 'TOR'))
  })
})

describe('per-conference seeding', () => {
  it('seeds each conference independently, 1..15', () => {
    const { E, W } = conferenceStandings(GAMES)
    expect(E).toHaveLength(15)
    expect(W).toHaveLength(15)
    expect(E.map((r) => r.seed)).toEqual([...Array(15)].map((_, i) => i + 1))
    expect(W.map((r) => r.seed)).toEqual([...Array(15)].map((_, i) => i + 1))
  })

  it('keeps every East team East and every West team West', () => {
    const { E, W } = conferenceStandings(GAMES)
    expect(E.every((r) => CONFERENCE_BY_ABBR[r.abbr] === 'E')).toBe(true)
    expect(W.every((r) => CONFERENCE_BY_ABBR[r.abbr] === 'W')).toBe(true)
    expect(E.length + W.length).toBe(TEAMS.length)
  })

  it('lets a conference lead its own field regardless of the other conference', () => {
    // A West team can hold the best record in the league without touching East seeding.
    // The live schedule is unplayed right after a rollover, so this reads the ARCHIVED
    // 2025-26 standings: Oklahoma City topped the West outright, Detroit the East,
    // each seeded #1 in its own group.
    const { E, W } = HISTORY_BY_YEAR[2026].standings
    expect(W[0]).toMatchObject({ abbr: 'OKC', seed: 1, gb: 0 })
    expect(E[0]).toMatchObject({ abbr: 'DET', seed: 1, gb: 0 })
    expect(W[0].w).toBeGreaterThan(E[0].w) // OKC has more wins but East seeds off DET
  })

  it('orders each conference by win percentage before tiebreakers', () => {
    for (const rows of Object.values(conferenceStandings(GAMES))) {
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].pct).toBeGreaterThanOrEqual(rows[i].pct)
      }
    }
  })

  it('marks the top 8 of each conference as the playoff field, 7–10 as the play-in', () => {
    const { E, W } = conferenceStandings(GAMES)
    for (const rows of [E, W]) {
      expect(rows.filter((r) => r.inPlayoffs)).toHaveLength(PLAYOFF_SPOTS)
      expect(rows.filter((r) => r.playIn).map((r) => r.seed)).toEqual([7, 8, 9, 10])
    }
  })
})

// The real 2025-26 data is the strongest fixture there is: these numbers can be checked
// against ESPN's published conference standings.
describe('the archived 2025-26 season and the live race', () => {
  it('matches ESPN: Oklahoma City tops the West and Detroit tops the East', () => {
    // Frozen in the archive — a finished season's numbers can always be checked
    // against ESPN's published conference standings.
    const { E, W } = HISTORY_BY_YEAR[2026].standings
    expect(W[0]).toMatchObject({ abbr: 'OKC', w: 64, l: 18 })
    expect(E[0]).toMatchObject({ abbr: 'DET', w: 60, l: 22 })
  })

  it('assigns every team to a conference and a division', () => {
    expect(TEAMS.every((t) => CONFERENCE_BY_ABBR[t.abbr])).toBe(true)
    expect(TEAMS.every((t) => DIVISION_BY_ABBR[t.abbr])).toBe(true)
  })

  it('never lets a team play more games than it is scheduled for', () => {
    for (const row of playoffRace(GAMES)) {
      expect(row.remaining).toBeGreaterThanOrEqual(0)
    }
  })

  it('runs the clinch/eliminate race inside each conference', () => {
    // Structural only: naming who is clinched/eliminated would pin moving season
    // data (the decided-season shapes are locked by the raceScenarios fixtures).
    const race = playoffRace(GAMES)
    expect(race).toHaveLength(TEAMS.length)
    expect(race.filter((r) => r.playIn)).toHaveLength(8) // 4 per conference
    for (const r of race) {
      expect(['E', 'W']).toContain(r.conf)
      // No team can be both safe and out.
      expect(r.clinched && r.eliminated).toBe(false)
    }
  })
})
