import { describeRole, type Role } from './currencies'
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
 *    condition, and names the loss (or losses — see `FormCondition.loss`) that
 *    condition governs. Meet it and the named loss is spared; fail it and that
 *    same loss is dealt double. See `condition`.
 *
 * **A form can never make units.** Both powers only ever move where a loss falls,
 * never create one, which keeps the first law true and the conservation check in
 * `sim/balance.ts` balancing. There is no fourth `LossRelief` that adds.
 *
 * A form is a choice of setting, not a branch in the resolver: `computeReaction`
 * has one branch for the underfed rule and two numbers for the condition, shared
 * by all seven forms. Do not reintroduce per-form knobs.
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
   * `credit` reacts regardless, releases its whole yield, and the shortfall is
   * drawn out of the caster as the toll.
   *
   * `measure` releases the share of its yield that the ring fed it, rounded down,
   * and nothing is charged to anyone. A form set to `measure` therefore resolves
   * every possible ring at a toll of exactly zero. The share is proportional, not
   * binary, so a well fed ring keeps most of its output rather than falling off a
   * cliff the moment one unit of demand goes unmet.
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
   * Which loss (or losses) the circle is spared when the condition holds, and
   * dealt double when it does not.
   *
   * `transit` is what the current pays to cross into a slot; sparing it is worth
   * at most one lap, so the forms that spare it reward a ring you have actually
   * filled. `spill` is what leaks out of the holes at the mouth; sparing it is
   * worth nothing on a closed ring and doubles a sparse one's delivery, so the
   * forms that spare it are the small-circle forms.
   *
   * `both` exists for dirge alone, whose condition (the sink's demand actually
   * met, resolved via `ConditionContext` rather than read off the ring's shape)
   * is a harder bar and priced accordingly: meeting it waives both losses,
   * missing it doubles both.
   *
   * There is no value that spares a toll — a reagent releasing a yield the ring
   * never fed it would make units out of nothing, and `underfed: 'measure'` is
   * the only settlement of that the first law permits.
   */
  loss: 'transit' | 'spill' | 'both'
  /**
   * Whether the ring as placed satisfies `statement`.
   *
   * Reads the raw placements for every form but one. Most conditions are
   * questions about the ring's shape — what stands where, what role it plays —
   * and are answered without resolving anything. `context` exists for the one
   * condition that is not: see `ConditionContext`.
   */
  test: (placements: Placement[], context: ConditionContext) => boolean
  /**
   * The slots `statement` speaks about, marked on the circle so the caster can see
   * what the form is looking at without reading the panel.
   *
   * Must name the same slots the sentence does and no others. A condition about
   * the ring's shape rather than particular slots (invocation, benediction)
   * answers with every reagent the rule counts. A condition that names nothing
   * when the ring holds nothing it wants (dirge without a sink) returns empty.
   */
  slots: (placements: Placement[]) => number[]
}

/**
 * What a condition needs beyond the raw placements to answer a question the
 * shape of the ring cannot: whether a reagent was actually fed.
 *
 * A condition is normally read before the ring is walked, since the walk needs
 * to know what it spares before the first crossing — but "was this reagent fed"
 * is an output of the walk, not an input. `fedUnderBaseline` breaks that circle
 * by resolving the same ring under the prayer first, so the verdict is decided
 * on the ring as it would run unblessed, never on itself.
 *
 * Built lazily by `computeReaction` (`buildConditionContext` in `lib/reaction.ts`)
 * — the baseline resolution only happens if a condition actually calls it.
 */
export interface ConditionContext {
  /** Whether the slot's demand was fully met, resolving under the prayer. */
  fedUnderBaseline: (slotIndex: number) => boolean
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
 * Kept here rather than written into JSX so the sentence can't drift from the
 * constant it describes; the doubled crossing quotes `TRANSIT_LOSS_*` through
 * `transitScale` rather than spelling the numbers.
 *
 * No `plain` entry: a cold circle has earned neither relief, and is shown no
 * cost line at all rather than a third sentence.
 */
const TRANSIT_RELIEF: Record<Exclude<LossRelief, 'plain'>, string> = {
  spared: 'Crossings are free.',
  doubled:
    `Crossings cost double: ${TRANSIT_LOSS_GAP * transitScale('doubled')} across a gap, ` +
    `${TRANSIT_LOSS_REAGENT * transitScale('doubled')} across a reagent.`,
}

const SPILL_RELIEF: Record<Exclude<LossRelief, 'plain'>, string> = {
  spared: 'Nothing spills. The ring delivers everything it still holds.',
  doubled: 'The spill is squared. Four reagents deliver a quarter, not a half.',
}

export const LOSS_RELIEF_RULE: Record<
  FormCondition['loss'],
  Record<Exclude<LossRelief, 'plain'>, string>
> = {
  transit: TRANSIT_RELIEF,
  spill: SPILL_RELIEF,
  // Composed rather than restated, so the crossing cost and the spill sentence
  // can't drift from the two entries above the way a hand-copied pair could.
  both: {
    spared: `${TRANSIT_RELIEF.spared} ${SPILL_RELIEF.spared}`,
    doubled: `${TRANSIT_RELIEF.doubled} ${SPILL_RELIEF.doubled}`,
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

function hasRole(placements: Placement[], role: Role): boolean {
  return placements.some((placement) => describeRole(placement.component) === role)
}

/** Slots holding a reagent of this role. */
function slotsWithRole(placements: Placement[], role: Role): number[] {
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
    // Asks nothing, spares nothing. The only form that resolves a ring exactly
    // as the bare laws state, and what every other form is measured against.
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
      // With no source anywhere, the first reagent the current reaches always
      // starves, guaranteeing a toll — that fixed price is what buys the spared spill.
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
      statement: 'At least two relays stand in the ring.',
      loss: 'spill',
      // A relay gives back exactly what it was given — the mechanical "echo" the
      // gloss's "said through twice" describes. A role rather than a shape, so the
      // other six slots pack as densely as any other form's.
      test: (placements) => slotsWithRole(placements, 'relay').length >= 2,
      // Wherever the relays stand. A ring with fewer than two marks nothing.
      slots: (placements) => slotsWithRole(placements, 'relay'),
    },
  },

  dirge: {
    form: 'dirge',
    label: 'Dirge',
    article: 'a',
    gloss: 'Sung slowly over a body or a grave. It is counted in beats, not lines. The singer stands still and unaccompanied.',
    // `credit`, not `measure`: `measure` charges nothing for a shortfall anywhere,
    // so it would let a ring starve every slot but the sink and still collect the
    // full boon. `credit` bills every shortfall, sink included, so the toll is
    // zero only when the whole ring is fed.
    underfed: 'credit',
    condition: {
      statement: 'A sink stands in the ring, and its demand is fully met.',
      loss: 'both',
      // Feeding the sink in full, not merely placing one, is the bar an actual
      // laying-to-rest implies — both sinks in the catalog demand most of a
      // source's whole yield, so satisfying one takes a ring built around it.
      // See `ConditionContext` for how "fed" is decided without the resolver
      // chasing its own tail.
      test: (placements, context) =>
        slotsWithRole(placements, 'sink').some((slotIndex) => context.fedUnderBaseline(slotIndex)),
      // Wherever the sinks stand, fed or not — the mark is gilt and never red,
      // and an unfed sink is a fact about the ring, not a verdict on the slot.
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
      // A closed ring never spills, so sparing the spill would be worth nothing;
      // sparing the transit is worth the whole lap. Failing it doubles every
      // crossing, making this the dearest form to misjudge.
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
      statement: 'Slot I and slot VIII are filled, and at least two slots are empty.',
      loss: 'transit',
      // Requires the room behind the door to be mostly empty, so the ward prices
      // like the small-circle forms rather than shadowing the invocation's full
      // ring at a toll it (being `measure`) can never actually pay.
      test: (placements) => {
        const filled = occupancy(placements)
        if (!filled[0] || !filled[RING_SLOT_COUNT - 1]) return false
        const filledCount = filled.filter(Boolean).length
        return RING_SLOT_COUNT - filledCount >= 2
      },
      // The two ends of the threshold. The room's openness is a count, not a
      // particular slot, so there is nothing there to mark beyond the doorway.
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
      // The small-circle form: three reagents deliver all they hold instead of a
      // fraction. The price is never the body, only the reagents left unplaced.
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
 * circle with nothing in it (several conditions are vacuously true with no reagents
 * placed). Both cases are `plain` on both losses — nothing spared, nothing doubled.
 */
export function conditionRelief(
  form: SpellForm,
  placements: Placement[],
  context: ConditionContext,
): { met: boolean | null; transit: LossRelief; spill: LossRelief } {
  const condition = FORM_META[form].condition
  if (!condition || placements.length === 0) {
    return { met: null, transit: 'plain', spill: 'plain' }
  }

  const met = condition.test(placements, context)
  const relief: LossRelief = met ? 'spared' : 'doubled'
  return {
    met,
    transit: condition.loss === 'transit' || condition.loss === 'both' ? relief : 'plain',
    spill: condition.loss === 'spill' || condition.loss === 'both' ? relief : 'plain',
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
