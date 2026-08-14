import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RadialBracket from '../src/components/RadialBracket.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { GAMES } from '../src/data/schedule.js'
import { decidedSeason, alignedPlayoffs, EAST } from './fixtures/decided.js'

// The live (post-rollover, unplayed) schedule → the inner-round nodes have no winners
// yet (the projected/empty paths). The winner paths need a postseason whose series
// MATCH the seeding (the wheel pairs series to seeds) — the archived real postseason
// alone can't provide that, because without its regular season the standings are all
// 0-0 and no r1 slot resolves. The synthetic decided season + aligned playoffs do.
const RESOLVED = [...decidedSeason(), ...alignedPlayoffs()]
const REGULAR = GAMES.filter((g) => g.seasonType !== 'playoffs')

beforeEach(() => {
  localStorage.clear()
})

describe('RadialBracket — hover, click, and follow interactions', () => {
  it('dims other nodes on hover from every ring, clears on leave, and routes a click', async () => {
    localStorage.setItem('nba:followed', JSON.stringify([EAST[0]]))
    const onPick = vi.fn()
    const { container } = render(
      <FollowProvider>
        <RadialBracket games={RESOLVED} onPick={onPick} />
      </FollowProvider>
    )

    // A followed team carries the followed class somewhere on the wheel.
    expect(container.querySelector('.rb-node.followed')).toBeTruthy()

    // Hovering a seed dims every other node; the hovered node itself is not dimmed.
    const leaf = container.querySelector('.rb-leaf')
    fireEvent.mouseEnter(leaf)
    expect(container.querySelector('.rb-node.is-dim')).toBeTruthy()
    expect(leaf.classList.contains('is-dim')).toBe(false)

    // Hovering the resolved inner-round winners (first round, semifinal, and the
    // conference champion) all route through their onHover guards.
    fireEvent.mouseEnter(container.querySelector('.rb-r1'))
    expect(container.querySelector('.rb-node.is-dim')).toBeTruthy()
    fireEvent.mouseEnter(container.querySelector('.rb-csf'))
    expect(container.querySelector('.rb-node.is-dim')).toBeTruthy()
    fireEvent.mouseEnter(container.querySelector('.rb-cf'))
    expect(container.querySelector('.rb-node.is-dim')).toBeTruthy()

    // Leaving the board clears the highlight.
    fireEvent.mouseLeave(container.querySelector('.rb'))
    expect(container.querySelector('.rb-node.is-dim')).toBeFalsy()

    // Clicking a seeded node routes back through onPick.
    await userEvent.click(leaf)
    expect(onPick).toHaveBeenCalled()
  })

  it('ignores hover and clicks on empty projected nodes', async () => {
    const onPick = vi.fn()
    const { container } = render(<RadialBracket games={REGULAR} onPick={onPick} />)

    // The inner rounds have no winners yet, so those nodes render empty.
    const emptyR1 = container.querySelector('.rb-r1.is-empty')
    expect(emptyR1).toBeTruthy()

    // Hovering an empty node passes an undefined abbr — the onHover guard short-circuits
    // and no node dims.
    fireEvent.mouseEnter(emptyR1)
    expect(container.querySelector('.rb-node.is-dim')).toBeFalsy()

    // Clicking an empty node does nothing (the team guard blocks onPick).
    await userEvent.click(emptyR1)
    expect(onPick).not.toHaveBeenCalled()
  })
})
