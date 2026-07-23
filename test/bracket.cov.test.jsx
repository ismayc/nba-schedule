import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import Bracket from '../src/components/Bracket.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'

beforeEach(() => {
  localStorage.clear()
})

// A mid-postseason feed: the Finals' clinching game (5) is switched to in-progress, so
// the series is live, still undecided, and has a next game to play.
const LIVE_FEED = GAMES.map((g) =>
  g.id === '401859967' ? { ...g, score: undefined, live: true } : g
)

describe('Bracket — live series footer', () => {
  it('marks a live series and shows its next game', () => {
    const { container } = render(
      <FollowProvider>
        <Bracket games={LIVE_FEED} tz={TZ} />
      </FollowProvider>
    )
    const live = container.querySelector('.bx-series.is-live')
    expect(live).toBeTruthy()
    expect(within(live).getByText('● LIVE')).toBeInTheDocument()
    expect(within(live).getByText(/Game 5 ·/)).toBeInTheDocument()
  })
})

describe('Bracket — NBA Cup won by the away team, no host city', () => {
  it('names the away winner and omits the city clause', () => {
    // Flip the committed cup result so the AWAY team (San Antonio) wins, and drop the
    // city — the two else-branches the committed home-win-with-city footnote never hits.
    const feed = GAMES.map((g) =>
      g.seasonType === 'cup' ? { ...g, score: [113, 124], city: undefined } : g
    )
    const { container } = render(<Bracket games={feed} tz={TZ} />)
    const cup = container.querySelector('.bx-cup')
    expect(cup).toHaveTextContent(/NBA Cup — Spurs beat Knicks 124–113/)
  })
})

describe('Bracket — phone (one-round-at-a-time) layout', () => {
  const realMatchMedia = window.matchMedia

  beforeEach(() => {
    // jsdom has no matchMedia; provide one that matches the phone breakpoint so the
    // mobile branch of useMediaQuery renders.
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })

  afterEach(() => {
    window.matchMedia = realMatchMedia
  })

  it('renders the round tabs and switches rounds', () => {
    const { container, unmount } = render(<Bracket games={GAMES} tz={TZ} />)
    expect(container.querySelector('.bx-mobile')).toBeTruthy()

    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBe(4)

    // The completed feed opens on the Finals tab — a single, conference-less group (no
    // conference sub-header).
    expect(container.querySelector('.bx-mobile-conf')).toBeFalsy()

    // Switch to the first round — now both conferences render under sub-headers.
    fireEvent.click(screen.getByRole('tab', { name: '1st Round' }))
    expect(screen.getByRole('tab', { name: '1st Round' })).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelector('.bx-mobile-conf')).toBeTruthy()

    // Unmount to exercise the media-query listener cleanup.
    unmount()
  })
})
