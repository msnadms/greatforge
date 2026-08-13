import type { MaterialComponent, PlayerProfile, Spell } from '../types/worldbuilding'

/**
 * Storage seam for the workshop. `firestoreRepository.ts` is the only implementation;
 * a conlang module reuses the same seam. Ids are generated client-side (`lib/id.ts`).
 */
export interface WorkshopRepository {
  getProfile(): Promise<PlayerProfile>
  saveProfile(profile: PlayerProfile): Promise<void>

  listComponents(): Promise<MaterialComponent[]>
  saveComponent(component: MaterialComponent): Promise<void>
  deleteComponent(id: string): Promise<void>

  listSpells(): Promise<Spell[]>
  saveSpell(spell: Spell): Promise<void>
  deleteSpell(id: string): Promise<void>
}
