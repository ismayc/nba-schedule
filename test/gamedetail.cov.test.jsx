import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Control the summary fetch per-test so we can drive the attendance/officials rows and
// the abort path that the network-stubbed suites never reach.
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: vi.fn() }))
import { fetchGameSummary } from '../src/services/summary.js'
import GameDetail from '../src/components/GameDetail.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'
const doubleOT = GAMES.find((g) => g.line && g.line.home.length > 5)
const played = GAMES.find((g) => g.score && g.venue && g.broadcast?.includes('Peacock'))

const open = (game, props = {}) =>
  render(<GameDetail game={game} games={GAMES} tz={TZ} onClose={() => {}} {...props} />)

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  fetchGameSummary.mockReset()
  fetchGameSummary.mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
})

describe('GameDetail coverage', () => {
  it('returns null with no game', () => {
    const { container } = render(<GameDetail game={null} games={GAMES} tz={TZ} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('labels a double-overtime column as OT2 in the line score', async () => {
    open(doubleOT)
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    const heads = [...document.querySelectorAll('.linescore thead th')].map((n) => n.textContent)
    expect(heads).toContain('OT2')
    // The winning quarter cells are bolded.
    expect(document.querySelector('.linescore td.q-won')).toBeInTheDocument()
  })

  it('labels a single overtime column as OT and suffixes the header Final/OT', async () => {
    const singleOT = {
      id: 'ot1',
      tip: '2026-01-04T00:00:00.000Z',
      seasonType: 'regular',
      home: 'BOS',
      away: 'MIA',
      score: [110, 108],
      ot: 1,
      line: { home: [25, 25, 25, 25, 10], away: [24, 26, 24, 26, 8] },
    }
    open(singleOT)
    // Header reads Final/OT for a single-overtime game.
    expect(document.querySelector('.md-state').textContent).toBe('Final/OT')
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    const heads = [...document.querySelectorAll('.linescore thead th')].map((n) => n.textContent)
    expect(heads).toContain('OT')
    expect(heads).not.toContain('OT2')
  })

  it('renders an en-dash for a missing quarter and null for an empty line', async () => {
    const withGap = {
      id: 'gap1',
      tip: '2026-01-01T00:00:00.000Z',
      seasonType: 'regular',
      home: 'BOS',
      away: 'MIA',
      score: [70, 65],
      line: { home: [20, 25, 15, 10], away: [18, null, 20, 12] },
    }
    open(withGap)
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    const cells = [...document.querySelectorAll('.linescore tbody td')].map((n) => n.textContent)
    expect(cells).toContain('–')

    // An empty line renders no table at all.
    cleanup()
    open({ ...withGap, id: 'empty1', line: { home: [], away: [] } })
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    expect(document.querySelector('.linescore')).toBeNull()
  })

  it('hides the line score under spoiler-free mode', async () => {
    open(doubleOT, { hideScores: true })
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    expect(document.querySelector('.linescore')).toBeNull()
  })

  it('hides game leaders when there are no stars, or none on either roster', async () => {
    const noStars = {
      id: 'ns1',
      tip: '2026-01-02T00:00:00.000Z',
      seasonType: 'regular',
      home: 'BOS',
      away: 'MIA',
      score: [80, 70],
      line: { home: [20, 20, 20, 20], away: [18, 18, 17, 17] },
    }
    open(noStars)
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    expect(screen.queryByText('Game leaders')).toBeNull()

    // Stars that belong to neither team also collapse the section.
    cleanup()
    open({ ...noStars, id: 'ns2', stars: [{ cat: 'points', v: '30', who: 'Nobody', team: 'ZZZ' }] })
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    expect(screen.queryByText('Game leaders')).toBeNull()
  })

  it('shows game leaders with a known label and an uncategorised one verbatim', async () => {
    const game = {
      id: 'gl1',
      tip: '2026-01-03T00:00:00.000Z',
      seasonType: 'regular',
      home: 'BOS',
      away: 'MIA',
      score: [80, 70],
      line: { home: [20, 20, 20, 20], away: [18, 18, 17, 17] },
      stars: [
        { cat: 'points', v: '30', who: 'A. Player', team: 'MIA' },
        { cat: 'steals', v: '5', who: 'B. Player', team: 'BOS' },
      ],
    }
    open(game)
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    expect(screen.getByText('Game leaders')).toBeInTheDocument()
    // 'points' maps to the PTS label; 'steals' isn't in CAT_LABEL so it renders as-is.
    expect(screen.getByText('PTS')).toBeInTheDocument()
    expect(screen.getByText('steals')).toBeInTheDocument()
  })

  it('shows the live status label in the header of an in-progress game', () => {
    const live = {
      id: 'live1',
      tip: '2026-01-06T00:00:00.000Z',
      seasonType: 'regular',
      home: 'BOS',
      away: 'MIA',
      live: true,
      score: [55, 50],
      statusLabel: 'Q3 3:12',
      line: { home: [20, 20, 15], away: [18, 17, 15] },
    }
    open(live)
    expect(document.querySelector('.md-state').textContent).toBe('Q3 3:12')

    // A live game with no status label falls back to a plain "Live".
    cleanup()
    open({ ...live, id: 'live2', statusLabel: undefined })
    expect(document.querySelector('.md-state').textContent).toBe('Live')
  })

  it('closes when the backdrop itself is pressed', () => {
    const onClose = vi.fn()
    open(played, { onClose })
    fireEvent.mouseDown(document.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalled()
    // A mousedown that starts on an inner element does NOT close.
    fireEvent.mouseDown(document.querySelector('.modal'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows attendance and officials once the summary loads', async () => {
    fetchGameSummary.mockResolvedValue({
      box: null,
      teamStats: null,
      injuries: [],
      info: { attendance: 18211, officials: ['Ref One', 'Ref Two'] },
      winprob: null,
    })
    open(played)
    expect(await screen.findByText('Attendance')).toBeInTheDocument()
    expect(screen.getByText('18,211')).toBeInTheDocument()
    expect(screen.getByText('Officials')).toBeInTheDocument()
    expect(screen.getByText('Ref One · Ref Two')).toBeInTheDocument()
  })

  it('renders watch chips for a game on the viewer’s services', () => {
    localStorage.setItem('nba:services', JSON.stringify(['peacock']))
    render(
      <ServicesProvider>
        <GameDetail game={played} games={GAMES} tz={TZ} onClose={() => {}} />
      </ServicesProvider>
    )
    const watch = document.querySelector('.md-facts .watch')
    expect(watch).toBeInTheDocument()
    expect(watch).toHaveAccessibleName('Watch on Peacock')
  })

  it('renders a venue without a state, omitting the trailing comma', () => {
    const game = {
      id: 'v1',
      tip: '2026-01-05T00:00:00.000Z',
      seasonType: 'regular',
      home: 'BOS',
      away: 'MIA',
      score: [80, 70],
      venue: 'Neutral Arena',
      city: 'Someplace',
      note: 'NBA Cup',
      line: { home: [20, 20, 20, 20], away: [18, 18, 17, 17] },
    }
    open(game)
    const dd = [...document.querySelectorAll('.md-facts dd')].find((n) =>
      n.textContent.includes('Neutral Arena')
    )
    expect(dd.textContent).toBe('Neutral Arena, Someplace')
    // The note row renders in the facts list.
    expect(screen.getByText('NBA Cup')).toBeInTheDocument()
  })

  it('renders a venue with neither a city nor a state', () => {
    const game = {
      id: 'v2',
      tip: '2026-01-05T00:00:00.000Z',
      seasonType: 'regular',
      home: 'BOS',
      away: 'MIA',
      score: [80, 70],
      venue: 'Bare Arena',
      line: { home: [20, 20, 20, 20], away: [18, 18, 17, 17] },
    }
    open(game)
    const dd = [...document.querySelectorAll('.md-facts dd')].find((n) =>
      n.textContent.includes('Bare Arena')
    )
    expect(dd.textContent).toBe('Bare Arena')
  })

  it('leaves the tale of the tape unmarked when the teams are dead even', async () => {
    // A tiny standings universe where BOS and MIA have identical records.
    const games = [
      { id: 'm1', seasonType: 'regular', tip: '2026-01-01T00:00:00.000Z', home: 'BOS', away: 'DEN', score: [80, 70], line: { home: [], away: [] } },
      { id: 'n1', seasonType: 'regular', tip: '2026-01-01T00:00:00.000Z', home: 'MIA', away: 'NY', score: [80, 70], line: { home: [], away: [] } },
    ]
    const game = { id: 'even1', seasonType: 'regular', tip: '2027-01-01T00:00:00.000Z', home: 'MIA', away: 'BOS' }
    render(<GameDetail game={game} games={games} tz={TZ} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Matchup' }))
    // Equal record, PPG, and allowed → no side is bolded on those rows.
    expect(document.querySelectorAll('.tale-val.better').length).toBe(0)
  })

  it('renders the season series and matchup tale for a played game', async () => {
    // Two prior meetings between BOS and MIA, one each way.
    const games = [
      { id: 'a', seasonType: 'regular', tip: '2026-01-01T00:00:00.000Z', home: 'BOS', away: 'MIA', score: [100, 90], line: { home: [], away: [] } },
      { id: 'b', seasonType: 'regular', tip: '2026-02-01T00:00:00.000Z', home: 'MIA', away: 'BOS', score: [88, 80], line: { home: [], away: [] } },
    ]
    const game = games[0]
    render(<GameDetail game={game} games={games} tz={TZ} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Matchup' }))
    expect(screen.getByText(/Season series/)).toBeInTheDocument()
    // A bolded record cell shows the better side is marked.
    expect(document.querySelector('.tale-val.better')).toBeInTheDocument()

    // Under spoiler-free mode the series scores are masked.
    cleanup()
    render(<GameDetail game={game} games={games} tz={TZ} hideScores onClose={() => {}} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Matchup' }))
    expect(document.querySelector('.drill-score').textContent).toBe('—')
  })

  it('opens the home team’s schedule from the actions row', async () => {
    const onPickTeam = vi.fn()
    const onClose = vi.fn()
    open(played, { onPickTeam, onClose })
    const btns = screen.getAllByRole('button', { name: /schedule$/ })
    await userEvent.click(btns[1]) // the home side
    expect(onPickTeam).toHaveBeenCalledWith(played.home)
    expect(onClose).toHaveBeenCalled()
  })

  it('opens the away team’s schedule and closes on the X', async () => {
    const onPickTeam = vi.fn()
    const onClose = vi.fn()
    open(played, { onPickTeam, onClose })
    const btns = screen.getAllByRole('button', { name: /schedule$/ })
    await userEvent.click(btns[0]) // the away side
    expect(onPickTeam).toHaveBeenCalledWith(played.away)
    cleanup()

    const onClose2 = vi.fn()
    open(played, { onClose: onClose2 })
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose2).toHaveBeenCalled()
  })

  it('opens an upcoming game on the matchup tab with no scoring tab', async () => {
    const upcoming = {
      id: 'up1',
      seasonType: 'regular',
      tip: '2027-03-01T00:00:00.000Z',
      home: 'BOS',
      away: 'MIA',
    }
    open(upcoming)
    // No score → the header shows the tip time and a countdown, and there is no Scoring tab.
    expect(document.querySelector('.md-time')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Scoring' })).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Matchup' })).toHaveAttribute('aria-selected', 'true')
    )
    // The lineups placeholder shows on the box tab before any summary posts.
    await userEvent.click(screen.getByRole('tab', { name: 'Box score' }))
    expect(await screen.findByText('Starting lineups')).toBeInTheDocument()
  })

  it('falls back to the first tab when the active one disappears', async () => {
    const upcoming = {
      id: 'up2',
      seasonType: 'regular',
      tip: '2027-03-02T00:00:00.000Z',
      home: 'BOS',
      away: 'MIA',
    }
    const { rerender } = render(
      <GameDetail game={played} games={GAMES} tz={TZ} onClose={() => {}} />
    )
    // Move to the Scoring tab, which only exists for a played game…
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    // …then swap in an upcoming game, whose TABS have no Scoring: the render
    // before the effect resets falls back to the first tab.
    rerender(<GameDetail game={upcoming} games={GAMES} tz={TZ} onClose={() => {}} />)
    expect(screen.queryByRole('tab', { name: 'Scoring' })).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Matchup' })).toHaveAttribute('aria-selected', 'true')
    )
  })

  it('surfaces the injury report on the matchup tab', async () => {
    fetchGameSummary.mockResolvedValue({
      box: null,
      teamStats: null,
      injuries: [{ abbr: 'MIA', players: [{ name: 'Jimmy Butler', pos: 'F', status: 'Out', detail: 'Knee' }] }],
      info: null,
      winprob: null,
    })
    const game = {
      id: 'inj1',
      seasonType: 'regular',
      tip: '2026-01-08T00:00:00.000Z',
      home: 'BOS',
      away: 'MIA',
      score: [80, 70],
      line: { home: [20, 20, 20, 20], away: [18, 18, 17, 17] },
    }
    open(game)
    await userEvent.click(screen.getByRole('tab', { name: 'Matchup' }))
    expect(await screen.findByRole('heading', { name: 'Injury report' })).toBeInTheDocument()
    expect(screen.getByText('Jimmy Butler')).toBeInTheDocument()
  })

  it('ignores a summary that resolves after the modal has closed', async () => {
    let resolve
    fetchGameSummary.mockReturnValue(new Promise((r) => { resolve = r }))
    const { unmount } = render(
      <GameDetail game={played} games={GAMES} tz={TZ} onClose={() => {}} />
    )
    unmount() // aborts the in-flight request
    // Resolving now hits the aborted guard and must not throw.
    resolve({ box: null, teamStats: null, injuries: [], info: { attendance: 1, officials: [] }, winprob: null })
    await Promise.resolve()
    expect(document.querySelector('.modal')).toBeNull()
  })
})
