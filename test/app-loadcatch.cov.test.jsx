import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'

vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))

// One not-yet-played game so seasonOver is false and the poll effect actually runs
// (the real committed season is complete and would short-circuit).
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
  ],
}))

// Keep the real overlay math but make the fetch itself reject, so App's load() try/catch
// is exercised — the committed schedule must still render.
vi.mock('../src/services/espn.js', async (importActual) => {
  const actual = await importActual()
  return { ...actual, fetchLive: vi.fn().mockRejectedValue(new Error('feed down')) }
})

import App from '../src/App.jsx'
import { fetchLive } from '../src/services/espn.js'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/?past=1')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a rejecting live feed', () => {
  it('swallows the error and still renders the committed schedule', async () => {
    render(
      <FollowProvider>
        <ServicesProvider>
          <App />
        </ServicesProvider>
      </FollowProvider>
    )
    await act(async () => {})
    await waitFor(() => expect(fetchLive).toHaveBeenCalled())
    expect(document.querySelectorAll('.game').length).toBeGreaterThan(0)
  })
})
