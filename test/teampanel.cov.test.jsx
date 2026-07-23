import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TeamPanel from '../src/components/TeamPanel.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'

beforeEach(() => {
  localStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
})

const open = (abbr, games, props = {}) =>
  render(
    <FollowProvider>
      <TeamPanel abbr={abbr} games={games} tz={TZ} onClose={() => {}} {...props} />
    </FollowProvider>
  )

describe('TeamPanel — live "Next up" and backdrop paths', () => {
  it('labels an in-progress upcoming game as Live', () => {
    // The committed season is complete, so append an unplayed, in-progress game to give
    // "Next up" a live entry (liveState → 'live').
    const games = [
      ...GAMES,
      { id: 'min-live', seasonType: 'regular', tip: '2026-09-01T00:00:00.000Z', home: 'MIN', away: 'LAL', live: true },
    ]
    open('MIN', games)
    expect(screen.getByText('Next up')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('closes on a backdrop mousedown but not on an inner one', () => {
    const onClose = vi.fn()
    const { container } = open('MIN', GAMES, { onClose })

    // Mousedown inside the dialog must not close it.
    fireEvent.mouseDown(container.querySelector('.modal'))
    expect(onClose).not.toHaveBeenCalled()

    // Mousedown on the backdrop itself closes it.
    fireEvent.mouseDown(container.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalled()
  })
})
