import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Bracket from '../src/components/Bracket.jsx'
import RadialBracket from '../src/components/RadialBracket.jsx'
import { GAMES } from '../src/data/schedule.js'
import { HISTORY_BY_YEAR } from '../src/data/history.js'
import { CUP_FINAL_2526 } from './fixtures/season2526.js'
import { decidedSeason, alignedPlayoffs } from './fixtures/decided.js'

const TZ = 'America/New_York'

// Spoiler-free mode ("Hide all winners"): a bracket shows matchups, games, and dates,
// but no result. The archived 2025-26 postseason is fully decided (New York beat San
// Antonio 4-1), so every result path has something to leak.
const POSTSEASON = HISTORY_BY_YEAR[2026].games
const UNPLAYED = GAMES.filter((g) => g.seasonType !== 'playoffs' && g.seasonType !== 'playin')
// The radial wheel needs series that line up with the seeding to fill its inner rings.
const RESOLVED = [...decidedSeason(), ...alignedPlayoffs()]

describe('Bracket in spoiler-free mode', () => {
  it('shows no series win counts and no winner or loser styling', () => {
    const { container } = render(<Bracket games={POSTSEASON} tz={TZ} hideScores />)
    expect(container.querySelectorAll('.bx-series').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.bx-wins')).toHaveLength(0)
    expect(container.querySelectorAll('.bx-won, .bx-lost, .bx-series.is-done')).toHaveLength(0)
  })

  it('shows played games as neutral dots with no score in the label', async () => {
    const onOpen = vi.fn()
    const { container } = render(<Bracket games={POSTSEASON} tz={TZ} onOpen={onOpen} hideScores />)
    expect(container.querySelectorAll('.dot-w, .dot-l')).toHaveLength(0)
    const dot = container.querySelector('.dots .dot')
    expect(dot).toHaveClass('dot-played')
    expect(dot).toHaveAccessibleName(/^Game 1$/)
    // The dot still opens its game; the detail view does its own hiding.
    await userEvent.click(dot)
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ round: 'R1', game: 1 }))
  })

  it('names no champion', () => {
    const { container } = render(<Bracket games={POSTSEASON} tz={TZ} hideScores />)
    expect(screen.queryByText(/win the title/i)).not.toBeInTheDocument()
    expect(container.querySelector('.banner-champ')).toBeNull()
  })

  it('leaves later-round slots on their feeder labels', () => {
    const { container } = render(<Bracket games={POSTSEASON} tz={TZ} hideScores />)
    const finals = container.querySelector('.bx-col-final .bx-series')
    expect(finals.querySelectorAll('.bx-team')).toHaveLength(0)
    expect(finals).toHaveTextContent('East champion')
    expect(finals).toHaveTextContent('West champion')
    // New York reached the conference semifinals by beating Atlanta; that slot stays open.
    expect(screen.getAllByText('Winner 1/8').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Conf. semifinal winner').length).toBeGreaterThan(0)
    // The East 8 seed (Atlanta) came through the play-in, so its first-round slot is open too,
    // while the 1 seed opposite it still shows.
    const first = container.querySelector('.bx-series')
    expect(first).toHaveTextContent('Knicks')
    expect(first).toHaveTextContent('8 seed')
    expect(first).not.toHaveTextContent('Hawks')
  })

  it('shows play-in matchups and dates but no result', () => {
    const { container } = render(<Bracket games={POSTSEASON} tz={TZ} hideScores />)
    expect(container.querySelectorAll('.pi-game')).toHaveLength(6)
    expect(
      container.querySelectorAll('.pi-won, .pi-lost, .pi-score, .pi-ot, .pi-seed-chip')
    ).toHaveLength(0)
    const outcomes = [...container.querySelectorAll('.pi-outcome')].map((n) => n.textContent)
    for (const text of outcomes) {
      expect(text).toMatch(/Apr/)
      expect(text).not.toMatch(/eliminated|Takes|To 8th-seed game/)
    }
  })

  it('previews the NBA Cup final as a matchup instead of naming the winner', () => {
    const { container } = render(
      <Bracket games={[...POSTSEASON, CUP_FINAL_2526]} tz={TZ} hideScores />
    )
    const cup = container.querySelector('.bx-cup')
    expect(cup).toHaveTextContent(/NBA Cup final — Spurs @ Knicks/)
    expect(cup).not.toHaveTextContent(/beat|124/)
  })

  it('still shows the projected bracket and its seeds before the postseason', () => {
    const { container } = render(<Bracket games={UNPLAYED} tz={TZ} hideScores />)
    expect(screen.getByText(/Projected\./)).toBeInTheDocument()
    const first = container.querySelector('.bx-series')
    expect([...first.querySelectorAll('.bx-seed')].map((n) => n.textContent)).toEqual(['1', '8'])
    expect(first.querySelectorAll('.bx-team')).toHaveLength(2)
  })
})

describe('RadialBracket in spoiler-free mode', () => {
  it('fills no inner ring and crowns no champion', () => {
    const { container } = render(<RadialBracket games={RESOLVED} hideScores />)
    // The seeds on the outer ring are the matchups, so they stay.
    expect(container.querySelectorAll('.rb-leaf:not(.is-empty)')).toHaveLength(16)
    expect(container.querySelectorAll('.rb-r1.is-empty')).toHaveLength(8)
    expect(container.querySelectorAll('.rb-csf.is-empty')).toHaveLength(4)
    expect(container.querySelectorAll('.rb-cf.is-empty')).toHaveLength(2)
    expect(container.querySelector('.rb-node.is-dim')).toBeNull()
    expect(container.querySelector('.rb-trophy')).toBeTruthy()
    expect(container.querySelector('.rb-champ')).toBeNull()
  })

  it('fills the rings when spoiler-free mode is off', () => {
    const { container } = render(<RadialBracket games={RESOLVED} />)
    expect(container.querySelectorAll('.rb-r1.is-empty')).toHaveLength(0)
    expect(container.querySelector('.rb-champ')).toBeTruthy()
  })
})
