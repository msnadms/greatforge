import { CURRENCY_META, currencyHue } from '../data/currencies'
import type { SlotReport } from './reaction'
import { RING_SLOT_COUNT, ledgerEntries, ledgerTotal, type Currency, type Ledger } from '../types/worldbuilding'

/**
 * The current, as geometry. Everything here is drawn in the same 100-unit box
 * `SpellCircle` and a rite's entry in the codex both use, so one set of rules
 * serves the bench and the thumbnails on the shelf. Nothing in this file is
 * React, and nothing in it reads the workshop — a caller hands it a resolved
 * reaction's `carrying` and `manifestation` and gets back paths.
 */

export const DEGREES_PER_SLOT = 360 / RING_SLOT_COUNT

export interface Point {
  x: number
  y: number
}

/** A point on the stage, by angle in degrees clockwise from due right. */
export function radialPoint(degrees: number, radius: number): Point {
  const angle = degrees * (Math.PI / 180)
  return {
    x: 50 + radius * Math.cos(angle),
    y: 50 + radius * Math.sin(angle),
  }
}

/** Slot i, starting at the top and running clockwise. */
export function slotPoint(index: number, radius: number): Point {
  return radialPoint(-90 + index * DEGREES_PER_SLOT, radius)
}

/**
 * How large to draw one circle's current. The bench draws it at desk scale
 * inside its ring of cards; a codex entry draws the same arcs small, inside a
 * disc a fraction of the size. Only the numbers differ.
 */
export interface FlowGeometry {
  /** Radius the arcs run at. */
  flowRadius: number
  /** Prefixes every gradient id this geometry mints. Gradient ids are document
   * -wide, and the shelf draws one circle per rite, so each needs its own. */
  idPrefix: string
  /** The fan of exit lines. Left out where a circle draws the ring alone,
   * which is what the codex's entries do — at that size the fan crowded the
   * band the title is engraved along. */
  manifest?: {
    /** Shortest and longest an exit line is drawn. */
    min: number
    max: number
    /** Units of length per unit of currency manifested. */
    scale: number
    /** Degrees between neighbouring lines, so several currencies fan out from
     * their shared origin rather than riding one another. */
    fanStep: number
  }
}

/** A single reagent's stroke colour on the flow ring, drawn from its own hue. */
export function flowBandColor(hue: number): string {
  return `hsl(${hue} var(--gem-s-strong) 55%)`
}

/** Turns a list of hues into gradient stops, evenly spaced along the arc. */
function flowStops(hues: number[]): { offset: string; color: string }[] {
  const last = hues.length - 1
  return hues.map((hue, i) => ({ offset: `${(i / last) * 100}%`, color: flowBandColor(hue) }))
}

/** The currency holding the largest amount in a ledger, or null if it holds nothing. */
export function dominantCurrency(ledger: Ledger): Currency | null {
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
export interface FlowArc {
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

/** Every currency in flight at a slot, as `Heat 7, Motion 2`. */
function carryingLabel(ledger: Ledger): string {
  return ledgerEntries(ledger)
    .map(([currency, amount]) => `${CURRENCY_META[currency].label} ${amount}`)
    .join(', ')
}

function buildFlowArc(from: number, to: number, carrying: Ledger[], geometry: FlowGeometry): FlowArc {
  const { path, start, end } = arcPath(from, to, geometry.flowRadius)

  return {
    key: `${from}-${to}`,
    path,
    gradientId: `${geometry.idPrefix}-flow-${from}-${to}`,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    stops: flowStops(carryingHues(carrying, from, to)),
    title: carryingLabel(carrying[from] ?? {}),
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
function buildMouthArc(carrying: Ledger[], first: SlotReport | null, geometry: FlowGeometry): FlowArc | null {
  if (!first) return null
  const mouth = RING_SLOT_COUNT - 1
  const startHue = carryingHue(carrying, mouth)
  if (startHue === null) return null
  const leavingFirst = carryingHue(carrying, 0)
  const received = dominantCurrency(first.received)
  const endHue = leavingFirst ?? (received ? currencyHue(received) : startHue)

  const { path, start, end } = arcPath(mouth, RING_SLOT_COUNT, geometry.flowRadius)

  return {
    key: `${mouth}-${RING_SLOT_COUNT}`,
    path,
    gradientId: `${geometry.idPrefix}-flow-${mouth}-${RING_SLOT_COUNT}`,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    stops: flowStops([startHue, endHue]),
    // What crosses, as on every other arc, rather than what slot I took out of
    // it: the slot's own card already states what it received.
    title: carryingLabel(carrying[mouth] ?? {}),
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
export function buildFlowArcs(
  carrying: Ledger[],
  first: SlotReport | null,
  geometry: FlowGeometry,
): FlowArc[] {
  const arcs: FlowArc[] = []
  let start: number | null = null
  for (let segment = 0; segment < RING_SLOT_COUNT - 1; segment++) {
    const flowing = ledgerTotal(carrying[segment] ?? {}) > 0
    if (flowing && start === null) start = segment
    if (!flowing && start !== null) {
      arcs.push(buildFlowArc(start, segment, carrying, geometry))
      start = null
    }
  }
  if (start !== null) arcs.push(buildFlowArc(start, RING_SLOT_COUNT - 1, carrying, geometry))

  const mouthArc = buildMouthArc(carrying, first, geometry)
  if (mouthArc) arcs.push(mouthArc)

  return arcs
}

export interface ManifestLine {
  currency: Currency
  amount: number
  path: string
  gradientId: string
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  title: string
  /**
   * The cubic's own control points, the same two `path` is built from. Carried
   * so a second drawing of this line can walk the curve rather than rebuild it
   * `lib/fire.ts` sprays along it, and a bézier reconstructed in two places is
   * a bézier that eventually disagrees with itself.
   */
  c1: Point
  c2: Point
}

/**
 * Slot VIII's own angle, not the mouth's — the mouth sits between two slots
 * and nothing is ever drawn reaching it, which left exit lines looking cut
 * short of the flow they were meant to continue.
 */
const MANIFEST_ANGLE = -90 + (RING_SLOT_COUNT - 1) * DEGREES_PER_SLOT

/**
 * Direction the current is travelling the instant it reaches the fan's origin
 * — tangent to the ring, not radial. Every exit line departs on this heading
 * before bending toward its own; departing radially instead met the tangential
 * current at a right angle and read as a hard corner.
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
 * A curved line for one currency's manifestation, running out from the fan's
 * origin — the flow ring directly under slot VIII, so a line reads as that
 * current carrying on rather than a mark in the margin. Leaves on
 * `MANIFEST_TANGENT` and sweeps toward its own fan heading over its whole
 * length, which keeps the bend gentle instead of a corner. Length is the only
 * channel amount is drawn on — the number itself is on the tooltip and in the
 * panel.
 */
function manifestLinePath(
  fanIndex: number,
  fanCount: number,
  amount: number,
  geometry: FlowGeometry & { manifest: NonNullable<FlowGeometry['manifest']> },
): { path: string; start: Point; end: Point; c1: Point; c2: Point } {
  const { min, max, scale, fanStep } = geometry.manifest
  const origin = radialPoint(MANIFEST_ANGLE, geometry.flowRadius)
  const spread = (fanCount - 1) * fanStep
  const centre = MANIFEST_ANGLE + MANIFEST_HEADING_BIAS
  const heading = centre - spread / 2 + fanIndex * fanStep
  const length = Math.min(max, min + amount * scale)

  const c1 = {
    x: origin.x + MANIFEST_TANGENT.x * length * 0.5,
    y: origin.y + MANIFEST_TANGENT.y * length * 0.5,
  }

  const rad = (heading * Math.PI) / 180
  const dir = { x: Math.cos(rad), y: Math.sin(rad) }
  const c2 = {
    x: origin.x + dir.x * length * 0.62,
    y: origin.y + dir.y * length * 0.62,
  }
  const end = {
    x: origin.x + dir.x * length,
    y: origin.y + dir.y * length,
  }

  return {
    path: `M ${origin.x} ${origin.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
    start: origin,
    end,
    c1,
    c2,
  }
}

/** What the ring gave up, drawn leaving through the mouth. Nothing at all where
 * the geometry states no fan. */
export function buildManifestLines(manifestation: Ledger, geometry: FlowGeometry): ManifestLine[] {
  const { manifest } = geometry
  if (!manifest) return []
  const entries = ledgerEntries(manifestation)
  return entries.map(([currency, amount], index) => {
    const { path, start, end, c1, c2 } = manifestLinePath(index, entries.length, amount, {
      ...geometry,
      manifest,
    })
    return {
      currency,
      amount,
      path,
      gradientId: `${geometry.idPrefix}-manifest-${currency}`,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      color: flowBandColor(currencyHue(currency)),
      title: `${CURRENCY_META[currency].label} ${amount}`,
      c1,
      c2,
    }
  })
}
