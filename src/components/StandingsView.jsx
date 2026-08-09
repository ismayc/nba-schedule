import { Fragment, useMemo } from 'react'
import { playoffRace, CONFERENCES, PLAYIN_SEEDS } from '../utils/standings.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

// The last play-in seed (10) — the elimination line: 11th and below are out.
const PLAYIN_CUT = PLAYIN_SEEDS[PLAYIN_SEEDS.length - 1]

const pct = (n) => n.toFixed(3).replace(/^0/, '')
const gbText = (n) => (n === 0 ? '—' : n % 1 ? n.toFixed(1) : String(n))
const signed = (n) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1))

function StreakPill({ streak }) {
  if (!streak) return <span className="dim">—</span>
  const win = streak > 0
  return (
    <span className={`streak ${win ? 'streak-w' : 'streak-l'}`}>
      {win ? 'W' : 'L'}
      {Math.abs(streak)}
    </span>
  )
}

// Ten dots, oldest first — faster to read than "7-3" when scanning for who's hot.
function LastTen({ results }) {
  return (
    <span className="l10" title={`${results.filter(Boolean).length}-${results.filter((r) => !r).length} in last 10`}>
      {results.map((won, i) => (
        <i key={i} className={won ? 'l10-w' : 'l10-l'} />
      ))}
    </span>
  )
}

// The race tiers are mutually exclusive, strongest claim first: a top-6 lock beats the
// bare play-in-berth ✓, and a team locked INTO the play-in gets its own amber chip —
// "safe from 11th, but 7th is now the ceiling" is neither a plain ✓ nor a ✕.
function RaceBadge({ row }) {
  if (row.clinchedTop6) {
    return (
      <span className="badge badge-in" title="Clinched a top-6 seed — straight to the bracket, no play-in">
        ✓ top 6
      </span>
    )
  }
  if (row.lockedPlayin) {
    return (
      <span className="badge badge-mid" title="Locked into the play-in — safe from elimination, but a top-6 seed is out of reach">
        play-in
      </span>
    )
  }
  if (row.clinched) {
    return (
      <span className="badge badge-in" title="Clinched at least a play-in berth">
        ✓
      </span>
    )
  }
  if (row.eliminated) {
    return (
      <span className="badge badge-out" title="Eliminated — can no longer reach the play-in">
        ✕
      </span>
    )
  }
  return null
}

// "3–7" while outcomes remain open; collapses to the bare seed once locked.
function FinishRange({ row }) {
  if (row.bestRank === row.worstRank) {
    return <span className="finish finish-locked">{row.bestRank}</span>
  }
  return (
    <span className="finish">
      {row.bestRank}–{row.worstRank}
    </span>
  )
}

function Row({ row, rank, onPick }) {
  const { isFollowed, toggle } = useFollow()
  const followed = isFollowed(row.abbr)

  return (
    <tr className={`${followed ? 'row-followed' : ''} ${row.eliminated ? 'row-elim' : ''}`}>
      <td className="col-rank">
        <button
          className={`star ${followed ? 'on' : ''}`}
          onClick={() => toggle(row.abbr)}
          aria-label={`${followed ? 'Unfollow' : 'Follow'} ${row.team.displayName}`}
          aria-pressed={followed}
        >
          ★
        </button>
        <span className="rank">{rank}</span>
      </td>
      <td className="col-team">
        <button className="team-btn" onClick={() => onPick?.(row.abbr)}>
          <TeamLogo abbr={row.abbr} size={26} />
          <span className="team-name">
            <span className="team-loc">{row.team.location}</span>{' '}
            <span className="team-nick">{row.team.name}</span>
          </span>
          <RaceBadge row={row} />
        </button>
      </td>
      <td className="num">{row.w}</td>
      <td className="num">{row.l}</td>
      <td className="num">{pct(row.pct)}</td>
      <td className="num dim">{gbText(row.gb)}</td>
      <td className="num hide-sm">{`${row.home.w}-${row.home.l}`}</td>
      <td className="num hide-sm">{`${row.road.w}-${row.road.l}`}</td>
      <td className="hide-sm">
        <LastTen results={row.last10} />
      </td>
      <td className="num">
        <StreakPill streak={row.streak} />
      </td>
      <td className={`num hide-sm ${row.netPpg > 0 ? 'pos' : 'neg'}`}>{signed(row.netPpg)}</td>
      <td className="num">
        <FinishRange row={row} />
      </td>
    </tr>
  )
}

// The playoff picture is per-conference: seeds 1–6 clinch a first-round series, seeds
// 7–10 are the play-in field (four teams for the last two spots), and 11th and below are
// out. Two thin banner rows — after 6 and after 10 — carry that structure without needing
// colour to explain it. (The old single "top 8" cut was wrong: it dropped 9–10, which
// actually play in.)
function Table({ caption, rows, rankKey, onPick }) {
  return (
    <div className="card">
      <h3 className="card-title">{caption}</h3>
      <div className="table-scroll">
        <table className="standings">
          <thead>
            <tr>
              <th className="col-rank" />
              <th className="col-team">Team</th>
              <th className="num">W</th>
              <th className="num">L</th>
              <th className="num">PCT</th>
              <th className="num">GB</th>
              <th className="num hide-sm">Home</th>
              <th className="num hide-sm">Road</th>
              <th className="hide-sm">Last 10</th>
              <th className="num">Strk</th>
              <th className="num hide-sm" title="Point differential per game">
                Net
              </th>
              <th
                className="num"
                title="Final seeds still arithmetically possible (win-loss bounds; a secured tiebreaker can only narrow this sooner)"
              >
                Finish
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const seed = i + 1
              return (
                <Fragment key={row.abbr}>
                  <Row row={row} rank={row[rankKey]} onPick={onPick} />
                  {seed === 6 && (
                    <tr className="cutline">
                      <td colSpan={12}>
                        <span>Seeds 1–6 clinch a series · play-in below</span>
                      </td>
                    </tr>
                  )}
                  {seed === PLAYIN_CUT && (
                    <tr className="cutline">
                      <td colSpan={12}>
                        <span>Play-in cut — seeds 7–10 play for the last two spots</span>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function StandingsView({ games, onPick }) {
  // Source rows from playoffRace (not conferenceStandings) so each row carries the
  // clinched/eliminated status the badges and row-elim styling read. playoffRace returns
  // a flat, per-conference-seeded list; regroup it back into the two conference tables.
  const byConf = useMemo(() => {
    const groups = { E: [], W: [] }
    for (const row of playoffRace(games)) groups[row.conf].push(row)
    return groups
  }, [games])

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Regular Season</h2>
          <p className="sub">
            The NBA seeds each conference on its own: the <strong>top 8 in each</strong> reach the
            postseason. Seeds 1–6 are in outright; seeds <strong>7–10 meet in the play-in</strong>{' '}
            (7 v 8 and 9 v 10, then the 7/8 loser hosts the 9/10 winner) for the last two spots.
          </p>
        </div>
      </div>

      <div className="grid-2">
        {Object.entries(CONFERENCES).map(([key, label]) => (
          <Table key={key} caption={label} rows={byConf[key]} rankKey="confRank" onPick={onPick} />
        ))}
      </div>

      <p className="legend">
        <span className="legend-item">
          <span className="badge badge-in">✓ top 6</span> clinched a top-6 seed — straight to
          the bracket, no play-in
        </span>
        <span className="legend-item">
          <span className="badge badge-in">✓</span> clinched at least a play-in berth — a
          top-10 finish is guaranteed
        </span>
        <span className="legend-item">
          <span className="badge badge-mid">play-in</span> locked into the play-in — safe from
          elimination, but a top-6 seed is out of reach
        </span>
        <span className="legend-item">
          <span className="badge badge-out">✕</span> eliminated — can no longer catch the 10th
          seed (row dims)
        </span>
        <span className="legend-item">
          <span className="legend-star">★</span> a team you follow
        </span>
        <span className="legend-item">
          <span className="finish">Finish 3–7</span> — the final seeds still arithmetically
          possible; a single number means the seed is locked
        </span>
      </p>
    </section>
  )
}
