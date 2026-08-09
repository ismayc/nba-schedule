import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import StandingsView from '../src/components/StandingsView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

// A tiny, hand-built set of Eastern-conference results chosen so the derived standings
// exercise every StreakPill and games-behind branch:
//   BOS 3-0  (W streak, leader → GB 0 → "—")
//   ATL 1-0  (W streak)
//   MIA 1-1  (an odd win/loss gap vs the 3-0 leader → a HALF-game GB, "1.5")
//   NY/PHI/ORL/DET 0-1 (L streaks)
// Every other franchise plays nothing, so its row carries a zero streak (the blank dash).
const g = (id, home, away, hs, as) => ({
  id,
  seasonType: 'regular',
  tip: `2026-05-${id}T23:00:00.000Z`,
  home,
  away,
  score: [hs, as],
})

const GAMES = [
  g('01', 'BOS', 'NY', 110, 90),
  g('02', 'BOS', 'PHI', 108, 95),
  g('03', 'BOS', 'ORL', 101, 88),
  g('04', 'MIA', 'DET', 100, 92), // MIA win
  g('05', 'ATL', 'MIA', 105, 96), // MIA loss → MIA 1-1
]

beforeEach(() => {
  localStorage.clear()
})

describe('StandingsView — streak and games-behind edge cases', () => {
  it('renders zero, integer, and half-game GB plus W/L/blank streaks', () => {
    localStorage.setItem('nba:followed', JSON.stringify(['BOS']))
    const { container } = render(
      <FollowProvider>
        <StandingsView games={GAMES} />
      </FollowProvider>
    )

    const gbs = [...container.querySelectorAll('td.dim')].map((n) => n.textContent)
    // The leader's GB is a dash; MIA (1-1 behind a 3-0 leader) is exactly a half game.
    expect(gbs).toContain('—')
    expect(gbs).toContain('1.5')
    // Integer GB is present too (e.g. the 0-1 teams sit two games back).
    expect(gbs.some((t) => /^\d+$/.test(t))).toBe(true)

    // Streak pills: a win streak (BOS), a loss streak (a 0-1 team), and blank dashes for
    // the many franchises that did not play.
    expect(container.querySelector('.streak-w')).toBeTruthy()
    expect(container.querySelector('.streak-l')).toBeTruthy()
    // A followed leader flags its row.
    expect(container.querySelector('.row-followed')).toBeTruthy()
  })
})

// A fully-decided Eastern conference: every Eastern team's schedule is exhausted (0 games
// remaining), so playoffRace resolves clinch/elimination for real. Ten teams go 1-0 and
// five go 0-2 — with no games left the ten have clinched a play-in berth (more wins than
// the 11th seed can reach) and the five are eliminated (can't reach the 10th seed's win).
// This is what makes the ✓/✕ badges and row-elim styling render — they read row.clinched
// and row.eliminated, which only a settled race sets. (The Western half stays 0-0, so its
// rows keep the not-clinched/not-eliminated branches live in the same render.)
const CLINCHERS = ['ATL', 'BKN', 'BOS', 'CHA', 'CHI', 'CLE', 'DET', 'IND', 'MIA', 'MIL']
const LOSERS = ['NY', 'ORL', 'PHI', 'TOR', 'WSH']
// Each loser drops both its games; each clincher wins exactly one of them. So every
// Eastern team plays its whole (tiny) schedule — remaining goes to zero for all 15.
const DECIDED = CLINCHERS.map((winner, i) =>
  g(String(10 + i), winner, LOSERS[i % LOSERS.length], 112, 100)
)

describe('StandingsView — clinched and eliminated badges', () => {
  it('shows the ✓/✕ badges and row-elim styling once the race is settled', () => {
    const { container } = render(
      <FollowProvider>
        <StandingsView games={DECIDED} />
      </FollowProvider>
    )

    // All ten clinchers finished TIED at 1-0 — tiebreakers, not arithmetic, will order
    // them 1–10, so nobody's top-6 (or play-in-lock) can be arithmetically certain: all
    // ten correctly wear the bare ✓, none the "top 6" or amber chips, and their Finish
    // spans the whole tied block. Scoped to the tables — the legend shows samples.
    const inChips = [...container.querySelectorAll('.standings .badge-in')]
    expect(inChips.length).toBe(10)
    expect(inChips.every((n) => n.textContent.trim() === '✓')).toBe(true)
    expect(container.querySelectorAll('.standings .badge-mid').length).toBe(0)
    expect(container.querySelectorAll('.standings .badge-out').length).toBe(5)
    // Eliminated teams carry the row-elim class.
    expect(container.querySelectorAll('.row-elim').length).toBe(5)
    // A clincher's range spans the tied block; an eliminated team's spans the tail.
    const finishes = [...container.querySelectorAll('.standings .finish')].map((n) => n.textContent)
    expect(finishes).toContain('1–10')
    expect(finishes).toContain('11–15')
  })

  it('shows the plain ✓ while a clinched team can still reach the top 6 or the play-in', () => {
    // A mid-race East: six 8-0 teams are locked ahead, CHI (6-2, done) may still be
    // caught by ATL, CLE (5-3, done) cannot catch CHI. ATL sits 4-4 with three games
    // still to play — floor 4, ceiling 7:
    //   • best rank 6 (only the five 8-0 teams are guaranteed ahead once CHI's 6 ≤ 7)
    //   • worst rank 8 (the 8-0s, CHI, and CLE can all finish at or above 4)
    // → clinched (worst ≤ 10), not top-6 (worst > 6), not locked into the play-in
    // (best ≤ 6): exactly the bare ✓ tier.
    const west = ['DAL', 'DEN', 'GS', 'HOU', 'LAC', 'LAL', 'MEM', 'MIN', 'NO', 'OKC', 'PHX', 'POR']
    const races = []
    let n = 0
    const add = (team, wins, losses, unplayed = 0) => {
      for (let i = 0; i < wins; i++)
        races.push(g(String(10 + n++), team, west[n % west.length], 100, 90))
      for (let i = 0; i < losses; i++)
        races.push(g(String(10 + n++), team, west[n % west.length], 90, 100))
      for (let i = 0; i < unplayed; i++)
        races.push({ ...g(String(10 + n++), team, west[n % west.length], 0, 0), score: null })
    }
    for (const t of ['BOS', 'BKN', 'NY', 'PHI', 'TOR']) add(t, 8, 0)
    add('CHI', 6, 2)
    add('CLE', 5, 3)
    add('ATL', 4, 4, 3)
    const { container, getByText } = render(
      <FollowProvider>
        <StandingsView games={races} />
      </FollowProvider>
    )
    const atlRow = getByText('Hawks').closest('tr')
    const badge = atlRow.querySelector('.badge-in')
    expect(badge.textContent.trim()).toBe('✓') // bare berth — not the top-6 chip
    expect(atlRow.querySelector('.finish').textContent).toBe('6–8')
  })

  it('explains the badges in a visible legend (tooltips are hover-only)', () => {
    const { container } = render(
      <FollowProvider>
        <StandingsView games={DECIDED} />
      </FollowProvider>
    )
    const legend = container.querySelector('.legend')
    expect(legend).toHaveTextContent(/✓ top 6 clinched a top-6 seed/)
    expect(legend).toHaveTextContent(/✓ clinched at least a play-in berth/)
    expect(legend).toHaveTextContent(/play-in locked into the play-in/)
    expect(legend).toHaveTextContent(/✕ eliminated — can no longer catch the 10th\s+seed/)
    expect(legend).toHaveTextContent(/★ a team you follow/)
    expect(legend).toHaveTextContent(/Finish 3–7/)
  })
})
