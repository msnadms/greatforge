import { currencyHue } from '../data/currencies'
import {
  DEGREES_PER_SLOT,
  buildManifestLines,
  dominantCurrency,
  radialPoint,
  type FlowGeometry,
  type Point,
} from './circleFlow'
import type { Reaction } from './reaction'
import {
  CURRENCIES,
  RING_SLOT_COUNT,
  ledgerTotal,
  type Currency,
  type Ledger,
} from '../types/worldbuilding'

/**
 * The casting, as fire. Nothing here is React and nothing here is Pixi: a
 * caller hands it a resolved reaction and the geometry the circle is drawn at,
 * and gets back the route the flame runs, the colour it burns at every point
 * of that route, and how hard. `components/CircleFire.tsx` is then only a
 * particle loop over this.
 *
 * The route is the current's own route, taken off the same numbers
 * `lib/circleFlow.ts` draws the arcs from. The ring from the first reagent
 * standing in the circle round to slot VIII, then out through the mouth along
 * the fan of exit lines. It is not a band, a rim or a halo. It is played once,
 * when a rite is spoken, and only when the casting landed.
 */

/**
 * How far apart the ring is sampled, in degrees. A degree and a half is about
 * one stage unit at the flow radius, finer than a blob of flame is wide.
 */
export const SAMPLE_STEP = 1.5

/**
 * Units in flight for the jet to burn at about two thirds strength. The curve
 * is `1 - exp(-total / HEAT_SCALE)`, so it saturates instead of topping out at
 * a number: a fat ring burns harder, a thin one still reads as fire, and
 * nothing here is pinned to a figure in the balance table that a catalog
 * retune would silently invalidate.
 */
const HEAT_SCALE = 10

/**
 * What the jet burns at where nothing is in flight. The flame dims across a
 * stretch the current died on; it never goes out, because a casting is one
 * gesture and a flame that gutters out mid-ring reads as the animation
 * breaking rather than as the ring doing so. The arcs already say where the
 * current stopped, in the plainer way, by not being drawn.
 */
const HEAT_FLOOR = 0.14

/** Degrees of ring the head covers a second. A full lap is a shade over a second. */
export const JET_SPEED = 1000

/** The closing lap is a spent tail rather than the run proper, so it crawls. */
export const TAIL_SPEED = 110

/**
 * How long the whole figure holds at full once it has reached its full length,
 * which is the moment the closing lap finishes tracing. The ring, the lap and
 * the exit sprays all burn undimmed across this, so a rite is read at rest
 * rather than caught on the way past.
 */
export const HOLD_SECONDS = 3

/**
 * How long the rite takes to gutter out once the hold is over. The ring, the
 * closing lap and the exit sprays all fall away across this same span, so the
 * whole thing ends together.
 */
export const BURST_SECONDS = 0.85

/** How long one blob of flame lives. */
export const PARTICLE_SECONDS = 0.55

/** One point on the route, with what burns there. */
export interface JetSample {
  x: number
  y: number
  /** Unit tangent: the direction the current is travelling at this point. */
  tx: number
  ty: number
  /**
   * What is in flight here, blended between the slot behind and the slot ahead
   * exactly as the arc's own gradient blends its stops. Empty across a stretch
   * carrying nothing.
   */
  carrying: Ledger
  /** What to burn where `carrying` is empty: whatever was last in flight. */
  fallbackCurrency: Currency | null
  /** How hard this point burns, 0 to 1, floored at `HEAT_FLOOR`. */
  heat: number
}

/** One currency leaving through the mouth, as the cubic the fan already draws. */
export interface JetExit {
  currency: Currency
  hue: number
  amount: number
  from: Point
  c1: Point
  c2: Point
  to: Point
}

export interface Jet {
  /** First reagent round to slot VIII. Never empty. */
  path: JetSample[]
  /** The closing lap over the mouth into slot I. Empty where the ring is open. */
  tail: JetSample[]
  /** One spray per currency manifested. Empty where the rite delivered nothing. */
  exits: JetExit[]
}

/** `(1 - t) * a + t * b`, currency by currency. */
function blendLedgers(a: Ledger, b: Ledger, t: number): Ledger {
  const mixed: Ledger = {}
  for (const currency of CURRENCIES) {
    const amount = (a[currency] ?? 0) * (1 - t) + (b[currency] ?? 0) * t
    if (amount > 0) mixed[currency] = amount
  }
  return mixed
}

/**
 * One blob's colour, before the core-to-ember ramp is applied to it. `hue` is
 * absolute; the other two are adjustments to that ramp rather than values, so a
 * tone says how this blob differs from the flame around it and the ramp goes on
 * deciding what a core and an ember are.
 */
export interface EmberTone {
  hue: number
  /** Multiplier on the ramp's saturation. Above 1 is a richer draw. */
  saturation: number
  /** Offset on the ramp's lightness, in percent. */
  lightness: number
}

/** What burns where nothing ever was. Old gold, the neutral the arcs fall to. */
const COLD_TONE: EmberTone = { hue: 40, saturation: 1, lightness: 0 }

/**
 * A restrained core-to-edge ramp per currency. The flame chooses its stop from
 * its age rather than at random: the hot centre stays nearly white and the
 * coloured edge stays one coherent hue instead of mixing like confetti.
 */
/** A distinct colour in one currency's fire palette, relative to its arc hue. */
interface PaletteStop {
  hue: number
  saturation: number
  lightness: number
}

/**
 * The hue shifts slightly toward a warmer, brighter edge, but each currency
 * remains recognizably one colour while its particles overlap.
 */
export const CURRENCY_PALETTE: Record<Currency, readonly PaletteStop[]> = {
  // Ember orange to pale gold.
  heat: [
    { hue: -5, saturation: 0.9, lightness: 0 },
    { hue: 4, saturation: 1, lightness: 3 },
    { hue: 12, saturation: 1.08, lightness: 6 },
    { hue: 20, saturation: 1.15, lightness: 9 },
  ],
  // Old gold to pale yellow.
  light: [
    { hue: -7, saturation: 0.88, lightness: 0 },
    { hue: 2, saturation: 0.98, lightness: 3 },
    { hue: 10, saturation: 1.08, lightness: 6 },
    { hue: 18, saturation: 1.14, lightness: 9 },
  ],
  // Verdigris to cool jade.
  motion: [
    { hue: -10, saturation: 0.9, lightness: 0 },
    { hue: -3, saturation: 1, lightness: 3 },
    { hue: 4, saturation: 1.08, lightness: 6 },
    { hue: 11, saturation: 1.14, lightness: 9 },
  ],
  // Steel blue to icy blue.
  mass: [
    { hue: -9, saturation: 0.88, lightness: 0 },
    { hue: -2, saturation: 0.98, lightness: 3 },
    { hue: 5, saturation: 1.07, lightness: 6 },
    { hue: 12, saturation: 1.13, lightness: 9 },
  ],
  // Periwinkle to pale violet.
  charge: [
    { hue: -8, saturation: 0.9, lightness: 1 },
    { hue: -1, saturation: 1, lightness: 4 },
    { hue: 6, saturation: 1.08, lightness: 7 },
    { hue: 13, saturation: 1.14, lightness: 10 },
  ],
}

/**
 * One colour out of a currency's palette. `shade` runs 0 at the core to 1 at the
 * ember.
 *
 * `shade` walks from the hot core stop to the coloured outer stop. The small
 * jitter stops a perfectly even gradient from looking synthetic without
 * pulling neighbouring particles into unrelated colours.
 */
export function currencyTone(currency: Currency | null, shade: number): EmberTone {
  if (!currency) return COLD_TONE
  const palette = CURRENCY_PALETTE[currency]
  const stop = palette[Math.min(palette.length - 1, Math.floor(shade * palette.length))]
  return {
    hue: currencyHue(currency) + stop.hue + gaussian() * (1 + 2 * shade),
    saturation: stop.saturation * (0.96 + Math.random() * 0.08),
    lightness: stop.lightness + gaussian() * (1 + 2 * shade),
  }
}

/**
 * The ring's SVG gradients blend the ledger leaving one slot into the ledger
 * leaving the next. Match that blend in the fire, too: selecting the largest
 * ledger entry made a particle switch hue as soon as two amounts crossed.
 *
 * Hues are combined as vectors rather than ordinary degrees, so a transition
 * over the 0/360 seam takes the short, natural route. Saturation and lightness
 * remain ordinary weighted averages. The tiny per-ember variation is applied
 * after the mix, which keeps the flame alive without breaking the transition.
 */
function ledgerTone(carrying: Ledger, fallbackCurrency: Currency | null, shade: number): EmberTone {
  const total = ledgerTotal(carrying)
  if (total <= 0) return currencyTone(fallbackCurrency, shade)

  let hueX = 0
  let hueY = 0
  let saturation = 0
  let lightness = 0

  for (const currency of CURRENCIES) {
    const amount = carrying[currency] ?? 0
    if (amount <= 0) continue

    const weight = amount / total
    const palette = CURRENCY_PALETTE[currency]
    const stop = palette[Math.min(palette.length - 1, Math.floor(shade * palette.length))]
    const hue = currencyHue(currency) + stop.hue
    const radians = (hue * Math.PI) / 180
    hueX += Math.cos(radians) * weight
    hueY += Math.sin(radians) * weight
    saturation += stop.saturation * weight
    lightness += stop.lightness * weight
  }

  return {
    hue: ((Math.atan2(hueY, hueX) * 180) / Math.PI + 360) % 360 + gaussian() * (1 + 2 * shade),
    saturation: saturation * (0.96 + Math.random() * 0.08),
    lightness: lightness + gaussian() * (1 + 2 * shade),
  }
}

/**
 * A standard normal, by Box-Muller. Fire scatters about a centre rather than
 * filling a box, so every jitter in the renderer is drawn from this instead of
 * from a flat `Math.random() - 0.5`: it feathers at the edges and stays dense
 * in the middle, which is the difference between a flame and a swarm.
 *
 * `1 - Math.random()` because `Math.log(0)` is not finite and `Math.random()`
 * can return exactly 0.
 */
export function gaussian(): number {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
}

/**
 * The colour to burn at one point. `shade` runs 0 at the core to 1 at the ember.
 *
 * Each particle follows the weighted mix of currency currently in flight.
 * `sampleRun` interpolates neighbouring ledgers, so this makes the flame use
 * the same soft transition as the engraving beneath it.
 */
export function sampleTone(sample: JetSample, shade: number): EmberTone {
  return ledgerTone(sample.carrying, sample.fallbackCurrency, shade)
}

/**
 * A short, even colour journey between two points in a flame. Used where an
 * exit leaves the ring: its root inherits the circle's current, then it eases
 * into the colour of what that exit manifests.
 */
export function blendEmberTones(from: EmberTone, to: EmberTone, progress: number): EmberTone {
  const t = Math.min(1, Math.max(0, progress))
  const hueDistance = ((to.hue - from.hue + 540) % 360) - 180
  return {
    hue: (from.hue + hueDistance * t + 360) % 360,
    saturation: from.saturation + (to.saturation - from.saturation) * t,
    lightness: from.lightness + (to.lightness - from.lightness) * t,
  }
}


/**
 * How the flame is mixed. The core is bright and almost colourless; saturation
 * increases gently only toward the edge. This preserves the read of heat while
 * still identifying the currency. `blend` is handed straight to Pixi.
 */
export interface EmberPalette {
  /** Saturation at the core and at the ember, in percent. */
  saturation: [number, number]
  /** Lightness at the core and at the ember, in percent. */
  lightness: [number, number]
  blend: 'add' | 'normal'
  /** Ceiling on one blob's opacity. Additive stacking needs far less. */
  alpha: number
}

/** Ink on parchment: a near-white core and a softly coloured edge. */
export const EMBER_LIGHT: EmberPalette = {
  saturation: [3, 46],
  lightness: [97, 62],
  blend: 'normal',
  alpha: 0.36,
}

/**
 * Candlelight: flame as light, brightest where it stacks.
 *
 * **The core is much darker than a flame's core looks, because the blending
 * adds it up.** Under `add`, lightness is the white a blob contributes, and a
 * core near a real flame's took the whole trail to white when stacked a few
 * deep, leaving no hue in it. The core lets a dense stretch reach white where
 * the head is and
 * stay the current's own colour everywhere else, which is what the low
 * saturation here is for.
 *
 * **This lightness moves with the flame's thickness and against its
 * saturation, and it has been brought down for each in turn.** A wider blob
 * overlaps its neighbours further, so the same core stacks deeper and drifts
 * back toward the white this number exists to hold off; the alpha moves with
 * it. A paler blob is a whiter one under `add`, since what a channel gives up
 * in colour it contributes as light, so desaturating on its own hands that
 * white straight back. Retune either and check this.
 *
 * Only in this palette: `EMBER_LIGHT` paints rather than adds, so its lightness
 * is unaffected by what its saturation does.
 */
export const EMBER_DARK: EmberPalette = {
  saturation: [3, 48],
  lightness: [95, 63],
  blend: 'add',
  alpha: 0.34,
}

/**
 * Fire as one colour. `t` runs 0 at the core to 1 at the ember.
 *
 * **Two decisions meet here and stay separate.** `EmberPalette` is the desk's:
 * how a core differs from an ember, and how the whole flame sits against the
 * ground it burns over. `EmberTone` is the currency's: where in its own range
 * this blob falls. The tone adjusts the ramp rather than replacing it, so
 * retuning either theme moves every currency together and retuning a currency
 * moves it in both themes.
 *
 * Deliberately not `flowBandColor`. That returns a string holding a CSS
 * variable, which Pixi cannot take, and it is tuned to read as pigment at rest
 * (a flame at 40% saturation is a smudge). Only the hue is shared, which keeps
 * the app's one rule about colour intact: a hue says which currency and never
 * anything else.
 */
export function emberColor(palette: EmberPalette, tone: EmberTone, t: number): number {
  const saturation =
    (palette.saturation[0] + (palette.saturation[1] - palette.saturation[0]) * t) * tone.saturation
  const lightness =
    palette.lightness[0] + (palette.lightness[1] - palette.lightness[0]) * t + tone.lightness
  return hslToRgb(tone.hue, clamp(saturation), clamp(lightness))
}

/** Into [0, 100], where a tone's adjustment could otherwise carry a ramp out of it. */
function clamp(percent: number): number {
  return Math.min(100, Math.max(0, percent))
}

function hslToRgb(hue: number, saturation: number, lightness: number): number {
  const s = saturation / 100
  const l = lightness / 100
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const sector = (((hue % 360) + 360) % 360) / 60
  const second = chroma * (1 - Math.abs((sector % 2) - 1))
  const [r, g, b] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second]
  const m = l - chroma / 2
  const byte = (channel: number) => Math.round(Math.min(1, Math.max(0, channel + m)) * 255)
  return (byte(r) << 16) | (byte(g) << 8) | byte(b)
}

/**
 * Samples a run of ring between two slot indices. `carryingAt` says what is in
 * flight leaving each slot, so a point a fraction `t` of the way from slot `i`
 * to slot `i + 1` burns the blend of the two, which is what the arc's gradient
 * already draws there.
 */
function sampleRun(
  from: number,
  to: number,
  radius: number,
  carryingAt: (index: number) => Ledger,
  startingCurrency: Currency | null,
): JetSample[] {
  const samples: JetSample[] = []
  const span = (to - from) * DEGREES_PER_SLOT
  const steps = Math.max(1, Math.round(span / SAMPLE_STEP))
  let fallbackCurrency = startingCurrency

  for (let step = 0; step <= steps; step++) {
    const along = (step / steps) * (to - from)
    const slot = Math.min(to - 1, from + Math.floor(along))
    const within = from + along - slot
    const carrying = blendLedgers(carryingAt(slot), carryingAt(slot + 1), within)

    const dominant = dominantCurrency(carrying)
    if (dominant) fallbackCurrency = dominant

    const degrees = -90 + (from + along) * DEGREES_PER_SLOT
    const point = radialPoint(degrees, radius)
    const radians = (degrees * Math.PI) / 180
    const total = ledgerTotal(carrying)

    samples.push({
      x: point.x,
      y: point.y,
      // Clockwise tangent: the heading the current is on at this point.
      tx: -Math.sin(radians),
      ty: Math.cos(radians),
      carrying,
      fallbackCurrency,
      heat: Math.max(HEAT_FLOOR, 1 - Math.exp(-total / HEAT_SCALE)),
    })
  }

  return samples
}

/**
 * The closing lap, drawn under exactly the test `buildMouthArc` uses: a reagent
 * stands at slot I, and something still leaves slot VIII to reach it. The fire
 * never runs a lap the arcs do not.
 *
 * It ends on whatever leaves slot I, or failing that on what slot I took, which
 * is the same rule the mouth arc's own gradient follows.
 */
function buildTail(reaction: Reaction, radius: number): JetSample[] {
  const mouth = RING_SLOT_COUNT - 1
  const leavingMouth = reaction.carrying[mouth] ?? {}
  if (ledgerTotal(leavingMouth) <= 0) return []

  const first = reaction.slots.find((slot) => slot.slotIndex === 0)
  if (!first) return []

  const leavingFirst = reaction.carrying[0] ?? {}
  const arriving = ledgerTotal(leavingFirst) > 0 ? leavingFirst : first.received

  return sampleRun(
    mouth,
    RING_SLOT_COUNT,
    radius,
    (index) => (index === mouth ? leavingMouth : arriving),
    dominantCurrency(leavingMouth),
  )
}

/**
 * What burns when this rite is spoken, or null where there is nothing to burn:
 * a cold circle, or a resolution that never walked the ring.
 */
export function buildJet(reaction: Reaction, geometry: FlowGeometry): Jet | null {
  if (reaction.slots.length === 0 || reaction.carrying.length === 0) return null

  // The first reagent standing in the circle. `slots` holds filled slots only,
  // in slot order, so this is that reagent and not merely slot I.
  const start = reaction.slots[0].slotIndex
  const mouth = RING_SLOT_COUNT - 1
  const carryingAt = (index: number) => reaction.carrying[Math.min(index, mouth)] ?? {}

  const path =
    start >= mouth
      ? sampleRun(mouth, mouth + 1, geometry.flowRadius, carryingAt, null).slice(0, 1)
      : sampleRun(
          start,
          mouth,
          geometry.flowRadius,
          carryingAt,
          dominantCurrency(carryingAt(start)),
        )

  const lines = buildManifestLines(reaction.manifestation, geometry)

  return {
    path,
    tail: buildTail(reaction, geometry.flowRadius),
    exits: lines.map((line) => ({
      currency: line.currency,
      hue: currencyHue(line.currency),
      amount: line.amount,
      from: { x: line.x1, y: line.y1 },
      c1: line.c1,
      c2: line.c2,
      to: { x: line.x2, y: line.y2 },
    })),
  }
}

/**
 * How far a gout runs past the fan's tip, as a multiple of the exit line's own
 * length. **The line states what the rite delivered; the fire is not bound by
 * it.** A flame that stops exactly where the ink stops reads as a diagram being
 * filled in, where what a spoken rite does is leave the circle, so the gouts
 * carry on past the fan and off the edge of the desk.
 *
 * Four lengths clears the viewport from the mouth at every size the circle is
 * drawn at, **and the small circle is the case that sets it**: a narrow window
 * shrinks the circle, which puts more stage units between it and the screen's
 * edge, not fewer. Further than this is flame nobody can see, paid for out of
 * the same ember pool the ring draws on.
 */
export const EXIT_REACH = 4

/** Length of an exit line, near enough for a rate. The bend is gentle. */
export function exitLength(exit: JetExit): number {
  return Math.hypot(exit.to.x - exit.from.x, exit.to.y - exit.from.y) || 1
}

/**
 * A point on one exit's cubic, `t` from 0 at the mouth to 1 at the tip, and on
 * out to `EXIT_REACH` past it.
 *
 * **Past the tip it runs straight, on the heading the curve ended on.** The
 * cubic's own extrapolation curls back on itself a short way beyond `t = 1`,
 * which sends a gout round in an arc rather than away; a fan that has finished
 * spreading should hold its line.
 */
export function exitPoint(exit: JetExit, t: number): Point {
  if (t > 1) {
    const heading = exitHeading(exit, 1)
    const over = (t - 1) * exitLength(exit)
    return { x: exit.to.x + heading.x * over, y: exit.to.y + heading.y * over }
  }
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * exit.from.x + b * exit.c1.x + c * exit.c2.x + d * exit.to.x,
    y: a * exit.from.y + b * exit.c1.y + c * exit.c2.y + d * exit.to.y,
  }
}

/** The heading of an exit at `t`, the cubic's derivative, normalised. */
export function exitHeading(exit: JetExit, t: number): Point {
  const u = 1 - t
  const x =
    3 * u * u * (exit.c1.x - exit.from.x) +
    6 * u * t * (exit.c2.x - exit.c1.x) +
    3 * t * t * (exit.to.x - exit.c2.x)
  const y =
    3 * u * u * (exit.c1.y - exit.from.y) +
    6 * u * t * (exit.c2.y - exit.c1.y) +
    3 * t * t * (exit.to.y - exit.c2.y)
  const length = Math.hypot(x, y) || 1
  return { x: x / length, y: y / length }
}
