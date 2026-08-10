/**
 * Throwaway probe: the *best* ring under each form, not the average one.
 * `balance.ts` samples random and fed rings; this one climbs to the optimum, which
 * is what a player who has read the panel actually builds.
 */
import { buildSeedComponents } from '../src/data/seedComponents'
import { computeReaction } from '../src/lib/reaction'
import { describeRole } from '../src/data/currencies'
import { FORM_META } from '../src/data/spellForms'
import {
  RING_SLOT_COUNT,
  SPELL_FORMS,
  type MaterialComponent,
  type Placement,
  type SpellForm,
} from '../src/types/worldbuilding'

let seq = 0
const CATALOG: MaterialComponent[] = buildSeedComponents(() => `c${seq++}`, 0)
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

let state = 0x2f6e2b1
function rand(): number {
  state = (state * 1664525 + 1013904223) >>> 0
  return state / 0x100000000
}

function show(ring: Placement[]): string {
  return ring
    .slice()
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((p) => `${ROMAN[p.slotIndex]}:${p.component.name}`)
    .join(' ')
}

type Score = (ring: Placement[], form: SpellForm) => number

const loud: Score = (ring, form) => computeReaction(ring, form).manifestationTotal
const net: Score = (ring, form) => {
  const r = computeReaction(ring, form)
  return r.manifestationTotal - r.tollTotal
}

/** Hill-climb from random starts: swap occupants, move them, add and remove. */
function best(
  form: SpellForm,
  score: Score,
  restarts = 400,
  fixedCount?: number,
): { value: number; ring: Placement[] } {
  let bestValue = -Infinity
  let bestRing: Placement[] = []

  for (let start = 0; start < restarts; start++) {
    const count = fixedCount ?? 1 + Math.floor(rand() * RING_SLOT_COUNT)
    const slots = [...Array(RING_SLOT_COUNT).keys()]
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[slots[i], slots[j]] = [slots[j], slots[i]]
    }
    const pool = [...CATALOG]
    let ring: Placement[] = slots.slice(0, count).map((slotIndex) => {
      const idx = Math.floor(rand() * pool.length)
      return { slotIndex, component: pool.splice(idx, 1)[0] }
    })
    let value = score(ring, form)

    // Steepest ascent, and the whole neighbourhood is enumerated against a *frozen*
    // ring before anything is accepted. Mutating `ring` mid-scan invalidates the
    // `open`/`used` sets it was built from, which is how the first cut of this probe
    // produced rings with two reagents standing in one slot.
    for (;;) {
      const current = ring
      const used = new Set(current.map((p) => p.component.id))
      const open = [...Array(RING_SLOT_COUNT).keys()].filter(
        (i) => !current.some((p) => p.slotIndex === i),
      )
      let bestMove: Placement[] | null = null
      let bestMoveValue = value

      const consider = (candidate: Placement[]): void => {
        const v = score(candidate, form)
        if (v > bestMoveValue) {
          bestMoveValue = v
          bestMove = candidate
        }
      }

      // Replace an occupant with any unused reagent, move it to any open slot, or lift it.
      for (const placement of current) {
        const others = current.filter((p) => p !== placement)
        for (const component of CATALOG) {
          if (used.has(component.id)) continue
          consider([...others, { slotIndex: placement.slotIndex, component }])
        }
        for (const slotIndex of open) {
          consider([...others, { slotIndex, component: placement.component }])
        }
        consider(others)
      }
      // Add a reagent in any open slot.
      for (const slotIndex of open) {
        for (const component of CATALOG) {
          if (used.has(component.id)) continue
          consider([...current, { slotIndex, component }])
        }
      }

      if (!bestMove) break
      ring = bestMove
      value = bestMoveValue
    }

    if (value > bestValue) {
      bestValue = value
      bestRing = ring
    }
  }

  return { value: bestValue, ring: bestRing }
}

console.log('=== the loudest ring each form can reach (hill-climbed) ===')
console.log('form           manif  toll   net  reagents  ring')
for (const form of SPELL_FORMS) {
  const { ring } = best(form, loud)
  const r = computeReaction(ring, form)
  console.log(
    form.padEnd(13) +
      String(r.manifestationTotal).padStart(6) +
      String(r.tollTotal).padStart(6) +
      String(r.manifestationTotal - r.tollTotal).padStart(6) +
      String(ring.length).padStart(10) +
      '  ' +
      show(ring),
  )
}

console.log('\n=== the best ring on manifestation minus toll ===')
console.log('form           manif  toll   net  reagents  ring')
for (const form of SPELL_FORMS) {
  const { ring } = best(form, net)
  const r = computeReaction(ring, form)
  console.log(
    form.padEnd(13) +
      String(r.manifestationTotal).padStart(6) +
      String(r.tollTotal).padStart(6) +
      String(r.manifestationTotal - r.tollTotal).padStart(6) +
      String(ring.length).padStart(10) +
      '  ' +
      show(ring),
  )
}

/**
 * The frontier that matters: the loudest ring a form can reach *at a toll of zero*,
 * by reagent count. A measuring form is always at zero, so this is where the
 * benediction's three reagents can be compared with a prayer's eight without the
 * credit rule flattering either.
 */
function cleanFrontier(): void {
  console.log('\n=== loudest ring at a toll of zero, by reagent count ===')
  console.log('form         ' + [1, 2, 3, 4, 5, 6, 7, 8].map((n) => String(n).padStart(6)).join(''))

  for (const form of SPELL_FORMS) {
    const row: string[] = []
    for (let count = 1; count <= RING_SLOT_COUNT; count++) {
      // The toll is penalized rather than forbidden. Scoring a tolled ring as
      // -Infinity makes the whole neighbourhood a plateau the climb cannot cross, so
      // the first cut of this table reported cells unreachable when they were only
      // unfound. A penalty of 1000 still guarantees the winner is untolled wherever
      // an untolled ring of that size exists at all.
      const scoreAtCount: Score = (ring, f) => {
        if (ring.length !== count) return -Infinity
        const r = computeReaction(ring, f)
        return r.manifestationTotal - 1000 * r.tollTotal
      }
      const { ring } = best(form, scoreAtCount, 60, count)
      const r = computeReaction(ring, form)
      row.push((r.tollTotal === 0 ? String(r.manifestationTotal) : `${r.manifestationTotal}!`).padStart(6))
    }
    console.log(form.padEnd(13) + row.join(''))
  }
}

cleanFrontier()

/**
 * The benediction, exhaustively. Three reagents out of the catalog in three of the
 * eight slots is small enough to enumerate outright, so this is the true optimum
 * rather than a climb.
 */
function benedictionExhaustive(): void {
  const slotSets: number[][] = []
  for (let a = 0; a < RING_SLOT_COUNT; a++) {
    for (let b = a + 1; b < RING_SLOT_COUNT; b++) {
      for (let c = b + 1; c < RING_SLOT_COUNT; c++) slotSets.push([a, b, c])
    }
  }

  let bestValue = -Infinity
  let bestRing: Placement[] = []
  const bySlotSet = new Map<string, number>()
  const totals: number[] = []
  /** The same rings said as a prayer, so the boon can be priced ring for ring. */
  let asPrayer = 0
  let asBenediction = 0
  /** Rings laid in the three slots a player reaches for last: VI, VII, VIII. */
  const lastThree: number[] = []
  /** Rings where nothing starves — the chain the player is actually trying to build. */
  const fed: number[] = []
  let fedPrayer = 0

  for (let i = 0; i < CATALOG.length; i++) {
    for (let j = i + 1; j < CATALOG.length; j++) {
      for (let k = j + 1; k < CATALOG.length; k++) {
        const trio = [CATALOG[i], CATALOG[j], CATALOG[k]]
        for (const slots of slotSets) {
          for (const order of [
            [0, 1, 2],
            [0, 2, 1],
            [1, 0, 2],
            [1, 2, 0],
            [2, 0, 1],
            [2, 1, 0],
          ]) {
            const ring = slots.map((slotIndex, at) => ({
              slotIndex,
              component: trio[order[at]],
            }))
            const reaction = computeReaction(ring, 'benediction')
            const total = reaction.manifestationTotal
            if (reaction.slots.every((s) => Object.keys(s.shortfall).length === 0)) {
              fed.push(total)
              fedPrayer += computeReaction(ring, 'prayer').manifestationTotal
            }
            const key = slots.map((s) => ROMAN[s]).join('')
            if (total > (bySlotSet.get(key) ?? -1)) bySlotSet.set(key, total)
            totals.push(total)
            asBenediction += total
            asPrayer += computeReaction(ring, 'prayer').manifestationTotal
            if (key === 'VIVIIVIII') lastThree.push(total)
            if (total > bestValue) {
              bestValue = total
              bestRing = ring
            }
          }
        }
      }
    }
  }

  console.log('\n=== benediction, all three-reagent rings enumerated ===')
  console.log(`best ${bestValue}  ${show(bestRing)}`)
  const held = bestRing.reduce(
    (sum, p) => sum + Object.values(p.component.yields).reduce((a, b) => a + (b ?? 0), 0),
    0,
  )
  console.log(`those three reagents carry ${held} in total, so transit took ${held - bestValue}`)

  console.log('\nbest three-reagent benediction by slot set (top 12):')
  for (const [key, value] of [...bySlotSet.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${key.padEnd(12)}${value}`)
  }

  // The same trio said as a prayer, for the comparison the panel invites.
  const r = computeReaction(bestRing, 'prayer')
  console.log(`\nthe same ring as a prayer: manif ${r.manifestationTotal} toll ${r.tollTotal}`)

  // How hard the optimum is to find, which is the actual question. A form whose best
  // ring is also its average ring is not a decision.
  const sorted = [...totals].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.floor(sorted.length * q)]
  console.log(
    `\nover all ${sorted.length} three-reagent rings: median ${at(0.5)}, ` +
      `p90 ${at(0.9)}, p99 ${at(0.99)}, best ${bestValue}`,
  )
  console.log(
    `  rings reaching 15+: ${totals.filter((t) => t >= 15).length}` +
      `   18+: ${totals.filter((t) => t >= 18).length}   20: ${totals.filter((t) => t >= 20).length}`,
  )
  const fedSorted = [...fed].sort((a, b) => a - b)
  console.log(
    `  of those, ${fed.length} starve nowhere: median ${fedSorted[Math.floor(fed.length / 2)]}, ` +
      `best ${fedSorted[fed.length - 1]}, average ${(fed.reduce((a, b) => a + b, 0) / fed.length).toFixed(1)} ` +
      `against ${(fedPrayer / fed.length).toFixed(1)} as a prayer`,
  )
  console.log(
    `  average as a benediction ${(asBenediction / totals.length).toFixed(1)}, ` +
      `as a prayer ${(asPrayer / totals.length).toFixed(1)}`,
  )
  const lastSorted = [...lastThree].sort((a, b) => a - b)
  console.log(
    `  laid in VI/VII/VIII only: median ${lastSorted[Math.floor(lastSorted.length / 2)]}, ` +
      `best ${lastSorted[lastSorted.length - 1]}, ` +
      `18+ ${((lastThree.filter((t) => t >= 18).length / lastThree.length) * 100).toFixed(1)}%`,
  )
}

benedictionExhaustive()

/**
 * What three reagents can carry at all: the fattest yields in the catalog, and how
 * much of that a benediction keeps.
 */
console.log('\n=== the fattest three yields in the catalog ===')
for (const component of [...CATALOG]
  .sort(
    (a, b) =>
      Object.values(b.yields).reduce((x, y) => x + (y ?? 0), 0) -
      Object.values(a.yields).reduce((x, y) => x + (y ?? 0), 0),
  )
  .slice(0, 8)) {
  const total = Object.values(component.yields).reduce((x, y) => x + (y ?? 0), 0)
  console.log(
    `  ${component.name.padEnd(18)}yields ${String(total).padStart(3)}  demands ${String(
      Object.values(component.demands).reduce((x, y) => x + (y ?? 0), 0),
    ).padStart(3)}  ${describeRole(component)}`,
  )
}

/**
 * The closed ring, said seven ways. `completionFactor` squares the share, and 1
 * squared is 1 — so a form whose condition names the spill forfeits *nothing* on a
 * full ring whether it met the condition or not. The ward is kept off this ground by
 * its "at least one slot empty" clause; the benediction is not.
 */
function theClosedRing(): void {
  state = 0xc105ed
  const SAMPLES = 4000
  console.log('\n=== eight reagents, random full rings, each form ===')
  console.log('form         ' + ['manif', 'toll', 'net', 'met'].map((h) => h.padStart(8)).join(''))
  const totals = new Map<SpellForm, { m: number; t: number; met: number }>(
    SPELL_FORMS.map((f) => [f, { m: 0, t: 0, met: 0 }]),
  )
  for (let i = 0; i < SAMPLES; i++) {
    const pool = [...CATALOG]
    const ring: Placement[] = [...Array(RING_SLOT_COUNT).keys()].map((slotIndex) => ({
      slotIndex,
      component: pool.splice(Math.floor(rand() * pool.length), 1)[0],
    }))
    for (const form of SPELL_FORMS) {
      const r = computeReaction(ring, form)
      const cell = totals.get(form)!
      cell.m += r.manifestationTotal
      cell.t += r.tollTotal
      if (r.conditionMet) cell.met++
    }
  }
  for (const [form, c] of totals) {
    const avg = (n: number) => (n / SAMPLES).toFixed(1).padStart(8)
    console.log(
      form.padEnd(13) +
        avg(c.m) +
        avg(c.t) +
        avg(c.m - c.t) +
        `${Math.round((c.met / SAMPLES) * 100)}%`.padStart(8),
    )
  }
}

theClosedRing()

console.log(`\n(forms: ${SPELL_FORMS.map((f) => `${f}/${FORM_META[f].underfed}`).join(' ')})`)
