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
 * The manner a working is spoken in. Recorded on the spell and rendered in the
 * app, but never read by `computeReaction` — see `data/spellForms.ts`.
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
 * How hard the material is to come by or to make — a fact about the world, not
 * a dial on the magic. The reaction never reads it, and it deliberately does not
 * track power: a rare reagent is awkward to source, not necessarily stronger, and
 * balancing the catalog against rarity would be balancing against the wrong axis.
 */
export const RARITIES = ['common', 'uncommon', 'rare', 'singular'] as const

export type Rarity = (typeof RARITIES)[number]

/** Number of component slots in the ring. Single source of truth for geometry. */
export const RING_SLOT_COUNT = 8

/**
 * How much of what the ring still holds at the mouth actually leaves it.
 *
 * An empty slot is a hole in the circle, and current spills out of a hole. The
 * share that survives is just the share of the ring you closed: eight reagents
 * deliver all of it, four deliver half, two deliver a quarter.
 *
 * Without this, transit loss cannot reach a sparsely filled ring at all. Loss is
 * only charged against current in flight, so a caster who puts everything in the
 * last two slots is never billed for the six empty ones — the current is released
 * after the gaps and leaves before it could ever cross them. That made a two-reagent
 * ring the most efficient thing in the game and put small circles outside the
 * cost system entirely.
 *
 * It never exceeds 1. A full ring is the baseline, not a bonus: a multiplier
 * above 1 would put units into the world that no reagent was carrying, and that is
 * precisely what the first law forbids.
 *
 * `filled` is simply the number of reagents standing in the ring. Every reagent closes
 * its slot, relays included: a relay is billed for what the ring could not give it
 * exactly like anything else, so there is no way to buy completion with one.
 */
export function completionFactor(filled: number): number {
  return Math.max(0, Math.min(filled, RING_SLOT_COUNT)) / RING_SLOT_COUNT
}

/**
 * Most of any one currency a single material may demand or yield.
 *
 * This sits in a narrow window, and both walls of it are real.
 *
 * A full lap costs RING_SLOT_COUNT × TRANSIT_LOSS_REAGENT = 8 units, and loss lands
 * on the oldest current first, so it is the reagent at slot I that pays it. The
 * ceiling therefore has to clear 8 or slot I can hold nothing that reaches the
 * mouth — at a ceiling of 9 the best reagent in the world returns one unit from
 * there, and the front of the ring is scenery. Twelve leaves it returning 4.
 *
 * The upper wall used to be the relay: when a crossing cost one unit of every
 * currency in flight, a relay saved as much as five and the ceiling had to stay
 * low enough that a plain reagent in the same slot did not simply beat it. Transit
 * is now flat, so the free crossing saves exactly one unit however wide the ring
 * is, and that wall is gone. A relay is a cheap slot rather than a strong one.
 */
export const MAX_LEDGER_ENTRY = 12

/**
 * Units of current dissipated crossing into a slot that holds an ordinary reagent.
 * This is what makes position matter: a yield of 4 is dead four reagents
 * downstream.
 *
 * A flat cost against the current as a whole, taken off whatever has been in
 * flight longest — not one unit of every currency. Charging per currency made a
 * wide ring pay five times what a narrow one paid for the same walk, which priced
 * the *breadth* of a spell rather than its shape and erased every small flow
 * before it reached the mouth.
 */
export const TRANSIT_LOSS_REAGENT = 1

/**
 * Units dissipated crossing into an empty slot — the current has to leap the gap.
 * Flat, exactly as `TRANSIT_LOSS_REAGENT` is; a hole costs twice what a reagent does.
 */
export const TRANSIT_LOSS_GAP = 2

/**
 * Units lost crossing into a relay: none. Loss is a property of the medium, and a
 * relay is the one material that carries current without resisting it.
 *
 * It applies wherever the relay stands, holes on both sides included: a relay
 * reached across a gap costs the gap's two and nothing further, where an ordinary
 * reagent in that slot would cost three. This is the entire difference between a
 * relay and an ordinary reagent — in every other respect the resolver treats them
 * identically, and a relay is billed for its own unmet demand like anything else,
 * which is what stops the free crossing being free profit.
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

export interface Spell {
  id: string
  title: string
  /** How it is spoken. Cosmetic: the reaction does not read it. */
  form: SpellForm
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
 * `form` is the field that matters here. It indexes `FORM_META` directly in the
 * reaction panel and the spellbook, so an unknown or absent one is not a cosmetic
 * problem: the lookup returns undefined, reading a label off it throws during
 * render, and with no error boundary above them the whole workshop goes blank.
 * Spells written before the forms existed, spells left behind by a form that was
 * later renamed, and hand-edited documents all land here, and any of the three
 * would otherwise take the app down rather than open as a prayer.
 */
export function normalizeSpell(input: Partial<Spell> & { id: string }): Spell {
  const now = Date.now()
  return {
    id: input.id,
    title: input.title ?? '',
    form: SPELL_FORMS.includes(input.form as SpellForm) ? (input.form as SpellForm) : 'prayer',
    text: input.text ?? '',
    notes: input.notes ?? '',
    slots: normalizeSlots(input.slots),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  }
}
