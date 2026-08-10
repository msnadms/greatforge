import { isRelay } from '../data/currencies'
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
  type Currency,
  type Ledger,
  type MaterialComponent,
} from '../types/worldbuilding'

/** A placed component together with the slot it occupies. */
export interface Placement {
  slotIndex: number
  component: MaterialComponent
}

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
  /** Demand the ring could not meet. Paid out of the caster. */
  shortfall: Ledger
  /** What it released once it fired. */
  released: Ledger
}

export interface Reaction {
  filled: number
  /**
   * Share of what the ring held that reached the mouth, from `completionFactor`.
   * 1 for a full ring; below that, the difference spilled out of the empty slots
   * and is included in `bled`.
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

function emptyReaction(): Reaction {
  return {
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
 *    units to leap a gap, one across a reagent, nothing through a relay — taken off
 *    the oldest current first. One or two units in total, not per currency and not
 *    per parcel, so the price of a lap is the length of the walk and the number of
 *    holes in it, and never the number of currencies the ring happens to be
 *    carrying.
 *  - A slot releases its yields whether or not the ring met its demands; the
 *    difference simply comes out of the caster. There are no exceptions to this,
 *    relays included — a relay is an ordinary reagent that happens to be free to
 *    cross, and it is asked, billed and counted like any other.
 *  - Slot I fires before anything can feed it, so its shortfall is provisional:
 *    closing the ring gives it one chance to be repaid by what came round.
 *  - Whatever is still in flight when the ring closes leaves it. That is the
 *    manifestation.
 *  - Unmet demand is the only thing the caster is ever charged for.
 *
 * `Spell.form` is **not** an input here. The seven forms are the manner a working
 * is spoken in and nothing else — the same reagents in the same slots resolve to the
 * same numbers under all seven. See `data/spellForms.ts`.
 */
export function computeReaction(placements: Placement[]): Reaction {
  if (placements.length === 0) return emptyReaction()

  const byIndex = new Map(placements.map((p) => [p.slotIndex, p.component]))
  const parcels: Parcel[] = []
  const transfers: Transfer[] = []
  const reports = new Map<number, SlotReport>()
  const bled: Ledger = {}
  const toll: Ledger = {}

  /**
   * What the current pays to cross into a slot: two units to leap a gap, one
   * across a reagent, nothing at all through a relay.
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
    if (!occupant) return TRANSIT_LOSS_GAP
    return isRelay(occupant) ? TRANSIT_LOSS_RELAY : TRANSIT_LOSS_REAGENT
  }

  function dropSpentParcels(): void {
    for (let i = parcels.length - 1; i >= 0; i--) {
      if (parcels[i].amount <= 0) parcels.splice(i, 1)
    }
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
   * The loss comes off the oldest parcels first, so current already near the end
   * of its reach dies before fresh current is touched. That is what makes a small
   * yield released early useful rather than wasted: a cheap reagent at the front of
   * the ring is eaten in place of a dear one behind it.
   */
  function crossInto(slotIndex: number): void {
    let remaining = baseTransitCost(slotIndex)
    if (remaining <= 0) return

    for (let i = 0; i < parcels.length && remaining > 0; i++) {
      const parcel = parcels[i]
      const lost = Math.min(remaining, parcel.amount)
      parcel.amount -= lost
      remaining -= lost
      addToLedger(bled, parcel.currency, lost)
    }

    dropSpentParcels()
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
   * Puts a slot's yields into the current. Every reagent fires for its full yield
   * whether the ring fed it or not; the difference has already been charged to the
   * caster as shortfall.
   */
  function release(report: SlotReport, yields: Ledger): void {
    for (const [currency, amount] of ledgerEntries(yields)) {
      if (amount <= 0) continue
      addToLedger(report.released, currency, amount)
      parcels.push({ currency, from: report.slotIndex, amount })
    }
  }

  // The walk: one lap, clockwise from slot I. Every reagent is resolved the same
  // way, relays included — the free crossing in `baseTransitCost` is the only
  // thing in the resolver that knows what a relay is.
  for (let slotIndex = 0; slotIndex < RING_SLOT_COUNT; slotIndex++) {
    if (slotIndex > 0) crossInto(slotIndex)

    const component = byIndex.get(slotIndex)
    if (!component) continue

    const demands = normalizeLedger(component.demands)
    const yields = normalizeLedger(component.yields)

    const report: SlotReport = { slotIndex, received: {}, shortfall: {}, released: {} }
    reports.set(slotIndex, report)

    for (const [currency, want] of ledgerEntries(demands)) {
      const got = draw(slotIndex, currency, want)
      addToLedger(report.received, currency, got)
      addToLedger(report.shortfall, currency, want - got)
    }

    release(report, yields)
  }

  // Closing the ring: the current crosses from the last slot back to the first.
  crossInto(0)

  // Slot I fires before anything can feed it, so closing the ring gives it one
  // chance to be repaid out of what came round.
  const first = reports.get(0)
  if (first) repay(first)

  // An open slot is a hole in the circle, and current spills out of a hole on its
  // way to the mouth. What the ring still holds is delivered in the proportion the
  // ring was closed; the remainder is counted as bled rather than quietly dropped,
  // so the ledger still balances against what the reagents released.
  const held: Ledger = {}
  for (const parcel of parcels) addToLedger(held, parcel.currency, parcel.amount)

  const completion = completionFactor(placements.length)

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
  for (const report of reports.values()) {
    for (const [currency, amount] of ledgerEntries(report.shortfall)) {
      addToLedger(toll, currency, amount)
    }
  }

  return {
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
