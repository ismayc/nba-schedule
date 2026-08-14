import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import Bracket, { BracketBody } from '../src/components/Bracket.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { HISTORY_BY_YEAR } from '../src/data/history.js'
import { CUP_FINAL_2526 } from './fixtures/season2526.js'

const TZ = 'America/New_York'

// The archived 2025-26 postseason — finished, so refresh- and rollover-stable. The
// live schedule holds no played games after the 2026-27 rollover.
const ARCHIVE = HISTORY_BY_YEAR[2026].games

beforeEach(() => {
  localStorage.clear()
})

// A mid-postseason feed: the Finals' clinching game (5) is switched to in-progress, so
// the series is live, still undecided, and has a next game to play.
const CLINCHER = ARCHIVE.find((g) => g.round === 'Final' && g.game === 5)
const LIVE_FEED = ARCHIVE.map((g) =>
  g.id === CLINCHER.id ? { ...g, score: undefined, live: true } : g
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
    // Flip the frozen cup result so the AWAY team (San Antonio) wins, and drop the
    // city — the two else-branches the real home-win-with-city footnote never hits.
    const feed = [...ARCHIVE, { ...CUP_FINAL_2526, score: [113, 124], city: undefined }]
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
    // The archive commits postseason rows + final standings; without the standings the
    // seed pairing is meaningless and R1 slots read incomplete (opening the wrong tab).
    const { container, unmount } = render(
      <BracketBody games={ARCHIVE} standings={HISTORY_BY_YEAR[2026].standings} tz={TZ} />
    )
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
