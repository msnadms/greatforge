import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { CURRENCY_META } from '../data/currencies'
import { conditionSlots } from '../data/spellForms'
import { useWorkshop } from '../state/useWorkshop'
import type { SlotReport } from '../lib/reaction'
import { RING_SLOT_COUNT } from '../types/worldbuilding'
import { ComponentSlot } from './ComponentSlot'

/**
 * Slot centres sit this far from the middle, in percent of the stage. Kept wide
 * enough that a filled slot card clears the corners of the spellbook in the hub.
 */
const RADIUS = 47

/** Flow arcs run along the inner engraved ring, inside the slot cards. */
const FLOW_RADIUS = RADIUS - 9

const DEGREES_PER_SLOT = 360 / RING_SLOT_COUNT

/**
 * The mouth: the seam between the last slot and the first, half a slot
 * anticlockwise of slot I. The current runs clockwise from slot I and slot VIII's
 * surplus crosses this one seam to leave, so the cut is where the working ends.
 *
 * Eight identical spokes say nothing about which slot is which, and a circle with
 * no cut in it reads as a walk with no end.
 */
const MOUTH_ANGLE = -90 - DEGREES_PER_SLOT / 2

/** The cut crosses all three engraved rings and carries on past the outermost. */
const MOUTH_INNER = FLOW_RADIUS - 4
const MOUTH_OUTER = RADIUS + 6

/**
 * The band the reagents' names are engraved along in view mode, outside the
 * outermost ring and clear of the tokens, which overhang the engraving.
 *
 * The tokens are a fixed 58px while the stage is fluid, so how far out they reach
 * in these units depends on how big the circle is drawn: wider on a small stage,
 * narrower on a large one. The band is set for the small end, which leaves it a
 * little airy on a wide desk and never lets a name run under a token.
 */
const NAME_RADIUS = 56

/** In stage units, like every other length here, not CSS pixels. */
const NAME_SIZE = 1.8

/** A name gets its slot's share of the rim, less a gap so neighbours never touch. */
const NAME_SPAN = DEGREES_PER_SLOT - 6

/** One dash plus one gap, matching `stroke-dasharray` on `.circle__flow`. */
const DASH_PERIOD = 3

/** Seconds `flow-drift` takes to travel one dash period. */
const DRIFT_SECONDS = 2.4

interface Point {
  x: number
  y: number
}

/** A point on the stage, by angle in degrees clockwise from due right. */
function radialPoint(degrees: number, radius: number): Point {
  const angle = degrees * (Math.PI / 180)
  return {
    x: 50 + radius * Math.cos(angle),
    y: 50 + radius * Math.sin(angle),
  }
}

/** Slot i, starting at the top and running clockwise. */
function slotPoint(index: number, radius = RADIUS): Point {
  return radialPoint(-90 + index * DEGREES_PER_SLOT, radius)
}

/**
 * The arc slot `index`'s name is set along, centred on the slot's own angle.
 *
 * A name on the lower half of the rim would hang upside down if it followed the
 * clockwise arc, so there the arc is drawn anticlockwise and the name reads
 * outward-up like the rest. Reversing the path also moves the baseline to the
 * other side of it, which would drop those names a line inward; the flipped arcs
 * take a radius one line larger to put the whole band back on one circle.
 */
function namePath(index: number): string {
  const centre = -90 + index * DEGREES_PER_SLOT
  // Normalised to (-180, 180], so "the lower half" is a plain comparison.
  const turned = (((centre % 360) + 540) % 360) - 180
  const flipped = turned > 0 && turned < 180

  const radius = flipped ? NAME_RADIUS + NAME_SIZE : NAME_RADIUS
  const half = flipped ? -NAME_SPAN / 2 : NAME_SPAN / 2
  const from = radialPoint(centre - half, radius)
  const to = radialPoint(centre + half, radius)
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 0 ${flipped ? 0 : 1} ${to.x} ${to.y}`
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
  const {
    draft,
    componentsById,
    placements,
    reaction,
    armedComponentId,
    placeComponent,
    clearSlot,
    mode,
  } = useWorkshop()

  const points = useMemo(
    () => Array.from({ length: RING_SLOT_COUNT }, (_, i) => slotPoint(i)),
    [],
  )

  /** The slots the spoken form's condition names, marked whether it holds or not. */
  const named = useMemo(
    () => conditionSlots(draft.form, placements),
    [draft.form, placements],
  )

  /**
   * How each slot resolved, keyed by slot. The card marks the starved ones and
   * explains them on hover, and both need more than the shortfall to do it: what
   * arrived, and whether the yield was cut or the caster billed.
   */
  const reports = useMemo(() => {
    const map = new Map<number, SlotReport>()
    for (const slot of reaction.slots) map.set(slot.slotIndex, slot)
    return map
  }, [reaction.slots])

  /**
   * A transfer whose ends coincide went the whole way round the ring, which has
   * no arc to draw; the numbers still show it in the panel.
   *
   * Each surviving arc also gets a `phase`: its place in the run of transfers
   * sharing the same pair of slots, as a fraction of one. Several currencies
   * routinely cross the same gap, and every arc is now drawn at one width along
   * the same radius, so their paths are identical to the pixel — without a phase
   * the last one painted would be the only one anyone ever sees. Offsetting each
   * by its share of the dash period interleaves the dashes instead, and the
   * crossing reads as a braid of everything in flight along it. All of them drift
   * at the same rate, so the offsets are constant and no two ever coincide.
   */
  /**
   * The names to engrave on the rim: every slot that has something standing in
   * it, in view mode only. In edit mode the card carries its own name.
   */
  const rimNames = useMemo(() => {
    if (mode !== 'view') return []
    return draft.slots.flatMap((id, index) => {
      const component = (id && componentsById.get(id)) || null
      return component ? [{ index, name: component.name }] : []
    })
  }, [mode, draft.slots, componentsById])

  const flows = useMemo(() => {
    const drawn = reaction.transfers.filter((transfer) => transfer.from !== transfer.to)
    const pairKey = (transfer: { from: number; to: number }) => `${transfer.from}-${transfer.to}`

    const counts = new Map<string, number>()
    for (const transfer of drawn) counts.set(pairKey(transfer), (counts.get(pairKey(transfer)) ?? 0) + 1)

    const seen = new Map<string, number>()
    return drawn.map((transfer) => {
      const key = pairKey(transfer)
      const index = seen.get(key) ?? 0
      seen.set(key, index + 1)
      return { ...transfer, phase: index / (counts.get(key) ?? 1) }
    })
  }, [reaction.transfers])

  return (
    <div className={`circle${mode === 'view' ? ' circle--view' : ''}`}>
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

        <line
          className="circle__mouth"
          x1={radialPoint(MOUTH_ANGLE, MOUTH_INNER).x}
          y1={radialPoint(MOUTH_ANGLE, MOUTH_INNER).y}
          x2={radialPoint(MOUTH_ANGLE, MOUTH_OUTER).x}
          y2={radialPoint(MOUTH_ANGLE, MOUTH_OUTER).y}
        />

        {/*
          The rim inscription. The whole engraving is `aria-hidden`, which is what
          keeps this from reading every name twice: each token already carries its
          reagent's name in its own `aria-label`.
        */}
        {rimNames.length > 0 && (
          <>
            <defs>
              {rimNames.map(({ index }) => (
                <path key={index} id={`slot-name-${index}`} d={namePath(index)} />
              ))}
            </defs>
            {rimNames.map(({ index, name }) => (
              <text key={index} className="circle__name">
                <textPath href={`#slot-name-${index}`} startOffset="50%">
                  {name}
                </textPath>
              </text>
            ))}
          </>
        )}

        {flows.map((flow) => (
          <path
            key={`flow-${flow.from}-${flow.to}-${flow.currency}`}
            className="circle__flow"
            d={flowPath(flow.from, flow.to)}
            style={
              {
                '--flow-hue': CURRENCY_META[flow.currency].hue,
                '--flow-phase': flow.phase * DASH_PERIOD,
                // Negative delay starts the drift already that far along, which
                // phases the dashes without changing how fast any arc travels.
                animationDelay: `${-flow.phase * DRIFT_SECONDS}s`,
              } as CSSProperties
            }
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
            report={reports.get(index) ?? null}
            named={named.has(index)}
            readOnly={mode === 'view'}
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
