import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Keep the game-detail summary and player log off the network and deterministic.
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))
vi.mock('../src/services/player.js', () => ({
  fetchPlayer: () => Promise.resolve(null),
  headshotUrl: () => 'data:image/gif;base64,',
}))

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { GAMES } from '../src/data/schedule.js'

const mount = async () => {
  const utils = render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>
  )
  // Flush the mount-time poll microtasks (the committed season is complete so it never
  // actually fetches, but the effect still schedules a microtask on some paths).
  await act(async () => {})
  return utils
}

const search = () => new URLSearchParams(window.location.search)

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  // The committed NBA season is complete, so the app never polls; keep fetch inert
  // regardless as a safety net.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('localStorage unavailable (private mode)', () => {
  it('falls back to defaults when every init read throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    await mount()
    // spoiler-free, show-past, watch-only, and alerts initializers all catch and default off.
    expect(screen.getByTitle('Spoiler-free mode')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTitle('Live alerts off')).toHaveAttribute('aria-pressed', 'false')
  })

  it('swallows write failures across every persisted toggle', async () => {
    // Services present so the "On my services" toggle (a localStorage write) exists.
    localStorage.setItem('nba:services', JSON.stringify(['youtubetv', 'prime', 'peacock']))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    // Mount alone runs the spoiler-free and show-past persistence effects' catches.
    await mount()

    // Theme toggle write catch, both ternary directions (dark->light->dark).
    const themeBtn = screen.getByTitle('Toggle theme')
    await userEvent.click(themeBtn)
    await userEvent.click(themeBtn)

    // Alerts write catch, both '1' and '0' branches.
    await userEvent.click(screen.getByTitle('Live alerts off'))
    await userEvent.click(screen.getByTitle('Live alerts on'))

    // Watch-only write catch, both branches.
    const watchBtn = screen.getByRole('button', { name: /On my services/ })
    await userEvent.click(watchBtn)
    await userEvent.click(watchBtn)

    // Nothing escaped to the UI; the shell is still standing.
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})

describe('the other views render', () => {
  it('renders the Week view', async () => {
    window.history.replaceState(null, '', '/?view=week')
    await mount()
    expect(screen.getByRole('button', { name: /📆 Week/ })).toHaveAttribute('aria-current', 'page')
    expect(document.querySelector('main')).toBeInTheDocument()
  })

  it('renders the Playoffs bracket', async () => {
    window.history.replaceState(null, '', '/?view=playoffs')
    await mount()
    expect(screen.getByRole('button', { name: /🏆 Playoffs/ })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('renders the Radial bracket', async () => {
    window.history.replaceState(null, '', '/?view=radial')
    await mount()
    expect(screen.getByRole('button', { name: /🎯 Radial/ })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })
})

describe('timezone select', () => {
  it('changes the timezone and records it in the URL', async () => {
    window.history.replaceState(null, '', '/?tz=America/New_York')
    await mount()
    await userEvent.selectOptions(screen.getByLabelText('Timezone'), 'America/Los_Angeles')
    await waitFor(() => expect(search().get('tz')).toBe('America/Los_Angeles'))
  })
})

describe('followed team filter', () => {
  it('shows the My teams chip and narrows the schedule when toggled', async () => {
    // OKC hosts the very first committed game, so it has games on the slate.
    localStorage.setItem('nba:followed', JSON.stringify(['OKC']))
    // The season is complete — reveal past days so there are cards to count.
    window.history.replaceState(null, '', '/?past=1')
    await mount()
    const before = document.querySelectorAll('.game').length
    const chip = screen.getByRole('button', { name: /My teams \(1\)/ })
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    const after = document.querySelectorAll('.game').length
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(before)
  })
})

describe('the services picker from an existing selection', () => {
  it('opens the editor from the gear button', async () => {
    localStorage.setItem('nba:services', JSON.stringify(['peacock']))
    await mount()
    await userEvent.click(screen.getByRole('button', { name: 'Edit my services' }))
    expect(screen.getByRole('dialog', { name: 'My services' })).toBeInTheDocument()
  })
})

describe('clearing the team via the Clear chip', () => {
  it('drops the team back to all teams', async () => {
    window.history.replaceState(null, '', '/?team=MIN&past=1')
    await mount()
    expect(screen.getByDisplayValue('Minnesota Timberwolves')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Clear/ }))
    await waitFor(() => expect(search().get('team')).toBeNull())
    expect(screen.getByDisplayValue('All teams')).toBeInTheDocument()
  })
})

describe('the calendar modal', () => {
  it('opens from the filter bar and closes again', async () => {
    await mount()
    await userEvent.click(screen.getByRole('button', { name: /📅 Calendar/ }))
    const dialog = screen.getByRole('dialog', { name: 'Calendar' })
    expect(dialog).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Calendar' })).not.toBeInTheDocument()
  })
})

describe('team panel wiring', () => {
  it('jumps to the full schedule from the panel', async () => {
    window.history.replaceState(null, '', '/?view=standings')
    await mount()
    await userEvent.click(document.querySelector('.team-btn'))
    const panel = screen.getByRole('dialog')
    await userEvent.click(within(panel).getByRole('button', { name: /Full schedule/ }))
    // onSchedule pins the team and switches to the schedule view.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /📋 Schedule/ })).toHaveAttribute(
        'aria-current',
        'page'
      )
    )
  })

  it('opens a past game from the form strip', async () => {
    window.history.replaceState(null, '', '/?view=standings')
    await mount()
    await userEvent.click(document.querySelector('.team-btn'))
    const panel = screen.getByRole('dialog')
    const chip = panel.querySelector('.tp-chip')
    expect(chip).toBeTruthy()
    await userEvent.click(chip)
    // onOpenGame closes the panel and opens that game's detail.
    expect(await screen.findByRole('dialog', { name: 'Game detail' })).toBeInTheDocument()
  })
})

describe('player modal wiring', () => {
  it('opens a player from the stats leaders and closes it', async () => {
    window.history.replaceState(null, '', '/?view=stats')
    await mount()
    const playerBtn = document.querySelector('.lead-player')
    expect(playerBtn).toBeTruthy()
    await userEvent.click(playerBtn)
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('game detail wiring', () => {
  it('jumps to a team schedule from the detail, closing it', async () => {
    const real = GAMES.find((g) => g.seasonType === 'regular')
    window.history.replaceState(null, '', `/?game=${real.id}`)
    await mount()
    const dialog = screen.getByRole('dialog', { name: 'Game detail' })
    // A "<team> schedule" action calls onPickTeam then the detail's onClose.
    const schedBtn = within(dialog).getAllByRole('button', { name: /schedule/ })[0]
    await userEvent.click(schedBtn)
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Game detail' })).not.toBeInTheDocument()
    )
    // A team is now pinned in the filter select and the view is the schedule.
    await waitFor(() => expect(search().get('team')).toBeTruthy())
  })

  it('closes on the Close button', async () => {
    const real = GAMES.find((g) => g.seasonType === 'regular')
    window.history.replaceState(null, '', `/?game=${real.id}`)
    await mount()
    const dialog = screen.getByRole('dialog', { name: 'Game detail' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Game detail' })).not.toBeInTheDocument()
  })
})
