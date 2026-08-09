import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'

vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))
vi.mock('../src/services/player.js', () => ({
  fetchPlayer: () => Promise.resolve(null),
  headshotUrl: () => 'data:image/gif;base64,',
}))

// The season's LAST unplayed game. When it goes live the overlay hands it a score —
// but a live score is provisional, so seasonOver must stay false and polling must
// keep running until the game is actually final. (Pre-fix, the provisional score
// flipped seasonOver mid-game and killed the live polling exactly when it mattered.)
vi.mock('../src/data/schedule.js', () => ({
  GAMES: [
    {
      id: '910001',
      tip: '2026-03-15T23:30:00.000Z',
      seasonType: 'regular',
      home: 'OKC',
      away: 'HOU',
      venue: 'Paycom Center',
      city: 'Oklahoma City',
      state: 'OK',
      broadcast: ['ESPN'],
    },
  ],
}))

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

const LIVE_EVENT = {
  id: '910001',
  competitions: [
    {
      status: {
        period: 2,
        displayClock: '3:45',
        type: { state: 'in', completed: false, shortDetail: 'Q2 3:45' },
      },
      competitors: [
        { homeAway: 'home', score: { value: 60 } },
        { homeAway: 'away', score: { value: 58 } },
      ],
    },
  ],
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  // Pin the clock just after tip so the imminent/live window math is deterministic.
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-03-15T23:45:00.000Z'))
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [LIVE_EVENT] }) })
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('a live final game of the season', () => {
  it('keeps polling — a live score does not end the season', async () => {
    render(
      <FollowProvider>
        <ServicesProvider>
          <App />
        </ServicesProvider>
      </FollowProvider>
    )
    // Flush the initial load (one scoreboard request per day in the window).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    const afterFirstLoad = fetch.mock.calls.length
    expect(afterFirstLoad).toBeGreaterThan(0)

    // The overlay has landed a provisional score; the live cadence must survive it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetch.mock.calls.length).toBeGreaterThan(afterFirstLoad)
  })
})
