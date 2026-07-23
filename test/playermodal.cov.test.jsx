import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('../src/services/player.js', () => ({
  fetchPlayer: vi.fn(),
  headshotUrl: (id) => `https://example.test/headshots/${id}.png`,
}))
import PlayerModal from '../src/components/PlayerModal.jsx'
import { fetchPlayer } from '../src/services/player.js'

const fullPlayer = {
  id: '1',
  name: 'Test Player',
  short: 'T. Player',
  team: 'BOS',
  pos: 'C',
  gamesPlayed: 10,
  avgMinutes: 30,
  avgRebounds: 8,
  avgPoints: 20,
  avgSteals: 1,
  avgBlocks: 2,
  avgAssists: 4,
  avgFgMade: 8,
  avgFgAtt: 16,
  fgPct: 50,
  avgThreeMade: 1,
  avgThreeAtt: 3,
  threePct: 33,
  avgFtMade: 3,
  avgFtAtt: 4,
  ftPct: 75,
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  fetchPlayer.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PlayerModal coverage', () => {
  it('returns null with no player', () => {
    const { container } = render(<PlayerModal player={null} tz="America/New_York" onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
    expect(fetchPlayer).not.toHaveBeenCalled()
  })

  it('handles an unknown team, a missing average, an empty name, and no game log', async () => {
    fetchPlayer.mockResolvedValue(null) // no bio, no games
    const player = { ...fullPlayer, name: '', team: 'ZZZ', avgSteals: undefined, pos: undefined }
    const { container } = render(<PlayerModal player={player} tz="America/New_York" onClose={() => {}} />)

    // Unknown team → no logo, the raw abbreviation stands in for the display name.
    expect(container.querySelector('.pm-sub .logo')).toBeNull()
    expect(screen.getByText(/ZZZ/)).toBeInTheDocument()
    // A non-numeric average renders as an en-dash (avgSteals is undefined).
    expect(screen.getAllByText('–').length).toBeGreaterThan(0)
    // The fetch resolved with nothing → the empty game-log state.
    expect(await screen.findByText('No game log available.')).toBeInTheDocument()

    // Headshot 404 with a blank name → empty initials, no crash.
    fireEvent.error(container.querySelector('img.pm-shot'))
    expect(container.querySelector('.pm-initials')?.textContent).toBe('')
  })

  it('shows the loading state before the fetch settles, with a known team logo and jersey', () => {
    // A promise that never resolves keeps the game log in its loading state.
    fetchPlayer.mockReturnValue(new Promise(() => {}))
    const { container } = render(<PlayerModal player={fullPlayer} tz="America/New_York" onClose={() => {}} />)
    // Known team → the logo renders and the position shows in the sub-line.
    expect(container.querySelector('.pm-sub .logo')).toBeInTheDocument()
    expect(screen.getByText(/· C/)).toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    // Numeric averages format to one decimal.
    expect(screen.getByText('20.0')).toBeInTheDocument()
  })

  it('renders a full bio with jersey, age, and a country flag', async () => {
    fetchPlayer.mockResolvedValue({
      bio: { jersey: '7', height: `6' 9"`, weight: '235 lbs', age: 27, college: 'Duke', country: 'USA' },
      games: [
        { id: 'g1', date: '2026-01-01T23:00:00.000Z', atVs: 'vs', opp: 'MIA', result: 'W', stats: { MIN: '34', PTS: '28', REB: '9', AST: '6' } },
      ],
    })
    const { container } = render(<PlayerModal player={fullPlayer} tz="America/New_York" onClose={() => {}} />)
    // Jersey appended to the sub-line.
    expect(await screen.findByText(/#7/)).toBeInTheDocument()
    // The bio line joins the present fields.
    expect(screen.getByText(/Age 27/)).toBeInTheDocument()
    // USA maps to a flag image; its onError hides it without throwing.
    const flag = container.querySelector('.pm-flag')
    expect(flag).toBeInTheDocument()
    fireEvent.error(flag)
    expect(flag.style.display).toBe('none')
    // A win result renders the win/loss chip.
    expect(container.querySelector('.pm-res.r-w')).toBeInTheDocument()
  })

  it('renders a country with no known flag and a game-log row with missing stats and no result', async () => {
    fetchPlayer.mockResolvedValue({
      bio: { country: 'Narnia' }, // unmapped → flagUrl returns null, name only
      games: [{ id: 'g1', date: '2026-07-01T23:00:00.000Z', atVs: '@', opp: 'MIA', result: null, stats: {} }],
    })
    const { container } = render(<PlayerModal player={fullPlayer} tz="America/New_York" onClose={() => {}} />)

    expect(await screen.findByText('Narnia')).toBeInTheDocument()
    // Unmapped country → no flag image.
    expect(container.querySelector('.pm-flag')).toBeNull()
    // Every missing stat cell falls back to an en-dash.
    const dashes = [...container.querySelectorAll('.pm-log tbody td')].filter((td) => td.textContent === '–')
    expect(dashes.length).toBe(4) // MIN, PTS, REB, AST
    // No result → no win/loss chip.
    expect(container.querySelector('.pm-res')).toBeNull()
  })

  it('renders the bio line from a later field when the earlier ones are absent', async () => {
    // Only college is present, so the height/weight/age operands all fall through.
    fetchPlayer.mockResolvedValue({ bio: { college: 'Late Field U' }, games: [] })
    render(<PlayerModal player={fullPlayer} tz="America/New_York" onClose={() => {}} />)
    expect(await screen.findByText('Late Field U')).toBeInTheDocument()
  })

  it('ignores a player fetch that resolves after the modal has unmounted', async () => {
    let resolve
    fetchPlayer.mockReturnValue(new Promise((r) => { resolve = r }))
    const { unmount } = render(<PlayerModal player={fullPlayer} tz="America/New_York" onClose={() => {}} />)
    unmount() // aborts the in-flight request
    // Resolving now hits the aborted guard and must not throw or update state.
    resolve({ bio: { college: 'Too Late U' }, games: [] })
    await Promise.resolve()
    expect(document.querySelector('.player-modal')).toBeNull()
  })

  it('closes when the backdrop is pressed', () => {
    fetchPlayer.mockResolvedValue(null)
    const onClose = vi.fn()
    const { container } = render(<PlayerModal player={fullPlayer} tz="America/New_York" onClose={onClose} />)
    fireEvent.mouseDown(container.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalled()
  })
})
