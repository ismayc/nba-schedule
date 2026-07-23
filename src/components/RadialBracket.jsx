import { Fragment, useMemo, useState } from 'react'
import { buildBracket, layout, polar, CENTER, RING } from '../utils/bracket.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

function Node({ pos, abbr, label, size, className = '', title, onClick, dim, onHover }) {
  const { x, y } = polar(pos.angle, pos.r)
  const team = TEAM_BY_ABBR[abbr]
  const { isFollowed } = useFollow()

  return (
    <button
      className={`rb-node ${className} ${dim ? 'is-dim' : ''} ${team ? '' : 'is-empty'} ${
        isFollowed(abbr) ? 'followed' : ''
      }`}
      style={{ left: `${x}%`, top: `${y}%` }}
      onMouseEnter={() => onHover?.(abbr)}
      onClick={() => team && onClick?.(abbr)}
      title={title || team?.displayName || label}
      aria-label={title || team?.displayName || label}
    >
      {team ? <TeamLogo abbr={abbr} size={size} /> : <span className="rb-tbd">{label}</span>}
    </button>
  )
}

// One side of the wheel: the eight seeds on the outer ring, advancing inward through the
// two playoff rounds to the conference champion just off centre.
function Side({ geo, data, seeds, hover, setHover, onPick }) {
  const bySeed = Object.fromEntries(seeds.map((r) => [r.seed, r]))
  return (
    <>
      {geo.leaves.map((leaf) => {
        const row = bySeed[leaf.seed]
        const seedPos = polar(leaf.angle, RING.leaf + 6)
        return (
          <Fragment key={`leaf-${geo.side}-${leaf.seed}`}>
            <Node
              pos={leaf}
              abbr={row?.abbr}
              label={`${leaf.seed}`}
              size={28}
              className="rb-leaf"
              dim={hover && hover !== row?.abbr}
              /* v8 ignore next -- every conference always seeds a full top-8 (computeStandings initialises all teams, slice(0,8) fills seeds 1–8), so bySeed[leaf.seed] always resolves a row; the `: undefined` branch is unreachable */
              title={row ? `${leaf.seed}. ${row.team.displayName} (${row.w}–${row.l})` : undefined}
              onClick={onPick}
              onHover={setHover}
            />
            <span className="rb-seed" style={{ left: `${seedPos.x}%`, top: `${seedPos.y}%` }}>
              {leaf.seed}
            </span>
          </Fragment>
        )
      })}

      {geo.r1.map((pos, i) => {
        const w = data.r1[i]?.winner
        return (
          <Node
            key={`r1-${geo.side}-${i}`}
            pos={pos}
            abbr={w}
            label="—"
            size={24}
            className="rb-r1"
            dim={hover && hover !== w}
            onClick={onPick}
            onHover={(a) => a && setHover(a)}
          />
        )
      })}

      {geo.csf.map((pos, i) => {
        const w = data.csf[i]?.winner
        return (
          <Node
            key={`csf-${geo.side}-${i}`}
            pos={pos}
            abbr={w}
            label="—"
            size={24}
            className="rb-csf"
            dim={hover && hover !== w}
            onClick={onPick}
            onHover={(a) => a && setHover(a)}
          />
        )
      })}

      {/* Conference champion, just off centre on this side. */}
      <Node
        pos={geo.cf}
        abbr={data.champion}
        label="—"
        size={26}
        className="rb-cf"
        dim={hover && hover !== data.champion}
        onClick={onPick}
        onHover={(a) => a && setHover(a)}
      />
    </>
  )
}

export default function RadialBracket({ games, onPick }) {
  const bracket = useMemo(() => buildBracket(games), [games])
  const geo = useMemo(layout, [])
  const [hover, setHover] = useState(null)

  const { conferences, champion, projected, seeds } = bracket

  // West on the left, East on the right.
  const sides = [
    { key: 'W', geo: geo.W, data: conferences.W, seeds: seeds.W },
    { key: 'E', geo: geo.E, data: conferences.E, seeds: seeds.E },
  ]

  // Every parent→child spoke, both sides, plus each conference final into the centre.
  const lines = sides.flatMap(({ key, geo: g }) => [
    ...g.r1.flatMap((m, i) => m.children.map((c) => ({ from: c, to: m, key: `${key}-r1-${i}-${c.seed}` }))),
    ...g.csf.flatMap((s, i) => s.children.map((c, j) => ({ from: c, to: s, key: `${key}-csf-${i}-${j}` }))),
    ...g.cf.children.map((s, i) => ({ from: s, to: g.cf, key: `${key}-cf-${i}` })),
    { from: g.cf, to: geo.finals, key: `${key}-fin` },
  ])

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Radial bracket</h2>
          <p className="sub">
            The whole bracket in one wheel — <strong>West on the left, East on the right</strong>,
            seeds on the outside advancing inward. Each conference&apos;s champion sits beside the
            centre, where the two meet in the Finals.
          </p>
        </div>
      </div>

      {projected && (
        <p className="banner">
          <strong>Projected</strong> from the current standings — the postseason
          hasn&apos;t started.
        </p>
      )}

      <div className="rb rb-whole" onMouseLeave={() => setHover(null)}>
        <svg className="rb-lines" viewBox="0 0 100 100" aria-hidden="true">
          {lines.map(({ from, to, key }) => {
            const a = polar(from.angle, from.r)
            const b = polar(to.angle, to.r)
            return <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          })}
          <circle cx={CENTER} cy={CENTER} r={RING.leaf} className="rb-ring" />
          <circle cx={CENTER} cy={CENTER} r={RING.r1} className="rb-ring" />
          <circle cx={CENTER} cy={CENTER} r={RING.csf} className="rb-ring" />
        </svg>

        <span className="rb-side-label rb-side-w">West</span>
        <span className="rb-side-label rb-side-e">East</span>

        {sides.map((s) => (
          <Side
            key={s.key}
            geo={s.geo}
            data={s.data}
            seeds={s.seeds}
            hover={hover}
            setHover={setHover}
            onPick={onPick}
          />
        ))}

        {/* Centre — the champion (NBA Finals winner) */}
        <div className="rb-center">
          {champion ? (
            <>
              <TeamLogo abbr={champion} size={40} />
              <span className="rb-champ">{TEAM_BY_ABBR[champion]?.name}</span>
            </>
          ) : (
            <span className="rb-trophy">🏆</span>
          )}
        </div>
      </div>
    </section>
  )
}
