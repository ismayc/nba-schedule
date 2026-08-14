import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The scorers list reads the committed PLAYERS table — empty right after a rollover —
// so swap in the frozen 2025-26 fixture rows (which include two New York players).
vi.mock('../src/data/leaders.js', async () => {
  const { PLAYERS_2526 } = await import('./fixtures/season2526.js')
  return { PLAYERS: PLAYERS_2526 }
})

import TeamPanel from '../src/components/TeamPanel.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { GAMES } from '../src/data/schedule.js'
import { HISTORY_BY_YEAR, HISTORY } from '../src/data/history.js'
import { playersByTeam } from '../src/utils/stats.js'
import { PLAYED_2526 } from './fixtures/season2526.js'
import { decidedSeason } from './fixtures/decided.js'

const TZ = 'America/New_York'
// The record/form/scorers sections need PLAYED games, which the live schedule lacks
// after a rollover — render New York over its frozen 14-game fixture pool.
const open = (abbr = 'NY', props = {}) =>
  render(
    <FollowProvider>
      <TeamPanel abbr={abbr} games={PLAYED_2526} tz={TZ} onClose={() => {}} {...props} />
    </FollowProvider>
  )

// Tests that need the "Next up" section use the real schedule padded with two games
// pinned ahead of it in board order.
const upcomingFor = (abbr) => [
  { id: `up-${abbr}-1`, tip: '2026-08-01T23:00:00.000Z', seasonType: 'regular', home: abbr, away: 'BOS' },
  { id: `up-${abbr}-2`, tip: '2026-08-03T23:00:00.000Z', seasonType: 'regular', home: 'BOS', away: abbr },
  ...GAMES,
]

describe('TeamPanel', () => {
  it('renders nothing without a team', () => {
    const { container } = render(<TeamPanel abbr={null} games={GAMES} tz={TZ} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the team, record, conference, and seed', () => {
    open()
    expect(screen.getByRole('dialog', { name: 'New York Knicks' })).toBeInTheDocument()
    // Frozen fixture pool: New York went 9-5 over its first 14 games. Its pool
    // opponents carry perfect 1-0/2-1 records from the same games, so by winning
    // percentage New York sits 4th in the pool's East table.
    expect(screen.getByText(/9–5/)).toBeInTheDocument()
    expect(screen.getByText(/Eastern Conference/)).toBeInTheDocument()
    expect(screen.getByText(/seed 4/)).toBeInTheDocument()
  })

  it('shows the six headline splits', () => {
    const { container } = open()
    const labels = [...container.querySelectorAll('.tp-stat-l')].map((n) => n.textContent)
    expect(labels).toEqual(['Scored', 'Allowed', 'Net', 'Home', 'Road', 'Left'])
  })

  it('signs the net rating', () => {
    const { container } = open()
    const net = container.querySelectorAll('.tp-stat-v')[2].textContent
    expect(net.startsWith('+')).toBe(true)
  })

  it('shows at most ten form chips, each won or lost', () => {
    const { container } = open()
    const chips = [...container.querySelectorAll('.tp-chip')]
    expect(chips.length).toBeGreaterThan(0)
    expect(chips.length).toBeLessThanOrEqual(10)
    for (const c of chips) expect(['W', 'L']).toContain(c.textContent)
  })

  it('hides form in spoiler-free mode', () => {
    const { container } = open('NY', { hideScores: true })
    expect(container.querySelectorAll('.tp-chip')).toHaveLength(0)
  })

  it('lists leading scorers in descending order', () => {
    const { container } = open()
    const lines = [...container.querySelectorAll('.tp-p-line')].map((n) =>
      Number(n.textContent.split(' ')[0])
    )
    expect(lines.length).toBeGreaterThan(0)
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i - 1]).toBeGreaterThanOrEqual(lines[i])
    }
  })

  it('lists only unplayed games under Next up', () => {
    open('MIN', { games: upcomingFor('MIN') })
    const list = screen.getByText('Next up').nextElementSibling
    const rows = list.querySelectorAll('li')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(5)
  })

  it('marks each upcoming game as home or away', () => {
    open('MIN', { games: upcomingFor('MIN') })
    const list = screen.getByText('Next up').nextElementSibling
    for (const li of list.querySelectorAll('li')) {
      expect(['vs', 'at']).toContain(within(li).getByText(/^(vs|at)$/).textContent)
    }
  })

  it('toggles following', async () => {
    open('MIN')
    const btn = screen.getByRole('button', { name: /Follow/ })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(btn)
    expect(screen.getByRole('button', { name: /Following/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('routes to the full schedule and closes', async () => {
    const onSchedule = vi.fn()
    const onClose = vi.fn()
    open('MIN', { onSchedule, onClose })
    await userEvent.click(screen.getByRole('button', { name: /Full schedule/ }))
    expect(onSchedule).toHaveBeenCalledWith('MIN')
    expect(onClose).toHaveBeenCalled()
  })

  it('opens a game from the form strip', async () => {
    const onOpenGame = vi.fn()
    const { container } = open('NY', { onOpenGame })
    await userEvent.click(container.querySelector('.tp-chip'))
    expect(onOpenGame).toHaveBeenCalled()
    expect(onOpenGame.mock.calls[0][0]).toBeTruthy()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    open('MIN', { onClose })
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('badges a clinched leader and an eliminated tail-ender in a decided season', () => {
    // The frozen 2025-26 pool decides nothing; the synthetic decided season does.
    render(
      <FollowProvider>
        <TeamPanel abbr="ATL" games={decidedSeason()} tz={TZ} onClose={() => {}} />
      </FollowProvider>
    )
    expect(screen.getByText(/✓ clinched/)).toBeInTheDocument()

    render(
      <FollowProvider>
        <TeamPanel abbr="WSH" games={decidedSeason()} tz={TZ} onClose={() => {}} />
      </FollowProvider>
    )
    expect(screen.getByText(/✕ eliminated/)).toBeInTheDocument()
  })

  it('works for every team in the league', () => {
    const abbrs = ['ATL', 'BKN', 'BOS', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GS',
      'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NO', 'NY', 'OKC', 'ORL',
      'PHI', 'PHX', 'POR', 'SA', 'SAC', 'TOR', 'UTAH', 'WSH']
    for (const abbr of abbrs) {
      const { unmount } = open(abbr)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      unmount()
    }
  })
})

describe('TeamPanel opened from an archived season', () => {
  // Regression: the panel was rendered once at App level off the live board, so
  // clicking a team in the History view described the CURRENT season — the wrong
  // record, the wrong seed, and a roster of players who were not on that team
  // that year. Given a season it must describe that season instead.
  const archived = HISTORY[0]
  const conf = archived.standings.E.length ? 'E' : 'W'
  const target = archived.standings[conf][0]

  const openArchived = () =>
    render(
      <FollowProvider>
        <TeamPanel abbr={target.abbr} season={archived} games={GAMES} tz={TZ} onClose={() => {}} />
      </FollowProvider>,
    )

  it('shows that season’s record and seed, not the live one', () => {
    openArchived()
    const sub = document.querySelector('.tp-sub')
    expect(sub).toHaveTextContent(`${target.w}–${target.l}`)
    expect(sub).toHaveTextContent(`seed ${target.seed}`)

    // Prove it differs from what the live board would have said, so the test
    // cannot pass by accident on a season that happens to match.
    const { container: live } = render(
      <FollowProvider>
        <TeamPanel abbr={target.abbr} games={GAMES} tz={TZ} onClose={() => {}} />
      </FollowProvider>,
    )
    expect(live.querySelector('.tp-sub').textContent).not.toBe(sub.textContent)
  })

  it('scores that season’s per-game figures from its committed totals', () => {
    openArchived()
    const tiles = [...document.querySelectorAll('.tp-stat')].map((n) => n.textContent)
    const gp = target.w + target.l
    expect(tiles.join(' ')).toContain((target.pf / gp).toFixed(1))
    expect(tiles.join(' ')).toContain((target.pa / gp).toFixed(1))
    // A finished season has nothing left to play.
    expect(tiles.some((t) => /^0Left$/.test(t.replace(/\s/g, '')))).toBe(true)
  })

  it('lists that season’s players, not this season’s', () => {
    openArchived()
    const names = [...document.querySelectorAll('.tp-p-name')].map((n) => n.firstChild.textContent)
    const archivedNames = Object.values(archived.players)
      .filter((p) => p.team === target.abbr)
      .map((p) => p.name)
    expect(names.length).toBeGreaterThan(0)
    for (const n of names) expect(archivedNames).toContain(n)

    // And the live roster for the same team is a different list.
    const liveNames = playersByTeam(target.abbr).slice(0, 6).map((p) => p.name)
    expect(names).not.toEqual(liveNames)
  })

  it('omits the last-10 form, which the archive does not commit', () => {
    openArchived()
    expect(screen.queryByText('Last 10')).not.toBeInTheDocument()
  })
})
