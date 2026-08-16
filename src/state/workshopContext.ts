import { createContext } from 'react'
import type { Reaction } from '../lib/reaction'
import type {
  CasterLevel,
  CasterSpecialty,
  Character,
  MaterialComponent,
  Placement,
  PlayMode,
  PlayerProfile,
  ReagentStock,
  Spell,
  SpellForm,
} from '../types/worldbuilding'

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

/** What a casting did, reported back to whatever asked for it. */
export interface CastOutcome {
  manifestationTotal: number
  tollTotal: number
  /** Reagents consumed. Fewer than the ring holds when a met dirge keeps some. */
  spentTotal: number
  /** Reagents a met dirge preserved, which stood in the ring and were not spent. */
  keptTotal: number
}

export interface WorkshopValue {
  loading: boolean
  /** Last storage failure, or null. Firestore can fail where localStorage could not. */
  error: string | null
  dismissError: () => void
  /** The current caster's chosen discipline; null until their first choice. */
  profile: PlayerProfile
  /** Which bench the workshop is standing at. See `PlayMode`. */
  playMode: PlayMode
  setPlayMode: (mode: PlayMode) => Promise<void>

  characters: Character[]
  /** The character the player bench reads, or null in sandbox and before the first. */
  activeCharacter: Character | null
  selectCharacter: (id: string | null) => Promise<void>
  createCharacter: (name: string, specialty: CasterSpecialty, level: CasterLevel) => Promise<boolean>
  /** Name and level only — a character's discipline is fixed at creation. */
  updateCharacter: (id: string, patch: { name?: string; level?: CasterLevel }) => Promise<boolean>
  /** Strikes the character, its shelf of rites and its satchel. The catalog stands. */
  deleteCharacter: (id: string) => Promise<boolean>
  /** Takes reagents from the pool into the active character's satchel. */
  takeReagent: (componentId: string, quantity?: number) => Promise<void>
  /** Puts back the stated number, or the whole stack when none is stated. */
  dropReagent: (componentId: string, quantity?: number) => Promise<void>
  /** What the active character carries, by component id. Empty in sandbox. */
  inventory: ReagentStock
  /**
   * Speaks an inscribed rite, spending what stood in it. The only thing that
   * decrements a satchel — writing a rite costs nothing. Resolves null when the
   * casting was refused, with the reason in `error`.
   */
  castSpell: (spellId: string) => Promise<CastOutcome | null>

  /**
   * The discipline the bench is working under: the active character's in player
   * mode, the profile's in sandbox. `allowedForms` follows it.
   */
  specialty: CasterSpecialty | null
  allowedForms: readonly SpellForm[]
  /** Refuses in player mode: a character's discipline is fixed at creation. */
  chooseSpecialty: (specialty: CasterSpecialty) => Promise<boolean>
  /** Highest scale this bench may write at — the character's level, or 5 in sandbox. */
  maxCasterLevel: CasterLevel

  /** The whole catalog, which is what a placed reagent is still resolved from. */
  components: MaterialComponent[]
  /** What may actually be laid in the circle: the satchel in player mode. */
  placeableComponents: MaterialComponent[]
  /** False in player mode — a player draws on the pool rather than writing it. */
  canAuthorComponents: boolean
  componentsById: Map<string, MaterialComponent>
  /** The shelf this bench shows: the active character's rites, or the sandbox's. */
  spells: Spell[]

  /** The spell currently on the workbench. Not persisted until saved. */
  draft: Spell
  /** Whether the working on the bench has been written down, or is still a draft. */
  draftIsInscribed: boolean
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
