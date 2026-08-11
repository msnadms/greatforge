/**
 * Core worldbuilding types.
 *
 * Magic is stoichiometric: every material demands certain currencies before it
 * will react, and yields others when it does. A spell is a ring of eight slots
 * that the current walks once, clockwise, losing one unit per slot crossed.
 * Whatever the ring cannot supply is taken from the caster; whatever the ring
 * cannot reabsorb escapes, and what escapes is what the spell does.
 */

export const CURRENCIES = ['heat', 'motion', 'charge', 'light', 'mass'] as const

export type Currency = (typeof CURRENCIES)[number]

/**
 * Amounts of each currency. Absent means zero — entries are dropped rather than
 * stored as 0, so documents stay small and never carry `undefined` to Firestore.
 */
export type Ledger = Partial<Record<Currency, number>>

/**
 * The manner a working is spoken in, and an input to `computeReaction`: a form
 * decides what an underfed reagent does, and states a condition on the circle that
 * spares or doubles one kind of loss. See `data/spellForms.ts`.
 */
export const SPELL_FORMS = [
  'prayer',
  'elegy',
  'litany',
  'dirge',
  'invocation',
  'ward',
  'benediction',
] as const

export type SpellForm = (typeof SPELL_FORMS)[number]

/**
 * How hard the material is to come by or to make. The resolver never reads it,
 * but the catalog tunes it so scarcity tracks strength: common is any ring's
 * baseline, uncommon is solid but unremarkable, rare is worth building a ring
 * around, and singular is one or two catalog entries doing at a single slot
 * what two `rare` reagents would together.
 */
export const RARITIES = ['common', 'uncommon', 'rare', 'singular'] as const

export type Rarity = (typeof RARITIES)[number]

/** Number of component slots in the ring. Single source of truth for geometry. */
export const RING_SLOT_COUNT = 8

/**
 * How a form's condition lands on one kind of loss: `spared` when the circle met
 * what the form asked of it, `doubled` when it did not, `plain` for a form that
 * asks nothing. Deliberately no fourth setting that *adds* to what leaves the
 * ring — a form may only decide where losses fall. See the seventh law in
 * `data/currencies.ts`.
 */
export type LossRelief = 'spared' | 'plain' | 'doubled'

/** What a crossing costs under a relief: nothing, its stated price, or twice it. */
export function transitScale(relief: LossRelief): number {
  if (relief === 'spared') return 0
  return relief === 'doubled' ? 2 : 1
}

/**
 * How much of what the ring still holds at the mouth actually leaves it. An
 * empty slot is a hole in the circle, and the share that survives is just the
 * share of the ring that was closed: eight reagents deliver all of it, four
 * deliver half, two a quarter.
 *
 * Never exceeds 1 — a full ring is the baseline, not a bonus, since anything
 * above 1 would put units into the world no reagent carried (law 1). `doubled`
 * squares the share rather than halving it, so the forfeit is nil on a closed
 * ring and severe on a sparse one, keeping the penalty pointed at the form's
 * required shape rather than the working's size.
 *
 * `filled` is the count of reagents standing in the ring, relays and
 * measure-cut reagents included — every occupied slot closes, whether or not
 * it reacted. `spill` is stated rather than defaulted since every ring is
 * resolved under some form.
 */
export function completionFactor(filled: number, spill: LossRelief): number {
  if (spill === 'spared') return 1
  const share = Math.max(0, Math.min(filled, RING_SLOT_COUNT)) / RING_SLOT_COUNT
  return spill === 'doubled' ? share * share : share
}

/**
 * Most of any one currency a single material may demand or yield.
 *
 * A full lap costs RING_SLOT_COUNT × TRANSIT_LOSS_REAGENT = 16 units, and a
 * crossing that nothing downstream demands falls back to the oldest current in
 * flight — the reagent at slot I — so the ceiling has to clear 16 or slot I can
 * never hold anything that reaches the mouth. Scaled together with
 * `TRANSIT_LOSS_REAGENT`/`TRANSIT_LOSS_GAP` so the ratio between a reagent's
 * ceiling and the lap's cost stays fixed; see the eighth law and `LEVEL_POWER`
 * below.
 */
export const MAX_LEDGER_ENTRY = 24

/**
 * How many rungs of power a working can be set to, and the fraction of a
 * reagent's ledger each rung actually commands.
 *
 * Set directly on the spell (`Spell.casterLevel`) through `LevelControl` in the
 * editor rather than earned or carried on a profile, so a working resolves the
 * same way every time it is opened regardless of what else the caster has
 * since written.
 *
 * The fraction scales a reagent's demand and yield together, by the same
 * amount — see the eighth law in `data/currencies.ts`. The flat transit cost
 * scales down too (`TRANSIT_POWER` below), on a shallower curve; the spill at
 * an open slot does not move with level at all. See `sim/balance.ts`'s
 * by-level table for what the curve buys.
 *
 * The five steps are a plain 15 points apart (40/55/70/85/100) and land the
 * ceiling on exactly the whole catalog — there is no "true" number a
 * reagent's ledger is scaled down from; level five simply reads it whole.
 */
export const CASTER_LEVELS = [1, 2, 3, 4, 5] as const

export type CasterLevel = (typeof CASTER_LEVELS)[number]

/** A new working starts at the bottom rung. */
export const DEFAULT_CASTER_LEVEL: CasterLevel = 1

/**
 * The flat transit cost's own fraction, on a curve shallower than
 * `LEVEL_POWER`'s: it reaches 1 (full, catalog-scale cost) by level 4 rather
 * than needing level 5, so a low level's crossings cost proportionally less
 * than its reagents shrink by. The flat lap cost doesn't shrink with a
 * reagent's ledger on its own, so without this curve a low level would spend
 * most of what it carries just crossing the ring. See `crossInto`'s transit
 * carry in `lib/reaction.ts` for how the fraction rounds to a whole crossing
 * cost without collapsing levels onto the same value.
 */
export const TRANSIT_POWER: Record<CasterLevel, number> = {
  1: 0.55,
  2: 0.7,
  3: 0.85,
  4: 1,
  5: 1,
}

export const LEVEL_POWER: Record<CasterLevel, number> = {
  1: 0.4,
  2: 0.55,
  3: 0.7,
  4: 0.85,
  5: 1,
}

export function isCasterLevel(value: unknown): value is CasterLevel {
  return typeof value === 'number' && (CASTER_LEVELS as readonly number[]).includes(value)
}

export function normalizeCasterLevel(value: unknown): CasterLevel {
  return isCasterLevel(value) ? value : DEFAULT_CASTER_LEVEL
}

/**
 * Units of current dissipated crossing into a slot that holds an ordinary
 * reagent. Flat against the current as a whole, not per currency, so the cost
 * of a lap depends on the ring's shape and never on how many currencies it
 * carries. Charged to the current the destination demanded, falling back to
 * the oldest current in flight for whatever that doesn't cover (see
 * `crossInto` in `lib/reaction.ts`). Level never scales this constant, which
 * is what makes a low level's shrunken reagents feel the lap harder.
 */
export const TRANSIT_LOSS_REAGENT = 2

/**
 * Units dissipated crossing into an empty slot — the current has to leap the
 * gap. Flat, exactly as `TRANSIT_LOSS_REAGENT` is; a hole costs twice what a
 * reagent does.
 */
export const TRANSIT_LOSS_GAP = 4

/**
 * Units lost crossing into a relay: none. Applies wherever the relay stands,
 * holes on both sides included — the entire difference between a relay and an
 * ordinary reagent, since a relay is otherwise billed for its own unmet
 * demand exactly like anything else.
 */
export const TRANSIT_LOSS_RELAY = 0

export interface MaterialComponent {
  id: string
  name: string
  description: string
  /** What it must be given before it will react. */
  demands: Ledger
  /** What it releases once its demands are met. */
  yields: Ledger
  rarity: Rarity
  /** True for components that shipped with the app. Seeds stay editable and deletable. */
  isSeed: boolean
  createdAt: number
  updatedAt: number
}

/**
 * A placed component together with the slot it occupies.
 *
 * Lives here rather than beside `computeReaction` because a form's condition is
 * a question about the ring — how many reagents stand in it, where the holes are,
 * what roles are present — and the conditions are written in `data/spellForms.ts`,
 * one layer below the resolver that reads them.
 */
export interface Placement {
  slotIndex: number
  component: MaterialComponent
}

export interface Spell {
  id: string
  title: string
  /** How it is spoken, and an input to the reaction. See `data/spellForms.ts`. */
  form: SpellForm
  /**
   * The power this working was set to. Belongs to the spell rather than the
   * caster: the level scales every placed reagent's ledger before the walk reads
   * it (the eighth law), so a spell resolves the same way every time it is
   * opened, and raising the level on one working never reaches into any other.
   * Set directly through `LevelControl` in the editor.
   */
  casterLevel: CasterLevel
  /** The authored prayer/elegy/litany itself. */
  text: string
  notes: string
  /** Always RING_SLOT_COUNT long. Entries are MaterialComponent ids, or null when empty. */
  slots: (string | null)[]
  createdAt: number
  updatedAt: number
}

export function emptySlots(): (string | null)[] {
  return Array.from({ length: RING_SLOT_COUNT }, () => null)
}

/**
 * Coerces a slot array to exactly RING_SLOT_COUNT entries, so stored spells stay
 * loadable if the ring size ever changes.
 */
export function normalizeSlots(slots: (string | null)[] | undefined): (string | null)[] {
  const next = emptySlots()
  if (!slots) return next
  for (let i = 0; i < Math.min(slots.length, RING_SLOT_COUNT); i++) {
    next[i] = slots[i] ?? null
  }
  return next
}

export function ledgerAmount(ledger: Ledger, currency: Currency): number {
  return ledger[currency] ?? 0
}

/** Present entries in CURRENCIES order, so every readout is deterministic. */
export function ledgerEntries(ledger: Ledger): Array<[Currency, number]> {
  const entries: Array<[Currency, number]> = []
  for (const currency of CURRENCIES) {
    const amount = ledger[currency]
    if (amount) entries.push([currency, amount])
  }
  return entries
}

export function ledgerTotal(ledger: Ledger): number {
  let total = 0
  for (const currency of CURRENCIES) total += ledger[currency] ?? 0
  return total
}

export function addToLedger(ledger: Ledger, currency: Currency, amount: number): void {
  if (amount <= 0) return
  ledger[currency] = (ledger[currency] ?? 0) + amount
}

/**
 * Drops zero, negative, and non-finite entries and clamps the rest to whole
 * numbers in range. Applied on both write and read, so hand-edited documents and
 * components saved before the ledger model existed still load.
 */
export function normalizeLedger(ledger: Ledger | undefined): Ledger {
  const next: Ledger = {}
  if (!ledger) return next
  for (const currency of CURRENCIES) {
    const raw = ledger[currency]
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue
    const amount = Math.min(MAX_LEDGER_ENTRY, Math.max(0, Math.round(raw)))
    if (amount > 0) next[currency] = amount
  }
  return next
}

/**
 * Fills in anything a stored component is missing. Components written before the
 * stoichiometric model load as inert reagents — empty ledgers, editable or
 * deletable like anything else.
 */
export function normalizeComponent(input: Partial<MaterialComponent> & { id: string }): MaterialComponent {
  const now = Date.now()
  return {
    id: input.id,
    name: input.name ?? 'Unnamed',
    description: input.description ?? '',
    demands: normalizeLedger(input.demands),
    yields: normalizeLedger(input.yields),
    rarity: RARITIES.includes(input.rarity as Rarity) ? (input.rarity as Rarity) : 'common',
    isSeed: input.isSeed ?? false,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  }
}

/**
 * Fills in anything a stored spell is missing, the way `normalizeComponent` does
 * for a reagent.
 *
 * `form` matters most here: it indexes `FORM_META` directly, so an unknown or
 * absent one throws during render with no error boundary above it, taking the
 * whole workshop down rather than opening as a prayer.
 */
export function normalizeSpell(input: Partial<Spell> & { id: string }): Spell {
  const now = Date.now()
  return {
    id: input.id,
    title: input.title ?? '',
    form: SPELL_FORMS.includes(input.form as SpellForm) ? (input.form as SpellForm) : 'prayer',
    casterLevel: normalizeCasterLevel(input.casterLevel),
    text: input.text ?? '',
    notes: input.notes ?? '',
    slots: normalizeSlots(input.slots),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  }
}
