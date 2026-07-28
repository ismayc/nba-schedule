import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Bracket from '../src/components/Bracket.jsx'
import RadialBracket from '../src/components/RadialBracket.jsx'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'

// The committed schedule holds the finished 2025-26 postseason (New York champion), so
// the completed path renders straight from GAMES. Stripping the playoff AND play-in
// games back out gives the projected path — the play-in has to go too, or its real
// results render in place of the projected 7–10 field.
const REGULAR = GAMES.filter((g) => g.seasonType !== 'playoffs' && g.seasonType !== 'playin')

describe('Bracket with a completed postseason', () => {
  it('announces the champion', () => {
    render(<Bracket games={GAMES} tz={TZ} />)
    expect(screen.getByText(/win the title/i)).toBeInTheDocument()
    expect(screen.getByText('New York Knicks')).toBeInTheDocument()
  })

  it('shows series win counts, not game scores', () => {
    const { container } = render(<Bracket games={GAMES} tz={TZ} />)
    const finals = container.querySelector('.bx-col-final .bx-series')
    const wins = [...finals.querySelectorAll('.bx-wins')].map((n) => n.textContent)
    // Finals ran San Antonio 1, New York 4.
    expect(wins.sort()).toEqual(['1', '4'])
  })

  it('labels every round as best-of-7', () => {
    render(<Bracket games={GAMES} tz={TZ} />)
    // 15 series across both conferences plus the Finals, each first-to-four.
    expect(screen.getAllByText('Best of 7')).toHaveLength(15)
  })

  it('marks the series winner and dims the loser', () => {
    const { container } = render(<Bracket games={GAMES} tz={TZ} />)
    const finals = container.querySelector('.bx-col-final .bx-series')
    expect(within(finals.querySelector('.bx-won')).getByText('Knicks')).toBeInTheDocument()
    expect(finals.querySelector('.bx-lost')).toBeTruthy()
  })

  it('does not show the projected banner', () => {
    render(<Bracket games={GAMES} tz={TZ} />)
    expect(screen.queryByText(/Projected/)).not.toBeInTheDocument()
  })

  it('footnotes the NBA Cup result without making it a bracket', () => {
    const { container } = render(<Bracket games={GAMES} tz={TZ} />)
    const cup = container.querySelector('.bx-cup')
    // 2025-26: New York beat San Antonio 124–113 in Las Vegas.
    expect(cup).toHaveTextContent(/NBA Cup — Knicks beat Spurs 124–113/)
    expect(cup).toHaveTextContent(/not counted in the standings/)
  })

  it('previews an unplayed NBA Cup final as a matchup', () => {
    const noScore = GAMES.map((g) => (g.seasonType === 'cup' ? { ...g, score: null } : g))
    const { container } = render(<Bracket games={noScore} tz={TZ} />)
    expect(container.querySelector('.bx-cup')).toHaveTextContent(/NBA Cup final — Spurs @ Knicks/)
  })

  it('shows no cup footnote when the season has no cup game', () => {
    const without = GAMES.filter((g) => g.seasonType !== 'cup')
    const { container } = render(<Bracket games={without} tz={TZ} />)
    expect(container.querySelector('.bx-cup')).toBeNull()
  })
})

describe('Bracket before the postseason', () => {
  it('flags the bracket as projected and lists the play-in field', () => {
    render(<Bracket games={REGULAR} tz={TZ} />)
    expect(screen.getByText(/Projected\./)).toBeInTheDocument()
    expect(screen.getByText(/seeds 7 to 10/i)).toBeInTheDocument()
    // Seeds 9 and 10 appear only in the play-in list, never in the eight-team bracket.
    expect(screen.getByText('Hornets')).toBeInTheDocument()
    expect(screen.getByText('Heat')).toBeInTheDocument()
  })

  it('labels unresolved slots with their feeders in both conferences', () => {
    render(<Bracket games={REGULAR} tz={TZ} />)
    expect(screen.getAllByText('Winner 1/8')).toHaveLength(2)
    expect(screen.getAllByText('Winner 4/5')).toHaveLength(2)
    expect(screen.getByText('East champion')).toBeInTheDocument()
    expect(screen.getByText('West champion')).toBeInTheDocument()
  })

  it('seeds the top team against the eighth', () => {
    const { container } = render(<Bracket games={REGULAR} tz={TZ} />)
    const first = container.querySelector('.bx-series')
    const seeds = [...first.querySelectorAll('.bx-seed')].map((n) => n.textContent)
    expect(seeds).toEqual(['1', '8'])
  })

  it('routes a team click back to the schedule', async () => {
    const onPick = vi.fn()
    const { container } = render(<Bracket games={REGULAR} tz={TZ} onPick={onPick} />)
    await userEvent.click(container.querySelector('.bx-team'))
    expect(onPick).toHaveBeenCalled()
  })
})

// The dots are the bracket's only per-game handle, so they have to reach the box score.
describe('the series dots', () => {
  it('opens the right game — including deep into a series and in later rounds', async () => {
    const onOpen = vi.fn()
    const { container } = render(<Bracket games={GAMES} tz={TZ} onOpen={onOpen} />)

    // Game 5 of the first series shown.
    const first = container.querySelector('.bx-series')
    const dots = first.querySelectorAll('.dots .dot')
    await userEvent.click(dots[4])
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ round: 'R1', game: 5, seasonType: 'playoffs' })
    )

    // And the Finals, at the other end of the bracket.
    const finals = container.querySelector('.bx-col-final .bx-series')
    await userEvent.click(finals.querySelectorAll('.dots .dot')[0])
    expect(onOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({ round: 'Final', game: 1 })
    )
  })

  it('labels each dot with the game it opens', () => {
    const { container } = render(<Bracket games={GAMES} tz={TZ} />)
    const dot = container.querySelector('.dots .dot')
    // Whatever the first series is, the label carries both scores.
    expect(dot).toHaveAccessibleName(/Game 1: .+ \d+, .+ \d+/)
  })

  it('gives a played dot a button and leaves an unplayed one inert', () => {
    const { container } = render(<Bracket games={GAMES} tz={TZ} />)
    // The Finals went five, so two of its seven dots are hollow and not clickable.
    const finals = container.querySelector('.bx-col-final .bx-series .dots')
    expect(finals.querySelectorAll('.dot')).toHaveLength(5)
    expect(finals.querySelectorAll('.dot-empty')).toHaveLength(2)
    expect(finals.querySelectorAll('.dot-empty button')).toHaveLength(0)
  })

  it('survives a click with no handler wired', async () => {
    const { container } = render(<Bracket games={GAMES} tz={TZ} />)
    await userEvent.click(container.querySelector('.dots .dot'))
    expect(container.querySelector('.dots .dot')).toBeInTheDocument()
  })

  it('numbers a dot by its position when the feed gave the game no number', () => {
    // ESPN's series headline is prose ("East 1st Round - Game 1"); a season where it
    // doesn't parse must still label the dot rather than say "Game undefined".
    const unnumbered = GAMES.map((g) => (g.round === 'R1' ? { ...g, game: undefined } : g))
    const { container } = render(<Bracket games={unnumbered} tz={TZ} />)
    expect(container.querySelector('.bx-series .dots .dot')).toHaveAccessibleName(/^Game 1: /)
  })

  it('opens a play-in game from the ladder as well', async () => {
    const onOpen = vi.fn()
    const { container } = render(<Bracket games={GAMES} tz={TZ} onOpen={onOpen} />)
    await userEvent.click(container.querySelector('.pi-teams'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ seasonType: 'playin' }))
  })
})

// The ladder that feeds the bracket, rendered under it. Every assertion is about what a
// result MEANT — a seed taken or a season ended — not just that two names appeared.
describe('the play-in tournament section', () => {
  const east = (container) => container.querySelectorAll('.bx-playin-conf')[0]

  it('lists three games per conference with the score of each', () => {
    const { container } = render(<Bracket games={GAMES} tz={TZ} />)
    expect(screen.getByText('Play-In Tournament')).toBeInTheDocument()
    expect(container.querySelectorAll('.pi-game')).toHaveLength(6)

    const first = east(container).querySelector('.pi-game')
    expect(first.querySelector('.pi-slot')).toHaveTextContent('7 vs 8')
    // Philadelphia 109, Orlando 97 — away side is listed first.
    expect([...first.querySelectorAll('.pi-score')].map((n) => n.textContent)).toEqual(['97', '109'])
  })

  it('says what each game settled', () => {
    const { container } = render(<Bracket games={GAMES} tz={TZ} />)
    const outcomes = [...east(container).querySelectorAll('.pi-outcome')].map((n) => n.textContent)
    expect(outcomes[0]).toMatch(/76ers — Takes 7 seed/)
    expect(outcomes[1]).toMatch(/Hornets — To 8th-seed game · Heat eliminated/)
    expect(outcomes[2]).toMatch(/Magic — Takes 8 seed · Hornets eliminated/)
  })

  it('heads each conference with the two seeds it produced', () => {
    const { container } = render(<Bracket games={GAMES} tz={TZ} />)
    const chips = [...east(container).querySelectorAll('.pi-seed-chip')].map((n) => n.textContent)
    expect(chips).toEqual(['776ers', '8Magic'])
  })

  it('marks the winner and dims the loser of each game', () => {
    const { container } = render(<Bracket games={GAMES} tz={TZ} />)
    const first = east(container).querySelector('.pi-game')
    expect(within(first.querySelector('.pi-won')).getByText('76ers')).toBeInTheDocument()
    expect(within(first.querySelector('.pi-lost')).getByText('Magic')).toBeInTheDocument()
  })

  it('flags a game that went to overtime', () => {
    const { container } = render(<Bracket games={GAMES} tz={TZ} />)
    // Charlotte 127–126 over Miami needed an extra period.
    const ot = [...container.querySelectorAll('.pi-game')].filter((n) => n.querySelector('.pi-ot'))
    expect(ot).toHaveLength(1)
    expect(ot[0].querySelector('.pi-slot')).toHaveTextContent('9 vs 10')
  })

  it('opens the game detail when a matchup is clicked', async () => {
    const onOpen = vi.fn()
    const { container } = render(<Bracket games={GAMES} tz={TZ} onOpen={onOpen} />)
    await userEvent.click(east(container).querySelector('.pi-teams'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ slot: '7v8', winner: 'PHI' }))
  })

  it('survives a click with no handler wired', async () => {
    const { container } = render(<Bracket games={GAMES} tz={TZ} />)
    await userEvent.click(container.querySelector('.pi-teams'))
    expect(container.querySelectorAll('.pi-game')).toHaveLength(6)
  })

  it('shows the tip time for a game not yet played, and LIVE for one in progress', () => {
    const upcoming = GAMES.map((g) =>
      g.seasonType === 'playin' && g.piSlot === '8seed' ? { ...g, score: undefined } : g
    )
    const { container: soon } = render(<Bracket games={upcoming} tz={TZ} />)
    const pending = [...soon.querySelectorAll('.pi-game')].at(-1)
    expect(pending.querySelector('.pi-outcome')).toHaveTextContent(/Apr/)
    // An undecided game shows no score and dims neither side.
    expect(pending.querySelectorAll('.pi-score')).toHaveLength(0)
    expect(pending.querySelector('.pi-lost')).toBeNull()
    // With the 8 seed still open, only the 7-seed chip is headed.
    expect(soon.querySelectorAll('.bx-playin-conf')[0].querySelectorAll('.pi-seed-chip')).toHaveLength(1)

    const live = upcoming.map((g) =>
      g.seasonType === 'playin' && g.piSlot === '8seed' ? { ...g, live: true } : g
    )
    const { container: playing } = render(<Bracket games={live} tz={TZ} />)
    const inProgress = [...playing.querySelectorAll('.pi-game.is-live')]
    expect(inProgress).toHaveLength(2)
    expect(inProgress[0].querySelector('.pi-outcome')).toHaveTextContent('● LIVE')
  })

  it('falls back to the projected 7–10 field when the play-in has not been scheduled', () => {
    render(<Bracket games={REGULAR} tz={TZ} />)
    expect(screen.queryByText('Play-In Tournament')).not.toBeInTheDocument()
    expect(screen.getByText(/seeds 7 to 10/i)).toBeInTheDocument()
  })
})

describe('RadialBracket', () => {
  it('renders one whole-bracket wheel — a node per seed each side plus the inner rounds', () => {
    const { container } = render(<RadialBracket games={REGULAR} />)
    // Both conferences in one wheel: 8 seeds, 4 first-round and 2 semifinal slots each side.
    expect(container.querySelectorAll('.rb-leaf')).toHaveLength(16)
    expect(container.querySelectorAll('.rb-r1')).toHaveLength(8)
    expect(container.querySelectorAll('.rb-csf')).toHaveLength(4)
    // One conference-champion node per side, and the West/East side labels.
    expect(container.querySelectorAll('.rb-cf')).toHaveLength(2)
    expect(container.querySelector('.rb-side-w')).toBeTruthy()
    expect(container.querySelector('.rb-side-e')).toBeTruthy()
  })

  it('shows the trophy while undecided and the champion once settled', () => {
    const { container: pending } = render(<RadialBracket games={REGULAR} />)
    expect(pending.querySelector('.rb-trophy')).toBeTruthy()

    const { container: done } = render(<RadialBracket games={GAMES} />)
    expect(done.querySelector('.rb-trophy')).toBeFalsy()
    // The Finals winner sits at the centre.
    expect(within(done.querySelector('.rb-center')).getByText('Knicks')).toBeInTheDocument()
  })

  it('labels seeds 1 through 8 around each conference ring', () => {
    const { container } = render(<RadialBracket games={REGULAR} />)
    const seeds = [...container.querySelectorAll('.rb-seed')].map((n) => n.textContent)
    expect(seeds).toHaveLength(16)
    const unique = [...new Set(seeds)].sort((a, b) => a - b)
    expect(unique).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
  })
})
