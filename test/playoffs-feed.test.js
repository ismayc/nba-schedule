import { describe, it, expect } from 'vitest'
import { playoffsFromScoreboard } from '../scripts/fetch-schedule.mjs'

// The team-schedule feed lags the bracket by days, so play-in and playoff games come
// from the scoreboard too. Shapes below are trimmed from the real 2026-04-15 (play-in)
// and 2026-04-20 (first round) scoreboards: the season type lives on `season.type`, the
// competition `type` is "STD" or a round code, and unscheduled slots carry "TBD" teams
// with negative ids.
const team = (id, abbreviation, homeAway) => ({ homeAway, team: { id, abbreviation } })
const event = (over = {}) => ({
  id: '401869369',
  date: '2026-04-20T23:00Z',
  season: { year: 2026, type: 3, slug: 'post-season' },
  competitions: [
    {
      type: { id: '14', abbreviation: 'RD16' },
      status: { type: { name: 'STATUS_SCHEDULED', completed: false } },
      venue: { fullName: 'Rocket Arena', address: { city: 'Cleveland', state: 'OH' } },
      broadcasts: [{ names: ['TNT'] }],
      notes: [{ headline: 'East 1st Round - Game 2' }],
      competitors: [team('5', 'CLE', 'home'), team('28', 'TOR', 'away')],
    },
  ],
  ...over,
})
const playIn = () => {
  const ev = event({ id: '401866757', season: { year: 2026, type: 5, slug: 'play-in-season' } })
  ev.competitions[0].type = { id: '1', abbreviation: 'STD' }
  ev.competitions[0].notes = [{ headline: 'NBA Play-In - East - 7th Place vs 8th Place' }]
  ev.competitions[0].competitors = [team('20', 'PHI', 'home'), team('19', 'ORL', 'away')]
  return ev
}
const KNOWN = new Set(['CLE', 'TOR', 'PHI', 'ORL'])

describe('playoffsFromScoreboard', () => {
  it('reads a first-round game from the scoreboard shape', () => {
    expect(playoffsFromScoreboard([event()], KNOWN)).toEqual([
      expect.objectContaining({
        id: '401869369',
        tip: '2026-04-20T23:00:00.000Z',
        seasonType: 'playoffs',
        home: 'CLE',
        away: 'TOR',
        venue: 'Rocket Arena',
        broadcast: ['TNT'],
        round: 'R1',
        game: 2,
      }),
    ])
  })

  it('reads a play-in game from season.type 5, though its competition type is STD', () => {
    expect(playoffsFromScoreboard([playIn()], KNOWN)).toEqual([
      expect.objectContaining({ id: '401866757', seasonType: 'playin', round: 'PI', piSlot: '7v8' }),
    ])
  })

  it('skips slots whose teams are still TBD, and anything not postseason', () => {
    const tbd = event({ id: 'tbd' })
    tbd.competitions[0].competitors = [team('-1', 'TBD', 'home'), team('-2', 'TBD', 'away')]
    const regular = event({ id: 'reg', season: { year: 2026, type: 2 } })
    const stranger = event({ id: 'x' })
    stranger.competitions[0].competitors = [team('5', 'CLE', 'home'), team('99', 'ZZZ', 'away')]
    expect(playoffsFromScoreboard([tbd, regular, stranger, event()], KNOWN).map((g) => g.id)).toEqual([
      '401869369',
    ])
  })
})
