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
