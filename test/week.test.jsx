import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WeekView from '../src/components/WeekView.jsx'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'
const open = (props = {}) => render(<WeekView games={GAMES} tz={TZ} {...props} />)

// "Today" (mid-2026) sits in the offseason after the committed 2025-26 schedule, so the
// view opens on an empty week where only Previous is live. Walk back until a week with
// games appears — the last week of the season — to exercise navigation from inside it.
const stepIntoSeason = async () => {
  for (let i = 0; i < 60; i++) {
    if (document.querySelector('.wk-game')) return
    const prev = screen.getByLabelText('Previous week')
    if (prev.disabled) return
    await userEvent.click(prev)
  }
}

describe('WeekView', () => {
  it('lays out seven day columns, Sunday first', () => {
    const { container } = open()
    const dows = [...container.querySelectorAll('.wk-dow')].map((n) => n.textContent)
    expect(dows).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  })

  it('opens on the current week', () => {
    open()
    // Today is inside the season, so a today-marked column should be present.
    expect(document.querySelector('.wk-head.is-today')).toBeTruthy()
  })

  it('navigates between weeks and back', async () => {
    const { container } = open()
    const label = () => container.querySelector('.sub').textContent

    // Step into the season first, where both directions are live.
    await stepIntoSeason()
    const start = label()
    await userEvent.click(screen.getByLabelText('Previous week'))
    expect(label()).not.toBe(start)

    await userEvent.click(screen.getByLabelText('Next week'))
    expect(label()).toBe(start)
  })

  it('returns to the current week', async () => {
    const { container } = open()
    const start = container.querySelector('.sub').textContent
    await userEvent.click(screen.getByLabelText('Next week'))
    await userEvent.click(screen.getByRole('button', { name: 'This week' }))
    expect(container.querySelector('.sub').textContent).toBe(start)
  })

  it('stops navigating past the ends of the season', async () => {
    const { container } = open()
    // Walk backwards well past the season opener; the control must disable.
    for (let i = 0; i < 60; i++) {
      const prev = screen.getByLabelText('Previous week')
      if (prev.disabled) break
      await userEvent.click(prev)
    }
    expect(screen.getByLabelText('Previous week')).toBeDisabled()
    expect(container.querySelectorAll('.wk-col')).toHaveLength(7)
  })

  it('counts the games in the week it is showing', () => {
    const { container } = open()
    const sub = container.querySelector('.sub').textContent
    const stated = Number(sub.match(/(\d+) game/)[1])
    expect(container.querySelectorAll('.wk-game')).toHaveLength(stated)
  })

  it('shows tip time for unplayed games and scores for finished ones', () => {
    const { container } = open()
    const cards = container.querySelectorAll('.wk-game')
    for (const c of cards) {
      const hasTime = !!c.querySelector('.wk-time')
      const hasPts = !!c.querySelector('.wk-pts')
      // Exactly one of the two — never both, never neither.
      expect(hasTime !== hasPts).toBe(true)
    }
  })

  it('hides scores in spoiler-free mode', () => {
    const { container } = open({ hideScores: true })
    expect(container.querySelectorAll('.wk-pts')).toHaveLength(0)
  })

  it('opens a game', async () => {
    const onOpen = vi.fn()
    const { container } = open({ onOpen })
    await stepIntoSeason()
    await userEvent.click(container.querySelector('.wk-game'))
    expect(onOpen).toHaveBeenCalled()
  })

  it('shows an empty state for a week with no games', () => {
    // An all-star or off week: feed the view a season with one distant game.
    render(<WeekView games={[GAMES[0]]} tz={TZ} />)
    expect(screen.getByText(/No games this week/i)).toBeInTheDocument()
  })
})
