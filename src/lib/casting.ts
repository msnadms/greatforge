import {
  stockCount,
  withStock,
  type MaterialComponent,
  type Placement,
  type ReagentStock,
} from '../types/worldbuilding'

/**
 * What speaking a rite takes out of a satchel.
 *
 * **Writing a rite costs nothing; speaking it is what spends.** A working can be
 * drafted, retuned and inscribed against reagents the caster does not own — the
 * circle is a diagram until it is spoken. `WorkshopProvider.castSpell` is the
 * only thing in the app that decrements a satchel.
 *
 * Two counts, and they are deliberately different:
 *
 * - **`required`** is every reagent standing in the ring. All of it has to be in
 *   hand, kept reagents included: a thing must be held to be laid in the circle,
 *   whether or not it survives being spoken.
 * - **`spent`** is what the casting actually consumes, which is `required` less
 *   whatever a met dirge preserves (`Reaction.keptSlots`). That is the clause
 *   `keptSlots` was built for, and `ComponentSlot` already tells the player a
 *   kept reagent will not be consumed, so this must agree with the circle.
 *
 * Counted per placement rather than assumed to be one apiece. Law 5 admits each
 * material once, so the two agree today; counting keeps this correct rather
 * than merely lucky if that rule is ever relaxed.
 */
export interface CastingCost {
  required: Map<string, number>
  spent: Map<string, number>
}

export function castingCost(placements: Placement[], keptSlots: readonly number[]): CastingCost {
  const kept = new Set(keptSlots)
  const required = new Map<string, number>()
  const spent = new Map<string, number>()
  for (const placement of placements) {
    const id = placement.component.id
    required.set(id, (required.get(id) ?? 0) + 1)
    if (!kept.has(placement.slotIndex)) spent.set(id, (spent.get(id) ?? 0) + 1)
  }
  return { required, spent }
}

/** What the ring calls for and the satchel cannot cover, with how short each is. */
export interface Shortfall {
  component: MaterialComponent
  needed: number
  carried: number
}

export function missingReagents(
  cost: CastingCost,
  stock: ReagentStock,
  componentsById: Map<string, MaterialComponent>,
): Shortfall[] {
  const short: Shortfall[] = []
  for (const [id, needed] of cost.required) {
    const carried = stockCount(stock, id)
    if (carried >= needed) continue
    const component = componentsById.get(id)
    if (component) short.push({ component, needed, carried })
  }
  return short
}

/** How many reagents the casting consumes in all. */
export function spentCount(cost: CastingCost): number {
  let total = 0
  for (const count of cost.spent.values()) total += count
  return total
}

/** The satchel after a casting. Reagents spent down to nothing drop out entirely. */
export function stockAfterCasting(stock: ReagentStock, cost: CastingCost): ReagentStock {
  let next = stock
  for (const [id, count] of cost.spent) {
    next = withStock(next, id, stockCount(next, id) - count)
  }
  return next
}
