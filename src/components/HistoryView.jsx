import { useMemo, useState } from 'react'
import { HISTORY, HISTORY_BY_YEAR, HISTORY_YEARS } from '../data/history.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { CONFERENCES } from '../utils/standings.js'
import { finalsSummary, playInQualifiers, seasonPlayIn } from '../utils/history.js'
import { BracketBody } from './Bracket.jsx'
import TeamLogo from './TeamLogo.jsx'

/**
 * Completed seasons, back to 2020-21.
 *
 * The floor is not arbitrary: 2020-21 is when the play-in tournament took its current
 * shape (seeds 7–10, three single-elimination games per conference). The 2020 Orlando
 * restart ran a one-off qualifier and earlier seasons had none, so every season in here
 * is directly comparable with this one — which is the point.
 *
 * Each season commits its final standings, its play-in and playoff games, and its
 * statistical leaders. The bracket and ladder are rebuilt from those games at runtime by
 * the same functions the current season uses, so an archived bracket cannot drift from
 * the live one. The regular season's ~1,230 games are summarised into the standings
 * rather than committed — the reason five extra seasons cost ~170KB rather than 4MB.
 */

const MODES = [
  { key: 'season', label: 'By season' },
  { key: 'playin', label: 'Play-in qualifiers' },
  { key: 'champions', label: 'Champions' },
]

// Every abbreviation in history.js is one of the 30 current franchises — no team has
// moved or been renamed since 2020-21 — so this never has to fall back.
const teamName = (abbr) => TEAM_BY_ABBR[abbr].name

const pct = (n) => n.toFixed(3).replace(/^0/, '')
// Games behind is always a multiple of a half, and String() renders "1.5" as such.
const gbText = (n) => (n === 0 ? '—' : String(n))
const signed = (n) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1))
const record = ([w, l]) => `${w}-${l}`

// A team, as a clickable chip — the same affordance as every other team reference in
// the app, so a name in a historical table still opens that team's panel.
function TeamChip({ abbr, size = 20, onPick }) {
  return (
    <button className="hy-team" onClick={() => onPick?.(abbr)}>
      <TeamLogo abbr={abbr} size={size} />
      <span>{teamName(abbr)}</span>
    </button>
  )
}

/* ── One season's final conference tables ──────────────────────────────── */

// The committed rows are compact (`home: [w, l]`, last-10 as a W-L pair), so this is a
// leaner table than the live Regular Season view rather than a reuse of it — a finished
// season has no clinch/elimination story left to tell.
function StandingsTable({ conf, rows, onPick }) {
  return (
    <div className="card">
      <h3 className="card-title">{CONFERENCES[conf]}</h3>
      <div className="table-scroll">
        <table className="standings">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th className="col-team">Team</th>
              <th className="num">W</th>
              <th className="num">L</th>
              <th className="num">PCT</th>
              <th className="num">GB</th>
              <th className="num hide-sm">Home</th>
              <th className="num hide-sm">Road</th>
              <th className="num hide-sm">Conf</th>
              <th className="num hide-sm" title="Point differential per game">
                Net
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.abbr} className={r.seed > 10 ? 'row-elim' : ''}>
                <td className="col-rank">
                  <span className="rank">{r.seed}</span>
                </td>
                <td className="col-team">
                  <TeamChip abbr={r.abbr} size={26} onPick={onPick} />
                </td>
                <td className="num">{r.w}</td>
                <td className="num">{r.l}</td>
                <td className="num">{pct(r.pct)}</td>
                <td className="num dim">{gbText(r.gb)}</td>
                <td className="num hide-sm">{record(r.home)}</td>
                <td className="num hide-sm">{record(r.road)}</td>
                <td className="num hide-sm">{record(r.conf)}</td>
                <td className={`num hide-sm ${r.netPpg > 0 ? 'pos' : 'neg'}`}>
                  {signed(r.netPpg)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── One season ────────────────────────────────────────────────────────── */

// One archived season: who came through the play-in, the bracket (which carries its own
// champion banner), the final standings, and the leaders.
function Season({ season, tz, onPick, onOpen }) {
  const playIn = useMemo(() => seasonPlayIn(season), [season])

  return (
    <>
      <p className="sub hy-note">
        Into the playoffs through the play-in:{' '}
        {['E', 'W'].map((c, i) => (
          <span key={c}>
            {i > 0 && ' · '}
            {[7, 8]
              .map((s) => playIn[c].seeds[s])
              .filter(Boolean)
              .map((abbr, j) => (
                <span key={abbr}>
                  {j > 0 && ' and '}
                  <strong>{teamName(abbr)}</strong>
                </span>
              ))}{' '}
            ({CONFERENCES[c].replace(' Conference', '')})
          </span>
        ))}
      </p>

      <BracketBody
        games={season.games}
        standings={season.standings}
        tz={tz}
        onPick={onPick}
        onOpen={onOpen}
      />

      <div className="grid-2">
        {['E', 'W'].map((c) => (
          <StandingsTable key={c} conf={c} rows={season.standings[c]} onPick={onPick} />
        ))}
      </div>

      <Leaders leaders={season.leaders} onPick={onPick} />
    </>
  )
}

const LEADER_LABELS = {
  points: 'Points',
  rebounds: 'Rebounds',
  assists: 'Assists',
  steals: 'Steals',
  blocks: 'Blocks',
  threes: '3-pointers',
}

function Leaders({ leaders, onPick }) {
  return (
    <div className="card">
      <h3 className="card-title">Season leaders — per game</h3>
      <div className="hy-leaders">
        {Object.entries(LEADER_LABELS).map(([key, label]) => (
          <div key={key} className="hy-leader-cat">
            <h4 className="bx-playin-title">{label}</h4>
            <ol className="hy-leader-list">
              {leaders[key].map((p, i) => (
                <li key={`${p.name}-${p.team}`}>
                  <span className="bx-field-seed">{i + 1}</span>
                  <button className="hy-team" onClick={() => onPick?.(p.team)}>
                    <TeamLogo abbr={p.team} size={16} />
                    <span>{p.short}</span>
                  </button>
                  <span className="hy-leader-v">{p.v.toFixed(1)}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Every play-in qualifier, all seasons ──────────────────────────────── */

function PlayInHistory({ seasons, onPick, onSeason }) {
  const rows = useMemo(() => playInQualifiers(seasons), [seasons])

  return (
    <div className="card">
      <h3 className="card-title">Every team that reached the playoffs through the play-in</h3>
      <p className="sub">
        Since 2020-21, {rows.length} teams have taken the 7 or 8 seed out of the play-in.
        What they did with it is the column that matters.
      </p>
      <div className="table-scroll">
        <table className="standings hy-table">
          <thead>
            <tr>
              <th>Season</th>
              <th>Conf</th>
              <th className="col-team">Team</th>
              <th className="num">Seed</th>
              <th className="hide-sm">Route</th>
              <th>Playoff run</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.year}-${r.abbr}`} className={r.champion ? 'hy-champ-row' : ''}>
                <td>
                  <button className="hy-year" onClick={() => onSeason?.(r.year)}>
                    {r.label}
                  </button>
                </td>
                <td className="dim">{r.conf}</td>
                <td className="col-team">
                  <TeamChip abbr={r.abbr} size={22} onPick={onPick} />
                </td>
                <td className="num">{r.seed}</td>
                <td className="hide-sm dim">{r.path}</td>
                <td>
                  {r.champion && '🏆 '}
                  {r.result}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Champions, all seasons ────────────────────────────────────────────── */

function Champions({ seasons, onPick, onSeason }) {
  const rows = useMemo(
    () =>
      seasons.map((s) => {
        const finals = finalsSummary(s)
        const best = [...s.standings.E, ...s.standings.W].sort((a, b) => b.pct - a.pct)[0]
        return { season: s, finals, best }
      }),
    [seasons]
  )

  return (
    <div className="card">
      <h3 className="card-title">Champions</h3>
      <div className="table-scroll">
        <table className="standings hy-table">
          <thead>
            <tr>
              <th>Season</th>
              <th className="col-team">Champion</th>
              <th className="col-team">Runner-up</th>
              <th className="num">Finals</th>
              <th className="col-team hide-sm">Best record</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ season, finals, best }) => (
              <tr key={season.year}>
                <td>
                  <button className="hy-year" onClick={() => onSeason?.(season.year)}>
                    {season.label}
                  </button>
                </td>
                <td className="col-team">
                  <TeamChip abbr={finals.winner} size={22} onPick={onPick} />
                </td>
                <td className="col-team">
                  <TeamChip abbr={finals.loser} size={22} onPick={onPick} />
                </td>
                <td className="num">
                  {finals.wins[0]}–{finals.wins[1]}
                </td>
                <td className="col-team hide-sm">
                  <TeamChip abbr={best.abbr} size={22} onPick={onPick} />
                  <span className="dim">
                    {' '}
                    {best.w}-{best.l}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// `seasons` is injectable so the all-seasons tables can be exercised against a season
// set the real archive doesn't (yet) contain — no play-in team has ever won the title.
export default function HistoryView({ season, onSeason, tz, onPick, onOpen, seasons = HISTORY }) {
  const [mode, setMode] = useState('season')
  // An unknown ?season= (a stale link, or one pointing at the current season) falls back
  // to the most recent archived year rather than rendering nothing.
  const year = HISTORY_BY_YEAR[season] ? season : HISTORY_YEARS[0]
  const data = HISTORY_BY_YEAR[year]

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>History</h2>
          <p className="sub">
            Every completed season since <strong>2020-21</strong> — the year the play-in
            tournament took its current form, which is what makes these seasons directly
            comparable with this one. Each carries its final standings, its play-in
            ladder, its full bracket, and its statistical leaders.
          </p>
        </div>
        <div className="view-tools" role="group" aria-label="History mode">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`chip ${mode === m.key ? 'on' : ''}`}
              onClick={() => setMode(m.key)}
              aria-pressed={mode === m.key}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'season' && (
        <>
          <div className="hy-pick">
            <label className="season-pick">
              <span className="sr-only">Season</span>
              <select value={year} onChange={(e) => onSeason?.(Number(e.target.value))}>
                {HISTORY_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {HISTORY_BY_YEAR[y].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Season season={data} tz={tz} onPick={onPick} onOpen={onOpen} />
        </>
      )}

      {mode === 'playin' && (
        <PlayInHistory seasons={seasons} onPick={onPick} onSeason={onSeason} />
      )}
      {mode === 'champions' && (
        <Champions seasons={seasons} onPick={onPick} onSeason={onSeason} />
      )}
    </section>
  )
}
