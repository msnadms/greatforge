/**
 * Throwaway balance harness. Compiled out to the scratchpad and run under node;
 * not part of the app. See CLAUDE.md "Balance".
 *
 * It used to be a form comparison: resolve one ring seven ways and ask which form
 * won each cell of a cost-tolerance map. Forms are cosmetic now and the resolver
 * does not take one, so what is left to check is the circle itself — that law 1
 * holds on every ring, that the ring shape still matters, and that every currency
 * in the catalog still reaches the mouth on some ring.
 */
import { buildSeedComponents } from '../src/data/seedComponents'
import { computeReaction, type Placement } from '../src/lib/reaction'
import { CURRENCY_META, describeRole } from '../src/data/currencies'
import {
  CURRENCIES,
  RING_SLOT_COUNT,
  ledgerAmount,
  ledgerEntries,
  ledgerTotal,
  type Currency,
  type Ledger,
  type MaterialComponent,
} from '../src/types/worldbuilding'

let seq = 0
const CATALOG: MaterialComponent[] = buildSeedComponents(() => `c${seq++}`, 0)

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
  const sources = CATALOG.filter((c) => ledgerTotal(c.demands) === 0)
  const rest = CATALOG.filter((c) => ledgerTotal(c.demands) > 0)
  const placements: Placement[] = [{ slotIndex: 0, component: pick(sources) }]
  const pool = [...rest]
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
  const sources = CATALOG.filter((c) => ledgerTotal(c.demands) === 0)
  const placements: Placement[] = [{ slotIndex: 0, component: pick(sources) }]
  const pool = CATALOG.filter((c) => c !== placements[0].component)
  for (let slotIndex = 1; slotIndex < reagents; slotIndex++) {
    const order = shuffled(pool)
    let placed = false
    for (const candidate of order) {
      const trial = [...placements, { slotIndex, component: candidate }]
      const r = computeReaction(trial)
      if (r.slots.every((slot) => ledgerEntries(slot.shortfall).length === 0)) {
        placements.push({ slotIndex, component: candidate })
        pool.splice(pool.indexOf(candidate), 1)
        placed = true
        break
      }
    }
    if (!placed) break
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
}

function resolve(ring: Placement[]): Row {
  const reaction = computeReaction(ring)

  // Law 1, checked on every ring: every unit a reagent released either was drawn
  // by another slot, bled away, or left at the mouth. The one law that cannot
  // move, so the harness throws rather than reporting.
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
  const source = CATALOG.find((c) => ledgerTotal(c.demands) === 0 && ledgerAmount(c.yields, 'motion') >= 10)
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
    const r = computeReaction([
      { slotIndex: 1, component: source },
      { slotIndex: 3, component: occupant },
    ])
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
  const sources = CATALOG.filter((c) => ledgerTotal(c.demands) === 0)
  const rest = CATALOG.filter((c) => describeRole(c) !== 'relay' && ledgerTotal(c.demands) > 0)
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
    const bare = computeReaction(ring)
    const withRelays = computeReaction(padded)
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

relayProbe()
isolatedRelaysMustCost()

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
const reaction = computeReaction(worked)
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
