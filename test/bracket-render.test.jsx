import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Bracket from '../src/components/Bracket.jsx'
import RadialBracket from '../src/components/RadialBracket.jsx'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'

// The committed schedule holds the finished 2025-26 postseason (New York champion), so
// the completed path renders straight from GAMES. Stripping the playoff games back out
// gives the projected path.
const REGULAR = GAMES.filter((g) => g.seasonType !== 'playoffs')

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
