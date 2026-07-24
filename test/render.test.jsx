import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StandingsView from '../src/components/StandingsView.jsx'
import ScheduleView from '../src/components/ScheduleView.jsx'
import StatsView from '../src/components/StatsView.jsx'
import GameCard from '../src/components/GameCard.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { GAMES } from '../src/data/schedule.js'
import { dayKey, todayKey } from '../src/utils/time.js'

const TZ = 'America/New_York'

beforeEach(() => {
  // jsdom has no layout, so scrollIntoView is absent.
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
})

describe('StandingsView', () => {
  // Both conferences render at once; each is a 15-team table led by its #1 seed.
  it('renders both conferences, 15 teams each, leaders first', () => {
    render(<StandingsView games={GAMES} />)
    const rows = screen.getAllByRole('row').filter((r) => within(r).queryByRole('button', { name: /Follow/ }))
    expect(rows).toHaveLength(30)

    const east = screen.getByText('Eastern Conference').closest('.card')
    const eastRows = within(east)
      .getAllByRole('row')
      .filter((r) => within(r).queryByRole('button', { name: /Follow/ }))
    expect(eastRows).toHaveLength(15)
    // Detroit tops the East in the committed 2025-26 season.
    expect(within(eastRows[0]).getByText('Pistons')).toBeInTheDocument()
  })

  it('marks the seed-6 series line and the seed-10 play-in cut per conference', () => {
    render(<StandingsView games={GAMES} />)
    // One banner per conference for each of the two cut lines: seeds 1–6 clinch a
    // series, and seeds 7–10 are the play-in field (10 is the elimination line, not 8).
    expect(screen.getAllByText(/Seeds 1–6 clinch a series/i)).toHaveLength(2)
    expect(screen.getAllByText(/Play-in cut — seeds 7–10/i)).toHaveLength(2)
  })

  it('names both conferences', () => {
    render(<StandingsView games={GAMES} />)
    expect(screen.getByText('Eastern Conference')).toBeInTheDocument()
    expect(screen.getByText('Western Conference')).toBeInTheDocument()
  })

  it('calls onPick when a team is clicked', async () => {
    const onPick = vi.fn()
    const { container } = render(<StandingsView games={GAMES} onPick={onPick} />)
    // The first team button is the East #1 seed — Detroit.
    await userEvent.click(container.querySelector('.team-btn'))
    expect(onPick).toHaveBeenCalledWith('DET')
  })
})

describe('GameCard', () => {
  const base = {
    id: '1',
    tip: '2026-07-19T17:00:00.000Z',
    seasonType: 'regular',
    home: 'DAL',
    away: 'LAL',
    score: [90, 82],
    venue: 'American Airlines Center',
    city: 'Dallas',
  }

  it('marks the winner and shows the final', () => {
    const { container } = render(<GameCard game={base} tz={TZ} />)
    expect(screen.getByText('Final')).toBeInTheDocument()
    expect(container.querySelector('.side.winner .side-nick').textContent).toBe('Mavericks')
  })

  it('annotates overtime', () => {
    render(<GameCard game={{ ...base, ot: 2 }} tz={TZ} />)
    expect(screen.getByText('Final/2OT')).toBeInTheDocument()
  })

  it('hides scores in spoiler-free mode', () => {
    render(<GameCard game={base} tz={TZ} hideScores />)
    expect(screen.queryByText('90')).not.toBeInTheDocument()
  })

  it('renders tip time in the chosen timezone', () => {
    render(<GameCard game={{ ...base, score: undefined }} tz={TZ} />)
    expect(screen.getByText('1:00 PM')).toBeInTheDocument()
    // Same instant, three hours earlier out west.
    render(<GameCard game={{ ...base, score: undefined }} tz="America/Los_Angeles" />)
    expect(screen.getByText('10:00 AM')).toBeInTheDocument()
  })

  it('flags postponed games', () => {
    render(<GameCard game={{ ...base, score: undefined, postponed: true }} tz={TZ} />)
    expect(screen.getByText('Postponed')).toBeInTheDocument()
  })

  it('labels games on the viewer’s chosen services and skips ones that are not', () => {
    // Viewer has YouTube TV and Peacock.
    localStorage.setItem('nba:services', JSON.stringify(['youtubetv', 'peacock']))
    const withServices = (game) => (
      <ServicesProvider>
        <GameCard game={game} tz={TZ} />
      </ServicesProvider>
    )

    // NBC + Peacock simulcast is watchable both ways — labels in catalog order.
    const { container, rerender } = render(withServices({ ...base, broadcast: ['NBC', 'Peacock'] }))
    const watch = container.querySelector('.watch')
    expect(watch).toHaveAccessibleName('Watch on Peacock, YouTube TV')
    expect([...watch.querySelectorAll('.watch-chip')].map((c) => c.textContent)).toEqual([
      'Peacock',
      'YouTube TV',
    ])
    // "Peacock" shows only as the badge, not repeated as a raw network; NBC (the bundle's
    // underlying network) still shows in the meta line.
    expect(container.querySelector('.game-meta').textContent).toContain('NBC')
    expect(screen.getAllByText('Peacock')).toHaveLength(1)

    // A game only on services the viewer lacks carries no badge.
    rerender(withServices({ ...base, broadcast: ['NBA League Pass'] }))
    expect(container.querySelector('.watch')).toBeNull()
  })

  it('shows no service badge until the viewer picks services', () => {
    // No provider / empty selection → the raw broadcast still renders, but no badge.
    const { container } = render(<GameCard game={{ ...base, broadcast: ['NBC', 'Peacock'] }} tz={TZ} />)
    expect(container.querySelector('.watch')).toBeNull()
  })
})

describe('StatsView leaders', () => {
  it('forces one decimal on per-game averages so the column stays aligned', () => {
    const { container } = render(<StatsView games={GAMES} tz={TZ} />)
    // Default category is Points (PPG): every value reads like "21.0", never bare "21".
    const vals = [...container.querySelectorAll('.lead-value')].map((n) => n.textContent)
    expect(vals.length).toBeGreaterThan(0)
    for (const v of vals) expect(v).toMatch(/^\d+\.\d$/)
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

describe('ScheduleView', () => {
  it('groups games under day headings', () => {
    const { container } = render(<ScheduleView games={GAMES} tz={TZ} showPast />)
    // The committed 2025-26 season is entirely in the past, so its months all start
    // collapsed (the open current month holds no games). Expand one to see its days.
    fireEvent.click(container.querySelector('.month-head'))
    expect(container.querySelectorAll('.day').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/game/).length).toBeGreaterThan(0)
  })

  it('shows an empty state when filters match nothing', () => {
    render(<ScheduleView games={[]} tz={TZ} />)
    expect(screen.getByText(/No games match/i)).toBeInTheDocument()
  })

  // Past days are dropped whole rather than by tip-off time, so a game earlier
  // today still counts as today.
  describe('recent window and full season', () => {
    // Synthetic games placed RELATIVE to the real "today" (not the committed schedule),
    // so the window math is deterministic whatever day the suite runs — no wall-clock
    // flake, and no dependence on where the committed season sits.
    const today = todayKey(TZ)
    const shift = (key, delta) => {
      const [y, m, d] = key.split('-').map(Number)
      return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
    }
    const g = (id, date, home, away, score) => ({
      id,
      tip: `${date}T16:00:00.000Z`, // noon ET — safely the same calendar day in TZ
      seasonType: 'regular',
      home,
      away,
      ...(score ? { score } : {}),
    })
    const dOld = shift(today, -14) // older than a week -> hidden by default
    const dRecent = shift(today, -3) // within the last week -> shown by default
    const dFuture = shift(today, 5)
    const games = [
      g('old', dOld, 'MIN', 'NY', [80, 70]),
      g('recent', dRecent, 'BOS', 'LAL', [88, 84]),
      g('today', today, 'CHI', 'ATL', [70, 66]),
      g('future', dFuture, 'PHX', 'LAC'),
    ]
    const keysOf = (c) =>
      [...c.querySelectorAll('.day')].map((d) => d.querySelector('.day-head span').textContent)

    it('defaults to the last week of results plus upcoming, hiding older days', () => {
      const { container } = render(<ScheduleView games={games} tz={TZ} />)
      // recent (−3), today, future (+5) show; the 14-days-ago game does not.
      expect(container.querySelectorAll('.day')).toHaveLength(3)
      expect(keysOf(container)).toContain('Today')
      // The recent view is a plain list — no month machinery.
      expect(container.querySelector('.month-jump')).toBeFalsy()
    })

    it('lands scrolled on the most recent past day (so yesterday is right there)', () => {
      const spy = Element.prototype.scrollIntoView
      render(<ScheduleView games={games} tz={TZ} />)
      expect(spy).toHaveBeenCalled()
    })

    it('anchors on today when nothing is in the past', () => {
      const spy = Element.prototype.scrollIntoView
      render(
        <ScheduleView games={[g('today', today, 'CHI', 'ATL', [70, 66]), g('future', dFuture, 'PHX', 'LAC')]} tz={TZ} />
      )
      expect(spy).toHaveBeenCalled()
    })

    it('does not scroll when no rendered day matches the anchor', () => {
      const spy = Element.prototype.scrollIntoView
      // Only a future day: anchor falls back to today, which has no rendered day.
      render(<ScheduleView games={[g('future', dFuture, 'PHX', 'LAC')]} tz={TZ} />)
      expect(spy).not.toHaveBeenCalled()
    })

    it('shows an empty state when no games match', () => {
      const { container } = render(<ScheduleView games={[]} tz={TZ} />)
      expect(container.querySelector('.empty')).toBeTruthy()
    })

    it('falls back to the last week of games when the season is finished', () => {
      // Everything well in the past (no recent, no upcoming) — instead of a blank default
      // view, show the completed season's most recent game-days.
      const finished = [
        g('p1', shift(today, -40), 'MIN', 'NY', [80, 70]),
        g('p2', shift(today, -35), 'BOS', 'LAL', [88, 84]),
        g('p3', shift(today, -30), 'CHI', 'ATL', [70, 66]),
      ]
      const { container } = render(<ScheduleView games={finished} tz={TZ} />)
      expect(container.querySelector('.empty')).toBeFalsy()
      expect(container.querySelectorAll('.day')).toHaveLength(3)
    })
  })

  describe('full season — collapsible months + jump bar', () => {
    const today = todayKey(TZ)
    const [Y, M, D] = today.split('-').map(Number)
    // Days pinned to specific months relative to the current one, so month grouping is
    // deterministic. inMonth(0, …) stays in the current month; ±1/±2 land in siblings.
    const inMonth = (offset, day = 15) =>
      new Date(Date.UTC(Y, M - 1 + offset, day)).toISOString().slice(0, 10)
    const g = (id, date, home, away, score) => ({
      id,
      tip: `${date}T16:00:00.000Z`,
      seasonType: 'regular',
      home,
      away,
      ...(score ? { score } : {}),
    })
    const otherDay = D === 25 ? 5 : 25 // a second current-month day, guaranteed ≠ today
    const games = [
      g('m2', inMonth(-2), 'MIN', 'NY', [80, 70]),
      g('m1', inMonth(-1), 'BOS', 'LAL', [88, 84]),
      g('today', today, 'CHI', 'ATL', [70, 66]),
      g('cur2', inMonth(0, otherDay), 'PHX', 'LAC', [90, 88]),
      g('n1', inMonth(1), 'DAL', 'IND'),
    ]
    const view = () => render(<ScheduleView games={games} tz={TZ} showPast />)

    it('renders a jump chip per month and opens only the current month', () => {
      const { container } = view()
      // Four distinct months -> four chips and four sections.
      expect(container.querySelectorAll('.month-jump .month-chip:not(.month-today)')).toHaveLength(4)
      expect(container.querySelectorAll('.month')).toHaveLength(4)
      // Only the current month is open, so only its two days render.
      expect(container.querySelectorAll('.month-days')).toHaveLength(1)
      expect(container.querySelectorAll('.day')).toHaveLength(2)
      // The current month's chip is flagged, and its header count is pluralized.
      expect(container.querySelector('.month-chip.is-current')).toBeTruthy()
      expect(container.querySelector('.month-head.open .month-count').textContent).toBe('2 games')
    })

    it('expands a collapsed month on click, then collapses the current one', () => {
      const { container } = view()
      const collapsed = [...container.querySelectorAll('.month-head')].find(
        (h) => !h.classList.contains('open')
      )
      fireEvent.click(collapsed)
      expect(container.querySelectorAll('.month-days')).toHaveLength(2)
      expect(collapsed.querySelector('.month-count').textContent).toBe('1 game') // singular
      // Collapsing the current month hides its days again.
      fireEvent.click(container.querySelector('.month-head.open'))
      expect(container.querySelectorAll('.month-days')).toHaveLength(1)
    })

    it('jumping to a month expands it and scrolls it into view', () => {
      const spy = Element.prototype.scrollIntoView
      const { container } = view()
      const openedBefore = container.querySelectorAll('.month-days').length
      const calledBefore = spy.mock.calls.length
      // The first chip is the earliest month, which starts collapsed.
      fireEvent.click(container.querySelector('.month-jump .month-chip'))
      expect(container.querySelectorAll('.month-days').length).toBeGreaterThan(openedBefore)
      expect(spy.mock.calls.length).toBeGreaterThan(calledBefore)
    })

    it('Today jump scrolls to today’s own day (a day row, not the month header)', () => {
      const spy = Element.prototype.scrollIntoView
      const { container } = view() // includes a game dated today
      fireEvent.click(container.querySelector('.month-today'))
      const last = spy.mock.contexts[spy.mock.contexts.length - 1]
      expect(last).toHaveClass('day')
      expect(last).toHaveClass('is-today')
    })

    it('Today jump goes to the next game-day when today has no game', () => {
      const spy = Element.prototype.scrollIntoView
      // No game dated today; a later-this-month game is the next game-day. The jump must
      // land on THAT day row, not on a month header.
      const noToday = [
        g('cur', inMonth(0, otherDay), 'PHX', 'LAC', [90, 88]),
        g('m1', inMonth(-1), 'BOS', 'LAL', [80, 70]),
      ]
      const { container } = render(<ScheduleView games={noToday} tz={TZ} showPast />)
      fireEvent.click(container.querySelector('.month-today'))
      const last = spy.mock.contexts[spy.mock.contexts.length - 1]
      expect(last).toHaveClass('day')
      expect(last).not.toHaveClass('is-today')
    })
  })
})
