import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Keep the game-detail summary/player off the network and deterministic.
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))
vi.mock('../src/services/player.js', () => ({
  fetchPlayer: () => Promise.resolve(null),
  headshotUrl: () => 'data:image/gif;base64,',
}))

// The real committed NBA season is fully decided, so the poll effect would short-circuit
// (seasonOver === true) and none of the live-overlay wiring would ever run. Swap in a tiny
// schedule with ONE not-yet-played game so seasonOver is false and the app actually polls.
vi.mock('../src/data/schedule.js', () => ({
  GAMES: [
    {
      id: '900001',
      tip: '2026-03-14T23:30:00.000Z',
      seasonType: 'regular',
      home: 'BOS',
      away: 'MIA',
      venue: 'TD Garden',
      city: 'Boston',
      state: 'MA',
      broadcast: ['ESPN'],
      score: [110, 101],
      line: { home: [28, 27, 28, 27], away: [25, 25, 26, 25] },
    },
    {
      id: '900100',
      tip: '2026-03-15T23:30:00.000Z',
      seasonType: 'regular',
      home: 'OKC',
      away: 'HOU',
      venue: 'Paycom Center',
      city: 'Oklahoma City',
      state: 'OK',
      broadcast: ['ESPN'],
    },
    // A second still-upcoming game with no live counterpart. Once the overlay gives the
    // in-progress game a running score, THIS game is what keeps seasonOver false so the
    // poll effect keeps running at the live cadence.
    {
      id: '900101',
      tip: '2026-03-16T23:30:00.000Z',
      seasonType: 'regular',
      home: 'LAL',
      away: 'GSW',
      venue: 'Crypto.com Arena',
      city: 'Los Angeles',
      state: 'CA',
      broadcast: ['ESPN'],
    },
  ],
}))

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

const UPCOMING = '900100'

// A live scoreboard event that flips the committed upcoming game to in-progress.
const liveEvent = (id = UPCOMING) => ({
  id,
  competitions: [
    {
      status: {
        period: 3,
        displayClock: '4:21',
        type: { state: 'in', completed: false, shortDetail: 'Q3 4:21' },
      },
      competitors: [
        { homeAway: 'home', score: { value: 60 } },
        { homeAway: 'away', score: { value: 58 } },
      ],
    },
  ],
})
const scoreboard = (events) => ({ ok: true, json: async () => ({ events }) })

const mount = () =>
  render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>
  )

// A poll's promise chain (fetch x3 -> json -> build map -> setLive -> re-render ->
// the effect re-run that repolls at the new cadence) spans several microtask hops.
// Advancing the fake clock a few rounds lets the whole chain settle deterministically.
const settle = async (rounds = 4) => {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
  }
}

// The cadence/retire tests fake the clock (and pin it so date-window queries are
// deterministic); the branch outcomes themselves don't depend on wall-clock — the app
// polls whenever the season isn't over, and nLive comes from the id-keyed overlay.
const useFake = () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-15T23:25:00.000Z'))
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(scoreboard([])))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('live overlay from a poll', () => {
  it('surfaces the live-now count and updated-at stamp and polls at the live cadence', async () => {
    useFake()
    fetch.mockResolvedValue(scoreboard([liveEvent()]))
    mount()
    await settle()

    // The overlay flips the committed upcoming game to in-progress.
    expect(screen.getByText(/1 live now/)).toBeInTheDocument()
    // A successful poll records an updated-at stamp in the footer.
    expect(screen.getByText(/Updated/)).toBeInTheDocument()

    // nLive > 0 -> the interval runs at the 30s live cadence. Advancing 30s fires it.
    const before = fetch.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetch.mock.calls.length).toBeGreaterThan(before)
  })

  it('stays on the idle cadence when nothing is live', async () => {
    useFake()
    fetch.mockResolvedValue(scoreboard([])) // nothing in progress
    mount()
    await settle()
    const afterMount = fetch.mock.calls.length
    expect(afterMount).toBeGreaterThan(0)
    expect(screen.queryByText(/live now/)).not.toBeInTheDocument()

    // No poll at 30s — the idle interval is two minutes.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetch.mock.calls.length).toBe(afterMount)

    // The next poll lands once the full 120s idle interval elapses.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000)
    })
    expect(fetch.mock.calls.length).toBeGreaterThan(afterMount)
  })
})

describe('live alerts fire toasts', () => {
  it('raises a tipoff toast when a game goes live and opens the game from it', async () => {
    // Real timers here so userEvent's pointer interactions resolve normally.
    localStorage.setItem('nba:alerts', '1')
    fetch.mockResolvedValue(scoreboard([liveEvent()]))
    mount()

    // The overlay flips a committed (not-live) game to live -> a tipoff moment.
    const toast = await screen.findByRole('status')
    expect(within(toast).getByText('Tipoff')).toBeInTheDocument()

    // Clicking the toast body opens that game's detail (Toasts onOpen).
    await userEvent.click(within(toast).getByRole('button', { name: /Tipoff/ }))
    expect(screen.getByRole('dialog', { name: 'Game detail' })).toBeInTheDocument()
  })

  it('filters toasts to a followed team when one is followed', async () => {
    // OKC (the upcoming game's home) is followed -> the alerts effect passes the followed
    // set as the team filter (the truthy side of that branch).
    localStorage.setItem('nba:alerts', '1')
    localStorage.setItem('nba:followed', JSON.stringify(['OKC']))
    fetch.mockResolvedValue(scoreboard([liveEvent()]))
    mount()
    const toast = await screen.findByRole('status')
    expect(within(toast).getByText('Tipoff')).toBeInTheDocument()
  })

  it('lets a toast be dismissed', async () => {
    localStorage.setItem('nba:alerts', '1')
    fetch.mockResolvedValue(scoreboard([liveEvent()]))
    mount()
    const toast = await screen.findByRole('status')
    await userEvent.click(within(toast).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('retires a toast on its own after a few seconds', async () => {
    useFake()
    localStorage.setItem('nba:alerts', '1')
    fetch.mockResolvedValue(scoreboard([liveEvent()]))
    mount()
    await settle()
    expect(screen.queryByRole('status')).toBeInTheDocument()
    // The 9s auto-retire timeout fires on the faked clock.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
