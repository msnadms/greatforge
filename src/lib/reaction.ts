import { isRelay } from '../data/currencies'
import { FORM_META, conditionRelief, type ConditionContext } from '../data/spellForms'
import {
  LEVEL_POWER,
  RING_SLOT_COUNT,
  TRANSIT_LOSS_GAP,
  TRANSIT_LOSS_RELAY,
  TRANSIT_LOSS_REAGENT,
  TRANSIT_POWER,
  addToLedger,
  completionFactor,
  ledgerEntries,
  ledgerTotal,
  normalizeLedger,
  transitScale,
  type CasterLevel,
  type Currency,
  type Ledger,
  type MaterialComponent,
  type Placement,
  type SpellForm,
} from '../types/worldbuilding'

/** Scales a ledger's amounts by `LEVEL_POWER[level]`, dropping anything that rounds to zero. */
function scaleLedger(ledger: Ledger, level: CasterLevel, round: (n: number) => number): Ledger {
  const normalized = normalizeLedger(ledger)
  const power = LEVEL_POWER[level]
  if (power >= 1) return normalized
  const scaled: Ledger = {}
  for (const [currency, amount] of ledgerEntries(normalized)) {
    const next = round(amount * power)
    if (next > 0) scaled[currency] = next
  }
  return scaled
}

/**
 * A ledger as a caster at this level can actually command it: normalized, then
 * demand and yield scaled by `LEVEL_POWER[level]` to the nearest unit. Exported
 * (not just used internally by `computeReaction`) because `ComponentTray`,
 * `ComponentSlot` and `DragLayer` need the same scaled numbers to show a
 * reagent card truthfully at the caster's current level.
 */
export function ledgerForCaster(ledger: Ledger, level: CasterLevel): Ledger {
  return scaleLedger(ledger, level, Math.round)
}

export interface SlotReport {
  slotIndex: number
  /** What the ring delivered against this slot's demands. */
  received: Ledger
  /**
   * Demand the ring could not meet. Paid out of the caster under a crediting form;
   * under a measuring one it is taken out of the yield instead and costs nothing.
   */
  shortfall: Ledger
  /** What it actually released, which is less than its yield when `measured`. */
  released: Ledger
  /**
   * True when a measuring form cut this reagent's yield to the share of its demand
   * the ring met. `released` is that share of the catalog yield, rounded down, and
   * the shortfall was not charged to anyone.
   */
  measured: boolean
}

export interface Reaction {
  /** The form the ring was resolved under. The same reagents differ across the seven. */
  form: SpellForm
  /**
   * Whether the ring satisfied what the form asks of it. `null` where there is no
   * verdict: the prayer, which asks nothing, and a cold circle, which has neither
   * met its form nor failed it.
   */
  conditionMet: boolean | null
  filled: number
  /**
   * Share of what the ring held that reached the mouth, from `completionFactor`.
   * 1 for a full ring; below that, the difference spilled out of the empty slots
   * and is included in `bled`. A form whose condition names the spill moves this:
   * met, the ring does not leak at all; failed, the share is squared.
   */
  completion: number
  /** Reports for filled slots only, in slot order. */
  slots: SlotReport[]
  /**
   * What is still in flight leaving slot `i` toward slot `i + 1` — index 7 is
   * what leaves slot VIII for the mouth. Recorded regardless of whether slot
   * `i` is a hole, a starved reagent or a sink, since those change what a slot
   * keeps but never what still travels past it. `SpellCircle` draws its flow
   * arcs from this.
   */
  carrying: Ledger[]
  /** Surplus that escaped the ring — what the spell actually does. */
  manifestation: Ledger
  /**
   * What the casting costs the caster: every unmet demand, and nothing else. A
   * ring that feeds every reagent standing in it is free to speak.
   */
  toll: Ledger
  /** Lost to transit and never claimed. The circle's inefficiency, as noise and glow. */
  bled: Ledger
  manifestationTotal: number
  tollTotal: number
  bledTotal: number
}

/** Current in flight between slots, decaying as it goes. */
interface Parcel {
  currency: Currency
  amount: number
  /**
   * Fractional share owed from a past proportional crossing (see
   * `spendProportional`) that rounded below one whole unit. Carried forward so
   * it accumulates and is eventually charged rather than dropped.
   */
  debt: number
}

// `conditionRelief` short-circuits on an empty ring before it ever reaches a
// condition's `test`, so this is never actually asked anything — it exists
// only because the parameter is required.
const NO_PLACEMENTS_CONTEXT: ConditionContext = { fedUnderBaseline: () => false }

function emptyReaction(form: SpellForm): Reaction {
  return {
    form,
    // A cold circle has no verdict: `conditionRelief` returns null for it.
    conditionMet: conditionRelief(form, [], NO_PLACEMENTS_CONTEXT).met,
    filled: 0,
    completion: 0,
    slots: [],
    carrying: [],
    manifestation: {},
    toll: {},
    bled: {},
    manifestationTotal: 0,
    tollTotal: 0,
    bledTotal: 0,
  }
}

/**
 * Builds what `conditionRelief` needs to answer a condition that reads the
 * ring's resolved state — currently only the dirge's. Resolves under the
 * prayer as a baseline (see `ConditionContext` in `data/spellForms.ts`), and
 * only on first use, since most forms' conditions never touch it.
 *
 * That baseline is resolved `pessimistic` (see `computeReaction`) rather than
 * at the nearest-unit rounding a real casting uses — see there for why: a
 * boolean gate reads a rounding coincidence very differently than a number
 * does, and this is the one place in the resolver that turns a rounded
 * amount into a boolean.
 */
export function buildConditionContext(placements: Placement[], level: CasterLevel): ConditionContext {
  let baseline: Reaction | null = null
  return {
    fedUnderBaseline: (slotIndex: number) => {
      if (!baseline) baseline = computeReaction(placements, 'prayer', level, true)
      const report = baseline.slots.find((s) => s.slotIndex === slotIndex)
      return report ? ledgerTotal(report.shortfall) === 0 : false
    },
  }
}

/**
 * Walks the ring once clockwise from slot I and closes it, resolving every
 * demand against the current in flight. Pure — no React, no storage.
 *
 * `form` decides two things: the underfed rule (credit vs measure, see
 * `FORM_META`) and which loss its condition spares or doubles (transit,
 * spill, or both). It can never add — every setting only lets a loss stand,
 * removes it, or deepens it. See `data/spellForms.ts`.
 *
 * `level` belongs to the spell, not the caster. It scales every placed
 * reagent's demand and yield by `LEVEL_POWER[level]` before the walk reads
 * either, and scales the flat transit cost by the shallower `TRANSIT_POWER`
 * curve. The completion spill does not move with level. See the eighth law
 * in `data/currencies.ts`.
 *
 * `pessimistic` is not a player-facing setting — no call site outside
 * `buildConditionContext`'s internal baseline probe should ever pass it.
 * `LEVEL_POWER`/`TRANSIT_POWER` round a demand, a yield and a transit cost
 * independently, and nearest-rounding several of them at once for the same
 * verdict lets a ring genuinely a fraction of a unit short of feeding a
 * reagent read fed at one level and starved at the next with no trend
 * between them — five numbers all moving the right direction, and a boolean
 * built from them that doesn't. Rounding a demand up and a yield or transit
 * cost down can only ever fail a ring the caster's true power hasn't reached
 * yet, never pass one by luck, so a verdict built this way only moves one
 * way as level rises. Left `false` (nearest, as before) `computeReaction`
 * reproduces the exact, extensively-tuned numbers in CLAUDE.md's Balance
 * section; flipped on for a whole ring rather than one reagent's supply
 * chain the compounding rounding is heavy enough to read as a real balance
 * cut — a fed eight-reagent ring at level 1 goes from ~1% dead to 100% —
 * which is why it stays off the path every real casting takes.
 */
export function computeReaction(
  placements: Placement[],
  form: SpellForm,
  level: CasterLevel = 5,
  pessimistic = false,
): Reaction {
  if (placements.length === 0) return emptyReaction(form)

  const { underfed } = FORM_META[form]
  const relief = conditionRelief(form, placements, buildConditionContext(placements, level))
  const transitFactor = transitScale(relief.transit)
  const demandForCaster = (ledger: Ledger): Ledger =>
    scaleLedger(ledger, level, pessimistic ? Math.ceil : Math.round)
  const yieldForCaster = (ledger: Ledger): Ledger =>
    scaleLedger(ledger, level, pessimistic ? Math.floor : Math.round)

  const byIndex = new Map(placements.map((p) => [p.slotIndex, p.component]))
  /** Demands as this caster can command them, keyed by slot. The walk asks for
   * these, and so does `crossInto`. */
  const demandsBySlot = new Map(
    placements.map((p) => [p.slotIndex, demandForCaster(p.component.demands)]),
  )
  const parcels: Parcel[] = []
  const reports = new Map<number, SlotReport>()
  const bled: Ledger = {}
  const toll: Ledger = {}

  /**
   * What the current pays to cross into a slot: four units to leap a gap, two
   * across a reagent, nothing through a relay — scaled by the form (which may
   * spare or double the crossing) and by level. The relay's free crossing is
   * unconditional and the only thing that makes it a relay; in every other
   * respect it is billed like an ordinary reagent (see the walk below, which
   * has no relay branch).
   */
  // `transitCarry` accumulates the fractional remainder each crossing's exact
  // cost leaves after rounding, so a lap's total cost tracks the exact rate to
  // within one unit instead of collapsing onto a couple of fixed values (2 *
  // 0.55 and 2 * 0.7 both round to 1 on their own). One carry serves both
  // reagent and gap crossings since gap cost is exactly double reagent cost.
  //
  // `pessimistic` rounds a crossing's cost up rather than to the nearest
  // unit — see `computeReaction`'s doc comment. Only the internal baseline
  // probe sets it; a real casting still rounds to nearest here exactly as
  // before.
  let transitCarry = 0

  function baseTransitCost(slotIndex: number): number {
    const occupant = byIndex.get(slotIndex)
    const stated = !occupant
      ? TRANSIT_LOSS_GAP
      : isRelay(occupant)
        ? TRANSIT_LOSS_RELAY
        : TRANSIT_LOSS_REAGENT
    const exact = stated * TRANSIT_POWER[level] * transitFactor
    if (exact <= 0) return 0
    const owed = exact + transitCarry
    const charged = Math.max(0, (pessimistic ? Math.ceil : Math.round)(owed))
    transitCarry = owed - charged
    return charged
  }

  function dropSpentParcels(): void {
    for (let i = parcels.length - 1; i >= 0; i--) {
      if (parcels[i].amount <= 0) parcels.splice(i, 1)
    }
  }

  /**
   * The slot a crossing is aimed at: itself if occupied, otherwise the next
   * occupied slot round the ring. A hole is never a destination — the cost of
   * leaping it is charged to the reagent it's heading toward.
   */
  function destinationOf(slotIndex: number): number {
    let target = slotIndex
    for (let step = 0; step < RING_SLOT_COUNT && !byIndex.has(target); step++) {
      target = (target + 1) % RING_SLOT_COUNT
    }
    return target
  }

  /**
   * Moves the current into the given slot, dimming it by what that slot costs
   * to cross. The cost is flat against the current as a whole — not per
   * parcel, not per currency — so it depends only on the shape of the ring,
   * never on how many currencies it carries.
   *
   * The destination's own demand pays first (`spend`), charged oldest parcel
   * first, so a chain pays its own way. What the destination didn't ask for
   * falls to every parcel still in flight, in proportion to what each
   * carries (`spendProportional`) — the fallback is never waived, only
   * reassigned, or an undemanded slot or a source with no demand would cross
   * for free. `Parcel.debt` banks each parcel's unrounded proportional share
   * so a parcel too small to round up on any one crossing still pays once
   * enough crossings accumulate its due.
   */
  function crossInto(slotIndex: number): void {
    let remaining = baseTransitCost(slotIndex)
    if (remaining <= 0) return

    const wanted = demandsBySlot.get(destinationOf(slotIndex))

    // What the destination demands, oldest parcel first.
    const spend = (payable: (currency: Currency) => boolean): void => {
      for (let i = 0; i < parcels.length && remaining > 0; i++) {
        const parcel = parcels[i]
        if (!payable(parcel.currency)) continue
        const lost = Math.min(remaining, parcel.amount)
        parcel.amount -= lost
        remaining -= lost
        addToLedger(bled, parcel.currency, lost)
      }
    }

    // What's left unpaid, split across every parcel in flight in proportion to
    // what it carries, with each parcel's unrounded share banked as debt. The
    // total taken must equal `spend` exactly, so surplus/shortfall from rounding
    // is resolved by raising the most-overdue parcels or deferring the least.
    const spendProportional = (): void => {
      if (remaining <= 0) return
      const total = parcels.reduce((sum, parcel) => sum + parcel.amount, 0)
      if (total <= 0) return
      const spend = Math.min(remaining, total)

      const entries = parcels.map((parcel) => {
        const owed = parcel.debt + (parcel.amount * spend) / total
        const due = Math.max(0, Math.min(parcel.amount, Math.floor(owed)))
        return { parcel, owed, due }
      })

      let outstanding = spend - entries.reduce((sum, entry) => sum + entry.due, 0)

      // More is due this crossing than its toll covers: raise the most overdue
      // parcels first, one unit at a time, until the toll is exactly matched.
      while (outstanding > 0) {
        let next: (typeof entries)[number] | undefined
        for (const entry of entries) {
          if (entry.due >= entry.parcel.amount) continue
          if (!next || entry.owed - entry.due > next.owed - next.due) next = entry
        }
        if (!next) break
        next.due++
        outstanding--
      }

      // Debt matured on more parcels than the toll can pay out this crossing:
      // defer whichever are least overdue, and their debt simply carries on.
      while (outstanding < 0) {
        let next: (typeof entries)[number] | undefined
        for (const entry of entries) {
          if (entry.due <= 0) continue
          if (!next || entry.owed - entry.due < next.owed - next.due) next = entry
        }
        if (!next) break
        next.due--
        outstanding++
      }

      for (const entry of entries) {
        entry.parcel.amount -= entry.due
        entry.parcel.debt = entry.owed - entry.due
        if (entry.due > 0) addToLedger(bled, entry.parcel.currency, entry.due)
      }
      remaining -= spend
    }

    spend((currency) => (wanted?.[currency] ?? 0) > 0)
    spendProportional()

    dropSpentParcels()
  }

  /**
   * A reagent's yield cut to the share of its demand the ring actually met.
   * One ratio over the whole ledger, not per currency. Rounded down so a
   * measured reagent never gives back more than it earned.
   */
  function inMeasure(yields: Ledger, fed: number, wanted: number): Ledger {
    const scaled: Ledger = {}
    for (const [currency, amount] of ledgerEntries(yields)) {
      addToLedger(scaled, currency, Math.floor((amount * fed) / wanted))
    }
    return scaled
  }

  /** Draws up to `want` of a currency, oldest parcel first. */
  function draw(currency: Currency, want: number): number {
    let taken = 0
    for (let i = 0; i < parcels.length && taken < want; i++) {
      const parcel = parcels[i]
      if (parcel.currency !== currency) continue
      const amount = Math.min(parcel.amount, want - taken)
      parcel.amount -= amount
      taken += amount
    }
    dropSpentParcels()
    return taken
  }

  /** Repays whatever a slot is still owed, out of current that has come round. */
  function repay(report: SlotReport): void {
    for (const [currency, missing] of ledgerEntries(report.shortfall)) {
      const got = draw(currency, missing)
      if (got === 0) continue
      addToLedger(report.received, currency, got)
      const left = missing - got
      if (left > 0) report.shortfall[currency] = left
      else delete report.shortfall[currency]
    }
  }

  /**
   * Puts a slot's yields into the current. The underfed rule is already
   * settled by the caller: a crediting form passes the full catalog yield, a
   * measuring one passes the share `inMeasure` cut down to. Slot I is called
   * again after the ring closes, for what the closing lap earned it.
   */
  function release(report: SlotReport, yields: Ledger): void {
    for (const [currency, amount] of ledgerEntries(yields)) {
      if (amount <= 0) continue
      addToLedger(report.released, currency, amount)
      parcels.push({ currency, amount, debt: 0 })
    }
  }

  /** A measured slot's yield and demand, for slot I to be re-measured against
   * once the closing lap repays it. Only slot I is ever read back out. */
  const measured = new Map<number, { yields: Ledger; wanted: number }>()

  /** What the current parcels amount to right now, by currency — a snapshot for `carrying`. */
  function heldLedger(): Ledger {
    const ledger: Ledger = {}
    for (const parcel of parcels) addToLedger(ledger, parcel.currency, parcel.amount)
    return ledger
  }

  const carrying: Ledger[] = []

  // One lap, clockwise from slot I. Every reagent resolves the same way,
  // relays included — `baseTransitCost` is the only place that asks.
  for (let slotIndex = 0; slotIndex < RING_SLOT_COUNT; slotIndex++) {
    if (slotIndex > 0) crossInto(slotIndex)

    const component = byIndex.get(slotIndex)
    if (!component) {
      carrying.push(heldLedger())
      continue
    }

    const demands = demandsBySlot.get(slotIndex) ?? {}
    const yields = yieldForCaster(component.yields)

    const report: SlotReport = {
      slotIndex,
      received: {},
      shortfall: {},
      released: {},
      measured: false,
    }
    reports.set(slotIndex, report)

    for (const [currency, want] of ledgerEntries(demands)) {
      const got = draw(currency, want)
      addToLedger(report.received, currency, got)
      addToLedger(report.shortfall, currency, want - got)
    }

    // The only branch in the walk the form controls: measure releases the fed
    // share and charges nothing, credit releases everything and bills the rest.
    const wanted = ledgerTotal(demands)
    const fed = wanted - ledgerTotal(report.shortfall)
    if (underfed === 'measure' && wanted > 0 && fed < wanted) {
      report.measured = true
      measured.set(slotIndex, { yields, wanted })
      release(report, inMeasure(yields, fed, wanted))
    } else {
      release(report, yields)
    }
    carrying.push(heldLedger())
  }

  // Closing the ring: the current crosses from the last slot back to the first.
  crossInto(0)

  // Slot I fires before anything can feed it, so closing the ring gives it one
  // chance to be repaid out of what came round.
  const first = reports.get(0)
  if (first) {
    repay(first)

    // Under a measuring form, that repayment raises slot I's fed share, so it
    // releases the difference now rather than staying measured at its
    // original, pre-repayment share.
    const deferred = measured.get(0)
    if (first.measured && deferred) {
      const fed = deferred.wanted - ledgerTotal(first.shortfall)
      const earned = inMeasure(deferred.yields, fed, deferred.wanted)
      const extra: Ledger = {}
      for (const [currency, amount] of ledgerEntries(earned)) {
        addToLedger(extra, currency, amount - (first.released[currency] ?? 0))
      }
      release(first, extra)
      if (fed >= deferred.wanted) first.measured = false
    }
  }

  // An open slot spills current on its way to the mouth. What's delivered is
  // the held ledger scaled by `completion`; the remainder counts as bled.
  const held: Ledger = {}
  for (const parcel of parcels) addToLedger(held, parcel.currency, parcel.amount)

  // Spared entirely if the condition was met, squared if it wasn't, untouched
  // if the form asks nothing.
  const completion = completionFactor(placements.length, relief.spill)

  // Apportioned across currencies by largest remainder, not by rounding each
  // one on its own — rounding per currency compounds with the ring's width
  // (law 4 is about closure, not width). This holds the error to half a unit
  // total and keeps manifestation + bled equal to what was held.
  const shares = ledgerEntries(held).map(([currency, amount]) => {
    const exact = amount * completion
    const whole = Math.floor(exact)
    return { currency, amount, whole, remainder: exact - whole }
  })

  const target = Math.round(ledgerTotal(held) * completion)
  let assigned = shares.reduce((sum, share) => sum + share.whole, 0)

  // Largest fractional part first. `sort` is stable, so currencies that tie are
  // settled in CURRENCIES order and a given ring always resolves the same way.
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder)) {
    if (assigned >= target) break
    share.whole++
    assigned++
  }

  const manifestation: Ledger = {}
  for (const share of shares) {
    if (share.whole > 0) manifestation[share.currency] = share.whole
    addToLedger(bled, share.currency, share.amount - share.whole)
  }

  // Unmet demand, charged to the caster — the whole of the toll. A measuring
  // form charges nothing here since it already took the difference out of the
  // yield; `sim/balance.ts` asserts this resolves to zero for every ring.
  if (underfed === 'credit') {
    for (const report of reports.values()) {
      for (const [currency, amount] of ledgerEntries(report.shortfall)) {
        addToLedger(toll, currency, amount)
      }
    }
  }

  return {
    form,
    conditionMet: relief.met,
    filled: placements.length,
    completion,
    slots: [...reports.values()].sort((a, b) => a.slotIndex - b.slotIndex),
    carrying,
    manifestation,
    toll,
    bled,
    manifestationTotal: ledgerTotal(manifestation),
    tollTotal: ledgerTotal(toll),
    bledTotal: ledgerTotal(bled),
  }
}

/** Resolves a spell's slot ids into placements, skipping empty and dangling slots. */
export function resolvePlacements(
  slots: (string | null)[],
  componentsById: Map<string, MaterialComponent>,
): Placement[] {
  const placements: Placement[] = []
  slots.forEach((id, slotIndex) => {
    if (!id) return
    const component = componentsById.get(id)
    if (component) placements.push({ slotIndex, component })
  })
  return placements
}
