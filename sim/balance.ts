/**
 * Throwaway balance harness. Compiled out to the scratchpad and run under node;
 * not part of the app. See CLAUDE.md "Balance".
 *
 * Checks two separable things: the circle (law 1, ring shape, every currency
 * reaching the mouth) and the forms (each worth choosing somewhere, measuring
 * forms never charge, no condition free or impossible). Circle measurements run
 * under PLAIN, the prayer, so they stay comparable across form changes.
 */
import { buildSeedComponents } from '../src/data/seedComponents'
import { buildConditionContext, computeReaction } from '../src/lib/reaction'
import { CURRENCY_META, describeRole } from '../src/data/currencies'
import { formsForSpecialty } from '../src/data/casterSpecialties'
import { FORM_META, conditionFor, conditionRelief, formLabelFor } from '../src/data/spellForms'
import { NEAR_OPTIMAL_RINGS, NET_OPTIMIZED_FORMS, type NearOptimalRing } from './nearOptimalRings'
import {
  CASTER_LEVELS,
  CASTER_SPECIALTIES,
  CURRENCIES,
  LEVEL_POWER,
  MAX_LEDGER_ENTRY,
  RING_SLOT_COUNT,
  SPELL_FORMS,
  TRANSIT_LOSS_GAP,
  TRANSIT_LOSS_REAGENT,
  ledgerAmount,
  ledgerEntries,
  ledgerTotal,
  type CasterLevel,
  type CasterSpecialty,
  type Currency,
  type Ledger,
  type MaterialComponent,
  type Placement,
  type SpellForm,
} from '../src/types/worldbuilding'

/** The form every measurement of the circle itself is taken under. */
const PLAIN: SpellForm = 'prayer'

interface FormRun {
  form: SpellForm
  specialty: CasterSpecialty | null
}

/** Legacy forms remain the control. Specialty runs exercise the conditions new rites actually retain. */
const FORM_RUNS: FormRun[] = [
  ...SPELL_FORMS.map((form) => ({ form, specialty: null })),
  ...CASTER_SPECIALTIES.flatMap((specialty) =>
    formsForSpecialty(specialty).map((form) => ({ form, specialty })),
  ),
]

function runKey({ form, specialty }: FormRun): string {
  return `${specialty ?? 'legacy'}:${form}`
}

function runLabel({ form, specialty }: FormRun): string {
  return specialty ? `${specialty} ${formLabelFor(form, specialty)}` : `legacy ${formLabelFor(form, null)}`
}

function sourceLimit({ form, specialty }: FormRun): number {
  return form === 'benediction' && specialty === 'mourner' ? 2 : 1
}

/**
 * Everything about a run that decides how a ring resolves under it: the
 * underfed settlement and the whole condition, predicate included. Two runs
 * sharing this resolve every ring identically — a specialty that leaves a
 * form's condition alone (the warden's ward, the invoker's invocation, every
 * specialty's prayer) is the same form as the legacy one, not a rival.
 */
function resolutionSig(run: FormRun): string {
  const condition = conditionFor(run.form, run.specialty)
  return JSON.stringify({
    form: run.form,
    underfed: FORM_META[run.form].underfed,
    sourceLimit: sourceLimit(run),
    condition: condition && {
      statement: condition.statement,
      loss: condition.loss,
      reward: condition.reward ?? 'spared',
      metTransit: condition.metTransit ?? null,
      test: condition.test.toString(),
    },
  })
}

/** Runs that resolve identically, keyed by `resolutionSig`, in `FORM_RUNS` order. */
const RESOLUTION_GROUPS = ((): Map<string, FormRun[]> => {
  const groups = new Map<string, FormRun[]>()
  for (const run of FORM_RUNS) {
    const sig = resolutionSig(run)
    const group = groups.get(sig)
    if (group) group.push(run)
    else groups.set(sig, [run])
  }
  return groups
})()

/**
 * The first run of a group — the one every sample is actually taken under, so
 * the warden's ward and the legacy ward share one search and print one set of
 * numbers instead of two samplings of the same form that differ only by noise.
 */
function canonical(run: FormRun): FormRun {
  return RESOLUTION_GROUPS.get(resolutionSig(run))![0]
}

// Node's globals, declared rather than pulled from `@types/node`, which this
// repo does not install. Keeps the out-of-tree compile clean instead of
// emitting through a TS2591 for `process` on every run.
declare const process: { argv: string[] }
declare function require(name: 'node:fs'): {
  readFileSync(path: string, encoding: 'utf8'): string
  writeFileSync(path: string, data: string, encoding: 'utf8'): void
  mkdirSync(path: string, options: { recursive: boolean }): void
  existsSync(path: string): boolean
}

/**
 * How the harness was asked to run. Full and unfiltered by default, which is
 * the mode every number in CLAUDE.md was taken under.
 *
 *   --near-optimal   only the curated `nearOptimalRings.ts` report
 *   --form=<keys>    only the sections that are per-form, only for these runs
 *                    (`ward`, `warden:ward`, `legacy:ward`; comma-separated)
 *   --quick[=n]      divide every sample size by n (default 10)
 *   --all            with --form, keep the cross-form sections too
 *   --no-cache       ignore the ring cache and do not write to it
 *   --refresh        rebuild every cached ring set
 */
function flag(name: string): string | null {
  const exact = process.argv.indexOf(`--${name}`)
  if (exact >= 0) {
    const next = process.argv[exact + 1]
    return next && !next.startsWith('--') ? next : ''
  }
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`))
  return inline ? inline.slice(name.length + 3) : null
}

const NEAR_OPTIMAL_ONLY = flag('near-optimal') !== null
const QUICK = flag('quick')
const FORM_FILTER = flag('form')
const CACHE_OFF = flag('no-cache') !== null
const CACHE_REFRESH = flag('refresh') !== null

/**
 * Every sample size in the harness is written at its full, tuned value and
 * divided by this. `--quick` trades precision for a run that finishes while
 * you are still looking at it; the numbers it prints are indicative, not the
 * ones to paste into CLAUDE.md, and the header says so.
 */
const SCALE = QUICK === null ? 1 : Math.max(1, Number(QUICK) || 10)
/** Sample size at the current scale, never below `floor` — a divided-down
 * cohort still has to be large enough to mean anything. */
function samples(full: number, floor = 20): number {
  return Math.max(floor, Math.round(full / SCALE))
}

/**
 * Which runs the per-form sections measure. `--form=ward` matches both the
 * legacy and every specialty run of that form; `--form=warden:ward` pins one.
 */
function runSelected(run: FormRun): boolean {
  if (FORM_FILTER === null || FORM_FILTER === '') return true
  return FORM_FILTER.split(',').some((raw) => {
    const want = raw.trim().toLowerCase()
    return want === run.form || want === runKey(run) || want === `${run.specialty}:${run.form}`
  })
}

const SELECTED_RUNS = FORM_RUNS.filter(runSelected)
/**
 * The circle tables, the level table and `formReport` are not per-form —
 * `formReport`'s `loud`/`cheap` columns are a comparison *between* forms, so
 * measuring a subset would change what the winner means. Under `--form` they
 * are skipped rather than quietly narrowed. `--all` keeps them.
 */
const CROSS_FORM_SECTIONS = FORM_FILTER === null || flag('all') !== null

let seq = 0

/**
 * `rare` and `singular` reagents are exceptional by design, not part of the
 * tuned envelope. Every table and probe below measures the catalog any player
 * starts with, so only `common`/`uncommon` are included.
 */
const FULL_CATALOG: MaterialComponent[] = buildSeedComponents(() => `c${seq++}`, 0)
const CATALOG: MaterialComponent[] = FULL_CATALOG.filter(
  (c) => c.rarity !== 'rare' && c.rarity !== 'singular',
)

/** The catalog split by role, through the same derived predicate the app labels the tray with. */
const SOURCES: MaterialComponent[] = CATALOG.filter((c) => describeRole(c) === 'source')
const NON_SOURCES: MaterialComponent[] = CATALOG.filter((c) => describeRole(c) !== 'source')

/** The source both transit probes are pinned to, so a catalog retune can't point them at different reagents. */
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

/** Fisher-Yates, returning a new array. `sort(() => rand() - 0.5)` is not a shuffle — it biases toward input order. */
function shuffled<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

/** A small, stable hash for cache keys and seeds. FNV-1a over the string. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * The seed a given sample starts from. Every cohort seeds itself by name
 * rather than continuing whatever stream the previous section left behind, so
 * a row is reproducible on its own — which is what lets `--form` measure one
 * run and get the same number the full harness prints, and what lets a cached
 * ring set stand in for a rebuilt one without shifting anything downstream.
 */
function seedFor(...parts: (string | number)[]): number {
  return hash(parts.join('|')) || 1
}

/**
 * What the catalog is, as one string. Any retune of a ledger, rarity or name
 * changes it, which invalidates every cached ring built out of it.
 */
const CATALOG_SIG = hash(
  CATALOG.map((c) => `${c.name}:${JSON.stringify(c.demands)}:${JSON.stringify(c.yields)}`).join(','),
).toString(16)

/**
 * **The cache holds rings, never numbers.** Finding rings is the slow half of
 * this harness — a fed ring answering a particular condition can cost
 * thousands of `computeReaction` calls to stumble onto — while resolving one
 * is nearly free. Caching the search and re-resolving every ring on every run
 * means a resolver or form change is always measured fresh and can never be
 * masked by a stale figure; the worst a stale entry can do is measure a ring
 * the sampler would no longer pick.
 *
 * Keyed on everything that decides *which rings the search yields*: the
 * catalog, the condition predicate that gates them, and the seed. A form's
 * relief (`loss`, `reward`) and its `underfed` setting are deliberately not in
 * the key — they change what a ring is worth, not which rings qualify — so
 * retuning a form re-resolves cached rings instantly instead of hunting for
 * them again.
 */
const CACHE_PATH = 'sim/.cache/rings.json'
const CACHE_VERSION = 1

interface CacheEntry {
  sig: string
  /** Encoded as `slot:Component Name`, so a cache file is readable and diffable. */
  rings: string[][]
  /** Rejection-sampling attempts the search spent, reported by the cohort tables. */
  tries: number
}

const fs = require('node:fs')
let cache: Record<string, CacheEntry> = {}
let cacheDirty = false
let cacheHits = 0
let cacheMisses = 0

if (!CACHE_OFF && !CACHE_REFRESH) {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as {
        version: number
        entries: Record<string, CacheEntry>
      }
      if (parsed.version === CACHE_VERSION) cache = parsed.entries
    }
  } catch {
    // A corrupt or half-written cache is not worth a failed run. Rebuild it.
    cache = {}
  }
}

function saveCache(): void {
  if (CACHE_OFF || !cacheDirty) return
  try {
    fs.mkdirSync('sim/.cache', { recursive: true })
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ version: CACHE_VERSION, entries: cache }), 'utf8')
  } catch {
    // Read-only checkout, or run from somewhere else. The harness still works.
  }
}

function encodeRing(ring: Placement[]): string[] {
  return ring.map((p) => `${p.slotIndex}:${p.component.name}`)
}

function decodeRing(encoded: string[]): Placement[] | null {
  const ring: Placement[] = []
  for (const entry of encoded) {
    const split = entry.indexOf(':')
    const component = CATALOG.find((c) => c.name === entry.slice(split + 1))
    if (!component) return null
    ring.push({ slotIndex: Number(entry.slice(0, split)), component })
  }
  return ring
}

/**
 * Rings for one sample, from the cache when it holds a set built the same way.
 * A cached set larger than `wanted` is sliced, so a `--quick` run reuses a
 * full run's search rather than starting its own.
 */
function ringsFor(
  name: string,
  sig: string,
  wanted: number,
  build: (n: number) => { rings: Placement[][]; tries: number },
): { rings: Placement[][]; tries: number } {
  const stored = cache[name]
  if (stored && stored.sig === sig && stored.rings.length >= wanted) {
    const decoded = stored.rings.slice(0, wanted).map(decodeRing)
    if (decoded.every((ring): ring is Placement[] => ring !== null)) {
      cacheHits++
      return { rings: decoded, tries: stored.tries }
    }
  }
  cacheMisses++
  const built = build(wanted)
  // Never shrink a good set: a `--quick` miss would otherwise replace a full
  // run's search with its own tenth of one, and the next full run would pay
  // for the whole search again.
  const keepsMore = stored && stored.sig === sig && stored.rings.length > built.rings.length
  if (!CACHE_OFF && !keepsMore) {
    cache[name] = { sig, rings: built.rings.map(encodeRing), tries: built.tries }
    cacheDirty = true
  }
  return built
}

function randomRing(reagents: number, maximumSources = 1): Placement[] {
  const chosen = shuffled([...Array(RING_SLOT_COUNT).keys()])
    .slice(0, reagents)
    .sort((a, b) => a - b)
  const pool = [...CATALOG]
  const placements: Placement[] = []
  let sourceCount = 0
  for (const slotIndex of chosen) {
    // Parting benediction is the one form that deliberately admits two sources.
    const candidates =
      sourceCount >= maximumSources ? pool.filter((c) => describeRole(c) !== 'source') : pool
    const idx = Math.floor(rand() * candidates.length)
    const component = candidates[idx]
    pool.splice(pool.indexOf(component), 1)
    if (describeRole(component) === 'source') sourceCount++
    placements.push({ slotIndex, component })
  }
  return placements
}

/** A ring built the way a player builds one: a source first, then anything. */
function builtRing(reagents: number, maximumSources = 1): Placement[] {
  const placements: Placement[] = [{ slotIndex: 0, component: pick(SOURCES) }]
  const pool = CATALOG.filter((component) => component !== placements[0].component)
  let sourceCount = 1
  for (let slotIndex = 1; slotIndex < reagents; slotIndex++) {
    const candidates =
      sourceCount >= maximumSources ? pool.filter((c) => describeRole(c) !== 'source') : pool
    const component = candidates[Math.floor(rand() * candidates.length)]
    pool.splice(pool.indexOf(component), 1)
    if (describeRole(component) === 'source') sourceCount++
    placements.push({ slotIndex, component })
  }
  return placements
}

/**
 * How many fresh shuffles `fedRing`/`fedRingIn` retry before giving up.
 * `growFed` is a one-pass greedy walk with no backtracking, so an unlucky
 * ordering can dead-end even when a fed ring exists; a retry with a fresh
 * shuffle almost always finds one.
 */
const FED_ATTEMPTS = 30

/**
 * A ring built so that every reagent is actually fed: each slot takes the first
 * candidate that leaves the circle with no shortfall anywhere. This is the ring a
 * competent player builds, and the only bucket in which a toll means a mistake
 * rather than a choice.
 */
function fedRing(reagents: number, level: CasterLevel = 5): Placement[] {
  let best: Placement[] = []
  for (let attempt = 0; attempt < FED_ATTEMPTS && best.length < reagents; attempt++) {
    const placements: Placement[] = [{ slotIndex: 0, component: pick(SOURCES) }]
    const pool = CATALOG.filter((c) => c !== placements[0].component)
    for (let slotIndex = 1; slotIndex < reagents; slotIndex++) {
      if (!growFed(placements, pool, slotIndex, level)) break
    }
    if (placements.length > best.length) best = placements
  }
  return best
}

/**
 * Fills one slot with the first candidate that leaves the ring starving nowhere,
 * spending it out of `pool`. Returns false if the pool holds no such reagent.
 * This is the harness's definition of "fed"; three cohorts build on it.
 */
function growFed(
  placements: Placement[],
  pool: MaterialComponent[],
  slotIndex: number,
  level: CasterLevel = 5,
  maximumSources = 1,
): boolean {
  // A source never starves the ring, so ordinary forms stop at one. Parting
  // benediction alone gets its second source through the caller's limit.
  const sourceCount = placements.filter((p) => describeRole(p.component) === 'source').length
  const candidates =
    sourceCount >= maximumSources ? pool.filter((c) => describeRole(c) !== 'source') : pool
  for (const candidate of shuffled(candidates)) {
    const trial = [...placements, { slotIndex, component: candidate }]
    const r = computeReaction(trial, PLAIN, level)
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
 * without starving something. `fedRing` above only lays reagents contiguously
 * from slot I; this lets a condition ask for an arbitrary shape.
 *
 * Slots must arrive in ascending order — the check is incremental.
 */
function fedRingIn(slots: number[], maximumSources = 1): Placement[] {
  for (let attempt = 0; attempt < FED_ATTEMPTS; attempt++) {
    const placements: Placement[] = []
    const pool = [...CATALOG]
    let ok = true
    for (const slotIndex of slots) {
      if (!growFed(placements, pool, slotIndex, 5, maximumSources)) {
        ok = false
        break
      }
    }
    if (ok) return placements
  }
  return []
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

function resolve(
  ring: Placement[],
  form: SpellForm = PLAIN,
  level: CasterLevel = 5,
  specialty: CasterSpecialty | null = null,
): Row {
  const reaction = computeReaction(ring, form, level, false, specialty)

  // Law 1: every unit released either was drawn, bled away, or reached the
  // mouth. Thrown rather than reported, since it can never legitimately fail.
  let released = 0
  let received = 0
  for (const slot of reaction.slots) {
    released += ledgerTotal(slot.released)
    received += ledgerTotal(slot.received)
  }
  // Two clauses add manifestation the reagents did not release: a met elegy's
  // grief, drawn from the caster's toll, and a met ward's doorway, paid back
  // for what its threshold slots were fed. Take both declared external
  // contributions out before checking the circle's ordinary conservation law.
  // The invocation's fold needs no term here — it moves units from
  // manifestation to bled, and both are already counted.
  const accounted =
    reaction.manifestationTotal -
    reaction.griefBonusTotal -
    reaction.wardBonusTotal +
    reaction.bledTotal +
    received
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

const PER_COUNT = samples(8000)
/** Fed rings cost a search rather than a draw, so every cohort takes fewer. */
const FED_PER_COUNT = Math.max(20, Math.round(PER_COUNT / 8))

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
  // Unmet demand is the only thing charged, so a clean ring costs nothing.
  if (row.toll === 0) c.clean++
  rings++
  for (const [currency, amount] of Object.entries(row.delivered) as Array<[Currency, number]>) {
    deliveredTotals.set(currency, deliveredTotals.get(currency)! + amount)
  }
}

console.log(
  `=== balance harness: ${SCALE === 1 ? 'full' : `quick, 1/${SCALE} samples (indicative only)`}` +
    `${FORM_FILTER ? `, forms matching "${FORM_FILTER}"` : ''}` +
    `${CACHE_OFF ? ', no cache' : CACHE_REFRESH ? ', cache rebuilding' : ''} ===`,
)

// Everything from here down is the slow, sampled part of the harness — skipped
// entirely under `--near-optimal`, which only wants the curated report below.
if (!NEAR_OPTIMAL_ONLY) {
if (CROSS_FORM_SECTIONS) {
  for (let reagents = 1; reagents <= RING_SLOT_COUNT; reagents++) {
    const key = `${reagents} reagents`
    // Each bucket seeds its own stream. They used to share one, which meant
    // serving the fed rings out of the cache would have shifted the random and
    // built rings drawn after them.
    state = seedFor('circle:random', reagents)
    for (let i = 0; i < PER_COUNT; i++) record(byCount, key, resolve(randomRing(reagents)))
    state = seedFor('circle:built', reagents)
    for (let i = 0; i < PER_COUNT; i++) record(builtByCount, key, resolve(builtRing(reagents)))

    const { rings: fedRings } = ringsFor(
      `circle:fed:${reagents}`,
      `${CATALOG_SIG}|lvl5`,
      FED_PER_COUNT,
      (n) => {
        state = seedFor('circle:fed', reagents)
        const built: Placement[][] = []
        for (let i = 0; i < n; i++) built.push(fedRing(reagents))
        return { rings: built, tries: n }
      },
    )
    for (const ring of fedRings) record(fedByCount, `${ring.length} fed reagents`, resolve(ring))
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

if (CROSS_FORM_SECTIONS) {
  table('random rings', byCount)
  table('source-first rings', builtByCount)
  table('fully fed rings', fedByCount)

  // A currency that never reaches the mouth is dead; retuning a seed's ledgers is how one dies.
  console.log(`\n=== delivered by currency over ${rings} rings ===`)
  const deliveredAll = [...deliveredTotals.values()].reduce((a, b) => a + b, 0) || 1
  for (const currency of CURRENCIES) {
    const total = deliveredTotals.get(currency)!
    console.log(
      `${CURRENCY_META[currency].label.padEnd(10)}${String(total).padStart(10)}  ${`${Math.round((total / deliveredAll) * 100)}%`.padStart(4)}`,
    )
  }
}

/**
 * The relay crossing: a relay must cross for free wherever it stands. Probes
 * with a source at slot II and an occupant at slot IV across one hole, relay
 * vs. ordinary reagent, and checks the gap between their costs.
 */
function relayProbe(): void {
  const source = MOTION_SOURCE
  if (!source) {
    console.log('\n=== the relay crossing: no motion source in the catalog to probe with ===')
    return
  }

  // Identical demands, differing only by role: the relay gives back what it
  // took, the reagent gives back something else. Demand is set above anything
  // a source can deliver, so receiving is never capped by it.
  const reagent = (name: string, yields: Ledger): MaterialComponent => ({
    id: name,
    name,
    description: '',
    demands: { motion: MAX_LEDGER_ENTRY },
    yields,
    rarity: 'common',
    isSeed: false,
    createdAt: 0,
    updatedAt: 0,
  })
  const probeRelay = reagent('probe relay', { motion: MAX_LEDGER_ENTRY })
  const probeReagent = reagent('probe reagent', { heat: MAX_LEDGER_ENTRY })

  const arriving = (occupant: MaterialComponent) => {
    // Under the prayer: forms that spare the transit make the relay and the
    // reagent cost the same, which is correct but useless as a probe here.
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
      `  ${relayGot === reagentGot + TRANSIT_LOSS_REAGENT ? 'OK' : 'BROKEN: the relay is not free'}`,
  )
}

/**
 * Regression check: a relay is an ordinary reagent but for the free crossing,
 * so an isolated, starved one must still cost something. Prints the change in
 * manifestation and toll from padding a sparse ring with two relays — toll
 * must rise whenever they go unfed.
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
    // Reagents at the front of the ring, so the back half is all holes.
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

    // The exploit: the relays went hungry, the caster wasn't billed, yet the
    // ring still delivered more. A *fed* relay adding completion is not an
    // exploit — that's what every fed reagent does.
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

/**
 * A player who never looks further back than the slot immediately before the
 * one they're filling, always taking the strongest reagent that still fits.
 * Permanent regression check: this naive strategy's toll-free rate must stay
 * well under 50%, or carelessness is a complete strategy again.
 */
function naiveChainRing(reagents: number): Placement[] {
  const source = pick(SOURCES)
  const placements: Placement[] = [{ slotIndex: 0, component: source }]
  const pool = [...NON_SOURCES]
  let available: Ledger = source.yields

  for (let slotIndex = 1; slotIndex < reagents; slotIndex++) {
    const candidates = pool.filter(
      (c) =>
        ledgerTotal(c.demands) > 0 &&
        ledgerEntries(c.demands).every(([currency, amount]) => (available[currency] ?? 0) - 1 >= amount),
    )
    let chosen: MaterialComponent | undefined
    if (candidates.length > 0) {
      chosen = candidates.reduce((best, c) => (ledgerTotal(c.yields) > ledgerTotal(best.yields) ? c : best))
    } else if (pool.length > 0) {
      chosen = pool.reduce((best, c) => (ledgerTotal(c.demands) < ledgerTotal(best.demands) ? c : best))
    }
    if (!chosen) break
    placements.push({ slotIndex, component: chosen })
    pool.splice(pool.indexOf(chosen), 1)
    available = chosen.yields
  }
  return placements
}

function naiveChainProbe(): void {
  const TRIALS = 8000
  let clean = 0
  let manifestation = 0
  let toll = 0
  state = 0x0a1e1e
  for (let i = 0; i < TRIALS; i++) {
    const ring = naiveChainRing(RING_SLOT_COUNT)
    const r = computeReaction(ring, PLAIN)
    manifestation += r.manifestationTotal
    toll += r.tollTotal
    if (r.tollTotal === 0) clean++
  }
  const cleanRate = clean / TRIALS
  console.log('\n=== naive one-hop chain (read only the previous slot, take the best fit) ===')
  console.log(`average manifestation ${(manifestation / TRIALS).toFixed(1)}`)
  console.log(`average toll          ${(toll / TRIALS).toFixed(1)}`)
  console.log(
    `toll-free rate        ${Math.round(cleanRate * 100)}%  ` +
      `${cleanRate < 0.5 ? 'OK' : 'TOO EASY: naive one-hop chaining is still reliably free'}`,
  )
}

/**
 * The full ring (8 reagents) at each caster level, random and fed — the table
 * the level curve in CLAUDE.md is drawn from. Watch the gap between "fed
 * manif" and careless net: it should widen with level, not close, or the
 * curve has stopped rewarding skill more at the top than the bottom.
 */
function levelReport(): void {
  console.log('\n=== full ring (8 reagents) by caster level ===')
  console.log(
    'lvl power   manif   toll   bled  dead  fed-manif  fed-dead',
  )
  for (const level of CASTER_LEVELS) {
    state = seedFor('level:random', level)
    let manif = 0
    let toll = 0
    let bled = 0
    let dead = 0
    for (let i = 0; i < PER_COUNT; i++) {
      const row = resolve(randomRing(RING_SLOT_COUNT), PLAIN, level)
      manif += row.manifestation
      toll += row.toll
      bled += row.bled
      if (row.manifestation === 0) dead++
    }
    // Same avg/pct convention as `table()`/`formReport()`, scoped to this level's sample size.
    const avg = (total: number) => (total / PER_COUNT).toFixed(1)
    const pct = (count: number) => `${Math.round((count / PER_COUNT) * 100)}%`

    // A fed ring is level-specific: `growFed` asks whether this level's
    // scaled ledgers feed the slot, so the cache key carries the level.
    const fedTrials = FED_PER_COUNT
    const { rings: fedRings } = ringsFor(
      `level:fed:${level}`,
      `${CATALOG_SIG}|lvl${level}`,
      fedTrials,
      (n) => {
        state = seedFor('level:fed', level)
        const built: Placement[][] = []
        for (let i = 0; i < n; i++) built.push(fedRing(RING_SLOT_COUNT, level))
        return { rings: built, tries: n }
      },
    )
    let fedManif = 0
    let fedDead = 0
    for (const ring of fedRings) {
      const row = resolve(ring, PLAIN, level)
      fedManif += row.manifestation
      if (row.manifestation === 0) fedDead++
    }
    const fedAvg = (total: number) => (total / fedTrials).toFixed(1)
    const fedPct = (count: number) => `${Math.round((count / fedTrials) * 100)}%`

    console.log(
      String(level).padStart(3) +
        LEVEL_POWER[level].toFixed(2).padStart(6) +
        avg(manif).padStart(8) +
        avg(toll).padStart(7) +
        avg(bled).padStart(7) +
        pct(dead).padStart(6) +
        fedAvg(fedManif).padStart(11) +
        fedPct(fedDead).padStart(10),
    )
  }
}

/**
 * The measuring forms must never charge a toll, at every level, not only the
 * level-five default the rest of this harness runs at. Guards against a
 * careless change to `forCaster` in `reaction.ts` quietly breaking that.
 */
function measuringFormsNeverChargeAcrossLevels(): void {
  let checked = 0
  for (const level of CASTER_LEVELS) {
    state = seedFor('measuring', level)
    for (let i = 0; i < samples(1000); i++) {
      const reagents = 1 + Math.floor(rand() * RING_SLOT_COUNT)
      const ring = rand() < 0.5 ? randomRing(reagents) : builtRing(reagents)
      for (const run of FORM_RUNS) {
        if (FORM_META[run.form].underfed !== 'measure') continue
        const r = computeReaction(ring, run.form, level, false, run.specialty)
        checked++
        if (r.tollTotal !== 0) {
          throw new Error(`${runLabel(run)} measures but charged ${r.tollTotal} at level ${level}`)
        }
      }
    }
  }
  console.log('\n=== measuring forms never charge, across every level ===')
  console.log(`${checked} checks, all zero  OK`)
}

// -------------------------------------------------------------------- forms

/**
 * Every legacy and specialty form over the same ordinary (one-source) rings.
 * `loud` counts rings where a form
 * delivered most; `cheap` counts rings where it scored best on manifestation
 * minus toll (read with care — a holding form scoring 0 beats a firing one
 * losing money, so it rewards doing nothing). `met` is the share of rings
 * answering the condition: 100% means it's free, 0% means it's unreachable.
 * Measuring forms are asserted, not just reported, to never charge.
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
  const cells = new Map<string, FormCell>(
    FORM_RUNS.map((run) => [
      runKey(run),
      { n: 0, manifestation: 0, toll: 0, bled: 0, met: 0, loud: 0, cheap: 0 },
    ]),
  )

  const SAMPLES = samples(2000)

  for (let reagents = 1; reagents <= RING_SLOT_COUNT; reagents++) {
    state = seedFor('formReport', reagents)
    for (let i = 0; i < SAMPLES; i++) {
      const ring = rand() < 0.5 ? randomRing(reagents) : builtRing(reagents)
      let loudest: FormRun[][] = []
      let loudestScore = -Infinity
      let cheapest: FormRun[][] = []
      let cheapestScore = -Infinity

      // One resolution per *distinct* form, credited to every run that shares
      // it. A specialty that leaves a form's condition alone resolves exactly
      // as the legacy run does, so resolving it twice would be wasted work and
      // scoring it twice would hand the tie to whichever came first in
      // `FORM_RUNS`. A top score can still be shared by distinct groups; those
      // groups are collected below and each receives the win.
      for (const [, group] of RESOLUTION_GROUPS) {
        const row = resolve(ring, group[0].form, 5, group[0].specialty)
        for (const run of group) {
          const cell = cells.get(runKey(run))!
          cell.n++
          cell.manifestation += row.manifestation
          cell.toll += row.toll
          cell.bled += row.bled
          if (row.met) cell.met++
        }

        if (FORM_META[group[0].form].underfed === 'measure' && row.toll !== 0) {
          throw new Error(`${runLabel(group[0])} measures but charged a toll of ${row.toll}`)
        }

        if (row.manifestation > loudestScore) {
          loudestScore = row.manifestation
          loudest = [group]
        } else if (row.manifestation === loudestScore) {
          loudest.push(group)
        }
        const score = row.manifestation - row.toll
        if (score > cheapestScore) {
          cheapestScore = score
          cheapest = [group]
        } else if (score === cheapestScore) {
          cheapest.push(group)
        }
      }

      for (const group of loudest) {
        for (const run of group) cells.get(runKey(run))!.loud++
      }
      for (const group of cheapest) {
        for (const run of group) cells.get(runKey(run))!.cheap++
      }
    }
  }

  console.log('\n=== legacy and specialty forms over the same ordinary rings ===')
  console.log(
    'form                       underfed' +
      ['manif', 'toll', 'bled', 'met', 'loud', 'cheap'].map((h) => h.padStart(8)).join(''),
  )
  const dead: string[] = []
  for (const run of FORM_RUNS) {
    const c = cells.get(runKey(run))!
    const avg = (total: number) => (total / c.n).toFixed(1).padStart(8)
    const pct = (count: number) => `${Math.round((count / c.n) * 100)}%`.padStart(8)
    console.log(
      runLabel(run).padEnd(27) +
        FORM_META[run.form].underfed.padEnd(8) +
        avg(c.manifestation) +
        avg(c.toll) +
        avg(c.bled) +
        (conditionFor(run.form, run.specialty) ? pct(c.met) : '-'.padStart(8)) +
        pct(c.loud) +
        pct(c.cheap),
    )
    if (c.loud === 0 && c.cheap === 0) dead.push(runLabel(run))
  }
  console.log(
    dead.length === 0
      ? 'every form wins on one objective or the other  OK'
      : `never the best choice either way: ${dead.join(', ')}  DEAD FORM`,
  )
}

/**
 * Each form on ground it chose: rings that answer its condition, scored
 * against the prayer on the same ring, over two cohorts.
 *
 * On **careless** rings the five crediting forms look strong and the two
 * measuring ones look weak — that's the underfed rule, not the condition: a
 * measuring form declines the credit a starved prayer collects. On **fed**
 * rings a measuring form and the prayer resolve identically, so whatever
 * separates them there is the condition's relief alone — the column to read
 * when tuning a condition.
 *
 * Rings are found by rejection sampling against the real `conditionFor`
 * predicate, so shapes can't drift from the resolver. Finding none is itself
 * the reachability check.
 */
/**
 * The rejection search itself, split out from the report so its results can be
 * cached. Seeded by cohort and run rather than continuing one stream across
 * every form, so a row measured under `--form` is the row the full harness
 * prints — and so a cached set can stand in without moving anything else.
 */
function groundRings(
  run: FormRun,
  cohort: 'careless' | 'fed',
  wanted: number,
  cap: number,
): { rings: Placement[][]; tries: number } {
  state = seedFor('ground', cohort, runKey(run))
  const rings: Placement[][] = []
  let tries = 0
  // Litany, dirge, and specialty benedictions ask about roles/resolved
  // state rather than only slot positions, so they gate after the fill.
  const geometric = run.form !== 'litany' && run.form !== 'dirge' && !run.specialty

  while (rings.length < wanted && tries < cap) {
    tries++
    const reagents = 1 + Math.floor(rand() * RING_SLOT_COUNT)
    let ring: Placement[]
    if (cohort === 'fed') {
      // Screen a throwaway ring against the shape first when the condition
      // only reads slot positions, before paying for the fill.
      const shape = randomRing(reagents, sourceLimit(run))
      if (
        geometric &&
        !conditionRelief(run.form, shape, buildConditionContext(shape, 5, run.form, run.specialty), run.specialty).met
      ) continue
      ring = fedRingIn(shape.map((p) => p.slotIndex), sourceLimit(run))
    } else {
      ring =
        rand() < 0.5
          ? randomRing(reagents, sourceLimit(run))
          : builtRing(reagents, sourceLimit(run))
    }
    if (ring.length === 0) continue
    // The gate is the predicate itself: `conditionRelief` before any slot
    // is walked, except dirge, which resolves a lazy baseline ring.
    if (!conditionRelief(run.form, ring, buildConditionContext(ring, 5, run.form, run.specialty), run.specialty).met) continue
    rings.push(ring)
  }
  return { rings, tries }
}

function formsOnTheirOwnGround(): void {
  for (const cohort of ['careless', 'fed'] as const) {
    // Feeding an arbitrary slot set is dear, so the fed cohort is smaller.
    const wanted = cohort === 'fed' ? samples(300, 10) : samples(1200, 40)
    const cap = cohort === 'fed' ? samples(60000, 2000) : samples(300000, 10000)
    console.log(`\n=== each form on ${cohort} rings that answer it, against the prayer ===`)
    console.log(
      'form                       rings' +
        ['manif', 'toll', 'vs plain', 'plaintoll'].map((h) => h.padStart(10)).join(''),
    )

    for (const run of SELECTED_RUNS) {
      const condition = conditionFor(run.form, run.specialty)
      if (!condition) continue

      // Which rings qualify depends on the condition's predicate and the
      // catalog, never on what the form does with them, so retuning a relief
      // re-resolves this set rather than hunting for it again.
      const measured = canonical(run)
      const { rings: found, tries } = ringsFor(
        `ground:${cohort}:${runKey(measured)}`,
        // The cap is not part of the key: the search is seeded, so the first N
        // rings it yields are the same however long it was allowed to run, and
        // a hit is only ever taken when the cached set already holds N.
        `${CATALOG_SIG}|${hash(condition.test.toString()).toString(16)}|${sourceLimit(run)}`,
        wanted,
        (n) => groundRings(measured, cohort, n, cap),
      )

      let manifestation = 0
      let toll = 0
      let plainManifestation = 0
      let plainToll = 0
      for (const ring of found) {
        const own = resolve(ring, run.form, 5, run.specialty)
        const plain = resolve(ring, PLAIN)
        manifestation += own.manifestation
        toll += own.toll
        plainManifestation += plain.manifestation
        plainToll += plain.toll
      }

      if (found.length === 0) {
        // Expected only for the fed elegy: it forbids a source, so the first
        // reagent the current reaches must starve.
        const why = cohort === 'fed' && run.form === 'elegy' ? '  (no source, so it cannot be fed)' : ''
        console.log(`${runLabel(run).padEnd(27)}UNREACHABLE in ${tries} tries${why}`)
        continue
      }
      const avg = (total: number) => (total / found.length).toFixed(1).padStart(10)
      console.log(
        runLabel(run).padEnd(27) +
          String(found.length).padEnd(5) +
          avg(manifestation) +
          avg(toll) +
          avg(plainManifestation) +
          avg(plainToll) +
          (found.length < wanted ? `   only ${found.length} in ${tries} tries` : ''),
      )
    }
  }
}

/**
 * A crossing must be paid by the current it's carrying, not by whatever else
 * is in the ring: a chain fed across two holes must receive the same whether
 * or not an unrelated source stands elsewhere, and a lone source (which
 * demands nothing) must still pay its own lap in full rather than riding it
 * untouched.
 */
function transitPayerProbe(): void {
  const source = MOTION_SOURCE
  // Two gaps plus the crossing into the eater's own slot: the feeder needs
  // enough to clear that path with something to spare.
  const pathCost = 2 * TRANSIT_LOSS_GAP + TRANSIT_LOSS_REAGENT
  const feeder = CATALOG.find((c) => ledgerAmount(c.yields, 'heat') >= pathCost + 2)
  const eater = CATALOG.find((c) => ledgerAmount(c.demands, 'heat') >= pathCost + 2)
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
  const released = ledgerTotal(source.yields)
  // Fixed lap cost, not scaled to the catalog. Checking `bledTotal` against it
  // (rather than requiring the source's whole yield to vanish) keeps the
  // probe valid whether the yield sits below or above the lap's cost.
  const lapCost = (RING_SLOT_COUNT - 1) * TRANSIT_LOSS_GAP + TRANSIT_LOSS_REAGENT
  const chargedInFull = lone.bledTotal >= Math.min(released, lapCost)

  console.log('\n=== the transit payer (feeder at III, hole, hole, reagent at VI) ===')
  console.log(`${feeder.name} releases heat ${ledgerAmount(feeder.yields, 'heat')}`)
  console.log(`  reached ${eater.name} at VI            ${alone}`)
  console.log(`  the same, with ${source.name} at I  ${shielded}`)
  console.log(
    `  a source cannot pay another chain's way  ${alone === shielded ? 'OK' : 'BROKEN: the chain was shielded'}`,
  )
  console.log(
    `  a lone source pays its lap in full        ${chargedInFull ? 'OK' : `BROKEN: only ${lone.bledTotal} of ${Math.min(released, lapCost)} lost`}`,
  )
}

// The four probes are assertions rather than readings and cost almost nothing,
// so they run under every mode. The tables that are not per-form are skipped
// when a filter is on, since narrowing them would change what they measure.
relayProbe()
transitPayerProbe()
isolatedRelaysMustCost()
naiveChainProbe()
if (CROSS_FORM_SECTIONS) {
  levelReport()
  measuringFormsNeverChargeAcrossLevels()
  formReport()
} else {
  console.log('\n=== skipped (not per-form): circle tables, level table, form report ===')
  console.log('pass --all to keep them alongside --form')
}
formsOnTheirOwnGround()

// One ring, resolved and printed slot by slot, to read against the laws as
// written. Drawn from the full catalog, not the balance-envelope `CATALOG`.
const worked: Placement[] = [
  'Falling Weight',
  'Lodestone',
  'Bismuth Crystal',
  'Tourmaline',
  'Grindwheel',
  'Hoarfrost',
].map((name, slotIndex) => ({
  slotIndex,
  component: FULL_CATALOG.find((c) => c.name === name)!,
}))

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
const reaction = computeReaction(worked, PLAIN)
console.log('\n=== worked example: weight, lodestone, bismuth, tourmaline, grindwheel, hoarfrost ===')
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
} // NEAR_OPTIMAL_ONLY

// --------------------------------------------------------- near-optimal rings

/**
 * Hand-picked rings — 10 per (form, level) — hill-climbed by
 * `sim/generateNearOptimal.ts` and reported under their own form and level.
 * `NET_OPTIMIZED_FORMS` (elegy, ward, benediction) are climbed against net
 * at level 5, one row each; every other form is climbed once per caster
 * level, against the most manifestation a ring can deliver while keeping
 * toll under that level's cap (5 at level 1, scaling to 15 at level 5).
 * Where `formsOnTheirOwnGround` samples the *shape* a form rewards at random
 * and averages over it, this is a fixed, reproducible set of rings a
 * genuinely skilled player would actually place, not merely a ring that
 * starves nowhere (`fedRing`'s bar): the climb searches directly for the
 * best output a caster could afford, condition included, rather than
 * stopping at "nothing shortfalls."
 */
function nearOptimalReport(): void {
  const byFormLevel = new Map<string, NearOptimalRing[]>()
  const key = ({ form, specialty }: FormRun, level: CasterLevel) =>
    `${specialty ?? 'legacy'}:${form}:${level}`
  for (const entry of NEAR_OPTIMAL_RINGS) {
    const k = key(entry, entry.level)
    const list = byFormLevel.get(k) ?? []
    list.push(entry)
    byFormLevel.set(k, list)
  }

  const resolveRing = (entry: NearOptimalRing): Placement[] =>
    entry.placements.map(({ slotIndex, component }) => {
      const found = CATALOG.find((c) => c.name === component)
      if (!found) throw new Error(`near-optimal ring names an unknown reagent: ${component}`)
      return { slotIndex, component: found }
    })

  const rows: (FormRun & { level: CasterLevel })[] = []
  const seen = new Set<string>()
  for (const entry of NEAR_OPTIMAL_RINGS) {
    const row = { form: entry.form, specialty: entry.specialty, level: entry.level }
    if (!runSelected(row)) continue
    const rowKey = key(row, row.level)
    if (!seen.has(rowKey)) {
      seen.add(rowKey)
      rows.push(row)
    }
  }

  console.log('\n=== near-optimal rings per form and specialty (sim/nearOptimalRings.ts) ===')
  console.log(
    'form               ' +
      ['manif', 'toll', 'net', 'bled', 'met'].map((h) => h.padStart(8)).join(''),
  )
  for (const run of rows) {
    const entries = byFormLevel.get(key(run, run.level)) ?? []
    const label = NET_OPTIMIZED_FORMS.includes(run.form)
      ? runLabel(run)
      : `${runLabel(run)} @ lvl ${run.level}`
    if (entries.length === 0) {
      console.log(`${label.padEnd(19)}NO RINGS GENERATED FOR THIS FORM/LEVEL`)
      continue
    }
    let manifestation = 0
    let toll = 0
    let bled = 0
    let met = 0
    for (const entry of entries) {
      const r = computeReaction(resolveRing(entry), run.form, run.level, false, run.specialty)
      manifestation += r.manifestationTotal
      toll += r.tollTotal
      bled += r.bledTotal
      if (r.conditionMet) met++
    }
    const n = entries.length
    const avg = (total: number) => (total / n).toFixed(1).padStart(8)
    console.log(
      label.padEnd(19) +
        avg(manifestation) +
        avg(toll) +
        avg(manifestation - toll) +
        avg(bled) +
        `${Math.round((met / n) * 100)}%`.padStart(8),
    )
  }

  const NAMED_SLOTS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
  console.log('\n--- each ring, in full ---')
  for (const run of rows) {
    const label = NET_OPTIMIZED_FORMS.includes(run.form)
      ? runLabel(run)
      : `${runLabel(run)} @ level ${run.level}`
    console.log(`\n${label}:`)
    for (const entry of byFormLevel.get(key(run, run.level)) ?? []) {
      const r = computeReaction(resolveRing(entry), run.form, run.level, false, run.specialty)
      const mark = r.conditionMet === null ? '  -' : r.conditionMet ? 'met' : 'fail'
      const shown = entry.placements
        .map((p) => `${NAMED_SLOTS[p.slotIndex]}:${p.component}`)
        .join(' ')
      console.log(
        `  manif ${String(r.manifestationTotal).padStart(3)}  toll ${String(r.tollTotal).padStart(
          3,
        )}  ${mark}  ${shown}`,
      )
    }
  }
}

nearOptimalReport()

saveCache()
console.log(
  `\ncache: ${cacheHits} ring sets reused, ${cacheMisses} searched` +
    (CACHE_OFF ? '  (--no-cache: nothing stored)' : `  -> ${CACHE_PATH}`),
)
