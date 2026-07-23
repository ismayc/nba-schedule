import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { PlayerBox, TeamStatsSection, InjuryReport, WinProbSection } from '../src/components/GameSummary.jsx'

const game = { away: 'MIA', home: 'BOS' }
const ready = (data) => ({ status: 'ready', data })

afterEach(() => cleanup())

describe('GameSummary coverage', () => {
  it('shows the loading placeholder while the summary is fetching', () => {
    render(<PlayerBox summary={{ status: 'loading', data: null }} game={game} hideScores={false} />)
    expect(screen.getByText('Box score')).toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('falls back to the lineups placeholder when no box exists', () => {
    render(<PlayerBox summary={ready({ box: null })} game={game} hideScores={false} />)
    expect(screen.getByText('Starting lineups')).toBeInTheDocument()
    expect(screen.getByText(/starters usually appear/)).toBeInTheDocument()
  })

  it('renders a box score with DNP, blank and null cells, and a partial totals row', () => {
    const side = {
      abbr: 'AA', // matches neither MIA nor BOS → exercises the index fallback
      name: 'Alpha',
      columns: [
        { key: 'minutes', label: 'MIN' },
        { key: 'points', label: 'PTS' },
        { key: 'rebounds', label: 'REB' },
        { key: 'assists', label: 'AST' },
      ],
      starters: [
        { id: 's1', name: 'Star One', pos: 'G', dnp: false, stats: { minutes: '30', points: '20', rebounds: null, assists: '' } },
        // id null → the row key falls back to the player name.
        { id: null, name: 'No Id', pos: 'F', dnp: false, stats: { minutes: '25', points: '10', rebounds: '5', assists: '3' } },
      ],
      bench: [
        { id: 'b1', name: 'Bench One', pos: null, dnp: true, stats: {} },
      ],
      totals: { minutes: '', points: '82', rebounds: null, assists: '' },
    }
    // Only one side present → the home BoxTable receives undefined and renders nothing.
    const box = { sides: [side], hasStats: true }
    const { container } = render(<PlayerBox summary={ready({ box })} game={game} hideScores={false} />)

    expect(screen.getByText('Box score')).toBeInTheDocument()
    expect(screen.getByText('DNP')).toBeInTheDocument() // the DNP player's minutes cell
    const dash = [...container.querySelectorAll('td')].filter((td) => td.textContent === '–')
    expect(dash.length).toBeGreaterThan(0)
    // Exactly one team's table renders (home side was undefined).
    expect(container.querySelectorAll('.box-team').length).toBe(1)
    // A null total renders blank.
    expect(container.querySelector('tfoot')).toBeInTheDocument()
    expect(container.querySelector('.bx-benchstart')).toBeInTheDocument()
  })

  it('renders both matched sides and a box without a totals row', () => {
    const mk = (abbr) => ({
      abbr,
      name: abbr,
      columns: [{ key: 'points', label: 'PTS' }],
      starters: [{ id: `${abbr}1`, name: `${abbr} Starter`, pos: 'G', dnp: false, stats: { points: '20' } }],
      bench: [],
      totals: null, // no totals → no tfoot
    })
    const box = { sides: [mk('MIA'), mk('BOS')], hasStats: true }
    const { container } = render(<PlayerBox summary={ready({ box })} game={game} hideScores={false} />)
    // Both sides matched by abbr → two box tables, and neither has a tfoot.
    expect(container.querySelectorAll('.box-team').length).toBe(2)
    expect(container.querySelector('tfoot')).toBeNull()
  })

  it('renders lineups when hideScores masks a stats-bearing box', () => {
    const side = {
      abbr: 'MIA',
      name: 'Miami',
      columns: [],
      starters: [{ id: 'p1', name: 'Has Both', jersey: '5', pos: 'G' }],
      bench: [],
    }
    const box = { sides: [side], hasStats: true }
    render(<PlayerBox summary={ready({ box })} game={game} hideScores />)
    // hasStats but hideScores → lineups, not a box score.
    expect(screen.getByText('Starting lineups')).toBeInTheDocument()
  })

  it('renders starting lineups with a missing jersey and no position, dropping an absent side', () => {
    const side = {
      abbr: 'MIA',
      name: 'Miami',
      columns: [],
      starters: [
        { id: null, name: 'No Jersey', jersey: null, pos: null }, // id null → key falls back to name
        { id: 'p2', name: 'Has Both', jersey: '5', pos: 'G' },
      ],
      bench: [{ id: 'p3', name: 'Reserve', jersey: '12', pos: 'F' }],
    }
    const box = { sides: [side], hasStats: false }
    const { container } = render(<PlayerBox summary={ready({ box })} game={game} hideScores={false} />)

    expect(screen.getByText('Starting lineups')).toBeInTheDocument()
    // Missing jersey → en-dash placeholder.
    expect(within(container.querySelector('.lu-list')).getByText('–')).toBeInTheDocument()
    // Only one lineup side rendered (the home side was undefined).
    expect(container.querySelectorAll('.lu-side').length).toBe(1)
    expect(screen.getByText(/Bench \(1\)/)).toBeInTheDocument()
  })

  it('collapses team stats under hideScores and when empty', () => {
    const teamStats = [{ label: 'FG%', away: '50', home: '52', better: 'home' }]
    const { container: c1 } = render(<TeamStatsSection summary={ready({ teamStats })} game={game} hideScores />)
    expect(c1.querySelector('.team-stats')).toBeNull()
    const { container: c2 } = render(<TeamStatsSection summary={ready({ teamStats: [] })} game={game} hideScores={false} />)
    expect(c2.querySelector('.team-stats')).toBeNull()
  })

  it('shows an en-dash for a missing team-stat value on either side', () => {
    const teamStats = [
      { label: 'FG%', away: null, home: '52', better: 'home' },
      { label: 'REB', away: '35', home: null, better: 'away' },
    ]
    const { container } = render(<TeamStatsSection summary={ready({ teamStats })} game={game} hideScores={false} />)
    const vals = [...container.querySelectorAll('.ts-val')].map((n) => n.textContent)
    expect(vals).toContain('–')
    expect(container.querySelectorAll('.ts-val.better').length).toBe(2)
  })

  it('renders nothing when there are no injuries', () => {
    const { container } = render(<InjuryReport summary={ready({ injuries: [] })} game={game} />)
    expect(container.querySelector('.injuries')).toBeNull()
  })

  it('orders injury sides away-first and tolerates a missing status and detail', () => {
    const injuries = [
      { abbr: 'BOS', players: [{ name: 'Home Hurt', pos: 'F', status: 'Out', detail: 'Knee' }] },
      { abbr: 'MIA', players: [{ name: 'Away Hurt', pos: null, status: null, detail: null }] },
      { abbr: 'ZZZ', players: [{ name: 'Neutral', pos: 'G', status: 'Day-To-Day', detail: 'Ankle' }] },
    ]
    const { container } = render(<InjuryReport summary={ready({ injuries })} game={game} />)
    const heads = [...container.querySelectorAll('.inj-side strong')].map((n) => n.textContent)
    // Away (MIA) sorts ahead of home (BOS), and the unknown side trails.
    expect(heads).toEqual(['MIA', 'BOS', 'ZZZ'])
    // The away player has no status text and no " · detail" suffix.
    const awayStatus = container.querySelector('.inj-side .inj-status')
    expect(awayStatus.textContent).toBe('')
    // The home player carries a status and detail.
    expect(screen.getByText('Out · Knee')).toBeInTheDocument()
  })

  it('collapses win probability under hideScores and with too few points', () => {
    const { container: c1 } = render(<WinProbSection summary={ready({ winprob: [0.5, 0.6] })} game={game} hideScores />)
    expect(c1.querySelector('.winprob')).toBeNull()
    const { container: c2 } = render(<WinProbSection summary={ready({ winprob: [0.5] })} game={game} hideScores={false} />)
    expect(c2.querySelector('.winprob')).toBeNull()
  })

  it('credits the away team when it is favored at the final probability point', () => {
    const winprob = [0.6, 0.4, 0.3] // ends below 50% home → away (MIA) favored at 70%
    render(<WinProbSection summary={ready({ winprob })} game={game} hideScores={false} />)
    expect(screen.getByText('Now 70% MIA')).toBeInTheDocument()
  })

  it('credits the home team and reads "Ended" once the game is final', () => {
    const winprob = [0.4, 0.55, 0.8] // ends above 50% → home (BOS) favored at 80%
    const finalGame = { ...game, score: [90, 80] } // score present, not live → final
    render(<WinProbSection summary={ready({ winprob })} game={finalGame} hideScores={false} />)
    expect(screen.getByText('Ended 80% BOS')).toBeInTheDocument()
  })
})
