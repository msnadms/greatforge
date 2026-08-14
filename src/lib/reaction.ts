import { isRelay } from '../data/currencies'
import {
  ELEGY_GRIEF,
  dirgeKeptSlots,
  FORM_META,
  INVOCATION_FOLD,
  WARD_DOOR,
  conditionFor,
  conditionRelief,
  doorCeiling,
  griefCeiling,
  griefTollPerManifestation,
  type ConditionContext,
} from '../data/spellForms'
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
  type CasterSpecialty,
  type Currency,
  type Ledger,
  type LossRelief,
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
  /** Discipline recorded on the rite, which selects any specialty form condition. */
  specialty: CasterSpecialty | null
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
   *
   * Every entry is the walk's own snapshot but for one case: current a
   * measured slot I releases once the closing lap has repaid it is added to
   * all eight, since it leaves slot I after the walk and rides the ring to
   * the mouth without a slot left to take it.
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
  /** Extra manifestation a met elegy draws from toll beyond its first unavoidable wound. */
  griefBonusTotal: number
  /** Extra manifestation a met ward is paid back for what its threshold slots were fed. */
  wardBonusTotal: number
  /** Non-sink slots a met dirge preserves when its reagents are consumed. */
  keptSlots: number[]
  /**
   * Units a met invocation lost gathering its manifestation into one currency.
   * Unlike the two bonuses this is not external current: the units moved to
   * `bled`, so the first law needs no adjustment for it.
   */
  foldLossTotal: number
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
const NO_PLACEMENTS_CONTEXT: ConditionContext = {
  fedUnderBaseline: () => false,
  touchedUnderBaseline: () => false,
}

function emptyReaction(form: SpellForm, specialty: CasterSpecialty | null): Reaction {
  return {
    form,
    specialty,
    // A cold circle has no verdict: `conditionRelief` returns null for it.
    conditionMet: conditionRelief(form, [], NO_PLACEMENTS_CONTEXT, specialty).met,
    filled: 0,
    completion: 0,
    slots: [],
    carrying: [],
    manifestation: {},
    toll: {},
    bled: {},
    manifestationTotal: 0,
    griefBonusTotal: 0,
    wardBonusTotal: 0,
    keptSlots: [],
    foldLossTotal: 0,
    tollTotal: 0,
    bledTotal: 0,
  }
}

/**
 * Adds `bonus` units to a manifestation, following the mix it already has, by
 * largest remainder so the total lands exactly on `bonus`.
 *
 * Shared by elegy's grief and the ward's doorway, which are the two clauses
 * that make units the reagents did not release. Both distribute rather than
 * name a currency, so neither can invent one the ring never raised, and both
 * check the manifestation is non-empty first, so neither can make a cold ring
 * speak.
 */
function spreadOverMix(manifestation: Ledger, bonus: number): void {
  const total = ledgerTotal(manifestation)
  if (bonus <= 0 || total <= 0) return

  const shares = ledgerEntries(manifestation).map(([currency, amount]) => {
    const exact = (amount * bonus) / total
    return { currency, amount: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })

  let assigned = shares.reduce((sum, share) => sum + share.amount, 0)
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder)) {
    if (assigned >= bonus) break
    share.amount++
    assigned++
  }

  for (const share of shares) addToLedger(manifestation, share.currency, share.amount)
}

/**
 * Builds what `conditionRelief` needs to answer a condition that reads the
 * ring's resolved state — currently only the dirge's. Resolves under the
 * prayer as a baseline (see `ConditionContext` in `data/spellForms.ts`), and
 * only on first use, since most forms' conditions never touch it.
 *
 * The baseline uses the same nearest-unit rounding as the visible casting.
 * A condition must not reject a current that the circle itself visibly
 * delivers merely because its private probe rounded that current differently.
 */
function conditionReliefForAssumption(
  form: SpellForm,
  placements: Placement[],
  specialty: CasterSpecialty | null,
  met: boolean,
): { met: boolean | null; transit: LossRelief; spill: LossRelief } {
  const condition = conditionFor(form, specialty)
  if (!condition || placements.length === 0) {
    return { met: null, transit: 'plain', spill: 'plain' }
  }

  const relief: LossRelief = met ? (condition.reward ?? 'spared') : 'doubled'
  return {
    met,
    transit: condition.loss === 'transit' || condition.loss === 'both' ? relief : 'plain',
    spill: condition.loss === 'spill' || condition.loss === 'both' ? relief : 'plain',
  }
}

export function buildConditionContext(
  placements: Placement[],
  level: CasterLevel,
  form: SpellForm = 'prayer',
  specialty: CasterSpecialty | null = null,
): ConditionContext {
  let baseline: Reaction | null = null
  return {
    fedUnderBaseline: (slotIndex: number) => {
      if (!baseline) baseline = resolveReaction(placements, form, level, specialty, true)
      const report = baseline.slots.find((s) => s.slotIndex === slotIndex)
      return report ? ledgerTotal(report.shortfall) === 0 : false
    },
    touchedUnderBaseline: (slotIndex: number) => {
      if (!baseline) baseline = resolveReaction(placements, form, level, specialty, true)
      const report = baseline.slots.find((s) => s.slotIndex === slotIndex)
      return report ? ledgerTotal(report.received) > 0 : false
    },
  }
}

/**
 * Walks the ring once clockwise from slot I and closes it, resolving every
 * demand against the current in flight. Pure — no React, no storage.
 *
 * `form` decides two things: the underfed rule (credit vs measure, see
 * `FORM_META`) and which loss its condition spares or doubles (transit,
 * spill, or both). Four forms then carry one further clause apiece, settled
 * at the end of the walk: elegy's grief, dirge's preservation, the ward's
 * doorway, and invocation's fold into a single currency. See `data/spellForms.ts`.
 *
 * `level` belongs to the spell, not the caster. It scales every placed
 * reagent's demand and yield by `LEVEL_POWER[level]` before the walk reads
 * either, and scales the flat transit cost by the shallower `TRANSIT_POWER`
 * curve. The completion spill does not move with level. See the eighth law
 * in `data/currencies.ts`.
 *
 */
export function computeReaction(
 placements: Placement[],
 form: SpellForm,
 level: CasterLevel = 5,
  // Kept in this position for existing callers; rounding is now always the
  // visible nearest-unit rule, including the condition baseline.
  _pessimistic = false,
  specialty: CasterSpecialty | null = null,
): Reaction {
  void _pessimistic
  return resolveReaction(placements, form, level, specialty)
}

/** Resolves a ring, optionally assuming its condition holds for a contextual condition check. */
function resolveReaction(
  placements: Placement[],
  form: SpellForm,
  level: CasterLevel,
  specialty: CasterSpecialty | null,
  assumedConditionMet: boolean | null = null,
): Reaction {
  if (placements.length === 0) return emptyReaction(form, specialty)

  const { underfed } = FORM_META[form]
  const conditionContext = buildConditionContext(placements, level, form, specialty)
  const relief =
    assumedConditionMet === null
      ? conditionRelief(form, placements, conditionContext, specialty)
      : conditionReliefForAssumption(form, placements, specialty, assumedConditionMet)
  const metTransit = relief.met ? conditionFor(form, specialty)?.metTransit : undefined
  const transitFactor = transitScale(relief.transit)
  const demandForCaster = (ledger: Ledger): Ledger => scaleLedger(ledger, level, Math.round)
  const yieldForCaster = (ledger: Ledger): Ledger => scaleLedger(ledger, level, Math.round)

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
  let transitCarry = 0

  /**
   * The catalog-scale price of crossing into this slot, before level and the
   * form's own scaling. A met condition may state its own pair of prices
   * (`FormCondition.metTransit`) in place of the standing ones.
   *
   * **A relay crosses free on every path, a stated pair included.** Law 2 says
   * "none through a relay, wherever it stands", and a stated cost is still a
   * crossing price rather than an exemption from the one rule the resolver
   * asks a component about. This was invisible while the only `metTransit`
   * set `reagent: 0`; it is not now that one charges for a reagent crossing.
   */
  function statedTransitCost(occupant: MaterialComponent | undefined): number {
    if (occupant && isRelay(occupant)) return TRANSIT_LOSS_RELAY
    if (metTransit) return occupant ? metTransit.reagent : metTransit.gap
    return occupant ? TRANSIT_LOSS_REAGENT : TRANSIT_LOSS_GAP
  }

  function baseTransitCost(slotIndex: number): number {
    const stated = statedTransitCost(byIndex.get(slotIndex))
    const exact = stated * TRANSIT_POWER[level] * (metTransit ? 1 : transitFactor)
    if (exact <= 0) return 0
    const owed = exact + transitCarry
    const charged = Math.max(0, Math.round(owed))
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

      // That release lands after the last `carrying` snapshot was taken, so
      // without this slot I reads on the circle as a reagent whose yield
      // vanished: the panel says it released, and no arc carries any of it.
      // Nothing round the ring can take it — every slot has already resolved,
      // and law 5 asks each one only once — so it rides the whole lap
      // untouched to the mouth, paying no crossing on the way because every
      // crossing is already behind it. Add it to each stretch it passes,
      // slot I's own included, since it has left slot I by then.
      for (const [currency, amount] of ledgerEntries(extra)) {
        if (amount <= 0) continue
        for (const ledger of carrying) addToLedger(ledger, currency, amount)
      }
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

  /**
   * A met elegy has no source, so its first underfed demand is unavoidable.
   * Toll beyond that wound strengthens the manifestation a little, then stops:
   * the effect is distributed over what the ring already made so it never
   * invents a new currency or makes a cold ring speak.
   *
   * The rate runs against level (`GRIEF_POWER`) where the floor and the ceiling
   * run with it (`LEVEL_POWER`, `griefCeiling`): a lesser working reads a
   * smaller wound and buys past it more cheaply, up to a lower ceiling.
   */
  let griefBonusTotal = 0
  if (form === 'elegy' && relief.met && ledgerTotal(manifestation) > 0) {
    const floor = Math.round(ELEGY_GRIEF.baseToll * LEVEL_POWER[level])
    griefBonusTotal = Math.min(
      griefCeiling(level),
      Math.floor(Math.max(0, ledgerTotal(toll) - floor) / griefTollPerManifestation(level)),
    )
    spreadOverMix(manifestation, griefBonusTotal)
  }

  /**
   * A met ward is paid back for its doorway: half of what slots I and VIII
   * were given comes back, to `doorCeiling`. Read off `received`, which by
   * this point includes what the closing lap repaid slot I, so the clause
   * asks for a chain that came all the way round rather than for a large
   * reagent parked at the door. See `WARD_DOOR`.
   */
  let wardBonusTotal = 0
  if (form === 'ward' && relief.met && ledgerTotal(manifestation) > 0) {
    const given = [0, RING_SLOT_COUNT - 1].reduce((sum, slotIndex) => {
      const report = reports.get(slotIndex)
      return sum + (report ? ledgerTotal(report.received) : 0)
    }, 0)
    wardBonusTotal = Math.min(
      doorCeiling(level),
      Math.floor(given / WARD_DOOR.receivedPerManifestation),
    )
    spreadOverMix(manifestation, wardBonusTotal)
  }

  // A dirge does not change what the ring releases. Once its sink has earned
  // the rite's relief, though, the nearest non-sinks on either side of its
  // fully fed sink are left intact. Keeping this on the reaction lets the future
  // casting write consume exactly the same deterministic slots the circle previews.
  const keptSlots =
    form === 'dirge' && relief.met && assumedConditionMet === null
      ? dirgeKeptSlots(placements, conditionContext)
      : []

  /**
   * A met invocation answers in one currency: everything it delivers is
   * gathered into its largest share, and a unit is lost for each currency
   * taken in. The lost units go to `bled` rather than vanishing, so this
   * clause alone needs no accounting on the reaction. See `INVOCATION_FOLD`.
   */
  let foldLossTotal = 0
  if (form === 'invocation' && relief.met) {
    const entries = ledgerEntries(manifestation)
    if (entries.length > 1) {
      // The name is the largest share. `ledgerEntries` walks CURRENCIES order
      // and the comparison is strict, so a tie settles on the first of them
      // and a given ring always folds the same way.
      let name = entries[0][0]
      for (const [currency, amount] of entries) {
        if (amount > (manifestation[name] ?? 0)) name = currency
      }

      for (const [currency, amount] of entries) {
        if (currency === name) continue
        const lost = Math.min(amount, INVOCATION_FOLD.lostPerCurrency)
        delete manifestation[currency]
        addToLedger(manifestation, name, amount - lost)
        addToLedger(bled, currency, lost)
        foldLossTotal += lost
      }
    }
  }

  return {
    form,
    specialty,
    conditionMet: relief.met,
    filled: placements.length,
    completion,
    slots: [...reports.values()].sort((a, b) => a.slotIndex - b.slotIndex),
    carrying,
    manifestation,
    toll,
    bled,
    manifestationTotal: ledgerTotal(manifestation),
    griefBonusTotal,
    wardBonusTotal,
    keptSlots,
    foldLossTotal,
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
