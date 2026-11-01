import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import type { Automaton } from '../algorithms/automata'

type Props = {
  automaton: Automaton
  activeStates?: string[]
  compact?: boolean
}

type Point = { x: number; y: number; level: number; order: number }

function buildLayout(automaton: Automaton, compact: boolean) {
  const levels = new Map<string, number>([[automaton.start, 0]])
  const queue = [automaton.start]

  while (queue.length) {
    const current = queue.shift()!
    const nextLevel = levels.get(current)! + 1
    automaton.transitions
      .filter((transition) => transition.from === current && transition.to !== current)
      .forEach((transition) => {
        if (!levels.has(transition.to)) {
          levels.set(transition.to, nextLevel)
          queue.push(transition.to)
        }
      })
  }

  automaton.states.forEach((state) => {
    if (!levels.has(state)) levels.set(state, 0)
  })

  const maxLevel = Math.max(...levels.values(), 0)
  const columns = Array.from({ length: maxLevel + 1 }, () => [] as string[])
  automaton.states.forEach((state) => columns[levels.get(state)!].push(state))

  // A small barycentric pass keeps connected states near one another and reduces crossings.
  for (let level = 1; level < columns.length; level++) {
    const priorOrder = new Map(columns[level - 1].map((state, index) => [state, index]))
    columns[level].sort((left, right) => {
      const score = (state: string) => {
        const parents = automaton.transitions
          .filter((transition) => transition.to === state)
          .map((transition) => priorOrder.get(transition.from))
          .filter((value): value is number => value !== undefined)
        return parents.length ? parents.reduce((sum, value) => sum + value, 0) / parents.length : Number.MAX_VALUE
      }
      return score(left) - score(right)
    })
  }

  const maxRows = Math.max(...columns.map((column) => column.length), 1)
  const horizontalGap = compact ? 145 : 165
  const width = Math.max(compact ? 660 : 760, 190 + maxLevel * horizontalGap)
  const height = Math.max(compact ? 350 : 410, 160 + (maxRows - 1) * 104)
  const positions: Record<string, Point> = {}

  columns.forEach((column, level) => {
    column.forEach((state, order) => {
      const x = maxLevel === 0 ? width / 2 : 95 + (level * (width - 190)) / maxLevel
      const usableHeight = height - 160
      const y = column.length === 1 ? height / 2 : 80 + (order * usableHeight) / (column.length - 1)
      positions[state] = { x, y, level, order }
    })
  })

  return { positions, width, height }
}

export default function AutomataDiagram({ automaton, activeStates = [], compact = false }: Props) {
  const markerId = `arrow-${useId().replaceAll(':', '')}`
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [selected, setSelected] = useState<string | null>(null)
  const layout = useMemo(() => buildLayout(automaton, compact), [automaton, compact])
  const edges = useMemo(() => {
    const grouped = new Map<string, { from: string; to: string; symbols: string[] }>()
    automaton.transitions.forEach((transition) => {
      const key = `${transition.from}\u0000${transition.to}`
      const current = grouped.get(key) ?? { from: transition.from, to: transition.to, symbols: [] }
      if (!current.symbols.includes(transition.symbol)) current.symbols.push(transition.symbol)
      grouped.set(key, current)
    })
    return [...grouped.values()]
  }, [automaton.transitions])

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setSelected(null)
  }, [automaton])

  const fit = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }
  const changeZoom = (next: number) => setZoom(Math.min(2.5, Math.max(0.75, next)))
  const viewportWidth = layout.width / zoom
  const viewportHeight = layout.height / zoom
  const viewX = (layout.width - viewportWidth) / 2 + pan.x
  const viewY = (layout.height - viewportHeight) / 2 + pan.y

  const startPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    dragRef.current = { clientX: event.clientX, clientY: event.clientY, x: pan.x, y: pan.y }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.classList.add('is-panning')
  }
  const movePan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragRef.current || !svgRef.current) return
    const bounds = svgRef.current.getBoundingClientRect()
    setPan({
      x: dragRef.current.x - ((event.clientX - dragRef.current.clientX) / bounds.width) * viewportWidth,
      y: dragRef.current.y - ((event.clientY - dragRef.current.clientY) / bounds.height) * viewportHeight,
    })
  }
  const endPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = null
    event.currentTarget.classList.remove('is-panning')
  }
  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    changeZoom(zoom + (event.deltaY < 0 ? 0.12 : -0.12))
  }

  return (
    <div className={`diagram-shell ${compact ? 'compact' : ''}`}>
      <div className="diagram-tools" aria-label="Diagram viewport controls">
        <button aria-label="Zoom out" onClick={() => changeZoom(zoom - 0.2)}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button aria-label="Zoom in" onClick={() => changeZoom(zoom + 0.2)}>+</button>
        <button className="fit-control" onClick={fit}>Fit</button>
      </div>
      <div className="diagram-stage">
        <svg
          ref={svgRef}
          className="automata-svg"
          viewBox={`${viewX} ${viewY} ${viewportWidth} ${viewportHeight}`}
          preserveAspectRatio="xMidYMid meet"
          aria-label="Interactive automata diagram. Drag to pan and use the controls to zoom."
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onWheel={handleWheel}
        >
          <defs>
            <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L8,4 L0,8 Z" className="arrow-head" />
            </marker>
          </defs>
          {edges.map((edge, index) => {
            const from = layout.positions[edge.from]
            const to = layout.positions[edge.to]
            if (!from || !to) return null
            const label = edge.symbols.join(', ')
            let path = ''
            let labelX = 0
            let labelY = 0

            if (edge.from === edge.to) {
              const loopTop = Math.max(22, from.y - 68)
              path = `M ${from.x - 18} ${from.y - 23} C ${from.x - 50} ${loopTop}, ${from.x + 50} ${loopTop}, ${from.x + 18} ${from.y - 23}`
              labelX = from.x
              labelY = loopTop - 5
            } else if (to.level < from.level) {
              const useTop = index % 2 === 0
              const laneY = useTop ? 34 + (index % 3) * 13 : layout.height - 34 - (index % 3) * 13
              const direction = to.x < from.x ? -1 : 1
              const startX = from.x + direction * 29
              const endX = to.x - direction * 34
              path = `M ${startX} ${from.y} C ${startX + direction * 42} ${laneY}, ${endX - direction * 42} ${laneY}, ${endX} ${to.y}`
              labelX = (startX + endX) / 2
              labelY = laneY + (useTop ? -7 : 15)
            } else if (to.level === from.level) {
              const sideX = Math.max(from.x, to.x) + 58
              path = `M ${from.x + 24} ${from.y} C ${sideX} ${from.y}, ${sideX} ${to.y}, ${to.x + 24} ${to.y}`
              labelX = sideX + 7
              labelY = (from.y + to.y) / 2
            } else {
              const dx = to.x - from.x
              const dy = to.y - from.y
              const distance = Math.max(Math.hypot(dx, dy), 1)
              const startX = from.x + (dx / distance) * 30
              const startY = from.y + (dy / distance) * 30
              const endX = to.x - (dx / distance) * 35
              const endY = to.y - (dy / distance) * 35
              const midX = (startX + endX) / 2
              const offset = ((index % 3) - 1) * 13
              path = `M ${startX} ${startY} C ${midX} ${startY + offset}, ${midX} ${endY + offset}, ${endX} ${endY}`
              labelX = midX
              labelY = (startY + endY) / 2 + offset - 8
            }

            return (
              <g key={`${edge.from}-${edge.to}`}>
                <path d={path} className="edge" markerEnd={`url(#${markerId})`} />
                <text x={labelX} y={labelY} className="edge-label">{label}</text>
              </g>
            )
          })}
          {layout.positions[automaton.start] && (
            <>
              <path
                d={`M ${layout.positions[automaton.start].x - 78} ${layout.positions[automaton.start].y} L ${layout.positions[automaton.start].x - 35} ${layout.positions[automaton.start].y}`}
                className="start-edge"
                markerEnd={`url(#${markerId})`}
              />
              <text x={layout.positions[automaton.start].x - 78} y={layout.positions[automaton.start].y - 9} className="start-label">START</text>
            </>
          )}
          {automaton.states.map((state) => {
            const point = layout.positions[state]
            const accepting = automaton.accepts.includes(state)
            const active = activeStates.includes(state)
            const subset = automaton.subsets?.[state]
            const subsetLabel = subset ? (subset.length > 4 ? `{${subset.slice(0, 3).join(',')},…}` : `{${subset.join(',')}}`) : ''
            return (
              <g
                key={state}
                className={`state-node ${active ? 'active' : ''} ${selected === state ? 'selected' : ''}`}
                onClick={(event) => {
                  event.stopPropagation()
                  setSelected(selected === state ? null : state)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setSelected(selected === state ? null : state)
                }}
                role="button"
                tabIndex={0}
                aria-label={`${state}${accepting ? ', accepting state' : ''}${subset ? `, contains ${subset.join(', ') || 'no NFA states'}` : ''}`}
              >
                <circle cx={point.x} cy={point.y} r="29" />
                {accepting && <circle cx={point.x} cy={point.y} r="23" className="accept-ring" />}
                <text x={point.x} y={point.y + 4} className="state-label">{state}</text>
                {subset && <text x={point.x} y={point.y + 45} className="subset-label">{subset.length ? subsetLabel : '∅'}</text>}
              </g>
            )
          })}
        </svg>
      </div>
      <div className="diagram-legend">
        <div className="legend-items"><span><i className="dot normal" /> State</span><span><i className="dot final" /> Accepting</span><span><i className="line" /> Transition</span><span className="pan-hint">Drag to pan · Scroll to zoom</span></div>
        {selected && <strong>{selected}{automaton.subsets?.[selected] ? ` = {${automaton.subsets[selected].join(', ') || '∅'}}` : ''}</strong>}
      </div>
    </div>
  )
}
