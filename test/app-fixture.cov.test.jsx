import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// App wiring that NEEDS a played, multi-phase season — form strips, leader boards,
// and phase chips are all empty against the live schedule right after a rollover
// (the 2026-27 data has no scores, no leaders, and only regular-season games). The
// schedule and player modules are mocked with the frozen 2025-26 fixture rows plus
// the archived postseason, so these paths stay exercised whatever the live season
// looks like. The sibling app.test.jsx keeps everything that works on live data.
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))
vi.mock('../src/services/player.js', () => ({
  fetchPlayer: () => Promise.resolve(null),
  headshotUrl: () => 'data:image/gif;base64,',
}))
vi.mock('../src/data/schedule.js', async () => {
  const { PLAYED_2526, CUP_FINAL_2526 } = await import('./fixtures/season2526.js')
  const { HISTORY_BY_YEAR } = await import('../src/data/history.js')
  return { GAMES: [...PLAYED_2526, CUP_FINAL_2526, ...HISTORY_BY_YEAR[2026].games] }
})
vi.mock('../src/data/leaders.js', async () => {
  const { PLAYERS_2526 } = await import('./fixtures/season2526.js')
  return { PLAYERS: PLAYERS_2526 }
})

import App from '../src/App.jsx'
import StatsView from '../src/components/StatsView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'

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
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const toggle = () => screen.getByRole('button', { name: /⚙ Filters/ })
// The phase chips share their labels with the nav (🏆 Playoffs), so scope to the chip row.
const phaseChip = (name) =>
  within(document.querySelector('.phase-chips')).getByRole('button', { name })
// The fixture season is entirely in the past, so Full season groups it into collapsed
// month sections; expand them all to put the games on screen.
const expandMonths = () => {
  for (const h of document.querySelectorAll('.month-head:not(.open)')) fireEvent.click(h)
}

describe('phase chips over a multi-phase season', () => {
  it('narrows the schedule to a chosen phase and back', async () => {
    window.history.replaceState(null, '', '/?past=1')
    await mount()
    expandMonths()
    const all = document.querySelectorAll('.game').length
    expect(all).toBeGreaterThan(0)
    await userEvent.click(toggle())

    // Exactly one Cup game exists, so the chip narrows the whole season to it.
    const cup = phaseChip('🏅 Cup')
    await userEvent.click(cup)
    expect(cup).toHaveAttribute('aria-pressed', 'true')
    expandMonths()
    expect(document.querySelectorAll('.game')).toHaveLength(1)

    // Deselecting restores the full list (empty phases = all).
    await userEvent.click(cup)
    expect(cup).toHaveAttribute('aria-pressed', 'false')
    expandMonths()
    expect(document.querySelectorAll('.game').length).toBe(all)
  })

  it('offers a Play-In chip that isolates the six play-in games', async () => {
    window.history.replaceState(null, '', '/?past=1')
    await mount()
    await userEvent.click(toggle())
    await userEvent.click(phaseChip('⚡ Play-In'))
    expandMonths()
    expect(document.querySelectorAll('.game')).toHaveLength(
      GAMES.filter((g) => g.seasonType === 'playin').length
    )
  })

  it('counts an active phase filter on the badge and Clear all resets it', async () => {
    await mount()
    await userEvent.click(toggle())
    await userEvent.click(phaseChip('🏆 Playoffs'))
    expect(within(toggle()).getByText('1')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(phaseChip('🏆 Playoffs')).toHaveAttribute('aria-pressed', 'false')
    expect(within(toggle()).queryByText('1')).not.toBeInTheDocument()
  })
})

describe('team panel wiring over played games', () => {
  it('opens a past game from the form strip', async () => {
    window.history.replaceState(null, '', '/?view=standings')
    await mount()
    await userEvent.click(document.querySelector('.team-btn'))
    const panel = screen.getByRole('dialog')
    const chip = panel.querySelector('.tp-chip')
    expect(chip).toBeTruthy()
    await userEvent.click(chip)
    // onOpenGame closes the panel and opens that game's detail.
    expect(await screen.findByRole('dialog', { name: 'Game detail' })).toBeInTheDocument()
  })
})

describe('StatsView over a real leaderboard', () => {
  it('forces two decimals on per-game averages so the column stays aligned', () => {
    const { container } = render(<StatsView games={GAMES} tz={TZ} />)
    // Default category is Points (PPG): every value reads like "21.00", never bare "21".
    const vals = [...container.querySelectorAll('.lead-value')].map((n) => n.textContent)
    expect(vals.length).toBeGreaterThan(0)
    for (const v of vals) expect(v).toMatch(/^\d+\.\d\d$/)
  })

  it('opens the player pop-out with the full stat row when a name is clicked', async () => {
    const onPickPlayer = vi.fn()
    const { container } = render(<StatsView games={GAMES} tz={TZ} onPickPlayer={onPickPlayer} />)
    await userEvent.click(container.querySelector('.lead-player'))
    expect(onPickPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ name: expect.any(String), avgPoints: expect.any(Number) })
    )
  })
})

describe('game detail over rostered teams', () => {
  it('shows the Leading scorer tale-of-the-tape row when both sides have one', async () => {
    // A frozen NY–MIA game; the mocked PLAYERS table carries a top scorer for both.
    const game = GAMES.find((g) => [g.home, g.away].sort().join() === 'MIA,NY')
    window.history.replaceState(null, '', `/?game=${game.id}`)
    await mount()
    await userEvent.click(screen.getByRole('tab', { name: 'Matchup' }))
    expect(screen.getByText('Leading scorer')).toBeInTheDocument()
  })
})

describe('player modal wiring over a real leaderboard', () => {
  it('opens a player from the stats leaders and closes it', async () => {
    window.history.replaceState(null, '', '/?view=stats')
    await mount()
    const playerBtn = document.querySelector('.lead-player')
    expect(playerBtn).toBeTruthy()
    await userEvent.click(playerBtn)
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
