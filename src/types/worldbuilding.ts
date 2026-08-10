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
 * track power: a rare stone is awkward to source, not necessarily stronger, and
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
 * share that survives is just the share of the ring you closed: eight stones
 * deliver all of it, four deliver half, two deliver a quarter.
 *
 * Without this, transit loss cannot reach a sparsely filled ring at all. Loss is
 * only charged against current in flight, so a caster who puts everything in the
 * last two slots is never billed for the six empty ones — the current is released
 * after the gaps and leaves before it could ever cross them. That made a two-stone
 * ring the most efficient thing in the game and put small circles outside the
 * cost system entirely.
 *
 * It never exceeds 1. A full ring is the baseline, not a bonus: a multiplier
 * above 1 would put units into the world that no stone was carrying, and that is
 * precisely what the first law forbids.
 */
export function completionFactor(filled: number): number {
  return Math.max(0, Math.min(filled, RING_SLOT_COUNT)) / RING_SLOT_COUNT
}

/**
 * Most of any one currency a single material may demand or yield.
 *
 * This sits in a narrow window, and both walls of it are real.
 *
 * A lap costs each currency RING_SLOT_COUNT × TRANSIT_LOSS_STONE = 8 units, so
 * the ceiling has to clear 8 or slot I can hold nothing that reaches the mouth —
 * at a ceiling of 9 the best stone in the world returns one unit from there, and
 * the front of the ring is scenery.
 *
 * The upper wall is the relay. A relay's whole worth is the crossing it makes
 * free, which saves one unit per currency in flight; a stone in the same slot
 * returns MAX_LEDGER_ENTRY − 8. So a relay is worth its slot only while the
 * ceiling stays under about eleven, and above that the role is dead weight by
 * arithmetic rather than by tuning.
 *
 * Twelve is the compromise: slot I returns up to 4, and a relay standing there
 * saves 3 or 4 once the ring is carrying several currencies at once. Which of
 * the two is right depends on the spell, which is the point.
 */
export const MAX_LEDGER_ENTRY = 12

/**
 * Units of current lost crossing into a slot that holds an ordinary stone. This
 * is what makes position matter: a yield of 4 is dead four stones downstream.
 */
export const TRANSIT_LOSS_STONE = 1

/**
 * Units lost crossing into an empty slot — the current has to leap the gap.
 */
export const TRANSIT_LOSS_GAP = 2

/**
 * What the caster is charged, per currency the ring raised, for speaking a form
 * at all. Every form bends a law, so every form pays this — there is no unformed
 * casting, and therefore no free one.
 *
 * It used to be the price of departing from a prayer, which made the prayer the
 * baseline and everything else a deviation from it. The prayer now bends a law
 * like any other form, so the price is uniform and the choice between forms is
 * decided entirely by the knob each one turns.
 *
 * Charged per currency rather than per unit, exactly as transit is, so a broad
 * ring pays more to speak than a narrow one — and so the price does not scale
 * with how large the spell is, only with how much of the world it touches.
 */
export const BEND_TOLL = 1

/**
 * What the caster pays, per unit, for what a ward holds in. A ward delivers what
 * the open slots would have spilled, and this is the rate the body buys it at.
 *
 * At par it is not a trade at all: a unit kept for a unit paid is worth taking
 * whenever the caster values the toll at anything under one, which is most of the
 * board, and the ward owned 50 cells of 84. At two for one it is the same bargain
 * the dirge offers in the other direction, and for the same reason — the body is a
 * poor substitute for the circle, and a form that sells delivery has to charge more
 * for it than the circle would have.
 */
export const WARD_HOLD_RATE = 2

/**
 * What a dirge will not spend: one part in this of whatever the ring still holds
 * at the close, set aside before the first substitution.
 *
 * Without a floor the dirge spent everything. It covered shortfalls until either
 * the shortfalls or the ring ran out, and on a catalog where nearly every ring
 * starves somewhere it was always the ring — average manifestation 1.4 against 20
 * for every other form. That is not a form that trades, it is a form that empties,
 * and a caster picking it was choosing to cast nothing and pay less for it.
 *
 * A third kept back makes it a trade again: it always delivers something, and the
 * relief it buys is bounded by the size of the spell rather than by the size of the
 * debt. Keeping half back left it too little to spend to be worth picking at all.
 */
export const DIRGE_KEPT_SHARE = 3

/**
 * Units of the wrong currency a dirge spends to cover one of the right.
 *
 * At par it stops being a trade and becomes an answer: covering a shortfall one
 * for one is worth doing on any ring where the caster minds the toll at all, and
 * the dirge took the whole of the `w = 2` column and pushed the invocation and the
 * benediction off the map entirely. At two for one the column stays contested,
 * which is the point of having seven forms.
 */
export const DIRGE_SUBSTITUTION_RATE = 2

/**
 * What part of its measure a stone gives where it stands under a prayer. The rest
 * is held back and given at the close, having crossed nothing.
 *
 * This is the whole tuning of the form, and it is delicate, because transit is the
 * largest cost in the system and a prayer is a way of not paying it. Holding
 * everything back is the strongest thing in the book by a distance: it skips the
 * walk entirely, and the demands it strands are worth far less than the lap it
 * saves, so it beat every other form on nearly every ring at every price. Holding
 * only half back lands on the elegy's numbers almost exactly, which is no use
 * either — two forms with the same numbers are one form with two names.
 *
 * A third walking is the value where the prayer owns a region of its own without
 * taking anyone else's: rings of four and five currencies, where a lap of transit
 * is charged four and five times over and skipping it is worth the stranded
 * demands, and rings whose stones do not feed each other, where there is nothing
 * to strand.
 */
export const PRAYER_WALKING_SHARE = 3

/**
 * What the whole current pays to cross one stone when a benediction carries it as
 * a single stream, multiplied by the same base as any other crossing — so nothing
 * through a relay, three across a stone, six to leap a gap.
 *
 * This is the one number that decides which rings a benediction is for. An
 * ordinary crossing costs one unit of *each* currency in flight, so a ring
 * carrying n currencies pays n; a benediction pays three however wide it is. It is
 * therefore a loss on a one- or two-currency ring, a wash at three, and a large
 * saving at four or five — the exact inverse of the invocation, which makes one
 * currency cheap and the rest dear.
 */
export const TRANSIT_FUSED = 2

/**
 * Units lost crossing into a relay: none. Loss is a property of the medium, and a
 * relay is the one material that carries current without resisting it.
 *
 * In practice this matters most at slot I, which is crossed only once — on the
 * closing step, with the whole lap's current in flight. A relay standing there
 * spends the ring's cheapest slot buying back the most expensive crossing.
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
 * stoichiometric model load as inert stones — empty ledgers, editable or
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
