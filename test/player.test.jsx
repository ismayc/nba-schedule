import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import PlayerModal from '../src/components/PlayerModal.jsx'
import { fetchPlayer, headshotUrl } from '../src/services/player.js'
import { flagUrl } from '../src/utils/flag.js'

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

// birthPlace only rides on the core athlete record, fetched separately.
const core = { birthPlace: { city: 'Hamilton', state: 'ON', country: 'Canada' } }

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
  globalThis.fetch = vi.fn((url) => {
    const u = String(url)
    const body = u.endsWith('/gamelog') ? gamelog : u.includes('sports.core.api') ? core : overview
    return Promise.resolve({ ok: true, json: async () => body })
  })
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
    expect(bio).toMatchObject({
      jersey: '2',
      pos: 'G',
      height: `6' 6"`,
      age: 27,
      college: 'Kentucky',
      country: 'Canada',
    })
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

describe('flagUrl', () => {
  it('maps a country name onto its ESPN IOC flag code', () => {
    expect(flagUrl('USA')).toContain('/countries/500/usa.png')
    expect(flagUrl('Slovenia')).toContain('/countries/500/slo.png')
    expect(flagUrl('United States')).toContain('/countries/500/usa.png')
  })

  it('returns null for a country it has no code for', () => {
    expect(flagUrl('Wakanda')).toBeNull()
    expect(flagUrl(null)).toBeNull()
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
    // Birthplace country + its flag arrive with the bio fetch.
    expect(screen.getByText('Canada')).toBeInTheDocument()
    const flag = document.querySelector('img.pm-flag')
    expect(flag?.getAttribute('src')).toContain('/countries/500/can.png')
    // A flag that 404s hides itself rather than showing a broken image.
    fireEvent.error(flag)
    expect(flag.style.display).toBe('none')
  })

  it('forces whole-number split averages to one decimal', () => {
    stub()
    // A player whose per-game FG/3PT/FT splits land on whole numbers must still read
    // "8.0-15.0", not "8-15", to match the decimal convention.
    const whole = { ...player, avgFgMade: 8, avgFgAtt: 15, avgThreeMade: 2, avgThreeAtt: 5 }
    render(<PlayerModal player={whole} tz="America/New_York" onClose={() => {}} />)
    expect(screen.getByText(/FG 8.0-15.0/)).toBeInTheDocument()
    expect(screen.getByText(/3PT 2.0-5.0/)).toBeInTheDocument()
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
