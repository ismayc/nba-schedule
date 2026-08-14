import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))
import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { whenBucket } from '../src/utils/time.js'
import { GAMES } from '../src/data/schedule.js'

const NOW = new Date('2026-07-19T18:00:00.000Z').getTime()

const game = (over) => ({ id: 'g', tip: '2026-07-19T18:00:00.000Z', home: 'NY', away: 'BOS', ...over })

const mount = async () => {
  const utils = render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>
  )
  await act(async () => {})
  return utils
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('whenBucket', () => {
  it('reads a ticking game as live', () => {
    expect(whenBucket(game({ live: true }), NOW)).toBe('live')
  })

  it('reads a game that has tipped without a feed as live too', () => {
    // Inside the ~2h15m window liveState calls this 'likely-live' — the card shows it
    // as under way, so the filter has to agree or the chip lies about what's on screen.
    expect(whenBucket(game(), NOW + 30 * 60 * 1000)).toBe('live')
  })

  it('reads a scheduled game as upcoming', () => {
    expect(whenBucket(game(), NOW - 60 * 60 * 1000)).toBe('upcoming')
  })

  it('reads a played game as finished', () => {
    expect(whenBucket(game({ score: [90, 82] }), NOW)).toBe('final')
  })

  it('reads a long-past game with no score as finished', () => {
    expect(whenBucket(game(), NOW + 10 * 60 * 60 * 1000)).toBe('final')
  })

  it('keeps a postponed game out of all three buckets', () => {
    expect(whenBucket(game({ postponed: true }), NOW)).toBe('void')
    expect(whenBucket(game({ canceled: true }), NOW)).toBe('void')
  })
})

describe('the When filter in the app', () => {
  const openFilters = () => userEvent.click(screen.getByRole('button', { name: /⚙ Filters/ }))

  it('narrows the schedule, counts on the badge, and clears', async () => {
    await mount()
    await openFilters()
    const cardCount = () => document.querySelectorAll('article.game').length

    const finished = screen.getByRole('button', { name: '✓ Finished' })
    expect(finished).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(finished)
    expect(finished).toHaveAttribute('aria-pressed', 'true')

    // "All the cards left are finished" would pass even with the filter doing
    // nothing. The CONTRAST is what has teeth: one bucket keeps games and the other
    // must empty the list entirely. Which is which depends on the season state —
    // a fresh rollover is all upcoming, a finished season all played — so derive
    // it from the data rather than pinning either era.
    const anyPlayed = GAMES.some((g) => g.score)
    if (anyPlayed) {
      expect(cardCount()).toBeGreaterThan(0)
      for (const c of document.querySelectorAll('article.game')) {
        expect(c.className).toMatch(/state-(final|past)\b/)
      }
    } else {
      expect(cardCount()).toBe(0)
      expect(screen.getByText(/No games match those filters/)).toBeInTheDocument()
    }

    expect(screen.getByRole('button', { name: /⚙ Filters/ })).toHaveTextContent('1')

    await userEvent.click(screen.getByRole('button', { name: '⏱ Upcoming' }))
    if (anyPlayed && GAMES.every((g) => g.score)) {
      // A fully played season: Upcoming is the empty bucket.
      expect(cardCount()).toBe(0)
      expect(screen.getByText(/No games match those filters/)).toBeInTheDocument()
    } else {
      expect(cardCount()).toBeGreaterThan(0)
      for (const c of document.querySelectorAll('article.game')) {
        expect(c.className).not.toMatch(/state-(final|past)\b/)
      }
    }

    await userEvent.click(screen.getByRole('button', { name: /Clear all/ }))
    expect(cardCount()).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '✓ Finished' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('clicking the active chip clears it instead of stacking a second bucket', async () => {
    await mount()
    await openFilters()
    const upcoming = screen.getByRole('button', { name: '⏱ Upcoming' })
    await userEvent.click(upcoming)
    expect(upcoming).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(upcoming)
    expect(upcoming).toHaveAttribute('aria-pressed', 'false')
  })

  it('switching buckets replaces the selection', async () => {
    await mount()
    await openFilters()
    await userEvent.click(screen.getByRole('button', { name: '⏱ Upcoming' }))
    await userEvent.click(screen.getByRole('button', { name: '✓ Finished' }))
    expect(screen.getByRole('button', { name: '⏱ Upcoming' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(screen.getByRole('button', { name: '✓ Finished' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})
