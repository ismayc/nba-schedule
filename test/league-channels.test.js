import { describe, it, expect, vi } from 'vitest'
import {
  parseLeagueFeed,
  committedLeagueTv,
  applyLeagueChannels,
  fetchLeagueChannels,
} from '../scripts/lib/league-channels.mjs'

const NOW = new Date('2026-11-05T12:00:00Z')
const display = (...names) => names.map((broadcasterDisplay) => ({ broadcasterDisplay }))
const feedGame = (tip, away, home, broadcasters) => ({
  gameDateTimeUTC: tip,
  awayTeam: { teamTricode: away },
  homeTeam: { teamTricode: home },
  broadcasters,
})
const feedJson = (...games) => ({ leagueSchedule: { gameDates: [{ games }] } })

describe('parseLeagueFeed', () => {
  it('joins on ESPN abbreviations and orders national, home, away without repeats', () => {
    const feed = parseLeagueFeed(
      feedJson(
        feedGame('2026-11-12T01:00:00Z', 'NYK', 'SAS', {
          nationalBroadcasters: display('ESPN'),
          homeTvBroadcasters: display('DAZN-SAS', 'ESPN'),
          awayTvBroadcasters: display('MSG / DAZN'),
        })
      )
    )
    expect(feed.get('2026-11-12T01:00 NY SA')).toEqual(['ESPN', 'DAZN-SAS', 'MSG / DAZN'])
  })

  it('skips a game with no TV channel or no named teams', () => {
    const feed = parseLeagueFeed(
      feedJson(
        feedGame('2026-11-12T01:00:00Z', 'DEN', 'MEM', { nationalRadioBroadcasters: display('ERADM') }),
        feedGame('2026-11-12T01:00:00Z', undefined, 'MEM', { homeTvBroadcasters: display('ABC24') })
      )
    )
    expect(feed.size).toBe(0)
  })

  it('throws on the wrong shape, so an error page cannot read as an empty feed', () => {
    expect(() => parseLeagueFeed({})).toThrow(/gameDates/)
    expect(() => parseLeagueFeed({ leagueSchedule: { gameDates: [] } })).toThrow(/gameDates/)
  })
})

describe('committedLeagueTv', () => {
  it('reads values from schedule lines and ignores everything else', () => {
    const source = [
      'export const GAMES = [',
      '  {"id":"1","leagueTv":["Altitude/Altitude+"]},',
      '  {"id":"2"},',
      '  {"id":"3", not json},',
      ']',
    ].join('\n')
    expect([...committedLeagueTv(source)]).toEqual([['1', ['Altitude/Altitude+']]])
  })
})

describe('applyLeagueChannels', () => {
  const upcoming = (o = {}) => ({ id: '1', tip: '2026-11-12T01:00:00.000Z', away: 'DEN', home: 'MEM', ...o })
  const feed = new Map([['2026-11-12T01:00 DEN MEM', ['ABC24/DAZN-MEM', 'Altitude/Altitude+']]])

  it('fills an upcoming game ESPN has not listed, and leaves broadcast alone', () => {
    const g = upcoming()
    expect(applyLeagueChannels([g], feed, new Map(), NOW)).toBe(1)
    expect(g.leagueTv).toEqual(['ABC24/DAZN-MEM', 'Altitude/Altitude+'])
    expect(g.broadcast).toBeUndefined()
  })

  it('never touches a game ESPN lists, and drops a stale value by not carrying it', () => {
    const g = upcoming({ broadcast: ['ESPN'] })
    expect(applyLeagueChannels([g], feed, new Map([['1', ['Old']]]), NOW)).toBe(0)
    expect(g.leagueTv).toBeUndefined()
  })

  it('leaves a rescheduled game unfilled rather than showing the old slot', () => {
    const g = upcoming({ tip: '2026-11-13T01:00:00.000Z' })
    expect(applyLeagueChannels([g], feed, new Map([['1', ['Old']]]), NOW)).toBe(0)
    expect(g.leagueTv).toBeUndefined()
  })

  it('keeps committed values when the feed could not be read', () => {
    const g = upcoming()
    expect(applyLeagueChannels([g], null, new Map([['1', ['Kept']]]), NOW)).toBe(1)
    expect(g.leagueTv).toEqual(['Kept'])
    const none = upcoming({ id: '2' })
    expect(applyLeagueChannels([none], null, new Map(), NOW)).toBe(0)
    expect(none.leagueTv).toBeUndefined()
  })

  it('keeps the committed value on a finished game, even with the feed in hand', () => {
    const played = upcoming({ tip: '2026-11-01T01:00:00.000Z', score: [100, 90] })
    expect(applyLeagueChannels([played], feed, new Map([['1', ['Aired']]]), NOW)).toBe(1)
    expect(played.leagueTv).toEqual(['Aired'])
  })
})

describe('fetchLeagueChannels', () => {
  it('returns the parsed channels from a real payload', async () => {
    const stdout = JSON.stringify(
      feedJson(feedGame('2026-11-12T01:00:00Z', 'DEN', 'MEM', { homeTvBroadcasters: display('ABC24') }))
    )
    const run = vi.fn().mockResolvedValue({ stdout })
    const feed = await fetchLeagueChannels(run)
    expect(feed.get('2026-11-12T01:00 DEN MEM')).toEqual(['ABC24'])
    expect(run.mock.calls[0][0]).toBe('curl')
  })

  // The two failures this feed is known for: a refused request, and HTTP 200 with HTML.
  it.each([
    ['a refused request', () => Promise.reject(new Error('curl: (22) 403\nmore'))],
    ['the 200 HTML error page', () => Promise.resolve({ stdout: '<!DOCTYPE html><html></html>' })],
    ['JSON of the wrong shape', () => Promise.resolve({ stdout: '{}' })],
  ])('returns null and warns on %s', async (_, run) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(fetchLeagueChannels(run)).resolves.toBeNull()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
