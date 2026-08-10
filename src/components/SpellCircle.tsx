import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { CURRENCY_META, currencyHue } from '../data/currencies'
import { conditionSlots } from '../data/spellForms'
import { useWorkshop } from '../state/useWorkshop'
import type { SlotReport } from '../lib/reaction'
import { CURRENCIES, RING_SLOT_COUNT, ledgerEntries, type Currency, type Ledger } from '../types/worldbuilding'
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

/** A single reagent's stroke colour on the flow ring, drawn from its own hue. */
function flowBandColor(hue: number): string {
  return `hsl(${hue} var(--gem-s-strong) 55%)`
}

/**
 * Turns a list of hues into gradient stops, one per hue, evenly spaced so the
 * first is pure at the literal start of the arc and the last is pure at its
 * literal end.
 */
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
 * Every occupied slot between slot `from` and slot `to` inclusive, in ring
 * order, coloured by whichever currency it is holding the most of right now:
 * what it released into the current, or failing that what it received from
 * it. A hole in between, and a slot presently carrying neither, contribute no
 * stop.
 */
function pathHues(from: number, to: number, reports: Map<number, SlotReport>): number[] {
  const span = (to - from + RING_SLOT_COUNT) % RING_SLOT_COUNT
  const hues: number[] = []
  for (let step = 0; step <= span; step++) {
    const report = reports.get((from + step) % RING_SLOT_COUNT)
    if (!report) continue
    const currency = dominantCurrency(report.released) ?? dominantCurrency(report.received)
    if (currency) hues.push(currencyHue(currency))
  }
  return hues
}

/**
 * A clockwise arc from one slot to another along the flow ring. The current only
 * ever runs clockwise, so the sweep flag is fixed; the long way round is taken
 * whenever the span passes a half turn.
 *
 * The gradient is still, not travelling: it runs once from whatever the slot
 * at the arc's start is holding most of to whatever the slot at its end is,
 * through everything standing between, so a crossing through a reagent
 * currently thick with heat and another thick with motion reads left to right
 * as one colour giving way to the other, live to this casting rather than
 * fixed to the catalog.
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

function buildFlowArc(
  from: number,
  to: number,
  amounts: Map<Currency, number>,
  reports: Map<number, SlotReport>,
): FlowArc {
  const currencies = CURRENCIES.filter((currency) => amounts.has(currency))
  const start = slotPoint(from, FLOW_RADIUS)
  const end = slotPoint(to, FLOW_RADIUS)
  const spanSlots = (to - from + RING_SLOT_COUNT) % RING_SLOT_COUNT
  const largeArc = spanSlots * DEGREES_PER_SLOT > 180 ? 1 : 0

  const stops = flowStops(pathHues(from, to, reports))

  return {
    key: `${from}-${to}`,
    path: `M ${start.x} ${start.y} A ${FLOW_RADIUS} ${FLOW_RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    gradientId: `flow-grad-${from}-${to}`,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    stops,
    title: currencies.map((currency) => `${CURRENCY_META[currency].label} ${amounts.get(currency)}`).join(', '),
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

  /**
   * A transfer whose ends coincide went the whole way round the ring, which has
   * no arc to draw; the numbers still show it in the panel.
   *
   * Several currencies routinely cross the same pair of slots, and each one
   * used to get its own dashed arc, offset in phase so the dashes interleaved
   * into a braid. That braid is gone: every pair of slots now draws exactly
   * one arc, its gradient built from what each slot along it is actually
   * holding most of, per `reports` above, rather than from the currencies
   * riding between the endpoints. See `buildFlowArc`.
   */
  const flows = useMemo<FlowArc[]>(() => {
    const drawn = reaction.transfers.filter((transfer) => transfer.from !== transfer.to)
    const byPair = new Map<string, { from: number; to: number; amounts: Map<Currency, number> }>()
    for (const transfer of drawn) {
      const key = `${transfer.from}-${transfer.to}`
      let entry = byPair.get(key)
      if (!entry) {
        entry = { from: transfer.from, to: transfer.to, amounts: new Map() }
        byPair.set(key, entry)
      }
      entry.amounts.set(transfer.currency, (entry.amounts.get(transfer.currency) ?? 0) + transfer.amount)
    }
    return Array.from(byPair.values()).map(({ from, to, amounts }) => buildFlowArc(from, to, amounts, reports))
  }, [reaction.transfers, reports])

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
