import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import GameCard, { livePeriod } from '../src/components/GameCard.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

const TZ = 'America/New_York'

const base = {
  id: '1',
  tip: '2026-01-15T00:00:00.000Z',
  seasonType: 'regular',
  home: 'OKC',
  away: 'HOU',
  score: [110, 102],
  venue: 'Paycom Center',
  city: 'Oklahoma City',
}

const wrap = (game, props = {}) =>
  render(
    <ServicesProvider>
      <FollowProvider>
        <GameCard game={game} tz={TZ} {...props} />
      </FollowProvider>
    </ServicesProvider>
  )

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
})

afterEach(() => cleanup())

describe('livePeriod', () => {
  it('covers every period/label branch', () => {
    expect(livePeriod({ statusLabel: 'Halftime' })).toBe('HALF')
    expect(livePeriod({ statusLabel: 'End of Q2' })).toBe('END OF Q2')
    expect(livePeriod({ period: 3 })).toBe('Q3')
    expect(livePeriod({ period: 5 })).toBe('OT')
    expect(livePeriod({ period: 6 })).toBe('OT2')
    // No period, but a status label → the label, uppercased.
    expect(livePeriod({ statusLabel: 'Delayed' })).toBe('DELAYED')
    // No period and no label → generic LIVE.
    expect(livePeriod({})).toBe('LIVE')
  })
})

describe('GameCard coverage', () => {
  it('shows a live badge with the current period for a live game', () => {
    const game = { ...base, score: undefined, live: true, period: 3, statusLabel: 'Q3 5:12' }
    const { container } = wrap(game)
    const badge = container.querySelector('.live-badge')
    expect(badge).toBeInTheDocument()
    expect(badge.textContent).toContain('Q3')
    expect(badge.getAttribute('title')).toContain('Q3 5:12')

    // A live game with no status label falls back to a plain "Live" tooltip.
    cleanup()
    const { container: c2 } = wrap({ ...base, score: undefined, live: true, period: 2 })
    expect(c2.querySelector('.live-badge').getAttribute('title')).toContain('Live —')
    expect(c2.querySelector('.live-badge').textContent).toContain('Q2')
  })

  it('labels a canceled game distinctly from a postponed one', () => {
    wrap({ ...base, score: undefined, canceled: true })
    expect(screen.getByText('Canceled')).toBeInTheDocument()
    cleanup()
    wrap({ ...base, score: undefined, postponed: true })
    expect(screen.getByText('Postponed')).toBeInTheDocument()
  })

  it('marks a final with the overtime suffix', () => {
    wrap({ ...base, ot: 1 })
    expect(screen.getByText('Final/OT')).toBeInTheDocument()
    cleanup()
    wrap({ ...base, ot: 2 })
    expect(screen.getByText('Final/2OT')).toBeInTheDocument()
    cleanup()
    wrap(base)
    expect(screen.getByText('Final')).toBeInTheDocument()
  })

  it('shows just the venue when no city is present', () => {
    const { container } = wrap({ ...base, city: undefined })
    expect(container.querySelector('.game-meta').textContent).toContain('Paycom Center')
    expect(container.querySelector('.game-meta').textContent).not.toContain(',')
  })

  it('opens the game on Enter and Space via the keyboard', () => {
    const onOpen = vi.fn()
    const { container } = wrap(base, { onOpen })
    const card = container.querySelector('.game')
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })
    fireEvent.click(card)
    expect(onOpen).toHaveBeenCalledTimes(3)
    // A non-activating key does nothing.
    fireEvent.keyDown(card, { key: 'a' })
    expect(onOpen).toHaveBeenCalledTimes(3)
  })

  it('toggles follow via the star without opening the card', () => {
    const onOpen = vi.fn()
    const { container } = wrap(base, { onOpen })
    const star = container.querySelector('.star')
    // A click on the star follows but stops the card from opening.
    fireEvent.click(star)
    expect(onOpen).not.toHaveBeenCalled()
    // A keydown on the star also stops propagation.
    fireEvent.keyDown(star, { key: 'Enter' })
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('reflects the followed state and falls back to the abbr for an unknown team', () => {
    localStorage.setItem('nba:followed', JSON.stringify(['HOU']))
    const { container } = wrap({ ...base, home: 'ZZZ' })
    // HOU is followed → the "Unfollow" control.
    expect(screen.getByRole('button', { name: /Unfollow/ })).toBeInTheDocument()
    // ZZZ is not a real franchise → the label uses the raw abbreviation.
    expect(screen.getByRole('button', { name: 'Follow ZZZ' })).toBeInTheDocument()
    expect(container.querySelector('.side.followed')).toBeInTheDocument()
    expect(container.querySelector('.star.on').textContent).toBe('★')
  })

  it('renders watch chips and a countdown for an upcoming broadcast game', () => {
    localStorage.setItem('nba:services', JSON.stringify(['peacock']))
    const upcoming = {
      ...base,
      score: undefined,
      tip: '2027-01-15T00:00:00.000Z',
      broadcast: ['NBC', 'Peacock'],
      note: 'NBA Cup - Group Play',
    }
    const { container } = wrap(upcoming)
    const watch = container.querySelector('.watch')
    expect(watch).toBeInTheDocument()
    expect(watch).toHaveAccessibleName('Watch on Peacock')
    // Upcoming state shows the tip time and a countdown.
    expect(container.querySelector('.time')).toBeInTheDocument()
    expect(container.querySelector('.countdown').textContent).toMatch(/^in /)
    // The note renders too.
    expect(container.querySelector('.note').textContent).toBe('NBA Cup - Group Play')
  })
})
