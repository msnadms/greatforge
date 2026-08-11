import { ledgerEntries, type Currency, type Ledger, type SpellForm } from '../types/worldbuilding'

/**
 * Titles a random-name button can offer, one list per form. Tied to what the
 * form is *for* rather than to its mechanics — a ward guards against
 * something, so it reaches for "Wall of" and "Shield of", where an elegy
 * reaches for "Lament for".
 */
const NAME_PREFIXES: Record<SpellForm, string[]> = {
  prayer: ['Prayer for', 'Prayer of', 'A Prayer to'],
  elegy: ['Elegy for', 'Lament for', 'In Memory of'],
  litany: ['Litany of', 'Litany by', 'Chant of'],
  dirge: ['Dirge for', 'Dirge of', 'Grave-Song for'],
  invocation: ['Invocation of', 'Call of', 'Deliverance by'],
  ward: ['Ward of', 'Wall of', 'Sentry of'],
  benediction: ['Benediction of', 'Blessing of', 'Farewell to'],
}

/** What the ring is naming, drawn from whichever currency it manifests most of. */
const NAME_NOUNS: Record<Currency, string[]> = {
  heat: ['Ember', 'the Kiln', 'the Furnace', 'Coal', 'the Scorched'],
  motion: ['the Gale', 'the Tide', 'Reeling', 'the Undertow', 'Recoil'],
  charge: ['Spark', 'the Arc', 'Struck Flint', 'the Storm', 'Lightning'],
  light: ['the Dawn', 'the Lantern', 'the Beacon', 'the Afterimage', 'Glow'],
  mass: ['Stone', 'Weight', 'Ash', 'Anchor', 'the Deep'],
}

/** For a ring that manifests nothing: empty, or every unit spent on the toll. */
const UNMANIFESTED_NOUNS = ['the Empty Circle', 'Nothing at All', 'the Cold Ring', 'the Unspoken', 'the Waiting']

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

/**
 * The two loudest currencies in the manifestation, ties broken toward
 * `CURRENCIES` order. `Array.prototype.sort` is stable, and `ledgerEntries`
 * already hands back entries in `CURRENCIES` order, so a tie keeps that order
 * without any extra comparison.
 */
function loudestCurrencies(manifestation: Ledger): Array<[Currency, number]> {
  return [...ledgerEntries(manifestation)].sort((a, b) => b[1] - a[1])
}

/** How close a second currency has to sit behind the loudest to earn a joint name. */
const PAIR_THRESHOLD = 5

/**
 * A random title for the working on the bench: a prefix for the form paired
 * with a noun for whichever currency the ring currently manifests most of. A
 * ring manifesting nothing draws from `UNMANIFESTED_NOUNS` instead.
 *
 * When a second currency comes in within `PAIR_THRESHOLD` of the loudest, the
 * ring isn't really about one thing more than the other, so half the time the
 * name says both: "Prayer for Ember and Spark" instead of "Prayer for Ember".
 */
export function generateSpellName(form: SpellForm, manifestation: Ledger): string {
  const prefix = pick(NAME_PREFIXES[form])
  const [loudest, runnerUp] = loudestCurrencies(manifestation)
  if (!loudest) return `${prefix} ${pick(UNMANIFESTED_NOUNS)}`

  const noun = pick(NAME_NOUNS[loudest[0]])
  const isPair = runnerUp && loudest[1] - runnerUp[1] <= PAIR_THRESHOLD && Math.random() < 0.5
  if (!isPair) return `${prefix} ${noun}`

  const secondNoun = pick(NAME_NOUNS[runnerUp[0]])
  return `${prefix} ${noun} and ${secondNoun}`
}
