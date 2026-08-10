import { describeRole } from './currencies'
import {
  RING_SLOT_COUNT,
  SPELL_FORMS,
  TRANSIT_LOSS_GAP,
  TRANSIT_LOSS_REAGENT,
  transitScale,
  type LossRelief,
  type Placement,
  type SpellForm,
} from '../types/worldbuilding'

/**
 * The seven forms a working may be spoken in.
 *
 * **A form is an input to the resolver.** It decides two things and no others:
 *
 *  - **What an underfed reagent does.** Under a crediting form it reacts in full
 *    anyway and the difference comes out of the caster; under a measuring form it
 *    gives back only the share it was fed, and nothing is charged. See `underfed`.
 *  - **What the form asks of the circle.** Every form but the prayer states one
 *    condition. Meet it and the ring is spared one kind of loss; fail it and that
 *    same loss is dealt double. See `condition`.
 *
 * **A form can never make units.** Both of its powers only ever move where a loss
 * falls — a spared crossing is a crossing that dissipated nothing, a spared spill is
 * a hole that did not leak, and a measured reagent gives up part of its own yield in
 * place of the toll. Nothing here can put a unit into the world that no reagent was
 * carrying, which is what keeps the first law true and what keeps the conservation
 * check in `sim/balance.ts` balancing. Any new form power must satisfy the same
 * test, and there is no fourth `LossRelief` that adds.
 *
 * Forms were cosmetic between August 2026 and this change, and before that they
 * were seven separate resolver knobs — `reach`, `laps`, `shortfall`, `transit`,
 * `gaps` — one law bent apiece. This is neither: there are exactly two mechanisms,
 * shared by all seven, and a form is a choice of setting rather than a special case
 * in the walk. `computeReaction` has one branch for the underfed rule and two
 * numbers for the condition, and that is the whole of it.
 *
 * Rotations and reflections were considered and rejected. Starting the walk at a
 * different slot, or running it anticlockwise, is a *symmetry of the ring* — it is
 * indistinguishable from rotating or mirroring the reagents the caster placed, so it
 * would read as a rule while adding no decision at all.
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
   * What kind of saying this is: the occasion, the address, the manner. Hover text
   * on the form's name in the reaction panel.
   *
   * **Keep the mechanics out of this field even though forms are behavioural
   * again.** What the form does is stated exactly, in `condition.statement` and in
   * `UNDERFED_RULE`, and stating it twice is how the two drift apart and the app
   * starts lying. One or two plain sentences, in-world, no em dashes.
   */
  gloss: string
  /**
   * What a reagent does when the ring did not meet its demands in full.
   *
   * `credit` is the older rule and the plainer one: it reacts regardless, releases
   * its whole yield, and the shortfall is drawn out of the caster as the toll. The
   * ring gets the full yield on the caster's account.
   *
   * `measure` is the trade: it releases the share of its yield that the ring fed
   * it, rounded down, and nothing is charged to anyone. A form set to `measure`
   * therefore resolves every possible ring at a toll of exactly zero.
   *
   * **The share has to be proportional, and that is not a detail.** The first cut
   * made it binary — a reagent the ring could not feed in full did not react at all
   * — and the cliff wrecked the three forms that used it. Feeding a reagent to the
   * exact unit is rare, so the rule was switched off almost always: measured over
   * rings built to satisfy their own conditions, the dirge delivered 1.2 and the
   * ward 3.2 where the same rings spoken as a prayer delivered 21.0 and 22.4. A
   * proportional share has no cliff, so a well fed ring keeps most of its output
   * and pays nothing for it, which is the trade these forms are supposed to be.
   */
  underfed: 'credit' | 'measure'
  /**
   * What the form asks of the circle, or `null` for the prayer, which asks nothing
   * and is spared nothing.
   */
  condition: FormCondition | null
}

export interface FormCondition {
  /**
   * The condition as the caster reads it. Rendered verbatim in the reaction panel
   * beside whether it currently holds, so it must be exactly what `test` checks.
   *
   * Mechanics only. The occasion and the in-world colour belong in `gloss`, and
   * mixing the two produces a sentence that reads as flavour and is then enforced
   * as a rule. One sentence, plainly stated, no atmosphere.
   */
  statement: string
  /**
   * Which loss the circle is spared when the condition holds, and dealt double
   * when it does not.
   *
   * `transit` is what the current pays to cross into a slot; sparing it is worth
   * at most one lap, so the two forms that spare it are the ones that reward a ring
   * you have actually filled. `spill` is what leaks out of the holes at the mouth;
   * sparing it is worth nothing on a closed ring and doubles a sparse one's
   * delivery, so the four forms that spare it are the small-circle forms.
   *
   * There is no third value. A toll cannot be spared this way: a reagent that
   * releases a yield the ring never fed it would be making units out of nothing,
   * and `underfed: 'measure'` — cutting the yield in place of the charge — is the
   * only settlement of that which the first law permits.
   */
  loss: 'transit' | 'spill'
  /** Whether the ring as placed satisfies `statement`. Pure, and reads only the ring. */
  test: (placements: Placement[]) => boolean
  /**
   * The slots `statement` speaks about, marked on the circle so the caster can see
   * what the form is looking at without reading the panel.
   *
   * It must name the same slots the sentence does and no others, for the same
   * reason `statement` must match `test`: three of these conditions are about the
   * shape of the ring rather than about particular slots, and the honest answer
   * there is every reagent the rule counts. A condition that names nothing at all
   * when the ring holds nothing it wants — the dirge without a sink — returns
   * empty, which marks nothing rather than marking everything.
   */
  slots: (placements: Placement[]) => number[]
}

/**
 * The two settings named for the caster, and the name is the thing being chosen:
 * a **volatile** form reacts on an incomplete draw and bills the difference to the
 * body, a **stable** one holds to what it was actually fed. Indexed by
 * `SpellFormMeta.underfed` and rendered wherever a form is shown or picked.
 *
 * UI only. The union stays `credit | measure`, which names the settlement the walk
 * branches on: the resolver's word for a rule should say what the code does with
 * it, not how it reads on the page.
 */
export const UNDERFED_LABEL: Record<SpellFormMeta['underfed'], string> = {
  credit: 'Volatile',
  measure: 'Stable',
}

/**
 * The underfed rule, stated in full. Hover text: on the name in `UNDERFED_LABEL`
 * in the reaction panel, and on the form's own option in the picker, which shows
 * the name of the form and nothing more. Indexed by `SpellFormMeta.underfed`.
 */
export const UNDERFED_RULE: Record<SpellFormMeta['underfed'], string> = {
  credit: 'A reagent the ring underfeeds reacts in full anyway. The shortfall comes out of you.',
  measure:
    'A reagent gives back only the share of its yield that the ring fed it. You are charged nothing.',
}

/**
 * What the condition costs or saves, stated for the panel. Indexed by
 * `FormCondition.loss` and then by the relief the ring earned.
 *
 * Here rather than in the panel for the same reason `UNDERFED_RULE` is: the
 * sentence must say what the resolver does, and a rule written into JSX drifts
 * from the constant it describes the first time that constant is retuned. The
 * doubled crossing quotes `TRANSIT_LOSS_*` through `transitScale` rather than
 * spelling the numbers, so it cannot.
 *
 * There is no `plain` entry. A form that states a condition is only ever spared or
 * doubled once a reagent stands in the ring, and a cold circle has earned neither —
 * it is shown no cost line at all rather than a third sentence.
 */
export const LOSS_RELIEF_RULE: Record<
  FormCondition['loss'],
  Record<Exclude<LossRelief, 'plain'>, string>
> = {
  transit: {
    spared: 'Crossings are free.',
    doubled:
      `Crossings cost double: ${TRANSIT_LOSS_GAP * transitScale('doubled')} across a gap, ` +
      `${TRANSIT_LOSS_REAGENT * transitScale('doubled')} across a reagent.`,
  },
  spill: {
    spared: 'Nothing spills. The ring delivers everything it still holds.',
    doubled: 'The spill is squared. Four reagents deliver a quarter, not a half.',
  },
}

/** Which slots hold a reagent, as a ring-shaped array. */
function occupancy(placements: Placement[]): boolean[] {
  const filled = Array.from({ length: RING_SLOT_COUNT }, () => false)
  for (const placement of placements) {
    if (placement.slotIndex >= 0 && placement.slotIndex < RING_SLOT_COUNT) {
      filled[placement.slotIndex] = true
    }
  }
  return filled
}

/**
 * Lengths of the unbroken runs of reagents, counted around the circle.
 *
 * Circular, so a run that spans the seam between slot VIII and slot I is one run
 * and not two. The walk starts from a reagent that has a hole behind it, which is
 * what stops a run being split at index 0; a completely closed ring has no such
 * slot and is the one run of eight.
 */
function filledRuns(placements: Placement[]): number[] {
  const filled = occupancy(placements)
  const count = filled.filter(Boolean).length
  if (count === 0) return []
  if (count === RING_SLOT_COUNT) return [RING_SLOT_COUNT]

  const start = filled.findIndex(
    (isFilled, i) => isFilled && !filled[(i + RING_SLOT_COUNT - 1) % RING_SLOT_COUNT],
  )
  const runs: number[] = []
  let run = 0
  for (let step = 0; step < RING_SLOT_COUNT; step++) {
    if (filled[(start + step) % RING_SLOT_COUNT]) {
      run++
    } else if (run > 0) {
      runs.push(run)
      run = 0
    }
  }
  if (run > 0) runs.push(run)
  return runs
}

function hasRole(placements: Placement[], role: 'source' | 'sink'): boolean {
  return placements.some((placement) => describeRole(placement.component) === role)
}

/** Slots holding a reagent of this role. */
function slotsWithRole(placements: Placement[], role: 'source' | 'sink'): number[] {
  return placements
    .filter((placement) => describeRole(placement.component) === role)
    .map((placement) => placement.slotIndex)
}

/** Every slot holding a reagent, for the conditions that count the ring's shape. */
function filledSlots(placements: Placement[]): number[] {
  return placements.map((placement) => placement.slotIndex)
}

const EVERY_SLOT = Array.from({ length: RING_SLOT_COUNT }, (_, i) => i)

export const FORM_META: Record<SpellForm, SpellFormMeta> = {
  prayer: {
    form: 'prayer',
    label: 'Prayer',
    article: 'a',
    gloss: 'The first form anyone is taught. It addresses something and asks. Most workings in the codex are prayers.',
    underfed: 'credit',
    // The prayer asks nothing of the circle, so it is spared nothing and forfeits
    // nothing. It is the only form that resolves a ring exactly as the bare laws
    // state, and it is what every other form is measured against.
    condition: null,
  },

  elegy: {
    form: 'elegy',
    label: 'Elegy',
    article: 'an',
    gloss: 'For something already gone. The text is past tense throughout, and the opening line names the dead.',
    underfed: 'credit',
    condition: {
      statement: 'Slot I is empty, and no source stands anywhere in the ring.',
      loss: 'spill',
      // Firing, and with no source anywhere, so the first reagent the current
      // reaches is guaranteed to starve and the caster is guaranteed a toll. That
      // fixed price up front is what the spared spill is bought with.
      test: (placements) =>
        placements.length > 0 &&
        !placements.some((placement) => placement.slotIndex === 0) &&
        !hasRole(placements, 'source'),
      // Slot I, which must stay clear, and any source, which must go.
      slots: (placements) => [0, ...slotsWithRole(placements, 'source')],
    },
  },

  litany: {
    form: 'litany',
    label: 'Litany',
    article: 'a',
    gloss: 'A list of short calls, said through twice. Whoever else is present says the second pass. No other form needs two voices.',
    underfed: 'credit',
    condition: {
      statement:
        'The reagents stand in pairs: every unbroken run is exactly two long, and there is more than one run.',
      loss: 'spill',
      // On a ring of eight, two pairs and their separating holes take six slots and
      // a third pair would need nine, so this is four reagents, always. A short
      // ring delivering all of it, bought by giving up the packing that would have
      // made the walk cheap.
      test: (placements) => {
        const runs = filledRuns(placements)
        return runs.length > 1 && runs.every((run) => run === 2)
      },
      // The rule is about the runs, so it is about every reagent standing in them.
      slots: filledSlots,
    },
  },

  dirge: {
    form: 'dirge',
    label: 'Dirge',
    article: 'a',
    gloss: 'Sung slowly over a body or a grave. It is counted in beats, not lines. The singer stands still and unaccompanied.',
    underfed: 'measure',
    condition: {
      statement: 'A sink stands in the ring.',
      loss: 'spill',
      // Holding and spared the spill, so a dirge neither tolls nor leaks. What it
      // pays instead is the sink itself, which spends a slot and eats current that
      // would otherwise have reached the mouth.
      test: (placements) => hasRole(placements, 'sink'),
      // Wherever the sinks stand. A ring with none marks nothing.
      slots: (placements) => slotsWithRole(placements, 'sink'),
    },
  },

  invocation: {
    form: 'invocation',
    label: 'Invocation',
    article: 'an',
    gloss: 'You call a thing by its true name and keep calling until it answers. Shortest of the seven, and the loudest.',
    underfed: 'credit',
    condition: {
      statement: 'Every slot is filled.',
      loss: 'transit',
      // The one form that wants the full ring, and the only one whose boon is worth
      // its most there: a closed ring never spills, so sparing the spill would be
      // worth nothing, and sparing the transit is worth the whole lap. Failing it
      // doubles every crossing, which is why this is the dearest form to misjudge.
      test: (placements) => placements.length >= RING_SLOT_COUNT,
      slots: () => EVERY_SLOT,
    },
  },

  ward: {
    form: 'ward',
    label: 'Ward',
    article: 'a',
    gloss: 'Said at a threshold, against something expected. It is addressed to what is coming, not to anyone present. The same door, the same day each year.',
    underfed: 'measure',
    condition: {
      statement: 'Slot I and slot VIII are filled, and at least one slot is empty.',
      loss: 'transit',
      // The open clause is what keeps the ward and the invocation apart. Without it
      // a full ring would satisfy both, and the ward — which holds, and so can never
      // be tolled — would strictly dominate the form built for the closed circle.
      test: (placements) => {
        const filled = occupancy(placements)
        return filled[0] && filled[RING_SLOT_COUNT - 1] && filled.some((isFilled) => !isFilled)
      },
      // The two ends of the threshold. The open clause asks for a hole rather than
      // for any particular slot, so there is nothing there to mark.
      slots: () => [0, RING_SLOT_COUNT - 1],
    },
  },

  benediction: {
    form: 'benediction',
    label: 'Benediction',
    article: 'a',
    gloss: 'Spoken over someone who is leaving, and it names them. The hands stay at the sides. Nothing else is worked after it.',
    underfed: 'measure',
    condition: {
      statement: 'No more than three reagents stand in the ring.',
      loss: 'spill',
      // The small-circle form, and the one that most changes how a ring is built:
      // three reagents that would deliver an eighth of what they hold deliver all of
      // it instead. Holding, so the price is never the body — it is the four
      // reagents you did not place, and a squared spill the moment you place them.
      test: (placements) => placements.length > 0 && placements.length <= 3,
      // The rule counts reagents, so it marks the ones being counted.
      slots: filledSlots,
    },
  },
}

export const FORM_LIST: SpellFormMeta[] = SPELL_FORMS.map((form) => FORM_META[form])

/**
 * Whether the ring satisfies what the form asks of it, and which relief that puts
 * on the form's chosen loss.
 *
 * `met` is `null` where there is no verdict to give: a form that asks nothing, and a
 * circle with nothing in it. Several conditions are vacuously true with no reagents
 * placed, so a cold circle cannot be reported as having met its form — but neither
 * has it failed, and calling it failed is a verdict on a working that does not exist
 * yet. Both cases are `plain` on both losses, which is the other half of the same
 * statement: nothing has been spared and nothing doubled.
 */
export function conditionRelief(
  form: SpellForm,
  placements: Placement[],
): { met: boolean | null; transit: LossRelief; spill: LossRelief } {
  const condition = FORM_META[form].condition
  if (!condition || placements.length === 0) {
    return { met: null, transit: 'plain', spill: 'plain' }
  }

  const met = condition.test(placements)
  const relief: LossRelief = met ? 'spared' : 'doubled'
  return {
    met,
    transit: condition.loss === 'transit' ? relief : 'plain',
    spill: condition.loss === 'spill' ? relief : 'plain',
  }
}

const EMPTY_SLOTS: ReadonlySet<number> = new Set<number>()

/**
 * The slots the form's condition names, marked on the circle whether it holds or
 * not — the mark says what is being looked at, and the panel says how it went.
 *
 * A cold circle names nothing, matching `conditionRelief`: an empty ring is not
 * failing its form, and marking eight slots under an invocation nobody has begun
 * to lay would read as a verdict on a working that does not exist yet.
 */
export function conditionSlots(form: SpellForm, placements: Placement[]): ReadonlySet<number> {
  const condition = FORM_META[form].condition
  if (!condition || placements.length === 0) return EMPTY_SLOTS
  return new Set(condition.slots(placements))
}
