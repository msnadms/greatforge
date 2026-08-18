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

/**
 * A rite that was actually spoken, for whatever draws the speaking of one.
 *
 * It carries the resolution `castSpell` ran against the *stored* rite, not the
 * bench's live `reaction` memo. The two agree whenever the working on the bench
 * is the one being cast, which is the only way to reach the button today, but
 * they are separate computations and only one of them is the casting.
 */
export interface CastEvent {
  /** Rises with every casting. Two identical rites resolve equal; both must fire. */
  nonce: number
  reaction: Reaction
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
  /** The last casting that landed, or null until one does. Never set by a refusal. */
  lastCast: CastEvent | null

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
  /** A group table's authoritative scale, or null when this account is not playing in one. */
  groupCasterLevel: CasterLevel | null

  /** The catalog as this bench may read it: everything but the singulars, unless it runs a table. */
  components: MaterialComponent[]
  /** What may actually be laid in the circle: the satchel in player mode. */
  placeableComponents: MaterialComponent[]
  /** False in player mode — a player draws on the pool rather than writing it. */
  canAuthorComponents: boolean
  /**
   * Whether singular reagents are readable here. A game master's to hand out, so
   * a codex shows none until this account runs a table — in the sandbox as well.
   */
  singularsVisible: boolean
  /** The whole catalog by id, singulars included. What a placed reagent is resolved from. */
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
