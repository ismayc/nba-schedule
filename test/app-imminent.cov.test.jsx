import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'

vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))
vi.mock('../src/services/player.js', () => ({
  fetchPlayer: () => Promise.resolve(null),
  headshotUrl: () => 'data:image/gif;base64,',
}))

// One unscored game, so the schedule module (not the wall clock) decides which cadence
// branch runs. On main the committed season is either fully played (pre-rollover) or
// fully unplayed (post-rollover) — neither is stable, hence the mock.
vi.mock('../src/data/schedule.js', () => ({
  GAMES: [
    {
      id: '910500',
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

const TIP = new Date('2026-03-15T23:30:00.000Z').getTime()

const mount = () =>
  render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>
  )

const flush = async (rounds = 4) => {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
  }
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('warm polling around a scheduled tip', () => {
  it('polls at the live cadence inside the pre-tip warm-up window, before anything is live', async () => {
    // Five minutes to tip, feed still says pre — the whole point of the warm-up:
    // the flip to live must land within one 30s refresh, not up to two minutes late.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(TIP - 5 * 60_000))
    mount()
    await flush()
    const afterMount = fetch.mock.calls.length
    expect(afterMount).toBeGreaterThan(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetch.mock.calls.length).toBeGreaterThan(afterMount)
  })

  it('stays on the idle cadence a day out from the next tip', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(TIP - 24 * 60 * 60_000))
    mount()
    await flush()
    const afterMount = fetch.mock.calls.length
    expect(afterMount).toBeGreaterThan(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetch.mock.calls.length).toBe(afterMount)
  })
})
