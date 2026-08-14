import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { CURRENCY_META, currencyHue } from '../data/currencies'
import { conditionSlots } from '../data/spellForms'
import { useWorkshop } from '../state/useWorkshop'
import type { SlotReport } from '../lib/reaction'
import { RING_SLOT_COUNT, ledgerEntries, ledgerTotal, type Currency, type Ledger } from '../types/worldbuilding'
import { ComponentSlot } from './ComponentSlot'

/** Slot centres sit this far from the middle, in percent of the stage. */
const RADIUS = 47

/** Flow arcs run along the inner engraved ring, inside the slot cards. */
const FLOW_RADIUS = RADIUS - 9

const DEGREES_PER_SLOT = 360 / RING_SLOT_COUNT

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

/** Exit lines start on the flow ring, the same radius the current is drawn at,
 * so a line reads as that current carrying on rather than a mark in the margin. */
const MANIFEST_INNER = FLOW_RADIUS

/** Shortest/longest an exit line is drawn, in stage units. The minimum clears
 * every ring between the flow radius and the rim with room to spare. */
const MANIFEST_MIN_LENGTH = 22
const MANIFEST_MAX_LENGTH = 62

/** Stage units of length per unit of currency manifested. */
const MANIFEST_LENGTH_SCALE = 3.2

/** Degrees between neighbouring exit lines' headings, so several currencies fan out from their shared origin rather than riding one another. */
const MANIFEST_FAN_STEP = 20

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

/** A single reagent's stroke colour on the flow ring, drawn from its own hue. */
function flowBandColor(hue: number): string {
  return `hsl(${hue} var(--gem-s-strong) 55%)`
}

/** Turns a list of hues into gradient stops, evenly spaced along the arc. */
function flowStops(hues: number[]): { offset: string; color: string }[] {
  const last = hues.length - 1
  return hues.map((hue, i) => ({ offset: `${(i / last) * 100}%`, color: flowBandColor(hue) }))
}

/** The currency holding the largest amount in a ledger, or null if it holds nothing. */
function dominantCurrency(ledger: Ledger): Currency | null {
  let best: Currency | null = null
  let bestAmount = 0
  for (const [currency, amount] of ledgerEntries(ledger)) {
    if (amount > bestAmount) {
      best = currency
      bestAmount = amount
    }
  }
  return best
}

/**
 * The currency slot `index`'s outgoing current is mostly made of — index 7 is
 * what leaves slot VIII for the mouth. Null where nothing is in flight there.
 */
function carryingHue(carrying: Ledger[], index: number): number | null {
  const currency = dominantCurrency(carrying[index] ?? {})
  return currency ? currencyHue(currency) : null
}

/**
 * One hue per slot from `from` to `to` inclusive. A slot holding nothing of
 * its own carries the last known hue forward rather than breaking the
 * gradient — by construction that can only be the arc's own endpoint.
 */
function carryingHues(carrying: Ledger[], from: number, to: number): number[] {
  const hues: number[] = []
  let last = 0
  for (let index = from; index <= to; index++) {
    const hue = carryingHue(carrying, index)
    if (hue !== null) last = hue
    hues.push(hue ?? last)
  }
  return hues
}

/**
 * The geometry of a clockwise arc from one slot to another along the flow
 * ring. `to` may run past slot VIII (index 7) — index 8 is slot I one lap
 * further round, which lets the closing arc describe the crossing over the
 * mouth instead of a zero-length loop.
 */
function arcPath(from: number, to: number, radius: number): { path: string; start: Point; end: Point } {
  const start = slotPoint(from, radius)
  const end = slotPoint(to, radius)
  const spanSlots = to - from
  const largeArc = spanSlots * DEGREES_PER_SLOT > 180 ? 1 : 0
  return { path: `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`, start, end }
}

/**
 * The gradient runs once from whatever is leaving the arc's start slot to
 * whatever is leaving its end slot, so a stretch thick with heat giving way
 * to one thick with motion reads left to right as one colour fading to the other.
 */
interface FlowArc {
  key: string
  path: string
  gradientId: string
  x1: number
  y1: number
  x2: number
  y2: number
  stops: { offset: string; color: string }[]
  title: string
}

function buildFlowArc(from: number, to: number, carrying: Ledger[]): FlowArc {
  const { path, start, end } = arcPath(from, to, FLOW_RADIUS)
  const stops = flowStops(carryingHues(carrying, from, to))
  const title = ledgerEntries(carrying[from] ?? {})
    .map(([currency, amount]) => `${CURRENCY_META[currency].label} ${amount}`)
    .join(', ')

  return {
    key: `${from}-${to}`,
    path,
    gradientId: `flow-grad-${from}-${to}`,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    stops,
    title,
  }
}

/**
 * The closing lap: whatever is still leaving slot VIII crosses the mouth into
 * slot I before any of it manifests (`repay`, in the resolver).
 *
 * **Drawn only where a reagent stands at slot I**, with anything still leaving
 * slot VIII to reach it. It used to be drawn only where the crossing actually
 * repaid slot I, which is a narrower test than occupancy and missed the
 * commonest shape there is: a source at slot I demands nothing, so it is never
 * repaid, and the ring visibly failed to close on a reagent plainly standing
 * in it. Occupancy is the right question. A source is arrived at like anything
 * else, and the line carries on into the run leaving slot I.
 *
 * An empty slot I gets no arc, because there is nothing there to arrive at.
 * Two other endings were tried and are worse: running it to the slot draws a
 * line into an empty socket that stops dead in it, and stopping it half a slot
 * short at the mouth ends the line at a point nothing marks as a destination.
 * What leaves an open ring is already drawn — the manifestation fan, which
 * departs from slot VIII along this same radius.
 *
 * It ends on whatever is leaving slot I, the same rule every other arc's end
 * follows, so the colour carries through the junction into the run that
 * starts there. Ending it on what slot I *took* instead put a hard edge at
 * that one point — the mouth arc arrived in the colour of the demand it paid
 * (mass) while the run leaving slot I began in the colour of the yield it
 * released (heat), and slot I is the only junction where the two sides were
 * read off different quantities. Where nothing leaves slot I the current
 * ends there, so the arc closes on what changed hands, or failing that on
 * the colour it arrived in.
 */
function buildMouthArc(carrying: Ledger[], first: SlotReport | null): FlowArc | null {
  if (!first) return null
  const mouth = RING_SLOT_COUNT - 1
  const startHue = carryingHue(carrying, mouth)
  if (startHue === null) return null
  const leavingFirst = carryingHue(carrying, 0)
  const received = dominantCurrency(first.received)
  const endHue = leavingFirst ?? (received ? currencyHue(received) : startHue)

  const { path, start, end } = arcPath(mouth, RING_SLOT_COUNT, FLOW_RADIUS)
  // What crosses, as on every other arc, rather than what slot I took out of
  // it: the slot's own card already states what it received.
  const title = ledgerEntries(carrying[mouth] ?? {})
    .map(([currency, amount]) => `${CURRENCY_META[currency].label} ${amount}`)
    .join(', ')

  return {
    key: `${mouth}-${RING_SLOT_COUNT}`,
    path,
    gradientId: `flow-grad-${mouth}-${RING_SLOT_COUNT}`,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    stops: flowStops([startHue, endHue]),
    title,
  }
}

/**
 * Every contiguous stretch of the ring still carrying something, each as one
 * arc from the slot it starts at to the slot it dies out at (or slot VIII, if
 * it runs all the way to the mouth). More than one stretch is possible: current
 * spent in full at a sink, or bled to nothing crossing a hole, does not revive
 * at the next source further round, so the line breaks there. The closing lap
 * (`buildMouthArc`) is always its own arc, never part of one of these runs.
 */
function buildFlowArcs(carrying: Ledger[], first: SlotReport | null): FlowArc[] {
  const arcs: FlowArc[] = []
  let start: number | null = null
  for (let segment = 0; segment < RING_SLOT_COUNT - 1; segment++) {
    const flowing = ledgerTotal(carrying[segment] ?? {}) > 0
    if (flowing && start === null) start = segment
    if (!flowing && start !== null) {
      arcs.push(buildFlowArc(start, segment, carrying))
      start = null
    }
  }
  if (start !== null) arcs.push(buildFlowArc(start, RING_SLOT_COUNT - 1, carrying))

  const mouthArc = buildMouthArc(carrying, first)
  if (mouthArc) arcs.push(mouthArc)

  return arcs
}

interface ManifestLine {
  currency: Currency
  amount: number
  path: string
  gradientId: string
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

/**
 * Slot VIII's own angle, not the mouth's — the mouth sits between two slots
 * and nothing is ever drawn reaching it, which left exit lines looking cut
 * short of the flow they were meant to continue.
 */
const MANIFEST_ANGLE = -90 + (RING_SLOT_COUNT - 1) * DEGREES_PER_SLOT

/** The one shared point every manifesting currency's line starts from, on the
 * flow ring directly under slot VIII. */
const MANIFEST_ORIGIN = radialPoint(MANIFEST_ANGLE, MANIFEST_INNER)

/**
 * Direction the current is travelling the instant it reaches
 * `MANIFEST_ORIGIN` — tangent to the ring, not radial. Every exit line
 * departs on this heading before bending toward its own; departing radially
 * instead met the tangential current at a right angle and read as a hard corner.
 */
const MANIFEST_TANGENT = (() => {
  const rad = (MANIFEST_ANGLE * Math.PI) / 180
  return { x: -Math.sin(rad), y: Math.cos(rad) }
})()

/**
 * Rotates the fan clockwise off slot VIII's own radial line, which is where
 * its engraved name runs in view mode (`namePath`). Without this the middle
 * of the fan drew straight out over the title.
 */
const MANIFEST_HEADING_BIAS = 30

/**
 * A curved line for one currency's manifestation, running out from
 * `MANIFEST_ORIGIN`. Leaves on `MANIFEST_TANGENT` and sweeps toward its own
 * fan heading over its whole length, which keeps the bend gentle instead of a
 * corner. Length is the only channel amount is drawn on — the number itself
 * is on the tooltip and in the panel.
 */
function manifestLinePath(fanIndex: number, fanCount: number, amount: number): { path: string; end: Point } {
  const spread = (fanCount - 1) * MANIFEST_FAN_STEP
  const centre = MANIFEST_ANGLE + MANIFEST_HEADING_BIAS
  const heading = centre - spread / 2 + fanIndex * MANIFEST_FAN_STEP
  const length = Math.min(MANIFEST_MAX_LENGTH, MANIFEST_MIN_LENGTH + amount * MANIFEST_LENGTH_SCALE)

  const c1 = {
    x: MANIFEST_ORIGIN.x + MANIFEST_TANGENT.x * length * 0.5,
    y: MANIFEST_ORIGIN.y + MANIFEST_TANGENT.y * length * 0.5,
  }

  const rad = (heading * Math.PI) / 180
  const dir = { x: Math.cos(rad), y: Math.sin(rad) }
  const c2 = {
    x: MANIFEST_ORIGIN.x + dir.x * length * 0.62,
    y: MANIFEST_ORIGIN.y + dir.y * length * 0.62,
  }
  const end = {
    x: MANIFEST_ORIGIN.x + dir.x * length,
    y: MANIFEST_ORIGIN.y + dir.y * length,
  }

  return {
    path: `M ${MANIFEST_ORIGIN.x} ${MANIFEST_ORIGIN.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
    end,
  }
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
    () => conditionSlots(draft.form, placements, draft.specialty),
    [draft.form, draft.specialty, placements],
  )

  /** How each slot resolved, keyed by slot. */
  const reports = useMemo(() => {
    const map = new Map<number, SlotReport>()
    for (const slot of reaction.slots) map.set(slot.slotIndex, slot)
    return map
  }, [reaction.slots])

  /** The names to engrave on the rim, view mode only — in edit mode the card
   * carries its own name. */
  const rimNames = useMemo(() => {
    if (mode !== 'view') return []
    return draft.slots.flatMap((id, index) => {
      const component = (id && componentsById.get(id)) || null
      return component ? [{ index, name: component.name }] : []
    })
  }, [mode, draft.slots, componentsById])

  /** The ring drawn as however many unbroken stretches still carry current,
   * plus the closing crossing over the mouth. See `buildFlowArcs`. */
  const flows = useMemo<FlowArc[]>(
    () => buildFlowArcs(reaction.carrying, reports.get(0) ?? null),
    [reaction.carrying, reports],
  )

  /** Whichever currency is leaving slot VIII for the mouth — its exit line is
   * painted last so overlaps never hide the colour actually in flight there. */
  const mouthCurrency = useMemo(
    () => dominantCurrency(reaction.carrying[RING_SLOT_COUNT - 1] ?? {}),
    [reaction.carrying],
  )

  /** What the ring gave up, drawn leaving through the mouth. See `manifestLinePath`. */
  const manifestLines = useMemo<ManifestLine[]>(() => {
    const entries = ledgerEntries(reaction.manifestation)
    return entries.map(([currency, amount], index) => {
      const { path, end } = manifestLinePath(index, entries.length, amount)
      return {
        currency,
        amount,
        path,
        gradientId: `manifest-grad-${currency}`,
        x1: MANIFEST_ORIGIN.x,
        y1: MANIFEST_ORIGIN.y,
        x2: end.x,
        y2: end.y,
        color: flowBandColor(currencyHue(currency)),
      }
    })
  }, [reaction.manifestation])

  /** `manifestLines` in paint order: the mouth's own currency moved to the
   * end so it renders on top. Kept separate so the fan layout stays fixed. */
  const manifestPaintOrder = useMemo(
    () => [...manifestLines].sort((a, b) => Number(a.currency === mouthCurrency) - Number(b.currency === mouthCurrency)),
    [manifestLines, mouthCurrency],
  )

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

        {flows.length > 0 && (
          <defs>
            {flows.map((flow) => (
              <linearGradient
                key={flow.gradientId}
                id={flow.gradientId}
                gradientUnits="userSpaceOnUse"
                x1={flow.x1}
                y1={flow.y1}
                x2={flow.x2}
                y2={flow.y2}
              >
                {flow.stops.map((stop, index) => (
                  <stop key={index} offset={stop.offset} stopColor={stop.color} />
                ))}
              </linearGradient>
            ))}
          </defs>
        )}

        {flows.map((flow) => (
          <path key={flow.key} className="circle__flow" d={flow.path} stroke={`url(#${flow.gradientId})`}>
            <title>{flow.title}</title>
          </path>
        ))}

        {manifestLines.length > 0 && (
          <defs>
            {manifestLines.map((line) => (
              <linearGradient
                key={line.gradientId}
                id={line.gradientId}
                gradientUnits="userSpaceOnUse"
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
              >
                <stop offset="0%" stopColor={line.color} stopOpacity="1" />
                <stop offset="55%" stopColor={line.color} stopOpacity="0.15" />
                <stop offset="100%" stopColor={line.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
        )}

        {manifestPaintOrder.map((line) => (
          <path key={line.currency} className="circle__manifest" d={line.path} stroke={`url(#${line.gradientId})`}>
            <title>{`${CURRENCY_META[line.currency].label} ${line.amount}`}</title>
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
