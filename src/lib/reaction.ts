import { isRelay } from '../data/currencies'
import { FORM_META, namedCurrency } from '../data/spellForms'
import {
  BEND_TOLL,
  CURRENCIES,
  DIRGE_KEPT_SHARE,
  DIRGE_SUBSTITUTION_RATE,
  PRAYER_WALKING_SHARE,
  RING_SLOT_COUNT,
  TRANSIT_FUSED,
  TRANSIT_LOSS_GAP,
  TRANSIT_LOSS_RELAY,
  TRANSIT_LOSS_STONE,
  WARD_HOLD_RATE,
  addToLedger,
  completionFactor,
  ledgerEntries,
  ledgerTotal,
  normalizeLedger,
  type Currency,
  type Ledger,
  type MaterialComponent,
  type SpellForm,
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
  /**
   * What the ring delivered against this slot's demands. In a dirge this may be
   * in a currency the slot never asked for — that is what actually arrived. In a
   * litany it is the sum of both firings.
   */
  received: Ledger
  /** Demand the ring could not meet. Paid out of the caster, in every form. */
  shortfall: Ledger
  /**
   * What it released once it fired, over every firing — so a litany's two, and a
   * prayer's two halves at the opening stone.
   */
  released: Ledger
}

export interface Reaction {
  form: SpellForm
  /** The currency an invocation named, null in every other form. */
  named: Currency | null
  filled: number
  /**
   * Share of what the ring held that reached the mouth, from `completionFactor`.
   * 1 for a full ring; below that, the difference spilled out of the empty slots
   * and is included in `bled`. The ward is the only form that touches this: it
   * seals its gaps, so it reads 1 at any count of stones.
   */
  completion: number
  /** Reports for filled slots only, in slot order. */
  slots: SlotReport[]
  transfers: Transfer[]
  /** Surplus that escaped the ring — what the spell actually does. */
  manifestation: Ledger
  /**
   * What the casting costs the caster: every unmet demand, plus whatever else the
   * form bills. A ward adds what it held in at the mouth, at `WARD_HOLD_RATE` for
   * one, and every form adds `BEND_TOLL` per currency the ring raised for the
   * speaking itself.
   */
  toll: Ledger
  /** Lost to transit and never claimed. The circle's inefficiency, as noise and glow. */
  bled: Ledger
  manifestationTotal: number
  tollTotal: number
  bledTotal: number
}

/**
 * What the current pays to cross into a slot, before the form scales it. Nothing
 * through a relay, one through any other stone, two to leap a gap.
 *
 * A relay is therefore free to cross but contributes nothing, so it pays for its
 * slot only where the crossing is worth more than the stone displaced. Slot I is
 * where that is reliably true: it is crossed exactly once, on the closing step,
 * when every currency the ring has raised is in flight at once.
 */
function baseTransitCost(occupant: MaterialComponent | undefined): number {
  if (!occupant) return TRANSIT_LOSS_GAP
  return isRelay(occupant) ? TRANSIT_LOSS_RELAY : TRANSIT_LOSS_STONE
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
    named: null,
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
 *  - Crossing into a slot costs the current what that slot is made of — nothing
 *    through a relay, one through any other stone, two to leap a gap — charged once
 *    per currency. Charging per currency rather than per unit is what makes a
 *    broad spell expensive and a narrow one cheap, and it is also why a small
 *    yield released early is not waste: loss lands on the oldest parcel first, so
 *    a cheap stone at the front of the ring is eaten in place of a dear one
 *    behind it. Slot I is usually spent on exactly that, or on a relay.
 *  - A slot releases its yields whether or not the ring met its demands; the
 *    difference simply comes out of the caster. Relays are the exception: their
 *    demand is a rating, so one carries what it was given and never bills for the
 *    shortfall.
 *  - Slot I fires before anything can feed it, so its shortfall is provisional:
 *    closing the ring gives it one chance to be repaid by what came round.
 *  - Whatever is still in flight when the ring closes leaves it. That is the
 *    manifestation.
 *
 * Every form bends exactly one of those, per `data/spellForms.ts` — the prayer
 * included, since a form that bent nothing would be free. Each branch below reads
 * as "and here is where the form departs from the paragraph above". The speaking
 * is itself charged, once, at the end, at the same price in every form: see
 * `BEND_TOLL`.
 */
export function computeReaction(placements: Placement[], form: SpellForm = 'prayer'): Reaction {
  if (placements.length === 0) return emptyReaction(form)

  const rules = FORM_META[form]
  const named =
    rules.transit === 'named' ? namedCurrency(placements.map((p) => p.component)) : null

  const byIndex = new Map(placements.map((p) => [p.slotIndex, p.component]))
   /**
   * What a prayer is holding back: every measure given, by the slot that gave it,
   * released in one breath once the ring has closed. Empty in every other form.
   */
  const withheld = new Map<number, Ledger>()
  const parcels: Parcel[] = []
  const transfers: Transfer[] = []
  const reports = new Map<number, SlotReport>()
  const bled: Ledger = {}
  const toll: Ledger = {}
  /**
   * Current that has left the ring before the mouth. Only an elegy produces any:
   * it is what the next stone declined to take, and it leaves where it stood,
   * having paid a gap's worth of transit for the leaving.
   */
  const escaped: Ledger = {}

  /**
   * An invocation names one currency and pushes every other one away from it: the
   * named currency crosses at half loss, and the rest pay double to leap a gap.
   * Halving floors, so a named currency crosses a stone for nothing and only pays
   * at a gap — and a relay stays free either way, which keeps the relay rule intact
   * under every form.
   *
   * The penalty is charged at gaps and nowhere else, and that is the whole form.
   * Doubling every crossing costs each unnamed currency eight a lap, which is
   * exactly what naming saves on the named one: the invocation was then a loss at
   * two currencies and a rout at three, it owned no ring in the catalog at any
   * price, and it had been that way since it was written. Confined to the gaps, the
   * bargain is about the *shape* of the ring rather than its width — an invocation
   * is free on a closed circle and ruinous on a holed one, which makes it the
   * ward's opposite and gives it the one thing it never had, a ring it is for.
   */
  function transitCost(base: number, currency: Currency): number {
    if (named === null) return base
    if (currency === named) return Math.floor(base / 2)
    return base === TRANSIT_LOSS_GAP ? base * 2 : base
  }

  function inFlight(currency: Currency): number {
    let total = 0
    for (const parcel of parcels) if (parcel.currency === currency) total += parcel.amount
    return total
  }

  function dropSpentParcels(): void {
    for (let i = parcels.length - 1; i >= 0; i--) {
      if (parcels[i].amount <= 0) parcels.splice(i, 1)
    }
  }

  /**
   * Moves the current into the given slot, dimming it by what that slot costs to
   * cross.
   *
   * The cost is charged once per currency, not once per parcel: it is *the
   * current* that dims, however many stones happen to be feeding it. Charging each
   * parcel would mean a stone that consumed half a stream and re-emitted it made
   * the remainder evaporate twice as fast, which would punish every relay and
   * every partial draw. Within a currency the loss comes off the oldest parcels
   * first, so current already near the end of its reach dies before fresh current
   * is touched.
   *
   * A litany's second lap is charged at the ordinary rate, and that is most of
   * what it costs: a lap dims every currency in flight by eight, so walking one
   * more is a real price paid on everything the first lap raised.
   */
  function crossInto(slotIndex: number): void {
    const occupant = byIndex.get(slotIndex)
    const base = baseTransitCost(occupant)
    if (base <= 0) return

    // A benediction does not charge each currency separately; see `fuseCross`.
    if (rules.transit === 'fused') {
      fuseCross(base)
      return
    }

    // A ward is held at its thresholds: the caster stands in the open slot, so the
    // leap dims nothing. What that costs is settled at the close, against what the
    // hole would have taken — see the completion block.
    if (rules.gaps === 'sealed' && !occupant) return

    for (const currency of CURRENCIES) {
      const cost = transitCost(base, currency)
      if (cost <= 0) continue

      let remaining = cost
      for (let i = 0; i < parcels.length && remaining > 0; i++) {
        const parcel = parcels[i]
        if (parcel.currency !== currency) continue
        const lost = Math.min(remaining, parcel.amount)
        parcel.amount -= lost
        remaining -= lost
        addToLedger(bled, currency, lost)
      }
    }

    dropSpentParcels()
  }

  /**
   * A benediction's crossing. The current is carried as a single stream, so the
   * slot takes `TRANSIT_FUSED` units in total rather than one of every currency in
   * flight, and it takes them a unit at a time off whichever currency is largest.
   *
   * Both halves of that matter, and they are the same half of law 2. Charging once
   * for the stream rather than once per currency is what makes the benediction the
   * wide ring's form: five currencies cost five a crossing under every other form
   * and three under this one. Taking it off the largest is what makes the saving
   * land where the ring is thin — an ordinary crossing costs a flow of four the
   * same unit it costs a flow of forty, which is why the catalog's small flows are
   * erased before the mouth. Here they are the last thing touched.
   */
  function fuseCross(base: number): void {
    let remaining = base * TRANSIT_FUSED

    while (remaining > 0) {
      let heaviest: Currency | null = null
      let most = 0
      for (const currency of CURRENCIES) {
        const total = inFlight(currency)
        if (total > most) {
          most = total
          heaviest = currency
        }
      }
      // Nothing left in flight to dim. A benediction over an empty ring is free,
      // exactly as an ordinary crossing is.
      if (heaviest === null) break

      for (const parcel of parcels) {
        if (parcel.currency !== heaviest || parcel.amount <= 0) continue
        parcel.amount -= 1
        addToLedger(bled, heaviest, 1)
        break
      }
      remaining -= 1
    }

    dropSpentParcels()
  }

  /**
   * An elegy's current leaving the ring. Everything released before `beforeSlot`
   * has already been offered to the one stone that could take it, so it goes now,
   * paying a gap's worth of transit on the way out — leaving the circle is a leap
   * like any other, and the only one this form ever makes.
   *
   * That charge is the whole reason the elegy is a trade rather than a free lunch.
   * Without it the walk never calls `crossInto` at all: undrawn current piled up
   * across the ring and rode to the mouth having paid nothing, which waived law 2
   * for everything the stones did not eat and made the elegy the strongest form in
   * the book by a distance. With it, every unit an elegy raises pays exactly one
   * crossing — the receiving slot's if a stone drew it, this one if none did.
   */
  function escapeStale(beforeSlot: number): void {
    const sources = new Set<number>()
    for (const parcel of parcels) if (parcel.from < beforeSlot) sources.add(parcel.from)

    for (const from of [...sources].sort((a, b) => a - b)) {
      for (const currency of CURRENCIES) {
        let remaining = transitCost(TRANSIT_LOSS_GAP, currency)
        for (let i = 0; i < parcels.length && remaining > 0; i++) {
          const parcel = parcels[i]
          if (parcel.from !== from || parcel.currency !== currency) continue
          const lost = Math.min(remaining, parcel.amount)
          parcel.amount -= lost
          remaining -= lost
          addToLedger(bled, currency, lost)
        }
      }
      for (const parcel of parcels) {
        if (parcel.from !== from || parcel.amount <= 0) continue
        addToLedger(escaped, parcel.currency, parcel.amount)
        parcel.amount = 0
      }
      dropSpentParcels()
    }
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

  /**
   * An elegy never lets the current travel, so a slot pays its own crossing out of
   * what it draws rather than out of the whole stream. The first units across are
   * the toll of the crossing; the rest arrive.
   */
  function drawAcross(to: number, currency: Currency, want: number): number {
    const cost = transitCost(baseTransitCost(byIndex.get(to)), currency)
    const taken = draw(to, currency, want + cost)
    const lost = Math.min(cost, taken)
    if (lost > 0) addToLedger(bled, currency, lost)
    return taken - lost
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
   * A dirge is not particular, but it is wasteful. Demand the ring cannot meet in
   * kind is met out of whatever else is passing, at **two units of the wrong
   * currency for one of the right** — recorded under the currency actually
   * consumed, since that is what moved and the arc should say so.
   *
   * The rate is what keeps the dirge honest. At one for one it would be a strictly
   * better litany: broader, and without the second lap to pay for. At two for one
   * it buys toll relief with the manifestation at a real price, and it is worth it
   * only where the demand is in a currency nothing upstream produces at all —
   * which is the one thing no other form can answer.
   *
   * Whatever is left after this is still billed to the caster. No form waives the
   * toll; a dirge only changes what counts as the ring being unable to supply.
   */
  function substitute(report: SlotReport, budget: Ledger): void {
    if (rules.shortfall !== 'substituted') return
    for (const [currency, missing] of ledgerEntries(report.shortfall)) {
      let left = missing
      for (const other of CURRENCIES) {
        if (left <= 0) break
        if (other === currency) continue
        // Take only an even amount: an odd unit would be consumed for nothing,
        // and the ring should not burn current it cannot turn into anything.
        const affordable = Math.min(inFlight(other), budget[other] ?? 0)
        const covered = Math.min(left, Math.floor(affordable / DIRGE_SUBSTITUTION_RATE))
        if (covered <= 0) continue
        const got = draw(report.slotIndex, other, covered * DIRGE_SUBSTITUTION_RATE)
        addToLedger(report.received, other, got)
        budget[other] = (budget[other] ?? 0) - got
        left -= covered
      }
      if (left > 0) report.shortfall[currency] = left
      else delete report.shortfall[currency]
    }
  }

  /**
   * Puts a slot's yields into the current. Relays hand on only what they took —
   * `took` is what this firing drew, not the report's running total, so a litany's
   * second lap does not hand on the first lap's receipts a second time.
   *
   * `withhold`, when given, is the prayer's: one part in `PRAYER_WALKING_SHARE`
   * enters the current here and the rest is put aside for the close.
   */
  function release(
    report: SlotReport,
    took: Ledger,
    yields: Ledger,
    relay: boolean,
    withhold: Ledger | null,
  ): void {
    // A relay hands on what it actually took, capped by its yield so a lossy one
    // still loses. Everything else fires for its full yield whether the ring fed
    // it or not; the difference has already been charged as shortfall.
    const releasing = relay
      ? ledgerEntries(took).map(
          ([currency, got]) => [currency, Math.min(got, yields[currency] ?? 0)] as const,
        )
      : ledgerEntries(yields)

    for (const [currency, amount] of releasing) {
      if (amount <= 0) continue
      // A prayer moves the measure rather than changing it: what walks and what is
      // set aside sum to exactly what the stone held, so law 1 holds under it too.
      const now = withhold ? Math.floor(amount / PRAYER_WALKING_SHARE) : amount
      if (withhold) addToLedger(withhold, currency, amount - now)
      if (now <= 0) continue
      addToLedger(report.released, currency, now)
      parcels.push({ currency, from: report.slotIndex, amount: now })
    }
  }

  // The walk. One lap in every form but the litany, which walks two and fires
  // every stone on both — the crossing into slot I that begins the second lap is
  // the close of the first, and the ring is closed once more after it.
  for (let lap = 0; lap < rules.laps; lap++) {
    for (let slotIndex = 0; slotIndex < RING_SLOT_COUNT; slotIndex++) {
      if (rules.reach === 'neighbour') {
        // An elegy is a chain, not a circle: current reaches the next stone and no
        // further. Anything released before the slot behind this one has had its
        // one chance to be drawn, so it leaves here rather than riding along.
        escapeStale(slotIndex - 1)
      } else if (slotIndex > 0 || lap > 0) {
        crossInto(slotIndex)
      }

      const component = byIndex.get(slotIndex)
      if (!component) continue

      const demands = normalizeLedger(component.demands)
      const yields = normalizeLedger(component.yields)
      const relay = isRelay(component)

      let report = reports.get(slotIndex)
      if (!report) {
        report = { slotIndex, received: {}, shortfall: {}, released: {} }
        reports.set(slotIndex, report)
      }

      // What this firing drew, as distinct from the report's running total.
      const took: Ledger = {}
      for (const [currency, want] of ledgerEntries(demands)) {
        const got =
          rules.reach === 'neighbour'
            ? drawAcross(slotIndex, currency, want)
            : draw(slotIndex, currency, want)
        addToLedger(took, currency, got)
        addToLedger(report.received, currency, got)
        // A relay's demand is a rating rather than a requirement, so falling short
        // of it costs the caster nothing — it simply carries less.
        if (!relay) addToLedger(report.shortfall, currency, want - got)
      }
      // A dirge does not substitute here; see the single pass below the walk.

      // A prayer keeps most of every measure back until the close.
      let held: Ledger | null = null
      if (rules.answer === 'closing') {
        held = withheld.get(slotIndex) ?? {}
        withheld.set(slotIndex, held)
      }
      release(report, took, yields, relay, held)
    }
  }

  // An elegy never closes, so whatever the last stone released has still had its
  // one chance to be drawn — by nobody. It leaves at the mouth on the same terms
  // as everything else this form lets go of.
  if (rules.reach === 'neighbour') escapeStale(RING_SLOT_COUNT)

  // Closing the ring: the current crosses from the last slot back to the first.
  // An elegy never closes — nothing comes back around, and slot I is never repaid.
  if (rules.reach === 'ring') {
    crossInto(0)

    const first = reports.get(0)
    if (first) repay(first)
  }

  // The prayer, answered. Everything the ring held back is given here at once,
  // having crossed nothing — which is the whole of what the form buys: a lap costs
  // eight of every currency in flight, and two thirds of this ring never went into
  // flight at all, so a stone at the front of the ring delivers very nearly what a
  // stone at the mouth does.
  //
  // The other side of the trade is why this is not simply the best form in the
  // book: the walk ran on a third of the current, so most stones went hungry and
  // the difference was billed to the caster. A prayer is for a ring whose stones do
  // not need each other, and it ruins a chain.
  //
  // It is not exempt from the hole in the circle: what a prayer gives at the close
  // is still standing in the ring when the ring is counted, so a sparse one spills
  // it like anything else. Sealing that is the ward's, and only the ward's.
  for (const [slotIndex, ledger] of [...withheld].sort((a, b) => a[0] - b[0])) {
    const report = reports.get(slotIndex)
    if (!report) continue
    for (const [currency, amount] of ledgerEntries(ledger)) {
      addToLedger(report.released, currency, amount)
      parcels.push({ currency, from: slotIndex, amount })
    }
  }

  // The dirge, resolved once and at the end rather than at each starved stone.
  //
  // Substituting during the walk took current out of flight that the slots behind
  // were counting on, so covering one shortfall opened another: the dirge could
  // and did come out with a *higher* toll than a prayer on the same ring, which is
  // the one thing its rule promises never to happen. Held back to the close, it
  // can only ever spend what would otherwise have reached the mouth — which is
  // exactly the trade the form is supposed to offer, and nothing else.
  if (rules.shortfall === 'substituted') {
    // What it may spend: everything the ring still holds bar one part in
    // `DIRGE_KEPT_SHARE`, fixed before the first substitution so that covering the
    // first shortfall cannot quietly enlarge the budget for the next.
    const budget: Ledger = {}
    for (const currency of CURRENCIES) {
      const holding = inFlight(currency)
      const share = holding - Math.floor(holding / DIRGE_KEPT_SHARE)
      if (share > 0) budget[currency] = share
    }
    for (const slotIndex of [...reports.keys()].sort((a, b) => a - b)) {
      substitute(reports.get(slotIndex)!, budget)
    }
  }

  // An open slot is a hole in the circle, and current spills out of a hole on its
  // way to the mouth. What the ring still holds is delivered in the proportion the
  // ring was closed; the remainder is counted as bled rather than quietly dropped,
  // so the ledger still balances against what the stones released.
  //
  // The ward is the one form that answers the hole rather than accepting it: it
  // delivers in full at any number of stones and bills the caster for the
  // difference, below. No other form touches this.
  const held: Ledger = { ...escaped }
  for (const parcel of parcels) addToLedger(held, parcel.currency, parcel.amount)

  const sealed = rules.gaps === 'sealed'
  const spilling = completionFactor(placements.length)
  const completion = sealed ? 1 : spilling
  const manifestation: Ledger = {}
  for (const [currency, amount] of ledgerEntries(held)) {
    const delivered = Math.round(amount * completion)
    if (delivered > 0) manifestation[currency] = delivered
    addToLedger(bled, currency, amount - delivered)

    // What a ward costs: the hole's share, at `WARD_HOLD_RATE` for one. The caster
    // stands where the circle is open and holds in what would have gone out of it,
    // and the body is charged two for every unit kept.
    //
    // The price has to be proportional, and it took two tries to get there. Billed
    // as the current crossed, against whatever was in flight at that moment, a ward
    // was nearly free on exactly the rings it is best on: put two stones in slots
    // VII and VIII and the six gaps in front of them are crossed with nothing in
    // flight yet, so nothing is charged and the ring still delivers four times what
    // any other form gets off it. Billed as a flat two per gap per currency, it
    // could not be dodged, but it fell hardest on the small rings that raise least
    // and vanished against a ring that raises a great deal. At par it is the same
    // bargain at every size: everything the ward delivers over what the ring would
    // have delivered is bought one for one out of the body.
    if (sealed) {
      addToLedger(toll, currency, (delivered - Math.round(amount * spilling)) * WARD_HOLD_RATE)
    }
  }

  // Every form, without exception. A dirge has already had its chance to cover
  // these out of the wrong currency; whatever survived that is still the caster's,
  // including at a stone too starved to fire. The toll is never waived.
  for (const report of reports.values()) {
    for (const [currency, amount] of ledgerEntries(report.shortfall)) {
      addToLedger(toll, currency, amount)
    }
  }

  // What the ring raised, and the two things charged against it.
  //
  // Both are read off what the stones released rather than off what survived, so
  // they price what the spell reached for and not what it managed to keep — and so
  // neither can be dodged by building a ring that bleeds.
  const raised = new Set<Currency>()
  for (const report of reports.values()) {
    for (const [currency] of ledgerEntries(report.released)) raised.add(currency)
  }

  for (const currency of CURRENCIES) {
    if (!raised.has(currency)) continue

    // The price of the speaking, charged in every form, since every form bends a
    // law. Uniform, so it never decides between forms. It exists because a form
    // that bent nothing would cost nothing, and would then be the right answer on
    // every ring whose bend went untested — which is what the prayer used to be.
    addToLedger(toll, currency, BEND_TOLL)
  }

  return {
    form,
    named,
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
