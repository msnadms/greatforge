import { isRelay } from '../data/currencies'
import { FORM_META, conditionRelief } from '../data/spellForms'
import {
  RING_SLOT_COUNT,
  TRANSIT_LOSS_GAP,
  TRANSIT_LOSS_RELAY,
  TRANSIT_LOSS_REAGENT,
  addToLedger,
  completionFactor,
  ledgerEntries,
  ledgerTotal,
  normalizeLedger,
  transitScale,
  type Currency,
  type Ledger,
  type MaterialComponent,
  type Placement,
  type SpellForm,
} from '../types/worldbuilding'

/** Current that reached one slot from another. Drawn as an arc along the ring. */
export interface Transfer {
  currency: Currency
  /** Slot that released it. */
  from: number
  /** Slot that consumed it. */
  to: number
  /** Amount that arrived, after transit loss. */
  amount: number
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
  transfers: Transfer[]
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
  /** Slot that released it, for attributing transfers. */
  from: number
  amount: number
}

function emptyReaction(form: SpellForm): Reaction {
  return {
    form,
    // Asked rather than restated: `conditionRelief` owns what a cold circle counts
    // as, and it answers `null` for one — no reagent has been placed, so there is
    // no verdict to give and nothing has been spared or doubled.
    conditionMet: conditionRelief(form, []).met,
    filled: 0,
    completion: 0,
    slots: [],
    transfers: [],
    manifestation: {},
    toll: {},
    bled: {},
    manifestationTotal: 0,
    tollTotal: 0,
    bledTotal: 0,
  }
}

/**
 * Walks the ring once clockwise from slot I and closes it, resolving every
 * demand against the current in flight.
 *
 * Pure — no React, no storage. The rules it implements are the laws in
 * `data/currencies.ts`, and they are the whole magic system:
 *
 *  - A slot's demands are drawn from current released *upstream* of it, oldest
 *    parcel first, so the current that has travelled furthest is spent before it
 *    decays away entirely.
 *  - Crossing into a slot dissipates a flat amount of whatever is in flight — two
 *    units to leap a gap, one across a reagent, nothing through a relay. One or two
 *    units in total, not per currency and not per parcel, so the price of a lap is
 *    the length of the walk and the number of holes in it, and never the number of
 *    currencies the ring happens to be carrying. It is charged to the current the
 *    slot ahead asked for, and only what that cannot cover falls on the oldest
 *    current in flight.
 *  - Under a crediting form a slot releases its whole yield whether or not the ring
 *    met its demands, and the difference comes out of the caster. Under a measuring
 *    form it releases the share of that yield the ring fed it, and nothing is
 *    charged to anyone. Neither rule has an exception for relays — a relay is an
 *    ordinary reagent that happens to be free to cross, and it is asked, billed and
 *    counted like any other.
 *  - Slot I fires before anything can feed it, so its shortfall is provisional:
 *    closing the ring gives it one chance to be repaid by what came round.
 *  - Whatever is still in flight when the ring closes leaves it. That is the
 *    manifestation.
 *  - Unmet demand is the only thing the caster is ever charged for, and a measuring
 *    form does not charge even that.
 *
 * **`form` is an input.** It decides the underfed rule above, and its condition
 * spares or doubles one of the two losses — what a crossing costs, or what leaks
 * out of the holes at the mouth. It can do nothing else, and in particular it can
 * never add: every setting either lets a loss stand, removes it, or deepens it, so
 * the first law holds under all seven. See `data/spellForms.ts`.
 */
export function computeReaction(placements: Placement[], form: SpellForm): Reaction {
  if (placements.length === 0) return emptyReaction(form)

  const { underfed } = FORM_META[form]
  const relief = conditionRelief(form, placements)
  const transitFactor = transitScale(relief.transit)

  const byIndex = new Map(placements.map((p) => [p.slotIndex, p.component]))
  /** Normalized demands, keyed by slot. The walk asks for these, and so does `crossInto`. */
  const demandsBySlot = new Map(
    placements.map((p) => [p.slotIndex, normalizeLedger(p.component.demands)]),
  )
  const parcels: Parcel[] = []
  const transfers: Transfer[] = []
  const reports = new Map<number, SlotReport>()
  const bled: Ledger = {}
  const toll: Ledger = {}

  /**
   * What the current pays to cross into a slot: two units to leap a gap, one
   * across a reagent, nothing at all through a relay — all of it scaled by the
   * form, which may spare the crossing entirely or charge twice for it.
   *
   * The relay is unaffected by that scaling, because nothing times anything is
   * still nothing. Under a form sparing the transit a relay is simply an ordinary
   * reagent, which is the honest reading: its whole worth is a crossing that costs
   * nothing, and on that ring no crossing costs anything.
   *
   * The free crossing is unconditional, and it is the *only* thing that makes a
   * relay a relay. In every other respect it is an ordinary reagent: it is asked for
   * its demands, billed in full for what the ring could not give it, it releases
   * its whole yield, and it closes its slot like anything else standing in the
   * ring.
   *
   * It costs nothing wherever it stands, including with holes on both sides. A
   * relay reached across a gap costs the gap's two and no more, where an ordinary
   * reagent in the same slot would cost three — the hole is charged as the hole it
   * is, and the relay adds nothing on top of it. What stops that being free profit
   * is that the relay is billed for its own unmet demand like anything else; see
   * the walk below, which has no relay branch in it.
   */
  function baseTransitCost(slotIndex: number): number {
    const occupant = byIndex.get(slotIndex)
    const stated = !occupant
      ? TRANSIT_LOSS_GAP
      : isRelay(occupant)
        ? TRANSIT_LOSS_RELAY
        : TRANSIT_LOSS_REAGENT
    return stated * transitFactor
  }

  function dropSpentParcels(): void {
    for (let i = parcels.length - 1; i >= 0; i--) {
      if (parcels[i].amount <= 0) parcels.splice(i, 1)
    }
  }

  /**
   * The slot a crossing is aimed at: the slot itself when something stands there,
   * and otherwise the next occupied slot round the ring.
   *
   * A hole is not a destination. Current leaping a gap is on its way somewhere, and
   * what it costs to get there is charged to the reagent it is going to — which is
   * what lets three crossings over two holes be paid by the one reagent waiting at
   * the end of them.
   */
  function destinationOf(slotIndex: number): number {
    let target = slotIndex
    for (let step = 0; step < RING_SLOT_COUNT && !byIndex.has(target); step++) {
      target = (target + 1) % RING_SLOT_COUNT
    }
    return target
  }

  /**
   * Moves the current into the given slot, dimming it by what that slot costs to
   * cross: two units to leap a gap, one across an ordinary reagent, nothing through
   * a relay.
   *
   * That is a flat cost against the current as a whole, not a cost per parcel and
   * not a cost per currency. A crossing dissipates the same one or two units
   * whether the ring is carrying one currency or five, so loss is a property of
   * the distance travelled and of the shape of the ring, and of nothing else — a
   * broad spell is no dearer to run than a narrow one.
   *
   * **The current the destination asked for pays first.** A crossing is charged to
   * what it is carrying to that slot, so a chain pays its own way and unrelated
   * current standing in the ring cannot pay for it.
   *
   * Billing the oldest parcel first — the rule until August 2026 — made an arc's
   * loss depend on a reagent with nothing to do with it. A source at slot I is the
   * oldest current for the whole lap, so it absorbed every crossing until it was
   * spent and everything downstream travelled free: 7 heat crossed two holes and a
   * reagent intact, where the same ring without the source delivered 2. It read as
   * a bug in the app, because on the circle it is one — the arc says 7 and the five
   * units are bled somewhere else, under another currency.
   *
   * **What the destination did not ask for pays the remainder, oldest first.** The
   * cost is never waived, only reassigned: a slot whose demand is not in flight,
   * and a source that demands nothing at all, still cost what they cost. Without
   * that fallback a lone source rides the whole ring untouched, which is the same
   * bug from the other side.
   */
  function crossInto(slotIndex: number): void {
    let remaining = baseTransitCost(slotIndex)
    if (remaining <= 0) return

    const wanted = demandsBySlot.get(destinationOf(slotIndex))

    // Two passes over the same parcels, oldest first within each: what the
    // destination demands, then everything else for whatever is left unpaid.
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

    spend((currency) => (wanted?.[currency] ?? 0) > 0)
    spend(() => true)

    dropSpentParcels()
  }

  /**
   * A reagent's yield cut to the share of its demand the ring actually met.
   *
   * One ratio over the whole ledger rather than one per currency, matching how
   * transit is charged: what a reagent gives back is a fact about how well it was
   * fed, not about which of its demands happened to go unmet. Rounded down, so a
   * measured reagent can never give back more than the share it earned and the
   * first law cannot be broken by rounding.
   */
  function inMeasure(yields: Ledger, fed: number, wanted: number): Ledger {
    const scaled: Ledger = {}
    for (const [currency, amount] of ledgerEntries(yields)) {
      addToLedger(scaled, currency, Math.floor((amount * fed) / wanted))
    }
    return scaled
  }

  /** Draws up to `want` of a currency for slot `to`, oldest parcel first. */
  function draw(to: number, currency: Currency, want: number): number {
    let taken = 0
    for (let i = 0; i < parcels.length && taken < want; i++) {
      const parcel = parcels[i]
      if (parcel.currency !== currency) continue
      const amount = Math.min(parcel.amount, want - taken)
      parcel.amount -= amount
      taken += amount
      transfers.push({ currency, from: parcel.from, to, amount })
    }
    dropSpentParcels()
    return taken
  }

  /** Repays whatever a slot is still owed, out of current that has come round. */
  function repay(report: SlotReport): void {
    for (const [currency, missing] of ledgerEntries(report.shortfall)) {
      const got = draw(report.slotIndex, currency, missing)
      if (got === 0) continue
      addToLedger(report.received, currency, got)
      const left = missing - got
      if (left > 0) report.shortfall[currency] = left
      else delete report.shortfall[currency]
    }
  }

  /**
   * Puts a slot's yields into the current, whatever the caller decided those are.
   *
   * Every reagent reaches here, and the underfed rule is settled before it does: a
   * crediting form passes the whole catalog yield and bills the difference to the
   * caster, a measuring one passes the share `inMeasure` cut it down to. Slot I
   * comes back a second time, for the part the closing lap earned it.
   */
  function release(report: SlotReport, yields: Ledger): void {
    for (const [currency, amount] of ledgerEntries(yields)) {
      if (amount <= 0) continue
      addToLedger(report.released, currency, amount)
      parcels.push({ currency, from: report.slotIndex, amount })
    }
  }

  /**
   * What a measured slot would have released had the ring fed it in full, with the
   * demand it was measured against. Only slot I is ever read back out — every other
   * slot has had its one chance by the time the walk moves on — but it is keyed by
   * slot so the rule reads as the general one it is rather than as a special case
   * bolted to the front of the ring.
   */
  const measured = new Map<number, { yields: Ledger; wanted: number }>()

  // The walk: one lap, clockwise from slot I. Every reagent is resolved the same
  // way, relays included — the free crossing in `baseTransitCost` is the only
  // thing in the resolver that knows what a relay is.
  for (let slotIndex = 0; slotIndex < RING_SLOT_COUNT; slotIndex++) {
    if (slotIndex > 0) crossInto(slotIndex)

    const component = byIndex.get(slotIndex)
    if (!component) continue

    const demands = demandsBySlot.get(slotIndex) ?? {}
    const yields = normalizeLedger(component.yields)

    const report: SlotReport = {
      slotIndex,
      received: {},
      shortfall: {},
      released: {},
      measured: false,
    }
    reports.set(slotIndex, report)

    for (const [currency, want] of ledgerEntries(demands)) {
      const got = draw(slotIndex, currency, want)
      addToLedger(report.received, currency, got)
      addToLedger(report.shortfall, currency, want - got)
    }

    // The underfed rule, and the only branch in the walk the form is responsible
    // for. Under a measuring form a reagent gives back the share of its yield that
    // the ring fed it and the caster is charged nothing; under a crediting form it
    // gives back all of it and the caster covers the difference.
    const wanted = ledgerTotal(demands)
    const fed = wanted - ledgerTotal(report.shortfall)
    if (underfed === 'measure' && wanted > 0 && fed < wanted) {
      report.measured = true
      measured.set(slotIndex, { yields, wanted })
      release(report, inMeasure(yields, fed, wanted))
    } else {
      release(report, yields)
    }
  }

  // Closing the ring: the current crosses from the last slot back to the first.
  crossInto(0)

  // Slot I fires before anything can feed it, so closing the ring gives it one
  // chance to be repaid out of what came round.
  const first = reports.get(0)
  if (first) {
    repay(first)

    /*
     * And under a measuring form that repayment earns slot I more of its yield.
     * Slot I is the one slot the ring can feed after the fact, so its measure is
     * provisional: whatever came round raises the share it was fed, and it releases
     * the difference now, standing at the mouth, without crossing anything.
     *
     * Without this a repaid slot I would sit there fed and still stinted, which
     * reads as a bug rather than a rule. With it, a measuring form wants something
     * *hungry* at slot I rather than the source every other form opens with — the
     * reagent that cannot survive the lap is exactly the one that does not have to
     * walk it. It is bounded by what one reagent can carry, and it is paid for out
     * of the manifestation, since feeding slot I is what the ring spent its lap
     * doing.
     */
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

  // An open slot is a hole in the circle, and current spills out of a hole on its
  // way to the mouth. What the ring still holds is delivered in the proportion the
  // ring was closed; the remainder is counted as bled rather than quietly dropped,
  // so the ledger still balances against what the reagents released.
  const held: Ledger = {}
  for (const parcel of parcels) addToLedger(held, parcel.currency, parcel.amount)

  // The spill, under whatever relief the form's condition earned: untouched for a
  // form that asks nothing, waived entirely for a ring that met what it asked, and
  // squared for one that did not.
  const completion = completionFactor(placements.length, relief.spill)

  /*
   * The share is apportioned across the currencies by largest remainder, not by
   * rounding each one on its own.
   *
   * Rounding per currency rounds half *up* once per currency in flight, so a ring
   * carrying five delivered up to two and a half units more than the share the
   * fourth law states — and the overshoot grew with the ring's width, which is
   * exactly the wrong axis for a rule about how closed the ring is. A four-reagent
   * ring holding 3/5/5/5/5 delivered 14 where half is 11.5.
   *
   * Rounding the total once and handing the leftover units to the largest
   * fractional parts keeps the error at half a unit for the whole ring however
   * many currencies it carries, and keeps `manifestation + bled` equal to what was
   * held, so law 1 still balances to the unit.
   */
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

  // Unmet demand, charged to the caster. This is the whole of the toll: nothing
  // else in the system bills the body, so a circle that feeds every reagent it
  // holds costs the caster nothing at all.
  //
  // A measuring form charges nothing at all, and does not need to: it took the
  // difference out of the yield instead. That holds for every slot and every ring,
  // so the three measuring forms resolve to a toll of exactly zero always, which
  // `sim/balance.ts` asserts rather than reports.
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
    transfers: mergeTransfers(transfers),
    manifestation,
    toll,
    bled,
    manifestationTotal: ledgerTotal(manifestation),
    tollTotal: ledgerTotal(toll),
    bledTotal: ledgerTotal(bled),
  }
}

/** Collapses repeated draws on the same parcel run into one arc per from/to/currency. */
function mergeTransfers(transfers: Transfer[]): Transfer[] {
  const merged = new Map<string, Transfer>()
  for (const transfer of transfers) {
    const key = `${transfer.from}>${transfer.to}:${transfer.currency}`
    const existing = merged.get(key)
    if (existing) existing.amount += transfer.amount
    else merged.set(key, { ...transfer })
  }
  return [...merged.values()]
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
