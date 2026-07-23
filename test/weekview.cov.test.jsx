import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
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
