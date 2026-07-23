import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StatsView from '../src/components/StatsView.jsx'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'

const EAST = ['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DET', 'IND', 'MIA', 'MIL', 'NY', 'ORL', 'PHI', 'TOR', 'WSH']
const WEST = ['DAL', 'DEN', 'GS', 'HOU', 'LAC', 'LAL', 'MEM', 'MIN', 'NO', 'OKC', 'PHX', 'POR', 'SAC', 'SA', 'UTAH']

// A half-finished season: within each conference a single round-robin is played (higher
// seed beats lower) and the return leg is left unplayed, so every team has games
// remaining. Nobody is mathematically clinched or eliminated, which forces the "in",
// "play-in" and "chasing" statuses plus live magic numbers into the race table.
const partialSeason = () => {
  const games = []
  let n = 0
  for (const conf of [EAST, WEST]) {
    for (let i = 0; i < conf.length; i++) {
      for (let j = i + 1; j < conf.length; j++) {
        games.push({
          id: `p${n++}`,
          seasonType: 'regular',
          tip: '2026-01-10T00:00:00.000Z',
          home: conf[i],
          away: conf[j],
          score: [80, 70],
          line: { home: [20, 20, 20, 20], away: [18, 17, 18, 17] },
        })
        games.push({
          id: `u${n++}`,
          seasonType: 'regular',
          tip: '2026-12-10T00:00:00.000Z',
          home: conf[j],
          away: conf[i],
        })
      }
    }
  }
  return games
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
})

describe('StatsView coverage', () => {
  it('expands the overtime and one-possession tiles into game lists', async () => {
    const { container } = render(<StatsView games={GAMES} tz={TZ} />)
    const tileButtons = container.querySelectorAll('.tile-btn')
    expect(tileButtons.length).toBe(2)

    // Overtime tile → a drill-down list annotated with OT counts.
    await userEvent.click(tileButtons[0])
    let drill = container.querySelector('.drill')
    expect(drill).toBeInTheDocument()
    expect(container.querySelector('.tile-btn.open')).toBeInTheDocument()
    expect(container.querySelector('.tile-caret').textContent).toBe('▾')
    expect(within(drill).getAllByText(/OT/).length).toBeGreaterThan(0)

    // One-possession tile → margins.
    await userEvent.click(container.querySelectorAll('.tile-btn')[1])
    drill = container.querySelector('.drill')
    expect(within(drill).getAllByText(/^by \d+$/).length).toBeGreaterThan(0)

    // Clicking the open tile again collapses it (toggle back to null).
    await userEvent.click(container.querySelectorAll('.tile-btn')[1])
    expect(container.querySelector('.drill')).toBeNull()
  })

  it('switches the leaders category to a percentage and a count', async () => {
    const { container } = render(<StatsView games={GAMES} tz={TZ} />)

    await userEvent.click(screen.getByRole('button', { name: 'FG%' }))
    expect(screen.getByText(/League leaders — Field goal %/)).toBeInTheDocument()
    // Percentage categories carry a trailing %.
    expect(container.querySelector('.lead-value').textContent).toMatch(/%$/)

    await userEvent.click(screen.getByRole('button', { name: 'DD' }))
    expect(screen.getByText(/League leaders — Double-doubles/)).toBeInTheDocument()
    // Double-double counts are whole numbers — no decimal, no percent.
    expect(container.querySelector('.lead-value').textContent).toMatch(/^\d+$/)

    // Back to a per-game average category → a plain one-decimal value.
    await userEvent.click(screen.getByRole('button', { name: 'PPG' }))
    expect(container.querySelector('.lead-value').textContent).toMatch(/^\d+\.\d$/)
  })

  it('routes team and player picks from every panel', async () => {
    const onPickTeam = vi.fn()
    const onPickPlayer = vi.fn()
    const { container } = render(
      <StatsView games={GAMES} tz={TZ} onPickTeam={onPickTeam} onPickPlayer={onPickPlayer} />
    )

    await userEvent.click(container.querySelector('.lead-team button'))
    expect(onPickTeam).toHaveBeenCalled()

    await userEvent.click(container.querySelector('.lead-player'))
    expect(onPickPlayer).toHaveBeenCalled()

    await userEvent.click(container.querySelector('.margin-team'))
    await userEvent.click(container.querySelector('.race .team-btn'))
    expect(onPickTeam.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('renders both positive and negative scoring margins', () => {
    const { container } = render(<StatsView games={GAMES} tz={TZ} />)
    // A completed season has strong and weak teams → both bar polarities appear.
    expect(container.querySelector('.margin-bar.pos')).toBeInTheDocument()
    expect(container.querySelector('.margin-bar.neg')).toBeInTheDocument()
  })

  it('marks clinched and eliminated teams once the season is decided', () => {
    const { container } = render(<StatsView games={GAMES} tz={TZ} />)
    const race = within(container.querySelector('.race'))
    expect(race.getAllByText('Clinched').length).toBeGreaterThan(0)
    expect(race.getAllByText('Eliminated').length).toBeGreaterThan(0)
    // Eliminated rows get the dimming class.
    expect(container.querySelector('.race tr.row-elim')).toBeInTheDocument()
    // Both conference tables render.
    expect(container.querySelectorAll('.race').length).toBe(2)
    // The cutline rows appear (seeds 1–6 clinch, play-in below).
    expect(container.querySelectorAll('.cutline').length).toBeGreaterThan(0)
  })

  it('shows in-the-field, play-in and chasing statuses with live magic numbers mid-season', () => {
    const { container } = render(<StatsView games={partialSeason()} tz={TZ} />)
    const race = within(container.querySelector('.card:last-child'))
    expect(race.getAllByText('In the field').length).toBeGreaterThan(0)
    expect(race.getAllByText('Play-in').length).toBeGreaterThan(0)
    expect(race.getAllByText('Chasing').length).toBeGreaterThan(0)
    // A live race publishes magic numbers (not the em-dash placeholder) for contenders.
    const magicCells = [...container.querySelectorAll('.race tbody tr td.num:nth-child(5)')]
    expect(magicCells.some((td) => /^\d+$/.test(td.textContent))).toBe(true)
    // Chasing teams below the play-in cut show a games-back figure.
    const gbCells = [...container.querySelectorAll('.race .hide-sm')]
    expect(gbCells.some((td) => /\d/.test(td.textContent))).toBe(true)
  })
})
