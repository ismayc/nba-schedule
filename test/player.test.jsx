import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import PlayerModal from '../src/components/PlayerModal.jsx'
import { fetchPlayer, headshotUrl } from '../src/services/player.js'

const overview = {
  athlete: {
    displayName: 'Shai Gilgeous-Alexander',
    jersey: '2',
    position: { abbreviation: 'G' },
    displayHeight: `6' 6"`,
    displayWeight: '195 lbs',
    age: 27,
    college: { name: 'Kentucky' },
    team: { displayName: 'Oklahoma City Thunder' },
  },
}

const gamelog = {
  labels: ['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'PF'],
  seasonTypes: [
    {
      categories: [
        {
          events: [
            { eventId: 'e2', stats: ['34', '24', '5', '7', '2', '1', '3', '9-18', '50.0', '2-5', '40.0', '4-4', '100', '2'] },
            { eventId: 'e1', stats: ['33', '31', '4', '6', '1', '1', '2', '11-19', '57.9', '2-4', '50.0', '7-8', '87.5', '1'] },
          ],
        },
      ],
    },
  ],
  events: {
    e1: { gameDate: '2026-07-19T23:00Z', atVs: 'vs', gameResult: 'W', opponent: { abbreviation: 'DEN' } },
    e2: { gameDate: '2026-07-15T23:00Z', atVs: '@', gameResult: 'L', opponent: { abbreviation: 'LAL' } },
  },
}

const stub = () => {
  globalThis.fetch = vi.fn((url) =>
    Promise.resolve({ ok: true, json: async () => (String(url).endsWith('/gamelog') ? gamelog : overview) })
  )
}

const player = {
  id: '4278073',
  name: 'Shai Gilgeous-Alexander',
  short: 'S. Gilgeous-Alexander',
  team: 'OKC',
  pos: 'G',
  gamesPlayed: 68,
  avgMinutes: 33.2,
  avgRebounds: 4.3,
  avgPoints: 31.1,
  avgFgMade: 9.2,
  avgFgAtt: 17.6,
  fgPct: 55.3,
  avgThreeMade: 1.7,
  avgThreeAtt: 4.4,
  threePct: 38.6,
  avgFtMade: 7.9,
  avgFtAtt: 9,
  ftPct: 87.9,
  avgAssists: 6.6,
  avgTurnovers: 2.2,
  avgSteals: 1.4,
  avgBlocks: 2,
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('fetchPlayer (service)', () => {
  it('parses bio and maps game-log stats by the feed’s labels, most recent first', async () => {
    stub()
    const { bio, games } = await fetchPlayer('4278073')
    expect(bio).toMatchObject({ jersey: '2', pos: 'G', height: `6' 6"`, age: 27, college: 'Kentucky' })
    // Sorted newest-first regardless of feed order (e1 = 7/19 comes before e2 = 7/15).
    expect(games.map((g) => g.opp)).toEqual(['DEN', 'LAL'])
    expect(games[0]).toMatchObject({ result: 'W', atVs: 'vs' })
    expect(games[0].stats).toEqual({ MIN: '33', PTS: '31', REB: '4', AST: '6' })
  })

  it('returns null when the request throws', async () => {
    globalThis.fetch = vi.fn(() => {
      throw new Error('offline')
    })
    expect(await fetchPlayer('x')).toBeNull()
  })

  it('builds a deterministic headshot URL', () => {
    expect(headshotUrl('4278073')).toContain('/headshots/nba/players/full/4278073.png')
  })
})

describe('PlayerModal (component)', () => {
  it('renders nothing without a player', () => {
    const { container } = render(<PlayerModal player={null} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows committed season stats immediately, then the fetched game log', async () => {
    stub()
    render(<PlayerModal player={player} tz="America/New_York" onClose={() => {}} />)
    // Committed and instant — averages forced to one decimal (blocks 2 → "2.0").
    expect(screen.getByText('Shai Gilgeous-Alexander')).toBeInTheDocument()
    expect(screen.getByText('31.1')).toBeInTheDocument()
    expect(screen.getByText('2.0')).toBeInTheDocument()
    expect(screen.getByText(/FG 9.2-17.6/)).toBeInTheDocument()
    // The fetched recent games fill in.
    expect(await screen.findByText('DEN')).toBeInTheDocument()
    expect(screen.getByText('LAL')).toBeInTheDocument()
  })

  it('falls back to the player’s initials when the headshot 404s', () => {
    stub()
    const { container } = render(<PlayerModal player={player} tz="America/New_York" onClose={() => {}} />)
    // jsdom never loads the image, so simulate the 404.
    fireEvent.error(container.querySelector('img.pm-shot'))
    expect(container.querySelector('.pm-initials')?.textContent).toBe('SG')
    expect(container.querySelector('img.pm-shot')).toBeNull()
  })
})
