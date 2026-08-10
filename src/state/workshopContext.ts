import { createContext } from 'react'
import type { Placement, Reaction } from '../lib/reaction'
import type { MaterialComponent, Spell } from '../types/worldbuilding'

/** Fields the editor collects; ids and timestamps are managed by the workshop. */
export type ComponentDraft = Omit<MaterialComponent, 'id' | 'isSeed' | 'createdAt' | 'updatedAt'>

export interface WorkshopValue {
  loading: boolean
  /** Last storage failure, or null. Firestore can fail where localStorage could not. */
  error: string | null
  dismissError: () => void
  components: MaterialComponent[]
  componentsById: Map<string, MaterialComponent>
  spells: Spell[]

  /** The spell currently on the workbench. Not persisted until saved. */
  draft: Spell
  dirty: boolean
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

  upsertComponent: (draft: ComponentDraft, id?: string) => Promise<void>
  deleteComponent: (id: string) => Promise<void>
}

export const WorkshopContext = createContext<WorkshopValue | null>(null)
