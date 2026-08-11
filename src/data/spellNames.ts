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
  invocation: ['Invocation of', 'Call of', 'True Name of'],
  ward: ['Ward of', 'Wall of', 'Sentry of'],
  benediction: ['Benediction of', 'Blessing of', 'Farewell to'],
}

/** What the ring is naming, drawn from whichever currency it manifests most of. */
const NAME_NOUNS: Record<Currency, string[]> = {
  heat: ['Ember', 'the Kiln', 'the Furnace', 'Coal', 'Scorch'],
  motion: ['the Gale', 'the Tide', 'Reeling', 'the Undertow', 'Recoil'],
  charge: ['Spark', 'Arc', 'Struck Flint', 'the Storm-Glass', 'Lightning'],
  light: ['the Dawn', 'Lantern', 'the Beacon', 'the Afterimage', 'Glow'],
  mass: ['Stone', 'Weight', 'Ash', 'Anchor', 'the Deep'],
}

/** For a ring that manifests nothing: empty, or every unit spent on the toll. */
const UNMANIFESTED_NOUNS = ['the Empty Circle', 'Nothing at All', 'the Cold Ring', 'the Unspoken', 'the Waiting']

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

/** The currency the ring manifests most of, ties broken toward `CURRENCIES` order. */
function loudestCurrency(manifestation: Ledger): Currency | null {
  const entries = ledgerEntries(manifestation)
  if (entries.length === 0) return null
  return entries.reduce((loudest, entry) => (entry[1] > loudest[1] ? entry : loudest))[0]
}

/**
 * A random title for the working on the bench: a prefix for the form paired
 * with a noun for whichever currency the ring currently manifests most of. A
 * ring manifesting nothing draws from `UNMANIFESTED_NOUNS` instead.
 */
export function generateSpellName(form: SpellForm, manifestation: Ledger): string {
  const currency = loudestCurrency(manifestation)
  const noun = currency ? pick(NAME_NOUNS[currency]) : pick(UNMANIFESTED_NOUNS)
  return `${pick(NAME_PREFIXES[form])} ${noun}`
}
