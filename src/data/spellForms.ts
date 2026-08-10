import { SPELL_FORMS, type SpellForm } from '../types/worldbuilding'

/**
 * The seven forms a working may be spoken in.
 *
 * **A form is cosmetic.** `computeReaction` does not take one and never reads
 * one: the same reagents in the same slots resolve to the same manifestation, toll
 * and bleed under all seven. What a spell does is decided by the circle, and the
 * form is what the caster calls the saying of it — the register the words are in,
 * who they are addressed to, and what occasion they belong to.
 *
 * Forms used to be resolver inputs, each bending exactly one law. They no longer
 * bend anything, so nothing here may be phrased as a rule: the laws in
 * `data/currencies.ts` are now true without exception, and a form that appeared to
 * promise otherwise would be the app lying to the user. Keep the prose to the
 * occasion and the manner of speaking, and keep currencies, slots and rates out of
 * it entirely.
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
   * What kind of saying this is: the occasion, the address, the manner. Rendered
   * in the reaction panel beneath the form's name, and nowhere near the numbers it
   * did not produce. One or two plain sentences, no mechanics, no em dashes.
   */
  gloss: string
}

export const FORM_META: Record<SpellForm, SpellFormMeta> = {
  prayer: {
    form: 'prayer',
    label: 'Prayer',
    article: 'a',
    gloss: 'Spoken to something, and asking rather than telling. It is the plainest of the seven, the first form a beginner is taught, and the one most workings are written in.',
  },

  elegy: {
    form: 'elegy',
    label: 'Elegy',
    article: 'an',
    gloss: 'Spoken about something already gone. An elegy is written in the past tense throughout and names what it is for in the opening line, so it cannot be spoken until the loss has happened.',
  },

  litany: {
    form: 'litany',
    label: 'Litany',
    article: 'a',
    gloss: 'A list, said through twice, the second time by whoever else is present. The text is a sequence of short calls rather than sentences, and it is the only form written for more than one voice.',
  },

  dirge: {
    form: 'dirge',
    label: 'Dirge',
    article: 'a',
    gloss: 'Sung slowly over a body or a grave. A dirge is measured out in beats rather than lines, and by convention it is sung standing still and unaccompanied.',
  },

  invocation: {
    form: 'invocation',
    label: 'Invocation',
    article: 'an',
    gloss: 'Calls a thing by name and goes on calling until it answers. An invocation is the shortest of the seven and the loudest, and the name it uses has to be the true one.',
  },

  ward: {
    form: 'ward',
    label: 'Ward',
    article: 'a',
    gloss: 'Spoken at a threshold, against something expected. A ward is addressed to what is coming rather than to anyone present, and it is written to be repeated at the same door on the same day each year.',
  },

  benediction: {
    form: 'benediction',
    label: 'Benediction',
    article: 'a',
    gloss: 'Spoken over someone who is leaving. A benediction names the person it is for and is delivered with the hands at the sides rather than raised, and by tradition it is the last working of a session.',
  },
}

export const FORM_LIST: SpellFormMeta[] = SPELL_FORMS.map((form) => FORM_META[form])
