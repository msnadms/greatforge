import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { conditionSlots } from '../data/spellForms'
import { useWorkshop } from '../state/useWorkshop'
import { DEGREES_PER_SLOT, radialPoint, slotPoint, type FlowGeometry } from '../lib/circleFlow'
import type { SlotReport } from '../lib/reaction'
import { RING_SLOT_COUNT } from '../types/worldbuilding'
import { buildJet } from '../lib/fire'
import { CircleFire } from './CircleFire'
import { CircleFlow } from './CircleFlow'
import { ComponentSlot } from './ComponentSlot'

/** Slot centres sit this far from the middle, in percent of the stage. */
const RADIUS = 47

/** Flow arcs run along the inner engraved ring, inside the slot cards. */
const FLOW_RADIUS = RADIUS - 9

/**
 * The mouth: the seam between the last slot and the first, half a slot
 * anticlockwise of slot I, where the ring's surplus crosses to leave.
 */
const MOUTH_ANGLE = -90 - DEGREES_PER_SLOT / 2

/** The cut crosses all three engraved rings and carries on past the outermost. */
const MOUTH_INNER = FLOW_RADIUS - 4
const MOUTH_OUTER = RADIUS + 6

/**
 * The band reagent names are engraved along in view mode, outside the outermost
 * ring. Tokens are a fixed 58px while the stage is fluid, so how far out they
 * reach in these stage units varies with stage size; tuned for the small end so
 * a name never runs under a token, at the cost of looking airy on a wide desk.
 */
const NAME_RADIUS = 56

/** In stage units, like every other length here, not CSS pixels. */
const NAME_SIZE = 1.8

/** A name gets its slot's share of the rim, less a gap so neighbours never touch. */
const NAME_SPAN = DEGREES_PER_SLOT - 6

/**
 * The bench's current, at desk scale. Exit lines start on the flow ring, the
 * same radius the current is drawn at, so a line reads as that current carrying
 * on rather than a mark in the margin; the shortest of them still clears every
 * ring between there and the rim with room to spare.
 */
const BENCH_FLOW: FlowGeometry = {
  flowRadius: FLOW_RADIUS,
  idPrefix: 'bench',
  manifest: { min: 22, max: 62, scale: 3.2, fanStep: 20 },
}

/**
 * The arc slot `index`'s name is set along, centred on the slot's own angle.
 *
 * A name on the lower half of the rim hangs upside down if it follows the
 * clockwise arc, so there the arc is drawn anticlockwise instead. Reversing
 * the path also flips the baseline to the other side, so those arcs use a
 * radius one line larger to keep the whole band on one circle.
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
    lastCast,
    playMode,
    draftIsInscribed,
  } = useWorkshop()

  const points = useMemo(
    () => Array.from({ length: RING_SLOT_COUNT }, (_, i) => slotPoint(i, RADIUS)),
    [],
  )

  /** The slots the spoken form's condition names, marked whether it holds or not. */
  const named = useMemo(
    () => conditionSlots(draft.form, placements, draft.specialty),
    [draft.form, draft.specialty, placements],
  )

  /** How each slot resolved, keyed by slot. */
  const reports = useMemo(() => {
    const map = new Map<number, SlotReport>()
    for (const slot of reaction.slots) map.set(slot.slotIndex, slot)
    return map
  }, [reaction.slots])

  /**
   * What the last casting burns, built from the resolution the casting itself
   * ran rather than from the bench's live preview. Null until a rite is spoken,
   * and on a ring with nothing in it to burn.
   */
  const firing = useMemo(() => {
    if (!lastCast) return null
    const jet = buildJet(lastCast.reaction, BENCH_FLOW)
    return jet ? { nonce: lastCast.nonce, jet } : null
  }, [lastCast])

  /** The names to engrave on the rim, view mode only — in edit mode the card
   * carries its own name. */
  const rimNames = useMemo(() => {
    if (mode !== 'view') return []
    return draft.slots.flatMap((id, index) => {
      const component = (id && componentsById.get(id)) || null
      return component ? [{ index, name: component.name }] : []
    })
  }, [mode, draft.slots, componentsById])

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

        {/* The whole engraving is `aria-hidden` — each token already carries its
            reagent's name in its own `aria-label`, so this doesn't double up. */}
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

        <CircleFlow
          block="circle"
          geometry={BENCH_FLOW}
          carrying={reaction.carrying}
          first={reports.get(0) ?? null}
          manifestation={reaction.manifestation}
          titles
        />
      </svg>

      {/* Its canvas is the whole viewport rather than this square, so the gouts
          can run off the desk: it lies over the reagents and the rails alike,
          and under the dialog scrim. Still rendered here because the 100-unit
          box is laid over this element (`fitStage` reads its parent's rect).
          `armed` is the same test `CastButton` renders itself on, so the
          renderer is built while the caster is reading the page rather than
          after they press. */}
      <CircleFire firing={firing} armed={playMode === 'player' && draftIsInscribed} />

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
            kept={reaction.keptSlots.includes(index)}
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
