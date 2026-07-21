import { useMemo, useState } from 'react'
import { buildBracket, layout, polar, CENTER, RING } from '../utils/bracket.js'
import { CONFERENCES } from '../utils/standings.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

function Node({ pos, abbr, label, size, className = '', title, onClick, dim }) {
  const { x, y } = polar(pos.angle, pos.r)
  const style = { left: `${x}%`, top: `${y}%` }
  const team = TEAM_BY_ABBR[abbr]
  const { isFollowed } = useFollow()

  return (
    <button
      className={`rb-node ${className} ${dim ? 'is-dim' : ''} ${team ? '' : 'is-empty'} ${
        isFollowed(abbr) ? 'followed' : ''
      }`}
      style={style}
      onClick={() => team && onClick?.(abbr)}
      title={title || team?.displayName || label}
      aria-label={title || team?.displayName || label}
    >
      {team ? <TeamLogo abbr={abbr} size={size} /> : <span className="rb-tbd">{label}</span>}
    </button>
  )
}

// One conference is a full 8→4→2→1 wheel: seeds on the outer ring, advancing inward to
// the conference champion at the centre. The two wheels flank the Finals indicator.
function ConferenceWheel({ conf, data, seeds, geo, onPick }) {
  const [hover, setHover] = useState(null)
  const bySeed = Object.fromEntries(seeds.map((r) => [r.seed, r]))

  const lines = [
    ...geo.r1.flatMap((m, i) =>
      m.children.map((c) => ({ from: c, to: m, key: `r1-${i}-${c.seed}` }))
    ),
    ...geo.csf.flatMap((s, i) =>
      s.children.map((c, j) => ({ from: c, to: s, key: `csf-${i}-${j}` }))
    ),
    ...geo.csf.map((s, i) => ({ from: s, to: { angle: 0, r: 0 }, key: `f-${i}` })),
  ]

  return (
    <div className="rb-wheel">
      <h3 className="rb-conf-title">{CONFERENCES[conf]}</h3>
      <div className="rb" onMouseLeave={() => setHover(null)}>
        <svg className="rb-lines" viewBox="0 0 100 100" aria-hidden="true">
          {lines.map(({ from, to, key }) => {
            const a = polar(from.angle, from.r)
            const b = polar(to.angle, to.r)
            return <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          })}
          <circle cx={CENTER} cy={CENTER} r={RING.leaf} className="rb-ring" />
          <circle cx={CENTER} cy={CENTER} r={RING.R1} className="rb-ring" />
          <circle cx={CENTER} cy={CENTER} r={RING.CSF} className="rb-ring" />
        </svg>

        {/* Outer ring — the eight conference seeds */}
        {geo.leaves.map((leaf) => {
          const row = bySeed[leaf.seed]
          const abbr = row?.abbr
          return (
            <span key={`leaf-${leaf.seed}`} onMouseEnter={() => setHover(abbr)}>
              <Node
                pos={leaf}
                abbr={abbr}
                label={`${leaf.seed}`}
                size={30}
                className="rb-leaf"
                dim={hover && hover !== abbr}
                title={
                  row ? `${leaf.seed}. ${row.team.displayName} (${row.w}–${row.l})` : undefined
                }
                onClick={onPick}
              />
              <span
                className="rb-seed"
                style={{
                  left: `${polar(leaf.angle, RING.leaf + 7).x}%`,
                  top: `${polar(leaf.angle, RING.leaf + 7).y}%`,
                }}
              >
                {leaf.seed}
              </span>
            </span>
          )
        })}

        {/* First-round winners */}
        {geo.r1.map((pos, i) => {
          const w = data.r1[i]?.winner
          return (
            <span key={`r1-${i}`} onMouseEnter={() => w && setHover(w)}>
              <Node
                pos={pos}
                abbr={w}
                label="—"
                size={26}
                className="rb-r1"
                dim={hover && hover !== w}
                onClick={onPick}
              />
            </span>
          )
        })}

        {/* Conference-semifinal winners */}
        {geo.csf.map((pos, i) => {
          const w = data.csf[i]?.winner
          return (
            <span key={`csf-${i}`} onMouseEnter={() => w && setHover(w)}>
              <Node
                pos={pos}
                abbr={w}
                label="—"
                size={26}
                className="rb-csf"
                dim={hover && hover !== w}
                onClick={onPick}
              />
            </span>
          )
        })}

        {/* Centre — the conference champion */}
        <div className="rb-center">
          {data.champion ? (
            <>
              <TeamLogo abbr={data.champion} size={38} />
              <span className="rb-champ">{TEAM_BY_ABBR[data.champion]?.name}</span>
            </>
          ) : (
            <span className="rb-tbd">—</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function RadialBracket({ games, onPick }) {
  const bracket = useMemo(() => buildBracket(games), [games])
  const geo = useMemo(layout, [])

  const { conferences, champion, projected } = bracket

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Radial bracket</h2>
          <p className="sub">
            One wheel per conference — seeds on the outside, that conference&apos;s champion
            in the middle. Every round advances one ring inward; the two champions meet in
            the Finals.
          </p>
        </div>
      </div>

      {projected && (
        <p className="banner">
          <strong>Projected</strong> from the current standings — the postseason
          hasn&apos;t started.
        </p>
      )}

      <div className="rb-pair">
        <ConferenceWheel conf="E" data={conferences.E} seeds={bracket.seeds.E} geo={geo} onPick={onPick} />

        <div className="rb-final">
          <span className="rb-final-label">NBA Finals</span>
          {champion ? (
            <>
              <TeamLogo abbr={champion} size={44} />
              <span className="rb-champ">{TEAM_BY_ABBR[champion]?.name}</span>
            </>
          ) : (
            <span className="rb-trophy">🏆</span>
          )}
        </div>

        <ConferenceWheel conf="W" data={conferences.W} seeds={bracket.seeds.W} geo={geo} onPick={onPick} />
      </div>
    </section>
  )
}
