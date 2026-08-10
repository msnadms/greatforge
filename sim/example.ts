import { buildSeedComponents } from '../src/data/seedComponents'
import { computeReaction, type Placement } from '../src/lib/reaction'
import { SPELL_FORMS, ledgerEntries, type MaterialComponent } from '../src/types/worldbuilding'

let n = 0
const CATALOG: MaterialComponent[] = buildSeedComponents(() => `c${n++}`, 0)
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

function ring(names: string[]): Placement[] {
  return names.map((name, slotIndex) => ({
    slotIndex,
    component: CATALOG.find((c) => c.name === name)!,
  }))
}

function show(ledger: Record<string, number | undefined>): string {
  const entries = ledgerEntries(ledger)
  return entries.length ? entries.map(([c, a]) => `${a} ${c}`).join(', ') : '-'
}

function detail(title: string, placements: Placement[], form: 'prayer' | 'elegy'): void {
  const r = computeReaction(placements, form)
  console.log(`\n--- ${title}: ${form} ---`)
  for (const slot of r.slots) {
    const c = placements.find((p) => p.slotIndex === slot.slotIndex)!.component
    console.log(
      `  ${ROMAN[slot.slotIndex].padEnd(4)} ${c.name.padEnd(18)} wanted ${show(c.demands).padEnd(12)} got ${show(slot.received).padEnd(12)} short ${show(slot.shortfall).padEnd(12)} released ${show(slot.released)}`,
    )
  }
  console.log(
    `  => manifestation ${r.manifestationTotal} (${show(r.manifestation)})   toll ${r.tollTotal} (${show(r.toll)})   bled ${r.bledTotal}`,
  )
}

function summary(title: string, placements: Placement[]): void {
  console.log(`\n=== ${title} ===`)
  for (const form of SPELL_FORMS) {
    const r = computeReaction(placements, form)
    console.log(
      `  ${form.padEnd(12)} manifestation ${String(r.manifestationTotal).padStart(3)}   toll ${String(r.tollTotal).padStart(3)}`,
    )
  }
}

const chain = ring(['Flint and Steel', 'Slow Match', 'Charcoal', 'Rust and Aluminium'])
detail('chain', chain, 'prayer')
detail('chain', chain, 'elegy')
summary('chain: flint, slow match, charcoal, rust+aluminium', chain)

const wide = ring([
  'Falling Weight',
  'Burning Glass',
  'Flint and Steel',
  'Lodestone',
  'Hoarfrost',
  'Magnesium Ribbon',
])
detail('wide', wide, 'prayer')
detail('wide', wide, 'elegy')
summary('wide: weight, glass, flint, lodestone, hoarfrost, magnesium', wide)
