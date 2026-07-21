import { Fragment, useMemo } from 'react'
import { conferenceStandings, CONFERENCES, PLAYIN_SEEDS } from '../utils/standings.js'
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
          {row.clinched && (
            <span className="badge badge-in" title="Clinched a playoff spot">
              ✓
            </span>
          )}
          {row.eliminated && (
            <span className="badge badge-out" title="Eliminated from playoff contention">
              ✕
            </span>
          )}
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
                      <td colSpan={11}>
                        <span>Seeds 1–6 clinch a series · play-in below</span>
                      </td>
                    </tr>
                  )}
                  {seed === PLAYIN_CUT && (
                    <tr className="cutline">
                      <td colSpan={11}>
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
  const byConf = useMemo(() => conferenceStandings(games), [games])

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
    </section>
  )
}
