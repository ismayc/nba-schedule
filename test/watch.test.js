import { describe, it, expect } from 'vitest'
import {
  watchableServices,
  broadcastNotBadged,
  localChannelCatalog,
  SERVICE_CATALOG,
  SERVICE_BY_KEY,
  LOCAL_CATALOG,
} from '../src/utils/watch.js'

const labels = (b, keys) => watchableServices(b, keys).map((s) => s.label)

describe('watchableServices', () => {
  it('matches a live-TV bundle via the national networks it carries', () => {
    expect(labels(['ESPN'], ['youtubetv'])).toEqual(['YouTube TV'])
    expect(labels(['ION'], ['youtubetv'])).toEqual(['YouTube TV'])
  })

  it('matches streaming exclusives by name', () => {
    expect(labels(['Peacock'], ['peacock'])).toEqual(['Peacock'])
    expect(labels(['Prime Video'], ['prime'])).toEqual(['Prime Video'])
    expect(labels(['Paramount+', 'CBS'], ['paramount'])).toEqual(['Paramount+'])
  })

  it('only reports services the viewer has selected', () => {
    // The game is on ESPN, but the viewer only has Peacock.
    expect(labels(['ESPN'], ['peacock'])).toEqual([])
    // Selecting YouTube TV surfaces it.
    expect(labels(['ESPN'], ['peacock', 'youtubetv'])).toEqual(['YouTube TV'])
  })

  it('lists every selected service that carries the game, in catalog order', () => {
    // NBC + Peacock simulcast, viewer has both a bundle and Peacock.
    expect(labels(['NBC', 'Peacock'], ['youtubetv', 'peacock'])).toEqual(['Peacock', 'YouTube TV'])
  })

  it('lists ALL of a viewer’s many services that carry the game — never capped', () => {
    // A viewer with more services than average, on a nationally-televised (ESPN) game:
    // every bundle/service that carries ESPN is returned, not a truncated subset.
    expect(labels(['ESPN'], ['youtubetv', 'hulu', 'sling', 'cable', 'disney'])).toEqual([
      'Disney+ / ESPN+',
      'YouTube TV',
      'Hulu + Live TV',
      'Sling TV',
      'Cable / Satellite',
    ])
  })

  it('bundle carriage differs — Sling has no ABC-only game, Fubo does', () => {
    expect(labels(['ABC'], ['sling'])).toEqual([])
    expect(labels(['ABC'], ['fubo'])).toEqual(['Fubo'])
  })

  it('excludes regional feeds that need an in-market add-on', () => {
    expect(labels(['Prime Video-Seattle'], ['prime'])).toEqual([])
    expect(labels(['NBC Sports BO'], ['youtubetv', 'cable'])).toEqual([])
  })

  it('returns [] with no selection or no broadcast', () => {
    expect(watchableServices(['ESPN'], [])).toEqual([])
    expect(watchableServices(['ESPN'], undefined)).toEqual([])
    expect(watchableServices(undefined, ['youtubetv'])).toEqual([])
    expect(watchableServices([], ['youtubetv'])).toEqual([])
  })

  it('exposes a catalog keyed for lookup', () => {
    expect(SERVICE_CATALOG.length).toBeGreaterThanOrEqual(10)
    expect(SERVICE_BY_KEY.youtubetv.label).toBe('YouTube TV')
    expect(SERVICE_BY_KEY.peacock.kind).toBe('stream')
    expect(SERVICE_BY_KEY.youtubetv.kind).toBe('bundle')
  })
})

describe('broadcastNotBadged', () => {
  const svc = (label) => ({ label })

  it('drops a network already shown as a badge but keeps the rest', () => {
    expect(broadcastNotBadged(['NBC', 'Peacock'], [svc('Peacock')])).toEqual(['NBC'])
    expect(broadcastNotBadged(['Prime Video'], [svc('Prime Video')])).toEqual([])
  })

  it('leaves a bundle badge’s underlying network in place (YouTube TV ≠ ESPN)', () => {
    expect(broadcastNotBadged(['ESPN'], [svc('YouTube TV')])).toEqual(['ESPN'])
  })

  it('returns the whole list when nothing is badged', () => {
    expect(broadcastNotBadged(['ESPN', 'ABC'], [])).toEqual(['ESPN', 'ABC'])
    expect(broadcastNotBadged(undefined, [])).toEqual([])
  })
})

describe('localChannelCatalog', () => {
  const g = (home, away, ...broadcast) => ({ home, away, broadcast })

  it('collects the distinct non-national feeds as picker entries, attributed to their team', () => {
    const cat = localChannelCatalog([
      g('AAA', 'BBB', 'ESPN', 'Local One'),
      g('CCC', 'AAA', 'Local Two', 'Local One'), // duplicate feed collapses; AAA survives the intersection
      g('DDD', 'EEE', 'ESPN'), // national only — contributes nothing
      { id: 'nobroadcast', home: 'FFF', away: 'GGG' }, // games without a broadcast list are tolerated
    ])
    // Local One airs two games whose only common team is AAA. Local Two airs once,
    // leaving BOTH that game's teams as candidates — no single team, so it's
    // unattributed and sorts after the attributed entry.
    expect(cat.map((c) => [c.label, c.team])).toEqual([
      ['Local One', 'AAA'],
      ['Local Two', null],
    ])
    expect(cat[0]).toMatchObject({ key: 'local:Local One', kind: 'local' })
    expect(cat[0].match(['Local One'])).toBe(true)
    expect(cat[0].match(['ESPN'])).toBe(false)
  })

  it('sorts unattributed feeds after attributed ones, alphabetically among themselves', () => {
    const cat = localChannelCatalog([
      g('AAA', 'BBB', 'Pinned TV'),
      g('CCC', 'AAA', 'Pinned TV'), // pinned to AAA
      g('DDD', 'EEE', 'Zed TV'), // one game each → unattributed
      g('FFF', 'GGG', 'Alpha TV'),
    ])
    expect(cat.map((c) => c.label)).toEqual(['Pinned TV', 'Alpha TV', 'Zed TV'])
  })

  it('is empty for a fully national slate — which is this league today, so the picker hides it', () => {
    expect(localChannelCatalog([g('AAA', 'BBB', 'ESPN')])).toEqual([])
    expect(LOCAL_CATALOG).toEqual([])
  })
})
