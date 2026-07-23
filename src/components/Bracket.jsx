import { Fragment, useEffect, useMemo, useState } from 'react'
import { buildBracket, PLAYOFF_ROUNDS } from '../utils/bracket.js'
import { CONFERENCES } from '../utils/standings.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { formatDate } from '../utils/time.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

// Track a CSS media query. jsdom (tests) has no matchMedia, so this reports false there
// and the desktop layout renders — which is what the render/follow tests assert against.
function useMediaQuery(query) {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  const [matches, setMatches] = useState(() => (supported ? window.matchMedia(query).matches : false))
  useEffect(() => {
    if (!supported) return
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query, supported])
  return matches
}

// Short pill labels for the mobile round selector (the full names don't fit a phone).
const ROUND_SHORT = { R1: '1st Round', CSF: 'Conf. Semis', CF: 'Conf. Finals', Final: 'Finals' }

// One dot per game in the series: filled for a played game, hollow for one still to
// come. Reads faster than a scoreline when scanning a bracket.
function SeriesDots({ series, team }) {
  const played = series.games.filter((g) => g.score)
  return (
    <span className="dots" aria-hidden="true">
      {Array.from({ length: series.bestOf }, (_, i) => {
        const g = played[i]
        if (!g) return <i key={i} className="dot-empty" />
        const winner = g.score[0] > g.score[1] ? g.home : g.away
        return <i key={i} className={winner === team ? 'dot-w' : 'dot-l'} />
      })}
    </span>
  )
}

function Side({ abbr, label, seed, wins, isWinner, decided, onPick }) {
  const team = TEAM_BY_ABBR[abbr]
  const { isFollowed } = useFollow()

  if (!team) {
    return (
      <div className="bx-side bx-empty">
        {/* v8 ignore next -- buildBracket sets a feeder on every slot (R1 "N seed", CSF/CF "Winner…", Final "… champion"), so an empty side always has a label; the 'TBD' fallback guards a shape buildBracket never emits */}
        <span className="bx-feeder">{label || 'TBD'}</span>
      </div>
    )
  }

  return (
    <div
      className={`bx-side ${isWinner ? 'bx-won' : decided ? 'bx-lost' : ''} ${
        isFollowed(abbr) ? 'followed' : ''
      }`}
    >
      {seed && <span className="bx-seed">{seed}</span>}
      <button className="bx-team" onClick={() => onPick?.(abbr)}>
        <TeamLogo abbr={abbr} size={24} />
        <span className="bx-name">{team.name}</span>
      </button>
      <span className="bx-wins">{wins}</span>
    </div>
  )
}

function Series({ series, onPick, tz }) {
  const [a, b] = series.order
  const decided = series.complete
  const next = series.games.find((g) => !g.score)

  return (
    <div
      className={`bx-series ${series.projected ? 'is-proj' : ''} ${series.live ? 'is-live' : ''} ${
        decided ? 'is-done' : ''
      }`}
    >
      <Side
        abbr={a}
        label={series.feeders?.[0]}
        seed={series.seeds?.[0]}
        wins={series.wins[a] ?? 0}
        isWinner={series.winner === a}
        decided={decided}
        onPick={onPick}
      />
      <Side
        abbr={b}
        label={series.feeders?.[1]}
        seed={series.seeds?.[1]}
        wins={series.wins[b] ?? 0}
        isWinner={series.winner === b}
        decided={decided}
        onPick={onPick}
      />
      <div className="bx-foot">
        <span className="bx-bo">Best of {series.bestOf}</span>
        {series.games.length > 0 && <SeriesDots series={series} team={a} />}
        {next && <span className="bx-next">Game {next.game} · {formatDate(next.tip, tz)}</span>}
        {series.live && <span className="bx-live">● LIVE</span>}
      </div>
    </div>
  )
}

// One conference's fixed fan: First Round (4) → Conference Semifinals (2) → Conference
// Finals (1). The `conf` flag lets the West mirror so both conference finals sit next to
// the Finals in the centre.
function ConferenceBracket({ conf, data, onPick, tz }) {
  return (
    <div className={`bx-conf bx-conf-${conf === 'E' ? 'east' : 'west'}`}>
      <h3 className="bx-conf-title">{CONFERENCES[conf]}</h3>
      <div className="bx-rounds">
        <div className="bx-col">
          <h4 className="bx-round">{PLAYOFF_ROUNDS.R1}</h4>
          {data.r1.map((s, i) => (
            <Series key={i} series={s} onPick={onPick} tz={tz} />
          ))}
        </div>
        <div className="bx-col">
          <h4 className="bx-round">{PLAYOFF_ROUNDS.CSF}</h4>
          {data.csf.map((s, i) => (
            <Series key={i} series={s} onPick={onPick} tz={tz} />
          ))}
        </div>
        <div className="bx-col bx-col-cf">
          <h4 className="bx-round">{PLAYOFF_ROUNDS.CF}</h4>
          <Series series={data.cf} onPick={onPick} tz={tz} />
        </div>
      </div>
    </div>
  )
}

// Phones: one round at a time, chosen from a pill selector, as a full-width vertical
// list — the same pattern world-cup-viewer uses so the bracket needs no horizontal
// scrolling on a phone. Each round shows both conferences' series under sub-headers.
function MobileBracket({ rounds, active, setActive, onPick, tz }) {
  /* v8 ignore next -- `active` is always one of the four round keys (initialised from a round key, only ever set to r.key), so find() never misses; the `|| rounds[0]` guard is unreachable */
  const round = rounds.find((r) => r.key === active) || rounds[0]
  return (
    <div className="bx-mobile">
      <div className="bx-round-tabs" role="tablist" aria-label="Playoff rounds">
        {rounds.map((r) => (
          <button
            key={r.key}
            role="tab"
            aria-selected={r.key === active}
            className={`bx-round-btn${r.key === active ? ' active' : ''}`}
            onClick={() => setActive(r.key)}
          >
            {ROUND_SHORT[r.key]}
          </button>
        ))}
      </div>
      <div className="bx-mobile-list">
        {round.groups.map((g) => (
          <Fragment key={g.conf ?? 'final'}>
            {g.conf && <h4 className="bx-mobile-conf">{CONFERENCES[g.conf]}</h4>}
            {g.series.map((s, i) => (
              <Series key={i} series={s} onPick={onPick} tz={tz} />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

export default function Bracket({ games, tz, onPick }) {
  const bracket = useMemo(() => buildBracket(games), [games])
  const { conferences, final, champion, projected, playIn } = bracket
  const isMobile = useMediaQuery('(max-width: 720px)')

  // The season's other title game. Deliberately a footnote, not a bracket: it's a
  // single exhibition final that counts for nothing in the standings (the reason
  // utils/standings excludes seasonType 'cup').
  const cup = useMemo(() => games.find((g) => g.seasonType === 'cup'), [games])

  // Rounds in bracket order, each carrying both conferences' series — the source for the
  // mobile one-round-at-a-time view.
  const rounds = useMemo(
    () => [
      { key: 'R1', groups: [{ conf: 'E', series: conferences.E.r1 }, { conf: 'W', series: conferences.W.r1 }] },
      { key: 'CSF', groups: [{ conf: 'E', series: conferences.E.csf }, { conf: 'W', series: conferences.W.csf }] },
      { key: 'CF', groups: [{ conf: 'E', series: [conferences.E.cf] }, { conf: 'W', series: [conferences.W.cf] }] },
      { key: 'Final', groups: [{ conf: null, series: [final] }] },
    ],
    [conferences, final]
  )

  // Open to the earliest round still undecided (the live/next one), else the Finals.
  const firstLive = rounds.find((r) => r.groups.some((g) => g.series.some((s) => !s.complete)))
  const [active, setActive] = useState(() => (firstLive ?? rounds[rounds.length - 1]).key)

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Playoffs</h2>
          <p className="sub">
            Eight teams per conference: seeds 1–6 qualify outright, seeds 7–8 come through
            a play-in among 7–10. Every round is best-of-7 and the bracket is fixed —
            1v8, 4v5, 2v7, 3v6, no re-seeding. The two conference champions meet in the
            Finals.
          </p>
        </div>
      </div>

      {projected && (
        <p className="banner">
          <strong>Projected.</strong> The postseason hasn&apos;t started, so this is the
          bracket you&apos;d get if the regular season ended today.
        </p>
      )}

      {champion && (
        <p className="banner banner-champ">
          🏆 <strong>{TEAM_BY_ABBR[champion]?.displayName}</strong> win the title.
        </p>
      )}

      {isMobile ? (
        <MobileBracket rounds={rounds} active={active} setActive={setActive} onPick={onPick} tz={tz} />
      ) : (
        <div className="bx">
          <ConferenceBracket conf="E" data={conferences.E} onPick={onPick} tz={tz} />

          <div className="bx-conf bx-conf-final">
            <h3 className="bx-conf-title">{PLAYOFF_ROUNDS.Final}</h3>
            <div className="bx-col bx-col-final">
              <Series series={final} onPick={onPick} tz={tz} />
            </div>
          </div>

          <ConferenceBracket conf="W" data={conferences.W} onPick={onPick} tz={tz} />
        </div>
      )}

      {projected && (
        <div className="card">
          <h3 className="card-title">Play-in — seeds 7 to 10</h3>
          <div className="bx-playin">
            {['E', 'W'].map((c) => (
              <div key={c} className="bx-playin-conf">
                <h4 className="bx-playin-title">{CONFERENCES[c]}</h4>
                <ol className="bx-field">
                  {playIn[c].map((r) => (
                    <li key={r.abbr}>
                      <span className="bx-field-seed">{r.seed}</span>
                      <TeamLogo abbr={r.abbr} size={20} />
                      <span>{r.team.name}</span>
                      <span className="dim">
                        {r.w}–{r.l}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      )}

      {cup && (
        <p className="bx-cup">
          🏆 NBA Cup{' '}
          {cup.score ? (
            <>
              — <strong>{TEAM_BY_ABBR[cup.score[0] > cup.score[1] ? cup.home : cup.away]?.name}</strong>{' '}
              beat {TEAM_BY_ABBR[cup.score[0] > cup.score[1] ? cup.away : cup.home]?.name}{' '}
              {Math.max(...cup.score)}–{Math.min(...cup.score)}
            </>
          ) : (
            <>
              final — {TEAM_BY_ABBR[cup.away]?.name} @ {TEAM_BY_ABBR[cup.home]?.name}
            </>
          )}
          <span className="dim">
            {' '}
            · {formatDate(cup.tip, tz)}
            {cup.city ? ` · ${cup.city}` : ''} · separate trophy, not counted in the
            standings
          </span>
        </p>
      )}
    </section>
  )
}
