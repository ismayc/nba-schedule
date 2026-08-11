import { useMemo, useState } from 'react'
import { HISTORY, HISTORY_BY_YEAR, HISTORY_YEARS } from '../data/history.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { CONFERENCES } from '../utils/standings.js'
import { finalsSummary, playInQualifiers, seasonPlayIn } from '../utils/history.js'
import { seasonScoring } from '../utils/stats.js'
import { BracketBody } from './Bracket.jsx'
import { Tile, GameList, Leaders, MarginChart } from './StatsView.jsx'
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
  { key: 'stats', label: 'Stats' },
  { key: 'playin', label: 'Play-in qualifiers' },
  { key: 'champions', label: 'Champions' },
]

// The two modes that show ONE season, and so want the season picker above them.
const SEASON_SCOPED = new Set(['season', 'stats'])

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
function TeamChip({ abbr, size = 20, onPick, year }) {
  return (
    <button className="hy-team" onClick={() => onPick?.(abbr, year)}>
      <TeamLogo abbr={abbr} size={size} />
      <span>{teamName(abbr)}</span>
    </button>
  )
}

/* ── One season's final conference tables ──────────────────────────────── */

// The committed rows are compact (`home: [w, l]`, last-10 as a W-L pair), so this is a
// leaner table than the live Regular Season view rather than a reuse of it — a finished
// season has no clinch/elimination story left to tell.
function StandingsTable({ conf, rows, onPick, year }) {
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
                  <TeamChip abbr={r.abbr} size={26} onPick={onPick} year={year} />
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
  // The bracket reports a team by abbreviation alone; stamp this season onto it
  // so the panel it opens describes the right year.
  const pick = (abbr) => onPick?.(abbr, season.year)

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
        onPick={pick}
        onOpen={onOpen}
      />

      <div className="grid-2">
        {['E', 'W'].map((c) => (
          <StandingsTable key={c} conf={c} rows={season.standings[c]} onPick={onPick} year={season.year} />
        ))}
      </div>
    </>
  )
}

/* ── One season's statistics ───────────────────────────────────────────── */

// The live Stats view's cards, driven by an archived season instead of a game list:
// the totals it derived from ~1,230 games are committed as numbers, the leaderboards
// were built by the same leaderboard() at fetch time, and the margin chart re-derives
// from points for/against in the standings.
//
// The live view's fourth card, the playoff race, has no historical meaning — magic
// numbers for a season that finished years ago — so a finished season shows its
// notable games instead.
function SeasonStats({ season, tz, onPickTeam, onPickPlayer, onOpen }) {
  const t = season.totals
  // Leaderboards and the margin chart report a team by abbreviation alone; stamp
  // this season onto it so the panel they open describes the right year.
  const pickTeam = (abbr) => onPickTeam?.(abbr, season.year)
  const [open, setOpen] = useState(null)
  const toggle = (k) => setOpen((v) => (v === k ? null : k))

  const rows = useMemo(() => seasonScoring(season.standings, TEAM_BY_ABBR), [season])
  // Rejoin each board row to that season's player table, so a row reaching the leaders
  // card or the player pop-out carries the same full stat line a live row does.
  // Identity is stable per season, so the card's memo holds across category switches.
  const getRows = useMemo(
    () => (cat) =>
      season.leaders[cat.key].map((r) => ({ ...season.players[r.id], rank: r.rank, value: r.value })),
    [season]
  )

  const margin = (g) => Math.abs(g.score[0] - g.score[1])
  const drill = (games, note) => <GameList games={games} tz={tz} note={note} onOpen={onOpen} />

  return (
    <>
      <div className="card">
        <h3 className="card-title">{season.label} in numbers</h3>
        <div className="tiles">
          <Tile label="Games played" value={t.played.toLocaleString()} sub="regular season" />
          <Tile label="Points scored" value={t.points.toLocaleString()} />
          <Tile label="Points per game" value={t.combinedPpg.toFixed(1)} sub="both teams" />
          <Tile
            label="Home win rate"
            value={`${Math.round((t.homeWins / t.played) * 100)}%`}
            sub={`${t.homeWins.toLocaleString()} of ${t.played.toLocaleString()}`}
          />
          <Tile label="Overtime games" value={t.ot} />
          <Tile label="One-possession finishes" value={t.nailbiters} sub="within 3" />
          <Tile label="Blowouts" value={t.blowouts} sub="by 20 or more" />
          <Tile
            label="Closest games"
            value={t.closest.length}
            onClick={() => toggle('closest')}
            open={open === 'closest'}
          />
          <Tile
            label="Highest scoring"
            value={t.highest.length}
            onClick={() => toggle('highest')}
            open={open === 'highest'}
          />
        </div>
        {open === 'closest' && drill(t.closest, (g) => `by ${margin(g)}`)}
        {open === 'highest' && drill(t.highest, (g) => `${g.score[0] + g.score[1]} total`)}
        <p className="fine">
          Totals cover the regular season. The five closest and five highest-scoring nights
          are the only regular-season games kept — each still opens its box score.
        </p>
      </div>

      <Leaders getRows={getRows} onPickTeam={pickTeam} onPickPlayer={onPickPlayer} />

      <MarginChart rows={rows} onPickTeam={pickTeam} />
    </>
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
                  <TeamChip abbr={r.abbr} size={22} onPick={onPick} year={r.year} />
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
                  <TeamChip abbr={finals.winner} size={22} onPick={onPick} year={season.year} />
                </td>
                <td className="col-team">
                  <TeamChip abbr={finals.loser} size={22} onPick={onPick} year={season.year} />
                </td>
                <td className="num">
                  {finals.wins[0]}–{finals.wins[1]}
                </td>
                <td className="col-team hide-sm">
                  <TeamChip abbr={best.abbr} size={22} onPick={onPick} year={season.year} />
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
export default function HistoryView({
  season,
  onSeason,
  tz,
  onPick,
  onOpen,
  onPickPlayer,
  seasons = HISTORY,
}) {
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
            ladder, its full bracket, and a full season of statistics.
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

      {SEASON_SCOPED.has(mode) && (
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
      )}

      {mode === 'season' && <Season season={data} tz={tz} onPick={onPick} onOpen={onOpen} />}

      {mode === 'stats' && (
        <SeasonStats
          season={data}
          tz={tz}
          onPickTeam={onPick}
          onPickPlayer={onPickPlayer}
          onOpen={onOpen}
        />
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
