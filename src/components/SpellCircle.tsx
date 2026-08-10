import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { CURRENCY_META } from '../data/currencies'
import { useWorkshop } from '../state/useWorkshop'
import { RING_SLOT_COUNT, type Ledger } from '../types/worldbuilding'
import { ComponentSlot } from './ComponentSlot'

/**
 * Slot centres sit this far from the middle, in percent of the stage. Kept wide
 * enough that a filled slot card clears the corners of the spellbook in the hub.
 */
const RADIUS = 47

/** Flow arcs run along the inner engraved ring, inside the slot cards. */
const FLOW_RADIUS = RADIUS - 9

const DEGREES_PER_SLOT = 360 / RING_SLOT_COUNT

interface Point {
  x: number
  y: number
}

/** Slot i, starting at the top and running clockwise. */
function slotPoint(index: number, radius = RADIUS): Point {
  const angle = (-90 + index * DEGREES_PER_SLOT) * (Math.PI / 180)
  return {
    x: 50 + radius * Math.cos(angle),
    y: 50 + radius * Math.sin(angle),
  }
}

/**
 * A clockwise arc from one slot to another along the flow ring. The current only
 * ever runs clockwise, so the sweep flag is fixed; the long way round is taken
 * whenever the span passes a half turn.
 */
function flowPath(from: number, to: number): string {
  const start = slotPoint(from, FLOW_RADIUS)
  const end = slotPoint(to, FLOW_RADIUS)
  const spanSlots = (to - from + RING_SLOT_COUNT) % RING_SLOT_COUNT
  const largeArc = spanSlots * DEGREES_PER_SLOT > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${FLOW_RADIUS} ${FLOW_RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

export function SpellCircle({ children }: { children: ReactNode }) {
  const { draft, componentsById, reaction, armedComponentId, placeComponent, clearSlot } =
    useWorkshop()

  const points = useMemo(
    () => Array.from({ length: RING_SLOT_COUNT }, (_, i) => slotPoint(i)),
    [],
  )

  /** Unmet demand per slot, for marking the slots the caster is paying for. */
  const shortfalls = useMemo(() => {
    const map = new Map<number, Ledger>()
    for (const slot of reaction.slots) map.set(slot.slotIndex, slot.shortfall)
    return map
  }, [reaction.slots])

  /**
   * A transfer whose ends coincide went the whole way round the ring, which has
   * no arc to draw; the numbers still show it in the panel.
   */
  const flows = useMemo(
    () => reaction.transfers.filter((transfer) => transfer.from !== transfer.to),
    [reaction.transfers],
  )

  return (
    <div className="circle">
      <svg className="circle__engraving" viewBox="0 0 100 100" role="presentation" aria-hidden="true">
        <circle className="circle__ring" cx="50" cy="50" r={RADIUS} />
        <circle className="circle__ring circle__ring--outer" cx="50" cy="50" r={RADIUS + 4} />
        <circle className="circle__ring circle__ring--inner" cx="50" cy="50" r={FLOW_RADIUS} />

        {points.map((point, index) => (
          <line
            key={`spoke-${index}`}
            className="circle__spoke"
            x1="50"
            y1="50"
            x2={point.x}
            y2={point.y}
          />
        ))}

        {flows.map((flow) => (
          <path
            key={`flow-${flow.from}-${flow.to}-${flow.currency}`}
            className="circle__flow"
            d={flowPath(flow.from, flow.to)}
            stroke={`hsl(${CURRENCY_META[flow.currency].hue} 70% 55%)`}
            strokeWidth={0.25 + Math.min(flow.amount, 9) * 0.12}
          >
            <title>{`${CURRENCY_META[flow.currency].label} ${flow.amount}`}</title>
          </path>
        ))}
      </svg>

      {points.map((point, index) => {
        const id = draft.slots[index]
        const style: CSSProperties = {
          left: `${point.x}%`,
          top: `${point.y}%`,
        }
        return (
          <ComponentSlot
            key={index}
            index={index}
            component={(id && componentsById.get(id)) || null}
            armedComponentId={armedComponentId}
            shortfall={shortfalls.get(index) ?? {}}
            style={style}
            onPlace={placeComponent}
            onClear={clearSlot}
          />
        )
      })}

      <div className="circle__hub">{children}</div>
    </div>
  )
}
