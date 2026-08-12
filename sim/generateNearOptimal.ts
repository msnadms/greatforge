/**
 * One-shot generator: hill-climbs to near-optimal rings for each form and
 * prints a TS module (`nearOptimalRings.ts`) capturing the top ones found.
 * Not part of the app, not imported by anything — see CLAUDE.md "Balance".
 * Regenerate by re-running this file (see its header comment) whenever the
 * catalog changes shape enough that the frontier might have moved.
 */
import { buildSeedComponents } from '../src/data/seedComponents'
import { computeReaction } from '../src/lib/reaction'
import { describeRole } from '../src/data/currencies'
import {
  CASTER_LEVELS,
  RING_SLOT_COUNT,
  SPELL_FORMS,
  type CasterLevel,
  type MaterialComponent,
  type Placement,
  type SpellForm,
} from '../src/types/worldbuilding'

let seq = 0
const FULL_CATALOG: MaterialComponent[] = buildSeedComponents(() => `c${seq++}`, 0)
/** Same envelope `balance.ts` measures against — rare/singular reagents are exceptional by design. */
const CATALOG: MaterialComponent[] = FULL_CATALOG.filter(
  (c) => c.rarity !== 'rare' && c.rarity !== 'singular',
)

let state = 0x9e3779b1
function rand(): number {
  state = (state * 1664525 + 1013904223) >>> 0
  return state / 0x100000000
}

function isSource(c: MaterialComponent): boolean {
  return describeRole(c) === 'source'
}

/**
 * Elegy, ward and benediction are not "spend under a budget" forms — elegy
 * can never be fed so it always pays something, and ward/benediction settle
 * with `measure`, which never charges a toll at all. A toll cap is either
 * meaningless (ward/benediction: toll is 0 by construction, so the cap never
 * binds) or actively hides the form's real tradeoff (elegy: the climb will
 * cheerfully blow past any cap on doubled losses rather than give up a
 * source, since manifestation-under-a-cap doesn't charge it for doing so).
 * These three are climbed against net (manifestation minus toll) instead,
 * same as before, at a single fixed level.
 */
const NET_FORMS: SpellForm[] = ['elegy', 'ward', 'benediction']

/**
 * The remaining forms (prayer, litany, dirge, invocation) are climbed as a
 * caster spending under a budget: most manifestation for a toll that stays
 * under a cap. The cap itself scales with caster level, from 5 at level one
 * up to 15 at level five (the flat cap this used to run at everywhere) —
 * a level-one caster is reading a much smaller catalog (`LEVEL_POWER`), so a
 * budget sized for a level-five working would never bind at the bottom of
 * the range.
 */
const TOLL_CAP_BY_LEVEL: Record<CasterLevel, number> = { 1: 5, 2: 7.5, 3: 10, 4: 12.5, 5: 15 }

function isNetForm(form: SpellForm): boolean {
  return NET_FORMS.includes(form)
}

/** The single level a net-optimized form is climbed at. */
const NET_FORM_LEVEL: CasterLevel = 5

interface Eval {
  manifestation: number
  toll: number
  feasible: boolean
}

function evaluate(ring: Placement[], form: SpellForm, level: CasterLevel): Eval {
  const r = computeReaction(ring, form, level)
  const cap = TOLL_CAP_BY_LEVEL[level]
  return { manifestation: r.manifestationTotal, toll: r.tollTotal, feasible: r.tollTotal < cap }
}

/**
 * Climb-ranking score. For a net form this is just manifestation minus toll.
 * For a capped form, a feasible ring (toll under that level's cap) always
 * beats an infeasible one, and among feasible rings the climb chases
 * manifestation; an infeasible ring is ranked by how far its toll sits above
 * the cap, so a climb that starts over budget still has a gradient back
 * toward feasibility instead of being stuck at a flat, uninformative penalty.
 */
function score(ring: Placement[], form: SpellForm, level: CasterLevel): number {
  if (isNetForm(form)) {
    const r = computeReaction(ring, form, level)
    return r.manifestationTotal - r.tollTotal
  }
  const { manifestation, toll, feasible } = evaluate(ring, form, level)
  return feasible ? 100_000 + manifestation : -toll
}

function signature(ring: Placement[]): string {
  return ring
    .slice()
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((p) => `${p.slotIndex}:${p.component.name}`)
    .join('|')
}

/**
 * Hill-climb from one random start, honoring law 5 throughout the climb (each
 * material once, at most one source) so every ring this produces is one a
 * player could actually build with `placeComponent`. Steepest ascent over a
 * frozen ring, same structure as `frontier.ts`'s `best()`.
 */
function climb(form: SpellForm, level: CasterLevel): Eval & { ring: Placement[] } {
  const count = 1 + Math.floor(rand() * RING_SLOT_COUNT)
  const slots = [...Array(RING_SLOT_COUNT).keys()]
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }
  const pool = [...CATALOG]
  const ring: Placement[] = []
  for (const slotIndex of slots.slice(0, count)) {
    const hasSource = ring.some((p) => isSource(p.component))
    const candidates = hasSource ? pool.filter((c) => !isSource(c)) : pool
    if (candidates.length === 0) continue
    const idx = Math.floor(rand() * candidates.length)
    const component = candidates[idx]
    pool.splice(pool.indexOf(component), 1)
    ring.push({ slotIndex, component })
  }

  let current = ring
  let value = score(current, form, level)

  for (;;) {
    const used = new Set(current.map((p) => p.component.id))
    const open = [...Array(RING_SLOT_COUNT).keys()].filter(
      (i) => !current.some((p) => p.slotIndex === i),
    )
    let bestMove: Placement[] | null = null
    let bestMoveValue = value

    const consider = (candidate: Placement[]): void => {
      const v = score(candidate, form, level)
      if (v > bestMoveValue) {
        bestMoveValue = v
        bestMove = candidate
      }
    }

    // Replace, relocate, or lift each occupant.
    for (const placement of current) {
      const others = current.filter((p) => p !== placement)
      const othersHaveSource = others.some((p) => isSource(p.component))
      for (const component of CATALOG) {
        if (used.has(component.id)) continue
        if (othersHaveSource && isSource(component)) continue
        consider([...others, { slotIndex: placement.slotIndex, component }])
      }
      for (const slotIndex of open) {
        consider([...others, { slotIndex, component: placement.component }])
      }
      consider(others)
    }
    // Add a reagent into any open slot.
    const hasSource = current.some((p) => isSource(p.component))
    for (const slotIndex of open) {
      for (const component of CATALOG) {
        if (used.has(component.id)) continue
        if (hasSource && isSource(component)) continue
        consider([...current, { slotIndex, component }])
      }
    }

    if (!bestMove) break
    current = bestMove
    value = bestMoveValue
  }

  return { ...evaluate(current, form, level), ring: current }
}

const RESTARTS_PER_FORM = 350
const TOP_N = 10

interface Found {
  manifestation: number
  toll: number
  ring: Placement[]
}

/** Every (form, level) pair this generator climbs. Net forms climb once, at
 * `NET_FORM_LEVEL`; capped forms climb once per caster level. */
const JOBS: { form: SpellForm; level: CasterLevel }[] = SPELL_FORMS.flatMap((form) =>
  isNetForm(form)
    ? [{ form, level: NET_FORM_LEVEL }]
    : CASTER_LEVELS.map((level) => ({ form, level })),
)

const results = new Map<string, Found[]>()
const jobKey = (form: SpellForm, level: CasterLevel): string => `${form}:${level}`

for (const { form, level } of JOBS) {
  state = 0xf00d0000 + JOBS.findIndex((j) => j.form === form && j.level === level) * 0x1000
  const seen = new Map<string, Found>()
  const net = isNetForm(form)
  for (let i = 0; i < RESTARTS_PER_FORM; i++) {
    const { manifestation, toll, feasible, ring } = climb(form, level)
    // A capped-form climb that never found its way under the cap has
    // nothing this report wants — the whole point is the best ring
    // *within* the cap. A net-form climb has no cap to fail.
    if (ring.length === 0 || (!net && !feasible)) continue
    const sig = signature(ring)
    const existing = seen.get(sig)
    const rank = (f: Found) => (net ? f.manifestation - f.toll : f.manifestation)
    const found = { manifestation, toll, ring }
    if (!existing || rank(found) > rank(existing)) seen.set(sig, found)
  }
  const rank = (f: Found) => (net ? f.manifestation - f.toll : f.manifestation)
  const top = [...seen.values()].sort((a, b) => rank(b) - rank(a)).slice(0, TOP_N)
  results.set(jobKey(form, level), top)
}

// ------------------------------------------------------------- emit the module

let out = ''
out += '/**\n'
out += ' * Near-optimal rings per form, hill-climbed by `sim/generateNearOptimal.ts`.\n'
out += ' * Elegy, ward and benediction (`NET_OPTIMIZED_FORMS`) are climbed against\n'
out += ' * net — manifestation minus toll — at level 5, 10 rings each: they are not\n'
out += ' * "spend under a budget" forms, so a toll cap either never binds (ward and\n'
out += ' * benediction settle with `measure`, which never charges a toll) or hides\n'
out += ' * the tradeoff (elegy will blow past any cap on doubled losses rather than\n'
out += ' * give up a source, since manifestation-under-a-cap does not charge it for\n'
out += ' * doing so). Every other form is climbed once per caster level for the most\n'
out += ' * manifestation a ring can deliver while keeping toll under that level\'s cap\n'
out += ' * (5 at level 1, scaling to 15 at level 5) — 10 rings per level, 50 per form\n'
out += ' * — and a climb that never gets under the cap is dropped rather than\n'
out += ' * reported. Every ring honors law 5 throughout the climb (each material\n'
out += ' * once, at most one source), so each is one a player could actually place\n'
out += " * with `placeComponent`. Regenerate by re-running the generator when the\n"
out += ' * catalog changes shape enough that the frontier might have moved — do not\n'
out += ' * hand-edit the placements below.\n'
out += ' */\n'
out += "import type { CasterLevel, SpellForm } from '../src/types/worldbuilding'\n\n"
out += '/** Climbed against net rather than a toll cap — see the module doc above. */\n'
out += `export const NET_OPTIMIZED_FORMS: SpellForm[] = ${JSON.stringify(NET_FORMS)}\n\n`
out += 'export interface NearOptimalRing {\n'
out += '  form: SpellForm\n'
out += '  /** The caster level this ring was climbed and resolved at. */\n'
out += '  level: CasterLevel\n'
out += '  /** Manifestation delivered under this ring\'s own form and level, at the climb\'s objective. */\n'
out += '  manifestation: number\n'
out += "  /** Toll paid for the same ring. For a form in `NET_OPTIMIZED_FORMS` this is whatever\n"
out += "   * net asked to pay; otherwise it is always under that level's toll cap. */\n"
out += '  toll: number\n'
out += '  placements: { slotIndex: number; component: string }[]\n'
out += '}\n\n'
out += 'export const NEAR_OPTIMAL_RINGS: NearOptimalRing[] = [\n'
for (const { form, level } of JOBS) {
  for (const { manifestation, toll, ring } of results.get(jobKey(form, level))!) {
    out += `  {\n    form: '${form}',\n    level: ${level},\n    manifestation: ${manifestation},\n    toll: ${toll},\n    placements: [\n`
    for (const p of ring.slice().sort((a, b) => a.slotIndex - b.slotIndex)) {
      out += `      { slotIndex: ${p.slotIndex}, component: ${JSON.stringify(p.component.name)} },\n`
    }
    out += '    ],\n  },\n'
  }
}
out += ']\n'

console.log(out)

// Sanity table, kept off stdout so it doesn't corrupt the module above when redirected.
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
console.error('\n=== near-optimal rings found per form ===')
for (const { form, level } of JOBS) {
  const found = results.get(jobKey(form, level))!
  const label = isNetForm(form) ? form : `${form} @ level ${level}`
  console.error(`\n${label}: (${found.length} found)`)
  for (const { manifestation, toll, ring } of found) {
    const shown = ring
      .slice()
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((p) => `${ROMAN[p.slotIndex]}:${p.component.name}`)
      .join(' ')
    console.error(
      `  manif ${String(manifestation).padStart(3)}  toll ${String(toll).padStart(3)}  ${shown}`,
    )
  }
}
