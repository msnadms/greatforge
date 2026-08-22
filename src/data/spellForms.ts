import { describeRole, type Role } from './currencies'
import {
  CURRENCIES,
  LEVEL_POWER,
  RING_SLOT_COUNT,
  SPELL_FORMS,
  TRANSIT_LOSS_GAP,
  TRANSIT_LOSS_REAGENT,
  transitScale,
  type LossRelief,
  type CasterLevel,
  type CasterSpecialty,
  type Placement,
  type SpellForm,
} from '../types/worldbuilding'

/**
 * The seven forms a working may be spoken in.
 *
 * **A form is an input to the resolver.** Every form decides two things:
 *
 *  - **What an underfed reagent does.** Under a crediting form it reacts in full
 *    anyway and the difference comes out of the caster; under a measuring form it
 *    gives back only the share it was fed, and nothing is charged. See `underfed`.
 *  - **What the form asks of the circle.** Every form but the prayer states one
 *    condition, and names the loss (or losses — see `FormCondition.loss`) that
 *    condition governs. Meet it and the named loss is spared; fail it and that
 *    same loss is dealt double. See `condition`.
 *
 * Four forms carry one further clause apiece, and none carries more than one:
 * a met elegy turns toll beyond its first wound into force (`ELEGY_GRIEF`), a
 * met dirge keeps up to two of the reagents it laid (`dirgeKeptSlots`), a
 * met ward is paid back part of what its two threshold slots were fed
 * (`WARD_DOOR`), and a met invocation gathers what it delivers into a single
 * currency (`INVOCATION_FOLD`). None of them is a fourth `LossRelief`.
 *
 * **One clause per form.** The prayer is the unblessed baseline, and the
 * benediction is written by all three specialties, so neither carries one.
 * Dirge's preservation is a casting consequence rather than a second condition:
 * it only occurs after the sink has earned the rite's existing relief.
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
   * **Never `spill` alone.** A full ring never spills, so sparing or doubling
   * it is worth nothing once the ring is closed, and a caster can dodge any
   * spill-flavoured condition for free by ignoring it and filling every slot.
   * `transit` alone has the mirror defect wherever the condition itself keeps
   * the ring open, so only the invocation, whose condition *is* the closed
   * ring, spares it. Everything else takes `both`, which is what makes a
   * condition bite: closing the ring to dodge the doubled spill still leaves
   * every crossing paying the doubled transit.
   *
   * There is no value that spares a toll — a reagent releasing a yield the ring
   * never fed it would make units out of nothing, and `underfed: 'measure'` is
   * the only settlement of that the first law permits.
   */
  loss: 'transit' | 'spill' | 'both'
  /**
   * What meeting the condition earns, on the loss `loss` names. Defaults to
   * `spared` — most forms trade an outright waiver for their condition.
   * `halved` exists where a form's bar is markedly easier than the full-spare
   * forms it would otherwise match: litany's two-relay bar against the full
   * spare invocation earns for filling every slot. Failing the condition
   * always doubles, regardless of what meeting it would have earned.
   */
  reward?: 'spared' | 'halved'
  /**
   * A specialty form may replace the normal transit price after meeting its
   * condition. These stated costs still scale with caster level in the walk.
   * The ordinary relief remains in force when the condition is not met.
   */
  metTransit?: {
    reagent: number
    gap: number
  }
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
 * shape of the ring cannot: whether a reagent was actually fed. The baseline
 * uses the casting's visible rounding, so its verdict cannot disagree with a
 * current the player can see reach a reagent.
 *
 * A condition is normally read before the ring is walked, since the walk needs
 * to know what it spares before the first crossing — but "was this reagent fed"
 * is an output of the walk, not an input. `fedUnderBaseline` breaks that circle
 * by resolving the same ring under the assumption its condition holds. The
 * verdict therefore asks whether the relief makes the stated delivery possible,
 * without using a private rounding rule or chasing repeated resolutions.
 *
 * Built lazily by `computeReaction` (`buildConditionContext` in `lib/reaction.ts`)
 * — the baseline resolution only happens if a condition actually calls it.
 */
export interface ConditionContext {
  /** Whether the slot's demand was fully met, resolving under the prayer. */
  fedUnderBaseline: (slotIndex: number) => boolean
  /** Whether the slot received any of what it demanded, resolving under the prayer. */
  touchedUnderBaseline: (slotIndex: number) => boolean
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
 * Elegy turns toll into a small, capped intensification: `tollPerManifestation`
 * toll buys one unit of manifestation, up to `maximumManifestation`.
 *
 * Deliberately a price and a ceiling rather than a multiplier. A multiplier
 * makes the largest, most underfed elegies grow fastest, which would leave an
 * 80-toll outlier as the only expert play.
 *
 * Both numbers are the full-power ones, and `GRIEF_POWER` scales both.
 */
export const ELEGY_GRIEF = {
  baseToll: 0,
  tollPerManifestation: 3,
  maximumManifestation: 50,
} as const

/**
 * What a working at `level` pays for grief, and how much of it it may buy, as a
 * fraction of the full-power numbers.
 *
 * **The rate is the one quantity in the system that runs *against* level.**
 * Multiplying the price by 0.6 at level one means a lesser working buys a unit
 * of manifestation for less toll than a greater one does. The reason is the
 * elegy's guaranteed wound: it forbids a source, so its first reagent always
 * starves and the rite always pays a fixed price unrelated to what the ring
 * goes on to deliver. `LEVEL_POWER` shrinks the delivery while `TRANSIT_POWER`
 * leaves a low-level lap proportionally dearer, so a flat rate would hand the
 * whole of grief's compensation to the caster needing it least.
 *
 * The steps are 10 points where `LEVEL_POWER`'s are 15, and both end at 1: the
 * rate improves as level falls, never fast enough to make a lesser elegy the
 * stronger one. `griefCeiling` reads the same table forwards, so the ceiling
 * moves *with* the working and bounds the cheap rate rather than compounding it.
 */
export const GRIEF_POWER: Record<CasterLevel, number> = {
  1: 0.6,
  2: 0.7,
  3: 0.8,
  4: 0.9,
  5: 1,
}

/** The toll one unit of grief-bought manifestation costs a working at `level`. */
export function griefTollPerManifestation(level: CasterLevel): number {
  return ELEGY_GRIEF.tollPerManifestation * GRIEF_POWER[level]
}

/** The most manifestation grief can buy a working at `level`, in whole units. */
export function griefCeiling(level: CasterLevel): number {
  return Math.round(ELEGY_GRIEF.maximumManifestation * GRIEF_POWER[level])
}

/**
 * A met ward is paid back for its doorway: half of what slots I and VIII were
 * actually given comes back as manifestation, to a ceiling.
 *
 * **Keyed on what the two slots received, never on what they released.** A
 * source demands nothing and so receives nothing, which is what stops the one
 * source a ring may hold from being parked on a doorpost for free. To collect,
 * a threshold slot has to be a hungry reagent the ring genuinely fed, and slot
 * I can only be fed once the current comes round, so the bonus asks for a
 * chain that reaches the door it started at.
 *
 * It is bought rather than granted: a met ward spares both losses, so current
 * drawn into a doorpost is current that would otherwise have reached the mouth,
 * and starving the middle to feed the doors cuts what the middle releases under
 * `measure`.
 *
 * The rate and the ceiling both run *with* level (`LEVEL_POWER`, unlike
 * grief's reversed `GRIEF_POWER`): what a door receives is scaled reagent
 * demand, so it shrinks with the working already and needs no second
 * correction.
 */
export const WARD_DOOR = {
  receivedPerManifestation: 2,
  maximumManifestation: 8,
} as const

/** The most manifestation a ward's doorway can return at `level`, in whole units. */
export function doorCeiling(level: CasterLevel): number {
  return Math.round(WARD_DOOR.maximumManifestation * LEVEL_POWER[level])
}

/**
 * A met invocation gathers everything it delivers into one currency, and a unit
 * is lost for each currency taken in. The rite calls a thing by one name, so it
 * answers in one.
 *
 * **This is a trade, not a bonus, and deliberately so** — the invocation is the
 * strongest form on the frontier and does not need power.
 *
 * Nothing here makes units out of nothing, which is why the reaction declares
 * no third bonus field for it: the lost units go to `bled`, where transit and
 * spill already land, and the first law balances untouched.
 */
export const INVOCATION_FOLD = {
  lostPerCurrency: 1,
} as const

/**
 * The non-sink slots a met dirge keeps: the nearest reagent on each side of its
 * first fully fed sink, wrapping around gaps. `fedUnderBaseline` is the same
 * verdict the condition used, so a sink can never grant preservation by being
 * fed only after the dirge has already spared its losses.
 *
 * **The choice is deliberately deterministic.** The first fully fed sink
 * clockwise from I anchors it, and the nearest non-sink on either side is kept.
 * Reordering the circle is already the craft the ring asks of the caster, so a
 * random preservation would hide a resource decision the layout can state
 * plainly and the player can plan around.
 *
 * The cap of two is the two directions, not a constant: there was a
 * `DIRGE_KEPT_REAGENTS = 2` beside this that nothing ever read, since the
 * number is structural here rather than tunable.
 */
export function dirgeKeptSlots(placements: Placement[], context: ConditionContext): number[] {
  const anchor = [...placements]
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .find(
      (placement) =>
        describeRole(placement.component) === 'sink' && context.fedUnderBaseline(placement.slotIndex),
    )
  if (!anchor) return []

  const bySlot = new Map(placements.map((placement) => [placement.slotIndex, placement]))
  const nearestNonSink = (direction: -1 | 1, excluded: Set<number>): number | null => {
    for (let distance = 1; distance < RING_SLOT_COUNT; distance++) {
      const slotIndex = (anchor.slotIndex + direction * distance + RING_SLOT_COUNT) % RING_SLOT_COUNT
      const placement = bySlot.get(slotIndex)
      if (
        placement &&
        describeRole(placement.component) !== 'sink' &&
        !excluded.has(slotIndex)
      ) {
        return slotIndex
      }
    }
    return null
  }

  const kept: number[] = []
  for (const direction of [-1, 1] as const) {
    const slotIndex = nearestNonSink(direction, new Set(kept))
    if (slotIndex !== null) kept.push(slotIndex)
  }
  return kept
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
  halved:
    `Crossings cost half their ordinary rate: ${TRANSIT_LOSS_GAP * transitScale('halved')} across a gap, ` +
    `${TRANSIT_LOSS_REAGENT * transitScale('halved')} across a reagent at full power.`,
  doubled:
    `Crossings cost double their ordinary rate: ${TRANSIT_LOSS_GAP * transitScale('doubled')} across a gap, ` +
    `${TRANSIT_LOSS_REAGENT * transitScale('doubled')} across a reagent at full power.`,
}

const SPILL_RELIEF: Record<Exclude<LossRelief, 'plain'>, string> = {
  spared: 'Nothing spills. The ring delivers everything it still holds.',
  // Reached through `both` rather than on its own: the litany's half reward
  // spares half the spill alongside half the crossing. No form names `spill`
  // by itself at any reward — see `FormCondition.loss`.
  halved: 'Half of what would have spilled reaches the mouth after all.',
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
    halved: `${TRANSIT_RELIEF.halved} ${SPILL_RELIEF.halved}`,
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

const BASE_BENEDICTION_CONDITION: FormCondition = {
  statement: 'No more than three reagents stand in the ring.',
  loss: 'both',
  test: (placements) => placements.length > 0 && placements.length <= 3,
  slots: filledSlots,
}

const SPECIALTY_BENEDICTION_CONDITIONS: Record<CasterSpecialty, FormCondition> = {
  warden: {
    statement: 'No more than four reagents stand in the ring, exactly one is a source, and at least one is a relay.',
    loss: 'both',
    test: (placements) =>
      placements.length <= 4 &&
      slotsWithRole(placements, 'source').length === 1 &&
      slotsWithRole(placements, 'relay').length >= 1,
    slots: filledSlots,
  },
  invoker: {
    statement: 'No more than four reagents stand in the ring, and each yields a currency another reagent demands.',
    loss: 'both',
    test: (placements) =>
      placements.length <= 4 &&
      placements.every((placement) =>
        CURRENCIES.some(
          (currency) =>
            (placement.component.yields[currency] ?? 0) > 0 &&
            placements.some(
              (other) =>
                other !== placement && (other.component.demands[currency] ?? 0) > 0,
            ),
        ),
      ),
    slots: filledSlots,
  },
  mourner: {
    statement: 'No more than four reagents stand in the ring, exactly two are sources, and a sink receives some of its demand.',
    loss: 'both',
    test: (placements, context) =>
      placements.length <= 4 &&
      slotsWithRole(placements, 'source').length === 2 &&
      slotsWithRole(placements, 'sink').some((slotIndex) => context.touchedUnderBaseline(slotIndex)),
    slots: filledSlots,
  },
}

/** The exact cost or relief a condition has earned, for the reaction panel. */
export function conditionCostRule(condition: FormCondition, met: boolean): string {
  const relief: Exclude<LossRelief, 'plain'> = met ? (condition.reward ?? 'spared') : 'doubled'
  if (!met || !condition.metTransit) return LOSS_RELIEF_RULE[condition.loss][relief]

  const transit =
    condition.metTransit.reagent === 0
      ? `Reagent crossings are free. Gaps cost ${condition.metTransit.gap} at full power.`
      : `At full power, crossings cost ${condition.metTransit.gap} across a gap, ${condition.metTransit.reagent} across a reagent.`
  if (condition.loss === 'transit') return transit
  return `${transit} ${SPILL_RELIEF[relief]}`
}

const SPECIALTY_LITANY_CONDITIONS: Partial<Record<CasterSpecialty, FormCondition>> = {
  warden: {
    statement: 'A relay sits immediately before a source, and at least two slots are empty.',
    loss: 'both',
    reward: 'spared',
    test: (placements) => {
      const hasAnsweringPair = placements.some(
        (relay) =>
          describeRole(relay.component) === 'relay' &&
          placements.some(
            (source) =>
              describeRole(source.component) === 'source' &&
              relay.slotIndex === (source.slotIndex - 1 + RING_SLOT_COUNT) % RING_SLOT_COUNT,
          ),
      )
      return hasAnsweringPair && placements.length <= RING_SLOT_COUNT - 2
    },
    slots: (placements) =>
      placements
        .filter(
          (placement) =>
            (describeRole(placement.component) === 'relay' &&
              placements.some(
                (source) =>
                  describeRole(source.component) === 'source' &&
                  placement.slotIndex ===
                    (source.slotIndex - 1 + RING_SLOT_COUNT) % RING_SLOT_COUNT,
              )) ||
            (describeRole(placement.component) === 'source' &&
              placements.some(
                (relay) =>
                  describeRole(relay.component) === 'relay' &&
                  relay.slotIndex === (placement.slotIndex - 1 + RING_SLOT_COUNT) % RING_SLOT_COUNT,
              )),
        )
        .map((placement) => placement.slotIndex),
  },
  invoker: {
    statement: 'At least one relay stands in the ring, at least three reagents demand a currency another reagent yields, and at least one slot is empty.',
    loss: 'both',
    reward: 'halved',
    // Nothing between voices, the plain price across a silence. `metTransit`
    // rather than a plain reward because the two halves differ: the reagents
    // the condition names cross for nothing, and the silence it requires costs
    // full price. The condition's own open-ring clause is load-bearing — a free
    // lap on a closed ring would simply be the invocation on an easier bar.
    //
    // A relay standing here saves nothing it was not already saving: the stated
    // reagent price is 0, so `statedTransitCost`'s relay branch and this pair
    // agree to the unit. That branch is still right to answer the relay first,
    // since law 2 binds every stated pair and not only this one.
    metTransit: { reagent: 0, gap: TRANSIT_LOSS_GAP },
    test: (placements) =>
      slotsWithRole(placements, 'relay').length >= 1 &&
      placements.filter((placement) =>
        CURRENCIES.some(
          (currency) =>
            (placement.component.demands[currency] ?? 0) > 0 &&
            placements.some(
              (other) =>
                other !== placement && (other.component.yields[currency] ?? 0) > 0,
            ),
        ),
      ).length >= 3 &&
      placements.length < RING_SLOT_COUNT,
    // The relays and the reagents that answer one another. The silence is a
    // count rather than a particular slot, so there is nothing there to mark,
    // the same reading the ward's threshold takes of its own two empty slots.
    slots: (placements) =>
      placements
        .filter(
          (placement) =>
            describeRole(placement.component) === 'relay' ||
            CURRENCIES.some(
              (currency) =>
                (placement.component.demands[currency] ?? 0) > 0 &&
                placements.some(
                  (other) =>
                    other !== placement && (other.component.yields[currency] ?? 0) > 0,
                ),
            ),
        )
        .map((placement) => placement.slotIndex),
  },
}

export const FORM_META: Record<SpellForm, SpellFormMeta> = {
  prayer: {
    form: 'prayer',
    label: 'Prayer',
    article: 'a',
    gloss: 'The first form anyone is taught. It addresses something and asks.',
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
      loss: 'both',
    // With no source anywhere, the first reagent the current reaches always
    // starves, guaranteeing a toll — that fixed price buys both reliefs:
    // nothing pays to cross, and whatever the ring still holds at the mouth
    // leaves whole rather than in proportion to how closed it is. Excess toll
    // also intensifies a met elegy by `ELEGY_GRIEF`, settled in the resolver.
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
      loss: 'both',
      // A relay gives back exactly what it was given — the mechanical "echo" the
      // gloss's "said through twice" describes. A role rather than a shape, so the
      // other six slots pack as densely as any other form's.
      //
      // `both`, not `spill` alone: sparing spill does nothing on a closed ring,
      // so a `spill`-only litany let a caster ignore the condition entirely and
      // just fill the ring, matching a ring that actually seated two relays.
      // Spending the transit half too means that dodge still pays the doubled
      // lap. `halved`, not the full spare invocation earns: two relays is a far
      // easier bar than filling all eight slots.
      reward: 'halved',
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
      // crossing, making this the dearest form to misjudge. A met invocation
      // also folds what it delivers into one currency by `INVOCATION_FOLD`,
      // settled in the resolver.
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
      // `both`, and spared outright. The condition forbids the ring from ever
      // closing, so the spill is the one loss a ward can never walk away from
      // and no placement improves on it. Relieving only the transit left the
      // form relieving the loss it barely pays and paying the loss it cannot,
      // and its best rings ignored the threshold and filled the circle instead.
      //
      // Spared rather than halved: the ward asks for a smaller ring than the
      // invocation but pays for it permanently, in two slots it may never fill
      // and in slot I standing first, where a reagent fires before anything has
      // crossed into the ring. A met ward is also paid back part of what those
      // two slots were fed, by `WARD_DOOR`, settled in the resolver.
      loss: 'both',
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
    // The small-circle form: three reagents deliver all they hold instead of a
    // fraction. Specialty-written benedictions can earn a fourth place through
    // their own composition rule; rites written before specialties keep this
    // plain version forever.
    condition: BASE_BENEDICTION_CONDITION,
  },
}

/** The condition a rite was inscribed with. Legacy rites retain the base form's condition. */
export function conditionFor(form: SpellForm, specialty: CasterSpecialty | null): FormCondition | null {
  if (form === 'benediction' && specialty) return SPECIALTY_BENEDICTION_CONDITIONS[specialty]
  if (form === 'litany' && specialty) return SPECIALTY_LITANY_CONDITIONS[specialty] ?? FORM_META.litany.condition
  return FORM_META[form].condition
}

/** Specialty-written forms carry their own names as well as their conditions. */
export function formLabelFor(form: SpellForm, specialty: CasterSpecialty | null): string {
  if (form === 'benediction') {
    if (specialty === 'warden') return 'Threshold Benediction'
    if (specialty === 'invoker') return 'Herald Benediction'
    if (specialty === 'mourner') return 'Parting Benediction'
  }
  if (form === 'litany') {
    if (specialty === 'warden') return 'Vigil Litany'
    if (specialty === 'invoker') return 'Answering Litany'
  }
  return FORM_META[form].label
}

/**
 * The indefinite article for whatever `formLabelFor` returns. A specialty renames
 * the rite, so the base form's `article` is the wrong word for it: an answering
 * litany is not "a litany" with a prefix stuck on. Stated per name rather than
 * guessed from the first letter, for the reason `SpellFormMeta.article` gives.
 */
export function articleFor(form: SpellForm, specialty: CasterSpecialty | null): 'a' | 'an' {
  if (form === 'litany' && specialty === 'invoker') return 'an'
  return FORM_META[form].article
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
  specialty: CasterSpecialty | null = null,
): { met: boolean | null; transit: LossRelief; spill: LossRelief } {
  const condition = conditionFor(form, specialty)
  if (!condition || placements.length === 0) {
    return { met: null, transit: 'plain', spill: 'plain' }
  }

  const met = condition.test(placements, context)
  const relief: LossRelief = met ? (condition.reward ?? 'spared') : 'doubled'
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
export function conditionSlots(
  form: SpellForm,
  placements: Placement[],
  specialty: CasterSpecialty | null = null,
): ReadonlySet<number> {
  const condition = conditionFor(form, specialty)
  if (!condition || placements.length === 0) return EMPTY_SLOTS
  return new Set(condition.slots(placements))
}
