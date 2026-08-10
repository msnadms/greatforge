import type { MaterialComponent, Spell } from '../types/worldbuilding'

/**
 * Storage seam for the workshop.
 *
 * The local implementation in `localRepository.ts` is the only one today. It stores
 * documents in exactly the shape Firestore will hold them, under the layout:
 *
 *   users/{uid}/components/{componentId}   -> MaterialComponent
 *   users/{uid}/spells/{spellId}           -> Spell
 *
 * Ids are generated client-side (`lib/id.ts`) so they carry over unchanged, and every
 * method is async so swapping in a Firestore implementation needs no call-site changes.
 */
export interface WorkshopRepository {
  listComponents(): Promise<MaterialComponent[]>
  saveComponent(component: MaterialComponent): Promise<void>
  deleteComponent(id: string): Promise<void>

  listSpells(): Promise<Spell[]>
  saveSpell(spell: Spell): Promise<void>
  deleteSpell(id: string): Promise<void>
}
