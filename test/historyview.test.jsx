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


})

// The live Stats view's cards, driven by an archived season. Every number here is a real
// 2022-23 figure, so a bad join or a wrong denominator fails rather than merely rendering.
describe('HistoryView — stats for one season', () => {
  const stats = async (season = 2023, props = {}) => {
    const utils = mount({ season, ...props })
    await userEvent.click(mode('Stats'))
    return utils
  }

  it('keeps the season picker, so stats follow the chosen year', async () => {
    const { container } = await stats(2021)
    expect(container.querySelector('.season-pick select')).toHaveValue('2021')
    // 2020-21 was the 72-game season.
    expect(container.querySelector('.tile-value')).toHaveTextContent('1,080')
  })

  it('shows the season totals it can no longer derive from games', async () => {
    const { container } = await stats()
    const tiles = [...container.querySelectorAll('.tile')].map((t) => t.textContent)
    expect(tiles[0]).toMatch(/1,230Games played/)
    expect(tiles[1]).toMatch(/282,127Points scored/)
    expect(tiles[3]).toMatch(/58%Home win rate714 of 1,230/)
    expect(tiles[4]).toMatch(/79Overtime games/)
  })

  it('drills into the closest games, each opening its box score', async () => {
    const onOpen = vi.fn()
    const { container } = await stats(2023, { onOpen })
    await userEvent.click(container.querySelectorAll('.tile-btn')[0])

    const rows = container.querySelectorAll('.drill li')
    expect(rows).toHaveLength(5)
    // The five closest games of 2022-23 were all won by a single point.
    for (const r of rows) expect(r.querySelector('.drill-note')).toHaveTextContent('by 1')

    await userEvent.click(container.querySelector('button.drill-row'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }))

    // Clicking the open tile again collapses it.
    await userEvent.click(container.querySelectorAll('.tile-btn')[0])
    expect(container.querySelector('.drill')).toBeNull()
  })

  it('drills into the highest-scoring games by combined total', async () => {
    const { container } = await stats()
    await userEvent.click(container.querySelectorAll('.tile-btn')[1])

    const notes = [...container.querySelectorAll('.drill-note')].map((n) => n.textContent)
    expect(notes).toHaveLength(5)
    // 2022-23's wildest night: Kings at Clippers, 176–175 in double overtime.
    expect(notes[0]).toBe('351 total')
    // Listed highest first.
    const totals = notes.map((n) => Number(n.replace(' total', '')))
    expect(totals).toEqual([...totals].sort((a, b) => b - a))
  })

  it('renders a full leaderboard for every category, ties and all', async () => {
    const { container } = await stats()
    expect(container.querySelectorAll('.cats .cat')).toHaveLength(9)
    // Opens on points: Embiid led 2022-23 at 33.08.
    const first = container.querySelector('.leaders tr')
    expect(first).toHaveTextContent('Joel Embiid')
    expect(first).toHaveTextContent('33.08')

    // A percentage category formats as a percentage…
    await userEvent.click([...container.querySelectorAll('.cat')].find((b) => b.textContent === 'FG%'))
    expect(container.querySelector('.leaders tr')).toHaveTextContent('70.53%')

    // …and a counting category stays a whole number, with ties sharing a rank.
    await userEvent.click([...container.querySelectorAll('.cat')].find((b) => b.textContent === 'TD'))
    const td = [...container.querySelectorAll('.leaders tr')].map((r) => r.textContent)
    expect(td[0]).toBe('1Nikola JokicC29')
    expect(td.filter((t) => t.startsWith('7'))).toHaveLength(2)
  })

  it('opens a leader’s pop-out with that season’s stat line, not this season’s', async () => {
    const onPickPlayer = vi.fn()
    const { container } = await stats(2023, { onPickPlayer })
    await userEvent.click(container.querySelector('.lead-player'))
    // Embiid's real 2022-23 line — the modal needs the whole row, not just the value.
    expect(onPickPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Joel Embiid', gamesPlayed: 66, avgRebounds: 10.1515 })
    )
  })

  it('ranks the scoring margin from points for and against', async () => {
    const { container } = await stats()
    const rows = container.querySelectorAll('.margin-row')
    expect(rows).toHaveLength(30)
    // 2022-23 Boston: best net rating in the league at +6.5 (117.9 scored, 111.4 allowed).
    expect(rows[0]).toHaveTextContent('Celtics')
    expect(rows[0]).toHaveTextContent('+6.5')
    expect(rows[0]).toHaveTextContent('117.9')
    expect(rows[0]).toHaveTextContent('111.4')
    // Worst is negative, so both arms of the diverging scale render.
    expect(rows[29].querySelector('.margin-bar.neg')).toBeTruthy()
  })

  it('routes a margin-chart team click to the team panel', async () => {
    const onPick = vi.fn()
    const { container } = await stats(2023, { onPick })
    await userEvent.click(container.querySelector('.margin-team'))
    // The season travels with the team: the panel it opens has to describe THAT
    // season, not whichever one the live board happens to be on.
    expect(onPick).toHaveBeenCalledWith('BOS', 2023)
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
    // Each row names its own season, so the panel opens on that year.
    expect(onPick).toHaveBeenCalledWith(HISTORY_BY_YEAR[2026].viaPlayIn.E[0], 2026)
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
    expect(onPick).toHaveBeenCalledWith('NY', 2026)
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
