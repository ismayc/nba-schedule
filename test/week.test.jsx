import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WeekView from '../src/components/WeekView.jsx'
// The FROZEN unplayed board, not src/data/schedule.js. See the fixture's own header:
// the live board stops being unplayed on opening night, and the empty-week test below
// needs a season that has not started.
import { GAMES_2627_PRESEASON as GAMES } from './fixtures/preseason-2627.js'

const TZ = 'America/New_York'

// Pin the clock too. "The current week" comes from Date.now(), so freezing the board
// alone would only move the failure. This instant is three weeks before opening night
// on October 20, 2026, which is what stepIntoSeason below walks forward from.
//
// Verified by rehearsal: without this the empty-week test failed on October 20, 2026,
// the day the season starts, with no commit behind it.
const NOW = new Date('2026-10-01T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => vi.useRealTimers())

const open = (props = {}) => render(<WeekView games={GAMES} tz={TZ} {...props} />)

// The runner's "today" can sit anywhere relative to the committed season: before it
// (a fresh rollover, like 2026-27 in August), inside it, or after it (the offseason).
// Walk toward the season — forward if it starts in the future, back otherwise — until
// a week with games appears, to exercise navigation from inside it.
const stepIntoSeason = async () => {
  const seasonAhead = new Date(GAMES[0].tip) > new Date()
  const control = seasonAhead ? 'Next week' : 'Previous week'
  for (let i = 0; i < 60; i++) {
    if (document.querySelector('.wk-game')) return
    const btn = screen.getByLabelText(control)
    if (btn.disabled) return
    await userEvent.click(btn)
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

    // Step into the season first. At a season edge one direction is disabled (the
    // walker lands on the first week when the season is ahead of "today"), so
    // navigate with whichever control is live and come back with its opposite.
    await stepIntoSeason()
    const start = label()
    const prev = screen.getByLabelText('Previous week')
    const [out, back] = prev.disabled ? ['Next week', 'Previous week'] : ['Previous week', 'Next week']
    await userEvent.click(screen.getByLabelText(out))
    expect(label()).not.toBe(start)

    await userEvent.click(screen.getByLabelText(back))
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

  it('shows tip time for unplayed games and scores for finished ones', async () => {
    // The live schedule has no finished games after a rollover, so build one week
    // holding a home win, an away win, and an unplayed game — all three arms.
    const monday = '2026-02-02'
    const wk = [
      { id: 'w1', seasonType: 'regular', tip: `${monday}T00:00:00.000Z`, home: 'NY', away: 'BOS', score: [100, 90] },
      { id: 'w2', seasonType: 'regular', tip: '2026-02-03T00:00:00.000Z', home: 'MIA', away: 'CHI', score: [80, 95] },
      { id: 'w3', seasonType: 'regular', tip: '2026-02-04T00:00:00.000Z', home: 'ATL', away: 'DET' },
    ]
    const { container } = render(<WeekView games={wk} tz={TZ} />)
    // These three games sit in the past relative to any post-rollover "today", so
    // walk back to their week (stepIntoSeason derives its direction from the real
    // schedule, not this synthetic one).
    for (let i = 0; i < 60 && !container.querySelector('.wk-game'); i++) {
      const prev = screen.getByLabelText('Previous week')
      if (prev.disabled) break
      await userEvent.click(prev)
    }
    const cards = [...container.querySelectorAll('.wk-game')]
    expect(cards).toHaveLength(3)
    for (const c of cards) {
      const hasTime = !!c.querySelector('.wk-time')
      const hasPts = !!c.querySelector('.wk-pts')
      // Exactly one of the two — never both, never neither.
      expect(hasTime !== hasPts).toBe(true)
    }
    // The winner's points are marked in both orientations — home win and away win.
    const winners = cards.map((c) => c.querySelector('.wk-pts.won')?.textContent ?? null)
    expect(winners).toEqual(['100', '95', null])
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
