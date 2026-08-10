/**
 * Throwaway balance harness. Compiled out to the scratchpad and run under node;
 * not part of the app. See CLAUDE.md "Balance".
 *
 * Two things to check, and they are separable. The circle itself: that law 1 holds
 * on every ring, that the ring shape still matters, and that every currency in the
 * catalog still reaches the mouth. And the forms, which are resolver inputs again:
 * that each of the seven is worth choosing somewhere, that the three measuring
 * forms never charge the body, and that no condition is either free to satisfy or
 * impossible to.
 *
 * Everything measuring the circle runs under PLAIN, the prayer, which is the one
 * form that asks nothing and spares nothing. Those numbers are directly comparable
 * with the table in CLAUDE.md from before forms became behavioural, and they must
 * stay so: a change that moves the prayer has moved the circle, not the forms.
 */
import { buildSeedComponents } from '../src/data/seedComponents'
import { computeReaction } from '../src/lib/reaction'
import { CURRENCY_META, describeRole } from '../src/data/currencies'
import { FORM_META, conditionRelief } from '../src/data/spellForms'
import {
  CURRENCIES,
  RING_SLOT_COUNT,
  SPELL_FORMS,
  ledgerAmount,
  ledgerEntries,
  ledgerTotal,
  type Currency,
  type Ledger,
  type MaterialComponent,
  type Placement,
  type SpellForm,
} from '../src/types/worldbuilding'

/** The form every measurement of the circle itself is taken under. */
const PLAIN: SpellForm = 'prayer'

let seq = 0
const CATALOG: MaterialComponent[] = buildSeedComponents(() => `c${seq++}`, 0)

/**
 * The catalog split by the one question the builders ask of it, through the same
 * derived predicate the app labels the tray with. Restating it as
 * `ledgerTotal(demands) === 0` is what let the probes below drift apart from the
 * cohorts they are meant to be comparable with.
 */
const SOURCES: MaterialComponent[] = CATALOG.filter((c) => describeRole(c) === 'source')
const NON_SOURCES: MaterialComponent[] = CATALOG.filter((c) => describeRole(c) !== 'source')

/**
 * The source both transit probes are pinned to. One reagent, so the two hard
 * assertions cannot start probing with different ones when the catalog is retuned.
 */
const MOTION_SOURCE = SOURCES.find((c) => ledgerAmount(c.yields, 'motion') >= 10)

// Deterministic PRNG so runs are comparable between tunings.
let state = 0x2f6e2b1
function rand(): number {
  state = (state * 1664525 + 1013904223) >>> 0
  return state / 0x100000000
}
function pick<T>(items: T[]): T {
  return items[Math.floor(rand() * items.length)]
}

/**
 * Fisher-Yates, returning a new array. `sort(() => rand() - 0.5)` is not a
 * shuffle — the comparator is inconsistent, so the result is biased toward the
 * input order by an amount that depends on the sort implementation. A harness
 * whose "random" rings lean on catalog order is measuring the catalog order.
 */
function shuffled<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function randomRing(reagents: number): Placement[] {
  const chosen = shuffled([...Array(RING_SLOT_COUNT).keys()])
    .slice(0, reagents)
    .sort((a, b) => a - b)
  const pool = [...CATALOG]
  const placements: Placement[] = []
  for (const slotIndex of chosen) {
    const idx = Math.floor(rand() * pool.length)
    placements.push({ slotIndex, component: pool.splice(idx, 1)[0] })
  }
  return placements
}

/** A ring built the way a player builds one: a source first, then anything. */
function builtRing(reagents: number): Placement[] {
  const placements: Placement[] = [{ slotIndex: 0, component: pick(SOURCES) }]
  const pool = [...NON_SOURCES]
  for (let slotIndex = 1; slotIndex < reagents; slotIndex++) {
    const idx = Math.floor(rand() * pool.length)
    placements.push({ slotIndex, component: pool.splice(idx, 1)[0] })
  }
  return placements
}

/**
 * A ring built so that every reagent is actually fed: each slot takes the first
 * candidate that leaves the circle with no shortfall anywhere. This is the ring a
 * competent player builds, and the only bucket in which a toll means a mistake
 * rather than a choice.
 */
function fedRing(reagents: number): Placement[] {
  const placements: Placement[] = [{ slotIndex: 0, component: pick(SOURCES) }]
  const pool = CATALOG.filter((c) => c !== placements[0].component)
  for (let slotIndex = 1; slotIndex < reagents; slotIndex++) {
    if (!growFed(placements, pool, slotIndex)) break
  }
  return placements
}

/**
 * Fills one slot with the first candidate that leaves the ring starving nowhere,
 * spending it out of `pool`. Returns false if the pool holds no such reagent.
 *
 * This is the harness's definition of "fed", and it is here once because three
 * cohorts are built on it. The two builders around it differ only in which slots
 * they walk and what they do when a slot cannot be filled.
 */
function growFed(placements: Placement[], pool: MaterialComponent[], slotIndex: number): boolean {
  for (const candidate of shuffled(pool)) {
    const trial = [...placements, { slotIndex, component: candidate }]
    const r = computeReaction(trial, PLAIN)
    if (r.slots.every((slot) => ledgerEntries(slot.shortfall).length === 0)) {
      placements.push({ slotIndex, component: candidate })
      pool.splice(pool.indexOf(candidate), 1)
      return true
    }
  }
  return false
}

/**
 * A fed ring in a *given* set of slots, or `[]` if the catalog cannot fill them
 * without starving something.
 *
 * `fedRing` above always lays its reagents contiguously from slot I, which is how a
 * player builds but is only one shape. Three of the six conditions ask for a shape
 * it can never produce — two pairs with a hole between them, or slot VIII filled
 * with the middle open — so measuring those forms against a contiguous builder
 * reports them unreachable when they are merely unbuilt.
 *
 * Slots must arrive in ascending order: the check is incremental, and it is only
 * valid because adding a later slot cannot retroactively starve an earlier one.
 */
function fedRingIn(slots: number[]): Placement[] {
  const placements: Placement[] = []
  const pool = [...CATALOG]
  for (const slotIndex of slots) {
    if (!growFed(placements, pool, slotIndex)) return []
  }
  return placements
}

interface Row {
  reagents: number
  manifestation: number
  /** The largest single currency in the manifestation, for concentration. */
  purest: number
  toll: number
  bled: number
  /** Currencies the reagents released, whether or not any survived to the mouth. */
  width: number
  delivered: Partial<Record<Currency, number>>
  /** Whether the ring answered what the form asks. Null for the prayer, which asks nothing. */
  met: boolean | null
}

function resolve(ring: Placement[], form: SpellForm = PLAIN): Row {
  const reaction = computeReaction(ring, form)

  // Law 1, checked on every ring and under every form: every unit a reagent
  // released either was drawn by another slot, bled away, or left at the mouth.
  // The one law that cannot move, so the harness throws rather than reporting.
  //
  // A measured reagent balances here without a special case: it released a cut-down
  // yield, and `released` is what it actually put into the ring rather than what the
  // catalog says it carries. A form that let a reagent release a yield it was never
  // fed would trip this immediately, which is the point — it is the guard rail on
  // the whole form mechanism.
  let released = 0
  let received = 0
  for (const slot of reaction.slots) {
    released += ledgerTotal(slot.released)
    received += ledgerTotal(slot.received)
  }
  const accounted = reaction.manifestationTotal + reaction.bledTotal + received
  if (accounted !== released) {
    throw new Error(`conservation broken: released ${released}, accounted ${accounted}`)
  }

  const raised = new Set<Currency>()
  for (const slot of reaction.slots) {
    for (const [currency] of ledgerEntries(slot.released)) raised.add(currency)
  }

  const delivered: Partial<Record<Currency, number>> = {}
  for (const currency of CURRENCIES) {
    const amount = ledgerAmount(reaction.manifestation, currency)
    if (amount > 0) delivered[currency] = amount
  }

  return {
    reagents: ring.length,
    manifestation: reaction.manifestationTotal,
    purest: Math.max(0, ...ledgerEntries(reaction.manifestation).map(([, n]) => n)),
    toll: reaction.tollTotal,
    bled: reaction.bledTotal,
    width: raised.size,
    delivered,
    met: reaction.conditionMet,
  }
}

// ---------------------------------------------------------------- accumulate

interface Cell {
  n: number
  manifestation: number
  purest: number
  toll: number
  bled: number
  width: number
  /** Rings that reached the mouth with nothing at all. */
  dead: number
  /** Rings that fed every reagent in them and so cost the caster nothing. */
  clean: number
}

function cell(): Cell {
  return { n: 0, manifestation: 0, purest: 0, toll: 0, bled: 0, width: 0, dead: 0, clean: 0 }
}

type Tally = Map<string, Cell>

const PER_COUNT = 8000

const byCount: Tally = new Map()
const builtByCount: Tally = new Map()
const fedByCount: Tally = new Map()
/** Total delivered per currency, over every ring, to catch a dead currency. */
const deliveredTotals = new Map<Currency, number>(CURRENCIES.map((c) => [c, 0]))
let rings = 0

function record(tally: Tally, key: string, row: Row): void {
  let c = tally.get(key)
  if (!c) {
    c = cell()
    tally.set(key, c)
  }
  c.n++
  c.manifestation += row.manifestation
  c.purest += row.purest
  c.toll += row.toll
  c.bled += row.bled
  c.width += row.width
  if (row.manifestation === 0) c.dead++
  // Unmet demand is the only thing charged to the caster, so a clean ring is one
  // that fed every reagent standing in it and cost the body nothing at all.
  if (row.toll === 0) c.clean++
  rings++
  for (const [currency, amount] of Object.entries(row.delivered) as Array<[Currency, number]>) {
    deliveredTotals.set(currency, deliveredTotals.get(currency)! + amount)
  }
}

for (let reagents = 1; reagents <= RING_SLOT_COUNT; reagents++) {
  const key = `${reagents} reagents`
  for (let i = 0; i < PER_COUNT; i++) record(byCount, key, resolve(randomRing(reagents)))
  for (let i = 0; i < PER_COUNT; i++) record(builtByCount, key, resolve(builtRing(reagents)))
  for (let i = 0; i < PER_COUNT / 8; i++) {
    const ring = fedRing(reagents)
    record(fedByCount, `${ring.length} fed reagents`, resolve(ring))
  }
}

// ------------------------------------------------------------------- report

function table(title: string, tally: Tally): void {
  console.log(`\n=== ${title} ===`)
  console.log(
    '                    ' +
      ['manif', 'purest', 'toll', 'bled', 'width', 'dead', 'clean']
        .map((h) => h.padStart(7))
        .join(''),
  )
  for (const [key, c] of tally) {
    const avg = (total: number) => (total / c.n).toFixed(1).padStart(7)
    const pct = (count: number) => `${Math.round((count / c.n) * 100)}%`.padStart(7)
    console.log(
      key.padEnd(20) +
        avg(c.manifestation) +
        avg(c.purest) +
        avg(c.toll) +
        avg(c.bled) +
        avg(c.width) +
        pct(c.dead) +
        pct(c.clean),
    )
  }
}

table('random rings', byCount)
table('source-first rings', builtByCount)
table('fully fed rings', fedByCount)

// The catalog is tuned so that every currency circulates. A currency that never
// survives to the mouth is a dead currency, and retuning a seed's ledgers is how
// one dies.
console.log(`\n=== delivered by currency over ${rings} rings ===`)
const deliveredAll = [...deliveredTotals.values()].reduce((a, b) => a + b, 0) || 1
for (const currency of CURRENCIES) {
  const total = deliveredTotals.get(currency)!
  console.log(
    `${CURRENCY_META[currency].label.padEnd(10)}${String(total).padStart(10)}  ${`${Math.round((total / deliveredAll) * 100)}%`.padStart(4)}`,
  )
}

/**
 * The relay crossing, measured against the arithmetic it is supposed to satisfy.
 * A reagent at slot II and a reagent at slot IV with a hole between them: the current
 * pays 2 for the hole and 1 to enter slot IV, so 3. Put a relay at slot IV instead
 * and it pays the hole and nothing else, so 2. The relay is free wherever it
 * stands, and this is the check that it stays that way.
 */
function relayProbe(): void {
  const source = MOTION_SOURCE
  if (!source) {
    console.log('\n=== the relay crossing: no motion source in the catalog to probe with ===')
    return
  }

  // Two reagents that demand exactly the same thing and differ only in role: giving
  // back what it asks makes the first a relay, giving back something else makes
  // the second a converter. Same demand means each receives precisely what
  // survived the crossings, so the gap between them is the free passage alone.
  const reagent = (name: string, yields: Ledger): MaterialComponent => ({
    id: name,
    name,
    description: '',
    demands: { motion: 12 },
    yields,
    rarity: 'common',
    isSeed: false,
    createdAt: 0,
    updatedAt: 0,
  })
  const probeRelay = reagent('probe relay', { motion: 12 })
  const probeReagent = reagent('probe reagent', { heat: 12 })

  const arriving = (occupant: MaterialComponent) => {
    // Under the prayer: the two forms that spare the transit would make the relay
    // and the reagent cost the same, which is correct behaviour and useless as a
    // probe of the relay rule.
    const r = computeReaction(
      [
        { slotIndex: 1, component: source },
        { slotIndex: 3, component: occupant },
      ],
      PLAIN,
    )
    return ledgerTotal(r.slots.find((s) => s.slotIndex === 3)?.received ?? {})
  }

  const released = ledgerAmount(source.yields, 'motion')
  const relayGot = arriving(probeRelay)
  const reagentGot = arriving(probeReagent)

  console.log('\n=== the relay crossing (source at II, hole at III, occupant at IV) ===')
  console.log(`${source.name} releases ${released}`)
  console.log(`  reached a relay at IV     ${relayGot}   (transit ${released - relayGot})`)
  console.log(`  reached a reagent at IV   ${reagentGot}   (transit ${released - reagentGot})`)
  console.log(
    `  roles: ${describeRole(probeRelay)} / ${describeRole(probeReagent)}` +
      `  ${relayGot === reagentGot + 1 ? 'OK' : 'BROKEN: the relay is not free'}`,
  )
}

/**
 * The free-completion exploit, as a regression check. A relay used to be exempt
 * from the toll — its demand was a rating rather than a requirement — so dropping
 * one into a far-off hole raised `completion` and could not be billed for the
 * demand it then failed to meet: two of them took a four-reagent ring from 8
 * delivered to 14 with the toll unmoved at 7.
 *
 * A relay is now an ordinary reagent but for the free crossing, so an isolated one
 * must *cost* something. What this prints is the change in manifestation and in
 * toll from padding a sparse ring with two of them; the toll must go up.
 */
function isolatedRelaysMustCost(): void {
  const relays = CATALOG.filter((c) => describeRole(c) === 'relay')
  const sources = SOURCES
  const rest = NON_SOURCES.filter((c) => describeRole(c) !== 'relay')
  let gained = 0
  let tolled = 0
  let free = 0
  let checked = 0
  state = 0x1c0ffee

  for (let i = 0; i < 4000; i++) {
    // A run of reagents at the front of the ring, so the back half is all holes.
    const reagents = 2 + Math.floor(rand() * 3)
    const ring: Placement[] = [{ slotIndex: 0, component: pick(sources) }]
    const pool = shuffled(rest)
    for (let s = 1; s < reagents; s++) ring.push({ slotIndex: s, component: pool[s] })

    // Slots VI and VIII, both with a hole on at least one side of them.
    const padded = [
      ...ring,
      { slotIndex: 5, component: pick(relays) },
      { slotIndex: 7, component: pick(relays) },
    ]
    const bare = computeReaction(ring, PLAIN)
    const withRelays = computeReaction(padded, PLAIN)
    const extraToll = withRelays.tollTotal - bare.tollTotal
    gained += withRelays.manifestationTotal - bare.manifestationTotal
    tolled += extraToll

    // The exploit, precisely: the added relays went hungry and the caster was not
    // billed for it, yet the ring still delivered more. A *fed* relay adding
    // completion is not an exploit — that is what every fed reagent does, and the
    // current had to survive the walk to reach it.
    const starved = [5, 7].some((slotIndex) => {
      const report = withRelays.slots.find((s) => s.slotIndex === slotIndex)
      return report ? ledgerTotal(report.shortfall) > 0 : false
    })
    if (starved && extraToll <= 0 && withRelays.manifestationTotal > bare.manifestationTotal) free++
    checked++
  }

  console.log('\n=== padding a sparse ring with two isolated relays ===')
  console.log(`average manifestation gained ${(gained / checked).toFixed(2)}`)
  console.log(`average toll paid for it     ${(tolled / checked).toFixed(2)}`)
  console.log(
    `starved and still free       ${free}/${checked}  ${free === 0 ? 'OK' : 'EXPLOITABLE'}`,
  )
}

// -------------------------------------------------------------------- forms

/**
 * The seven forms over the same rings, and the three questions worth asking of
 * them.
 *
 * Is each form ever the right choice? Two win columns, because there is no single
 * objective in this game and a form that serves neither is dead in the picker.
 * `loud` counts rings where the form delivered most, and `cheap` counts rings where
 * it scored best on manifestation minus toll.
 *
 * Read `cheap` with care. It treats a unit taken out of the caster as exactly as
 * bad as a unit delivered, which makes doing nothing a strong play: a holding form
 * scoring 0 beats a firing form scoring 18 against a toll of 25. That is what
 * exposed the first cut of the underfed rule, where a binary hold made the three
 * measuring forms sweep `cheap` at an average manifestation of 0.6.
 *
 * Is each condition a real question? `met` is the share of rings answering it. At
 * 100% the condition is free and the forfeit is unreachable; at 0% the boon is.
 *
 * Do the measuring forms ever charge? They must not, under any ring, which is
 * asserted rather than reported.
 */
function formReport(): void {
  interface FormCell {
    n: number
    manifestation: number
    toll: number
    bled: number
    met: number
    loud: number
    cheap: number
  }
  const cells = new Map<SpellForm, FormCell>(
    SPELL_FORMS.map((form) => [
      form,
      { n: 0, manifestation: 0, toll: 0, bled: 0, met: 0, loud: 0, cheap: 0 },
    ]),
  )

  state = 0x5eed1e
  const SAMPLES = 2000

  for (let reagents = 1; reagents <= RING_SLOT_COUNT; reagents++) {
    for (let i = 0; i < SAMPLES; i++) {
      const ring = rand() < 0.5 ? randomRing(reagents) : builtRing(reagents)
      let loudest: SpellForm | null = null
      let loudestScore = -Infinity
      let cheapest: SpellForm | null = null
      let cheapestScore = -Infinity

      for (const form of SPELL_FORMS) {
        const row = resolve(ring, form)
        const cell = cells.get(form)!
        cell.n++
        cell.manifestation += row.manifestation
        cell.toll += row.toll
        cell.bled += row.bled
        if (row.met) cell.met++

        if (FORM_META[form].underfed === 'measure' && row.toll !== 0) {
          throw new Error(`${form} measures but charged a toll of ${row.toll}`)
        }

        if (row.manifestation > loudestScore) {
          loudestScore = row.manifestation
          loudest = form
        }
        const score = row.manifestation - row.toll
        if (score > cheapestScore) {
          cheapestScore = score
          cheapest = form
        }
      }

      cells.get(loudest!)!.loud++
      cells.get(cheapest!)!.cheap++
    }
  }

  console.log('\n=== the seven forms over the same rings ===')
  console.log(
    'form         underfed' +
      ['manif', 'toll', 'bled', 'met', 'loud', 'cheap'].map((h) => h.padStart(8)).join(''),
  )
  const dead: SpellForm[] = []
  for (const [form, c] of cells) {
    const avg = (total: number) => (total / c.n).toFixed(1).padStart(8)
    const pct = (count: number) => `${Math.round((count / c.n) * 100)}%`.padStart(8)
    console.log(
      form.padEnd(13) +
        FORM_META[form].underfed.padEnd(8) +
        avg(c.manifestation) +
        avg(c.toll) +
        avg(c.bled) +
        (FORM_META[form].condition ? pct(c.met) : '-'.padStart(8)) +
        pct(c.loud) +
        pct(c.cheap),
    )
    if (c.loud === 0 && c.cheap === 0) dead.push(form)
  }
  console.log(
    dead.length === 0
      ? 'every form wins on one objective or the other  OK'
      : `never the best choice either way: ${dead.join(', ')}  DEAD FORM`,
  )
}

/**
 * Each form on ground it chose: rings that answer its condition, scored against the
 * prayer on the very same ring.
 *
 * Run twice, over rings drawn two ways, and the pair is the point.
 *
 * On **careless** rings — reagents thrown in — the four crediting forms look strong
 * and the three measuring ones look broken. They are not. A careless ring feeds the
 * average slot 38% of what it asked, and the prayer's output there is almost
 * entirely reagents firing on demands nothing ever met, which is exactly what its
 * toll of 20-odd is buying. A measuring form declines that credit, so it delivers
 * little and charges nothing, and the comparison is a statement about the two
 * underfed rules rather than about either form.
 *
 * On **fed** rings — every reagent supplied in full — a measuring form and the
 * prayer resolve identically, because nothing is stinted when nothing is short.
 * Whatever separates them there is the condition alone, which is what the boon is
 * actually worth. This is the column to read when tuning a condition.
 *
 * Rings are found by rejection: draw, then keep the ones the real predicate accepts,
 * so the shapes are never described twice and cannot drift from `FORM_META`. Failing
 * to find any is itself the reachability check — a condition no ring satisfies is a
 * form that only ever carries its forfeit.
 */
function formsOnTheirOwnGround(): void {
  const WANTED = 1200
  const CAP = 300000

  for (const cohort of ['careless', 'fed'] as const) {
    state = cohort === 'fed' ? 0xfed0fed : 0xd16e5
    // Feeding an arbitrary slot set is dear, so the fed cohort is smaller and
    // screens the shape with a throwaway random ring before paying for the fill.
    const wanted = cohort === 'fed' ? 300 : WANTED
    const cap = cohort === 'fed' ? 60000 : CAP
    console.log(`\n=== each form on ${cohort} rings that answer it, against the prayer ===`)
    console.log(
      'form         rings' +
        ['manif', 'toll', 'vs plain', 'plaintoll'].map((h) => h.padStart(10)).join(''),
    )

    for (const form of SPELL_FORMS) {
      if (!FORM_META[form].condition) continue

      let found = 0
      let tries = 0
      let manifestation = 0
      let toll = 0
      let plainManifestation = 0
      let plainToll = 0

      while (found < wanted && tries < cap) {
        tries++
        const reagents = 1 + Math.floor(rand() * RING_SLOT_COUNT)
        let ring: Placement[]
        if (cohort === 'fed') {
          // Screen a throwaway ring in these slots first. It settles the four
          // conditions that only read the shape, and costs nothing next to the fill.
          const shape = randomRing(reagents)
          if (!conditionRelief(form, shape).met) continue
          ring = fedRingIn(shape.map((p) => p.slotIndex))
        } else {
          ring = rand() < 0.5 ? randomRing(reagents) : builtRing(reagents)
        }
        if (ring.length === 0) continue
        // The gate is the predicate itself, not a resolved ring. `computeReaction`
        // reads `conditionMet` straight off `conditionRelief` before it walks a
        // single slot, and most draws here are rejected — paying for a full walk to
        // answer a question about slot indices was most of this harness's runtime.
        if (!conditionRelief(form, ring).met) continue

        found++
        const own = resolve(ring, form)
        const plain = resolve(ring, PLAIN)
        manifestation += own.manifestation
        toll += own.toll
        plainManifestation += plain.manifestation
        plainToll += plain.toll
      }

      if (found === 0) {
        // Expected for the elegy when fed, and only for the elegy: it forbids a
        // source anywhere, so the first reagent the current reaches has nothing to
        // draw on and must starve. An elegy always pays something, by construction.
        const why = cohort === 'fed' && form === 'elegy' ? '  (no source, so it cannot be fed)' : ''
        console.log(`${form.padEnd(13)}UNREACHABLE in ${tries} tries${why}`)
        continue
      }
      const avg = (total: number) => (total / found).toFixed(1).padStart(10)
      console.log(
        form.padEnd(13) +
          String(found).padEnd(5) +
          avg(manifestation) +
          avg(toll) +
          avg(plainManifestation) +
          avg(plainToll) +
          (found < wanted ? `   only ${found} in ${tries} tries` : ''),
      )
    }
  }
}

/**
 * A crossing must be paid by the current it is carrying, not by whatever else
 * happens to be in the ring.
 *
 * The pair: a reagent fed across two holes, with and without an unrelated source
 * standing at slot I. Billing the oldest parcel first made the source absorb every
 * crossing in the lap, so the chain behind it travelled free and the same arc read
 * 7 with the source and 2 without. Both readings must now agree.
 *
 * The second half is the other side of the same rule. A lone source demands
 * nothing, so nothing it carries was ever asked for; without the fallback to the
 * oldest current it would ride the whole ring untouched and cross for free.
 */
function transitPayerProbe(): void {
  const source = MOTION_SOURCE
  const feeder = CATALOG.find((c) => ledgerAmount(c.yields, 'heat') >= 7)
  const eater = CATALOG.find((c) => ledgerAmount(c.demands, 'heat') >= 7)
  if (!source || !feeder || !eater) {
    console.log('\n=== the transit payer: no heat chain in the catalog to probe with ===')
    return
  }

  // Slots I, III and VI: two holes between the feeder and the reagent waiting on it.
  const chain: Placement[] = [
    { slotIndex: 2, component: feeder },
    { slotIndex: 5, component: eater },
  ]
  const arriving = (ring: Placement[]) =>
    ledgerAmount(computeReaction(ring, PLAIN).slots.find((s) => s.slotIndex === 5)?.received ?? {}, 'heat')

  const alone = arriving(chain)
  const shielded = arriving([{ slotIndex: 0, component: source }, ...chain])

  const lone = computeReaction([{ slotIndex: 0, component: source }], PLAIN)
  const lap = ledgerTotal(source.yields) - lone.bledTotal

  console.log('\n=== the transit payer (feeder at III, hole, hole, reagent at VI) ===')
  console.log(`${feeder.name} releases heat ${ledgerAmount(feeder.yields, 'heat')}`)
  console.log(`  reached ${eater.name} at VI            ${alone}`)
  console.log(`  the same, with ${source.name} at I  ${shielded}`)
  console.log(
    `  a source cannot pay another chain's way  ${alone === shielded ? 'OK' : 'BROKEN: the chain was shielded'}`,
  )
  console.log(
    `  a lone source still decays over its lap  ${lap <= 0 ? 'OK' : `BROKEN: ${lap} units crossed free`}`,
  )
}

relayProbe()
transitPayerProbe()
isolatedRelaysMustCost()
formReport()
formsOnTheirOwnGround()

// One ring, resolved and printed slot by slot, to read against the laws as written.
const worked: Placement[] = [
  'Falling Weight',
  'Lodestone',
  'Bismuth Crystal',
  'Tourmaline',
  'Charcoal',
  'Hoarfrost',
].map((name, slotIndex) => ({
  slotIndex,
  component: CATALOG.find((c) => c.name === name)!,
}))

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
const reaction = computeReaction(worked, PLAIN)
console.log('\n=== worked example: weight, lodestone, bismuth, tourmaline, charcoal, hoarfrost ===')
function show(ledger: Parameters<typeof ledgerEntries>[0]): string {
  const entries = ledgerEntries(ledger).map(([c, n]) => `${CURRENCY_META[c].short} ${n}`)
  return entries.length ? entries.join(', ') : '-'
}
for (const slot of reaction.slots) {
  const component = worked.find((p) => p.slotIndex === slot.slotIndex)!.component
  console.log(
    `${ROMAN[slot.slotIndex].padEnd(5)}${component.name.padEnd(16)}` +
      `got ${show(slot.received).padEnd(20)} short ${show(slot.shortfall).padEnd(20)} gave ${show(slot.released)}`,
  )
}
console.log(`manifestation ${show(reaction.manifestation)}  (${reaction.manifestationTotal})`)
console.log(`toll          ${show(reaction.toll)}  (${reaction.tollTotal})`)
console.log(`bled          ${show(reaction.bled)}  (${reaction.bledTotal})`)

// The same six reagents in the same slots, said seven ways. This is the one place
// the whole form mechanism is legible at a glance rather than as an average.
console.log('\n=== that same ring, spoken seven ways ===')
console.log('form         cond' + ['manif', 'toll', 'bled'].map((h) => h.padStart(8)).join(''))
for (const form of SPELL_FORMS) {
  const r = computeReaction(worked, form)
  const mark = r.conditionMet === null ? '  - ' : r.conditionMet ? ' met' : 'fail'
  console.log(
    form.padEnd(13) +
      mark +
      String(r.manifestationTotal).padStart(8) +
      String(r.tollTotal).padStart(8) +
      String(r.bledTotal).padStart(8),
  )
}
