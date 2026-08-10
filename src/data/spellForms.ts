import {
  CURRENCIES,
  SPELL_FORMS,
  ledgerAmount,
  type Currency,
  type SpellForm,
} from '../types/worldbuilding'
import type { Ledgered } from './currencies'

/**
 * What choosing a form does to the reaction.
 *
 * The laws describe a circle nobody casts. Every one of the seven forms, the
 * prayer included, is that circle with exactly one law bent, and no form bends two
 * — that is the whole design constraint, and it is what keeps seven options
 * learnable. Pick the law you cannot afford to obey, and the form is chosen for
 * you.
 *
 * There is deliberately no obedient form. A form that bent nothing would be free
 * on every ring, and free is not a choice: it would be the answer whenever no
 * other bend happened to pay, which is most rings. The prayer used to be exactly
 * that, and it now bends law 3 like the elegy: it is the form that does not answer
 * until the circle has closed.
 *
 * The knobs below are read by `computeReaction`; the prose beside them is rendered
 * in the app as the statement of what the resolver does. **They must agree.** If a
 * knob changes meaning, `rule` changes in the same edit, exactly as `LAWS` does.
 */
export interface SpellFormMeta {
  form: SpellForm
  label: string
  /**
   * Indefinite article for `label`, stated rather than guessed from the first
   * letter — the prose in this app is written, not assembled, and a rule that
   * happens to work for these seven would quietly break on the eighth.
   */
  article: 'a' | 'an'
  /**
   * Exactly what the resolver does differently, and the only description a form
   * carries. Rendered in the reaction panel beside the numbers it produced, so it
   * is written as mechanics and nothing else: currencies, slots and rates, in
   * plain sentences. No atmosphere, and no em dashes. The picker in the spellbook
   * shows the bare label, on the grounds that a form is a rule rather than a mood.
   */
  rule: string
  /** Title of the law it bends. Never null: every form bends exactly one. */
  bends: string

  /**
   * How far current travels. `ring` is the law: it runs until something draws it
   * or transit eats it. `neighbour` is the elegy — it reaches the next stone and
   * no further, and whatever that stone does not want leaves the circle there.
   */
  reach: 'ring' | 'neighbour'
  /**
   * Laps walked. The second is the litany's, and every stone demands and gives its
   * whole measure again on it. The lap is charged at the ordinary rate, which is
   * the price: eight of every currency in flight, the first lap's included.
   */
  laps: 1 | 2
  /**
   * How unmet demand is covered. `caster` is the law. `substituted` is the dirge:
   * the ring covers what it can out of the wrong currency first, two units for
   * one, and the caster is billed the remainder — never nothing. No form waives
   * the toll, which is the one thing none of them may do.
   */
  shortfall: 'caster' | 'substituted'
  /**
   * How a crossing is charged. `even` is the law: one unit of every currency in
   * flight, separately. `named` is the invocation — one currency crosses cheap and
   * the rest dear. `fused` is the benediction — the whole current is carried as a
   * single stream and pays `TRANSIT_FUSED` in total however many currencies it is
   * made of, taken from whichever of them is largest.
   */
  transit: 'even' | 'named' | 'fused'
  /** Whether an open slot leaks, or is held shut at the caster's expense. */
  gaps: 'leak' | 'sealed'
  /**
   * When a stone's measure enters the current. `walking` is the law: all of it
   * where the stone stands, as the current reaches it. `closing` is the prayer —
   * one part in `PRAYER_WALKING_SHARE` walks and the rest is given at the close,
   * so most of the ring crosses nothing and feeds nothing.
   */
  answer: 'walking' | 'closing'
}

/**
 * The circle as the laws describe it. **No form is this** — every entry below is a
 * copy of it with exactly one field changed, and a form that changed none would be
 * free, which is the one thing no form may be.
 */
const PLAIN = {
  reach: 'ring',
  laps: 1,
  shortfall: 'caster',
  transit: 'even',
  gaps: 'leak',
  answer: 'walking',
} as const

export const FORM_META: Record<SpellForm, SpellFormMeta> = {
  prayer: {
    ...PLAIN,
    answer: 'closing',
    form: 'prayer',
    label: 'Prayer',
    article: 'a',
    rule: 'Each stone releases a third of its measure where it stands, rounded down. The ring holds the rest until it closes, then gives it at the mouth, having crossed nothing. So two thirds of the spell pays no transit and feeds nothing: the walk runs on the other third, and most demands go unmet and are charged to the caster. What is given at the close still spills through open slots.',
    bends: 'The circle is walked once, then closed',
  },

  elegy: {
    ...PLAIN,
    reach: 'neighbour',
    form: 'elegy',
    label: 'Elegy',
    article: 'an',
    rule: 'A stone draws only from the slot immediately before it, and pays that crossing out of what it draws. Current the next stone does not take leaves the ring where it stands, paying two of every currency on the way out. The ring never closes, so slot I is never repaid.',
    bends: 'The circle is walked once, then closed',
  },

  litany: {
    ...PLAIN,
    laps: 2,
    form: 'litany',
    label: 'Litany',
    article: 'a',
    rule: 'The ring is walked twice. Every stone demands and gives its whole measure again on the second lap, drawing on what the first lap left in flight, so most are better fed the second time. The second lap costs a full lap of transit, eight of every currency in flight, charged against what the first lap raised as well as the second.',
    bends: 'Each material stands once and is asked once',
  },

  dirge: {
    ...PLAIN,
    shortfall: 'substituted',
    form: 'dirge',
    label: 'Dirge',
    article: 'a',
    rule: 'At the close, current still in the ring covers demands it could not meet, at two units of the wrong currency for one of the right. It spends only current that would otherwise have reached the mouth, so the manifestation pays for the relief, and it will not spend the last third of what it holds. Whatever is still uncovered is charged to the caster in full: the toll is reduced, never waived.',
    bends: 'What the ring cannot supply, the body supplies',
  },

  invocation: {
    ...PLAIN,
    transit: 'named',
    form: 'invocation',
    label: 'Invocation',
    article: 'an',
    rule: 'Names the currency the placed stones yield most of. That currency crosses a stone for nothing and a gap for one. Every other currency crosses a stone as usual and pays four to leap a gap. A closed ring pays nothing extra and saves eight of the named currency a lap; every open slot is dear.',
    bends: 'The current runs one way',
  },

  ward: {
    ...PLAIN,
    gaps: 'sealed',
    form: 'ward',
    label: 'Ward',
    article: 'a',
    rule: 'An open slot neither leaks nor dims the current. Everything the ring holds reaches the mouth at any number of stones, and the caster is charged two units for every one held in that way. A full ring pays nothing extra, having nothing to hold in.',
    bends: 'An open slot is a hole in the circle',
  },

  benediction: {
    ...PLAIN,
    transit: 'fused',
    form: 'benediction',
    label: 'Benediction',
    article: 'a',
    rule: 'The current crosses as one stream rather than five. A crossing costs two units in total instead of one of every currency in flight, four to leap a gap, nothing through a relay, and it is taken from whichever currency the ring holds most of. A ring carrying one or two currencies pays more this way; one carrying four or five pays far less, and its smallest flows survive the walk.',
    bends: 'The current runs one way',
  },
}

export const FORM_LIST: SpellFormMeta[] = SPELL_FORMS.map((form) => FORM_META[form])

/**
 * The currency an invocation names: the one the placed stones yield most of, ties
 * broken in `CURRENCIES` order so the naming is deterministic.
 *
 * Read off the stones rather than off the reaction, because transit depends on the
 * name — deriving the name from what survived transit would not terminate.
 */
export function namedCurrency(components: Ledgered[]): Currency | null {
  let named: Currency | null = null
  let best = 0
  for (const currency of CURRENCIES) {
    let total = 0
    for (const component of components) total += ledgerAmount(component.yields, currency)
    if (total > best) {
      best = total
      named = currency
    }
  }
  return named
}
