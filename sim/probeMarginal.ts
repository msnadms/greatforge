/**
 * Throwaway probe: what is one reagent worth in a slot?
 *
 * For every catalog entry, build random legal rings without it, drop it into a
 * random empty slot, and read the change in net (manifestation minus toll).
 * Prayer, level 5. Not part of the app or the standing harness.
 */
import { buildSeedComponents } from '../src/data/seedComponents'
import { computeReaction } from '../src/lib/reaction'
import { describeRole } from '../src/data/currencies'
import {
  RING_SLOT_COUNT,
  ledgerTotal,
  type MaterialComponent,
  type Placement,
} from '../src/types/worldbuilding'

let seq = 0
const FULL_CATALOG = buildSeedComponents(() => `c${seq++}`, 0)
const ENVELOPE = FULL_CATALOG.filter((c) => c.rarity !== 'rare' && c.rarity !== 'singular')

let state = 0x2f6e2b1
function rand(): number {
  state = (state * 1664525 + 1013904223) >>> 0
  return state / 0x100000000
}
function pick<T>(items: T[]): T {
  return items[Math.floor(rand() * items.length)]
}
function shuffled<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

const isSource = (c: MaterialComponent) => describeRole(c) === 'source'

/** A legal base ring of `size` reagents drawn from the envelope, never using `avoid`. */
function baseRing(size: number, avoid: string[], avoidSource: boolean): Placement[] {
  const pool = shuffled(
    ENVELOPE.filter((c) => !avoid.includes(c.name) && !(avoidSource && isSource(c))),
  )
  const slots = shuffled([...Array(RING_SLOT_COUNT).keys()])
  const placements: Placement[] = []
  let sources = 0
  for (const component of pool) {
    if (placements.length >= size) break
    if (isSource(component)) {
      if (sources > 0) continue
      sources++
    }
    placements.push({ slotIndex: slots[placements.length], component })
  }
  return placements
}

const TRIALS = 4000

/** Hypothetical retunes, probed alongside the catalog. Kept out of the base rings. */
const VARIANTS: { component: MaterialComponent; replaces: string }[] = [
  { replaces: 'Steam Main', component: { ...FULL_CATALOG[0], name: '* Main 6/6', demands: { heat: 6, motion: 6 }, yields: { heat: 6, motion: 6 } } },
  { replaces: 'Steam Main', component: { ...FULL_CATALOG[0], name: '* Main 8/8', demands: { heat: 8, motion: 8 }, yields: { heat: 8, motion: 8 } } },
  { replaces: 'Steam Main', component: { ...FULL_CATALOG[0], name: '* Main 10/10', demands: { heat: 10, motion: 10 }, yields: { heat: 10, motion: 10 } } },
  { replaces: 'Superfluid Helium', component: { ...FULL_CATALOG[0], name: '* Helium relay 8/8', demands: { heat: 8, motion: 8 }, yields: { heat: 8, motion: 8 } } },
  { replaces: 'Superfluid Helium', component: { ...FULL_CATALOG[0], name: '* Helium 12>12+12', demands: { heat: 12 }, yields: { heat: 12, motion: 12 } } },
  { replaces: 'Superfluid Helium', component: { ...FULL_CATALOG[0], name: '* Helium 12>12+16', demands: { heat: 12 }, yields: { heat: 12, motion: 16 } } },
  { replaces: 'Superfluid Helium', component: { ...FULL_CATALOG[0], name: '* Helium 10>10+14', demands: { heat: 10 }, yields: { heat: 10, motion: 14 } } },
  { replaces: 'Superfluid Helium', component: { ...FULL_CATALOG[0], name: '* Helium 12>24 mot', demands: { heat: 12 }, yields: { motion: 24 } } },
]

interface Row {
  component: MaterialComponent
  deltaNet: number
  deltaManif: number
  deltaToll: number
  wins: number
}

const CANDIDATES: { component: MaterialComponent; avoid: string[] }[] = [
  ...FULL_CATALOG.map((component) => ({ component, avoid: [component.name] })),
  ...VARIANTS.map(({ component, replaces }) => ({ component, avoid: [component.name, replaces] })),
]

const rows: Row[] = []
for (const { component, avoid } of CANDIDATES) {
  let deltaNet = 0
  let deltaManif = 0
  let deltaToll = 0
  let wins = 0
  for (let t = 0; t < TRIALS; t++) {
    const size = 3 + Math.floor(rand() * 4)
    const base = baseRing(size, avoid, isSource(component))
    const taken = new Set(base.map((p) => p.slotIndex))
    const free = [...Array(RING_SLOT_COUNT).keys()].filter((s) => !taken.has(s))
    if (free.length === 0) continue
    const withIt = [...base, { slotIndex: pick(free), component }]

    const before = computeReaction(base, 'prayer', 5)
    const after = computeReaction(withIt, 'prayer', 5)
    const gain = after.manifestationTotal - after.tollTotal - (before.manifestationTotal - before.tollTotal)
    deltaNet += gain
    deltaManif += after.manifestationTotal - before.manifestationTotal
    deltaToll += after.tollTotal - before.tollTotal
    if (gain > 0) wins++
  }
  rows.push({
    component,
    deltaNet: deltaNet / TRIALS,
    deltaManif: deltaManif / TRIALS,
    deltaToll: deltaToll / TRIALS,
    wins: (wins / TRIALS) * 100,
  })
}

const pad = (text: string, width: number) => text.padEnd(width)
const num = (value: number, width = 6) => value.toFixed(1).padStart(width)

console.log('reagent worth in a random legal ring, prayer, level 5')
console.log(
  `${pad('reagent', 22)}${pad('role', 11)}${pad('rarity', 10)}${'Δnet'.padStart(7)}${'Δmanif'.padStart(8)}${'Δtoll'.padStart(7)}${'better%'.padStart(9)}  ledger`,
)
for (const row of [...rows].sort((a, b) => b.deltaNet - a.deltaNet)) {
  const { component } = row
  const ledger = `${ledgerTotal(component.demands)} -> ${ledgerTotal(component.yields)}`
  console.log(
    `${pad(component.name, 22)}${pad(describeRole(component), 11)}${pad(component.rarity, 10)}` +
      `${num(row.deltaNet, 7)}${num(row.deltaManif, 8)}${num(row.deltaToll, 7)}${num(row.wins, 9)}  ${ledger}`,
  )
}
