import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HistoryView from '../src/components/HistoryView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { HISTORY_BY_YEAR } from '../src/data/history.js'

const TZ = 'America/New_York'

// The bracket inside a season renders team names, which read the follow context.
const mount = (props = {}) =>
  render(
    <FollowProvider>
      <HistoryView tz={TZ} {...props} />
    </FollowProvider>
  )

const mode = (name) =>
  within(document.querySelector('.view-tools')).getByRole('button', { name })

describe('HistoryView — one season', () => {
  it('opens on the newest archived season', () => {
    const { container } = mount()
    expect(container.querySelector('.season-pick select')).toHaveValue('2026')
    // 2025-26's champion, in the banner the bracket puts above itself.
    expect(screen.getByText(/win the title/)).toHaveTextContent(/New York Knicks/)
  })

  it('falls back to the newest season for a year it does not hold', () => {
    // 2018-19 predates the play-in entirely, so it is not (and never will be) archived.
    const { container } = mount({ season: 2019 })
    expect(container.querySelector('.season-pick select')).toHaveValue('2026')
  })

  it('shows the chosen season and reports a change back to the app', async () => {
    const onSeason = vi.fn()
    const { container } = mount({ season: 2023, onSeason })
    expect(container.querySelector('.season-pick select')).toHaveValue('2023')

    await userEvent.selectOptions(container.querySelector('.season-pick select'), '2021')
    expect(onSeason).toHaveBeenCalledWith(2021)
  })

  it('renders that season’s champion, bracket, play-in ladder, standings and leaders', () => {
    const { container } = mount({ season: 2023 })

    // 2022-23: Denver beat Miami 4-1.
    expect(screen.getByText(/win the title/)).toHaveTextContent(
      /Denver Nuggets.*beating Miami Heat 4–1 in the Finals/
    )
    // Who came through the play-in that year.
    expect(container.querySelector('.hy-note')).toHaveTextContent(
      /Hawks.*Heat.*Eastern.*Lakers.*Timberwolves.*Western/
    )
    // The full bracket: 15 series, and the six play-in games under it.
    expect(screen.getAllByText('Best of 7')).toHaveLength(15)
    expect(container.querySelectorAll('.pi-game')).toHaveLength(6)
    // Both conference tables, all 30 teams.
    expect(container.querySelectorAll('.standings tbody tr')).toHaveLength(30)
    // Six leader categories, ten deep.
    expect(container.querySelectorAll('.hy-leader-cat')).toHaveLength(6)
    expect(container.querySelectorAll('.hy-leader-list li')).toHaveLength(60)
  })

  it('lists the real final table for that season', () => {
    const { container } = mount({ season: 2023 })
    const east = container.querySelectorAll('.standings')[0]
    const top = within(east).getAllByRole('row')[1]
    // Milwaukee won the 2022-23 East at 58-24.
    expect(top).toHaveTextContent('Bucks')
    expect(top).toHaveTextContent('58')
    expect(top).toHaveTextContent('24')
  })

  it('routes a team click to the team panel and a game to its box score', async () => {
    const onPick = vi.fn()
    const onOpen = vi.fn()
    const { container } = mount({ season: 2023, onPick, onOpen })

    await userEvent.click(container.querySelector('.standings .hy-team'))
    expect(onPick).toHaveBeenCalled()

    await userEvent.click(container.querySelector('.dots .dot'))
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ seasonType: 'playoffs', round: 'R1' })
    )
  })

  it('routes a leader click to that player’s team', async () => {
    const onPick = vi.fn()
    const { container } = mount({ season: 2023, onPick })
    await userEvent.click(container.querySelector('.hy-leader-list .hy-team'))
    // 2022-23 scoring leader: Joel Embiid, Philadelphia.
    expect(onPick).toHaveBeenCalledWith('PHI')
  })
})

describe('HistoryView — play-in qualifiers', () => {
  it('lists every seed the play-in has produced, with its route and its run', async () => {
    const { container } = mount()
    await userEvent.click(mode('Play-in qualifiers'))

    const rows = container.querySelectorAll('.hy-table tbody tr')
    expect(rows).toHaveLength(24) // 6 seasons × 2 conferences × 2 seeds
    const heat = [...rows].find((r) => r.textContent.includes('2022-23') && r.textContent.includes('Heat'))
    expect(heat).toHaveTextContent('Lost the 7/8 game, then won the 8th-seed game')
    expect(heat).toHaveTextContent('Lost the Finals')
  })

  it('jumps back to a season from its row', async () => {
    const onSeason = vi.fn()
    const { container } = mount({ onSeason })
    await userEvent.click(mode('Play-in qualifiers'))
    await userEvent.click(container.querySelector('.hy-year'))
    expect(onSeason).toHaveBeenCalledWith(2026)
  })

  it('opens a team panel from the table', async () => {
    const onPick = vi.fn()
    const { container } = mount({ onPick })
    await userEvent.click(mode('Play-in qualifiers'))
    await userEvent.click(container.querySelector('.hy-table .hy-team'))
    expect(onPick).toHaveBeenCalledWith(HISTORY_BY_YEAR[2026].viaPlayIn.E[0])
  })
})

describe('HistoryView — a play-in team that wins the title', () => {
  // Hasn't happened. The 2022-23 Heat came closest, reaching the Finals as an 8 seed out
  // of the play-in, so this replays that season with the Finals scores flipped — the
  // smallest change that produces the case the table is built to celebrate.
  const flipped = {
    ...HISTORY_BY_YEAR[2023],
    games: HISTORY_BY_YEAR[2023].games.map((g) =>
      g.round === 'Final' ? { ...g, score: [g.score[1], g.score[0]] } : g
    ),
  }

  it('marks the row and crowns it in the qualifier table', async () => {
    const { container } = mount({ seasons: [flipped] })
    await userEvent.click(mode('Play-in qualifiers'))

    const champRow = container.querySelector('.hy-champ-row')
    expect(champRow).toHaveTextContent('Heat')
    expect(champRow).toHaveTextContent('🏆 Won the title')
  })
})

describe('HistoryView — champions', () => {
  it('lists every champion with the Finals margin and that season’s best record', async () => {
    const { container } = mount()
    await userEvent.click(mode('Champions'))

    const rows = [...container.querySelectorAll('.hy-table tbody tr')].map((r) =>
      [...r.cells].map((c) => c.textContent.trim())
    )
    expect(rows).toHaveLength(6)
    expect(rows[1]).toEqual(['2024-25', 'Thunder', 'Pacers', '4–3', 'Thunder 68-14'])
    // 2022-23 is the one season here whose champion did not have the best record.
    expect(rows[3]).toEqual(['2022-23', 'Nuggets', 'Heat', '4–1', 'Bucks 58-24'])
  })

  it('jumps back to a season, and opens a champion’s team panel', async () => {
    const onSeason = vi.fn()
    const onPick = vi.fn()
    const { container } = mount({ onSeason, onPick })
    await userEvent.click(mode('Champions'))

    await userEvent.click(container.querySelector('.hy-year'))
    expect(onSeason).toHaveBeenCalledWith(2026)

    await userEvent.click(container.querySelector('.hy-table .hy-team'))
    expect(onPick).toHaveBeenCalledWith('NY')
  })
})

describe('HistoryView — mode switching', () => {
  it('marks the active mode and swaps the panel', async () => {
    mount()
    expect(mode('By season')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(/reached the playoffs through the play-in/)).not.toBeInTheDocument()

    await userEvent.click(mode('Champions'))
    expect(mode('Champions')).toHaveAttribute('aria-pressed', 'true')
    expect(mode('By season')).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('.season-pick')).toBeNull()
  })
})
