import { createContext } from 'react'
import type { Reaction } from '../lib/reaction'
import type { CasterSpecialty, MaterialComponent, Placement, PlayerProfile, Spell, SpellForm } from '../types/worldbuilding'

/** Fields the editor collects; ids and timestamps are managed by the workshop. */
export type ComponentDraft = Omit<MaterialComponent, 'id' | 'isSeed' | 'createdAt' | 'updatedAt'>

/**
 * Whether the bench is reading an inscribed working or changing one.
 *
 * An inscribed working opens in `view`: the book reads as a written page and the
 * circle is a diagram of it, so nothing can be lost by clicking around a spell
 * that was only meant to be looked at. `edit` is the workbench proper.
 */
export type BenchMode = 'view' | 'edit'

export interface WorkshopValue {
  loading: boolean
  /** Last storage failure, or null. Firestore can fail where localStorage could not. */
  error: string | null
  dismissError: () => void
  /** The current caster's chosen discipline; null until their first choice. */
  profile: PlayerProfile
  allowedForms: readonly SpellForm[]
  chooseSpecialty: (specialty: CasterSpecialty) => Promise<boolean>
  components: MaterialComponent[]
  componentsById: Map<string, MaterialComponent>
  spells: Spell[]

  /** The spell currently on the workbench. Not persisted until saved. */
  draft: Spell
  dirty: boolean
  mode: BenchMode
  /** Opens the working on the bench for changes. The only way out of `view`. */
  editDraft: () => void
  placements: Placement[]
  reaction: Reaction

  /** Component selected in the tray, waiting for a slot click. */
  armedComponentId: string | null
  armComponent: (id: string | null) => void

  placeComponent: (slotIndex: number, componentId: string) => void
  clearSlot: (slotIndex: number) => void
  moveSlot: (from: number, to: number) => void
  updateDraft: (patch: Partial<Omit<Spell, 'id' | 'createdAt'>>) => void

  saveDraft: () => Promise<void>
  newSpell: () => void
  selectSpell: (id: string) => void
  deleteSpell: (id: string) => Promise<void>

  /** Resolves false when the write failed; the editor stays open on its draft. */
  upsertComponent: (draft: ComponentDraft, id?: string) => Promise<boolean>
  deleteComponent: (id: string) => Promise<void>
}

export const WorkshopContext = createContext<WorkshopValue | null>(null)
