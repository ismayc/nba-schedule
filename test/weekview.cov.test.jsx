import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WeekView from '../src/components/WeekView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { todayKey } from '../src/utils/time.js'

const TZ = 'America/New_York'
const today = todayKey(TZ)
// A mid-afternoon-UTC tip lands on the same calendar day in Eastern time, so the game
// sits in the current (default) week the view opens on.
const at = (h) => `${today}T${String(h).padStart(2, '0')}:00:00.000Z`

beforeEach(() => {
  localStorage.clear()
})

describe('WeekView — followed/live game and the singular count', () => {
  it('marks a followed team’s live game and says "1 game" for a lone fixture', () => {
    localStorage.setItem('nba:followed', JSON.stringify(['MIN']))
    const live = { id: 'g-live', tip: at(18), seasonType: 'regular', home: 'MIN', away: 'LAL', live: true }
    const { container } = render(
      <FollowProvider>
        <WeekView games={[live]} tz={TZ} />
      </FollowProvider>
    )

    const card = container.querySelector('.wk-game')
    expect(card.classList.contains('is-mine')).toBe(true)
    expect(card.classList.contains('is-live')).toBe(true)

    const sub = container.querySelector('.sub').textContent
    expect(sub).toMatch(/\b1 game\b/)
    expect(sub).not.toMatch(/1 games/)
  })
})

describe('WeekView — All-Star cards', () => {
  it('renders the All-Star card both scored (no names) and unscored (named), and opens it', async () => {
    const onOpen = vi.fn()
    const scored = { id: 'as-s', tip: at(18), seasonType: 'allstar', home: 'COOP', away: 'SPO', score: [150, 140] }
    const named = {
      id: 'as-n',
      tip: at(20),
      seasonType: 'allstar',
      home: 'STARS',
      away: 'WORLD',
      homeName: 'Team Stars',
      awayName: 'World',
    }
    const { container } = render(
      <FollowProvider>
        <WeekView games={[scored, named]} tz={TZ} onOpen={onOpen} />
      </FollowProvider>
    )

    // Named side falls through to the name; unnamed side falls back to the raw abbr.
    expect(screen.getByText('World · Team Stars')).toBeInTheDocument()
    expect(screen.getByText('SPO · COOP')).toBeInTheDocument()
    // The finished All-Star game shows its points, away-first.
    expect(screen.getByText('140 – 150')).toBeInTheDocument()

    await userEvent.click(container.querySelector('.wk-allstar'))
    expect(onOpen).toHaveBeenCalled()
  })
})
