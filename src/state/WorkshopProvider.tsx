import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { describeError } from '../lib/describeError'
import { firestoreRepository } from '../lib/firestoreRepository'
import { newId } from '../lib/id'
import type { WorkshopRepository } from '../lib/repository'
import { computeReaction, resolvePlacements } from '../lib/reaction'
import { castingCost, missingReagents, spentCount, stockAfterCasting } from '../lib/casting'
import { describeRole } from '../data/currencies'
import { formsForSpecialty } from '../data/casterSpecialties'
import {
  DEFAULT_CASTER_LEVEL,
  MAX_CASTER_LEVEL,
  emptySlots,
  normalizePlayerProfile,
  stockCount,
  withStock,
  type CasterLevel,
  type CasterSpecialty,
  type Character,
  type MaterialComponent,
  type PlayMode,
  type PlayerProfile,
  type ReagentStock,
  type Spell,
  type SpellForm,
} from '../types/worldbuilding'
import type { Membership } from '../types/groups'
import {
  WorkshopContext,
  type BenchMode,
  type CastEvent,
  type CastOutcome,
  type ComponentDraft,
  type WorkshopValue,
} from './workshopContext'
import { useWrite } from './useWrite'

function blankSpell(
  form: SpellForm = 'prayer',
  specialty: CasterSpecialty | null = null,
  characterId: string | null = null,
): Spell {
  const now = Date.now()
  return {
    id: newId(),
    title: '',
    form,
    specialty,
    characterId,
    casterLevel: DEFAULT_CASTER_LEVEL,
    text: '',
    notes: '',
    slots: emptySlots(),
    createdAt: now,
    updatedAt: now,
  }
}

function byUpdatedDesc(a: Spell, b: Spell): number {
  return b.updatedAt - a.updatedAt
}

function byName(a: MaterialComponent, b: MaterialComponent): number {
  return a.name.localeCompare(b.name)
}

function byCharacterName(a: Character, b: Character): number {
  return a.name.localeCompare(b.name)
}

interface WorkshopProviderProps {
  children: ReactNode
  /** Overridable so tests can supply a stand-in for Firestore. */
  repository?: WorkshopRepository
  /**
   * Whether this bench may read the catalog's singular reagents. `App.tsx` passes
   * whether the account runs a table.
   *
   * A prop rather than a `useGroups()` read: this is the only fact about groups
   * the workshop has any use for, and taking it as one keeps the provider
   * mountable on its own, which every preview entry point relies on. Defaults to
   * hidden, so a caller that never states it cannot leak them.
   */
  singularsVisible?: boolean
  /** Seats this account has joined; only the active character's seat affects its bench. */
  groupMemberships?: Membership[]
}

export function WorkshopProvider({
  children,
  repository = firestoreRepository,
  singularsVisible = false,
  groupMemberships = [],
}: WorkshopProviderProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<PlayerProfile>(() => normalizePlayerProfile(undefined))
  const [characters, setCharacters] = useState<Character[]>([])
  const [components, setComponents] = useState<MaterialComponent[]>([])
  // Every rite the account holds. What the shelf shows is `spells` below, the
  // slice belonging to whichever bench is standing.
  const [allSpells, setAllSpells] = useState<Spell[]>([])
  const [draft, setDraft] = useState<Spell>(blankSpell)
  const [dirty, setDirty] = useState(false)
  // A blank bench has nothing to read yet; only an inscribed working opens in `view`.
  const [mode, setMode] = useState<BenchMode>('edit')
  const [armedComponentId, setArmedComponentId] = useState<string | null>(null)
  // The last rite spoken, which the circle burns. Set only by a casting that
  // landed, so nothing anywhere reports an outcome before `castSpell` answers.
  const [lastCast, setLastCast] = useState<CastEvent | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [loadedProfile, loadedCharacters, loadedComponents, loadedSpells] = await Promise.all([
          repository.getProfile(),
          repository.listCharacters(),
          repository.listComponents(),
          repository.listSpells(),
        ])
        if (cancelled) return
        setProfile(loadedProfile)
        setCharacters([...loadedCharacters].sort(byCharacterName))
        setComponents([...loadedComponents].sort(byName))
        setAllSpells([...loadedSpells].sort(byUpdatedDesc))

        // The bench opens on a blank working belonging to whichever mode was
        // stored, under that bench's own discipline.
        const opening =
          loadedProfile.mode === 'player'
            ? loadedCharacters.find((entry) => entry.id === loadedProfile.activeCharacterId) ?? null
            : null
        const openingSpecialty =
          loadedProfile.mode === 'player' ? opening?.specialty ?? null : loadedProfile.specialty
        if (openingSpecialty) {
          setDraft(
            blankSpell(
              formsForSpecialty(openingSpecialty)[1],
              openingSpecialty,
              opening?.id ?? null,
            ),
          )
        }
      } catch (cause) {
        if (cancelled) return
        setError(`Could not open the workshop: ${describeError(cause)}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [repository])

  const dismissError = useCallback(() => setError(null), [])

  /** Applies local state only once a persisted write lands; failures surface via `error`. */
  const write = useWrite(setError)

  const activeCharacterId = profile.mode === 'player' ? profile.activeCharacterId : null
  const grantedSingulars = useMemo(
    () =>
      groupMemberships.find(
        (seat) => seat.status === 'joined' && seat.characterId === activeCharacterId,
      )?.singularReagents ?? [],
    [activeCharacterId, groupMemberships],
  )

  // A gifted singular is a snapshot carried by a group seat, not a component in
  // this account's private catalog. It nevertheless resolves exactly like one
  // while the gift stands, and drops away if its game master takes it back.
  const componentsById = useMemo(
    () => new Map([...components, ...grantedSingulars].map((component) => [component.id, component])),
    [components, grantedSingulars],
  )

  /**
   * The catalog as this bench may read it. A singular reagent is a game master's
   * to hand out, so an account running no table sees none — in the sandbox as
   * well, where the codex is otherwise whole.
   *
   * The state list and `componentsById` stay whole either way, because a reagent
   * already standing in an inscribed rite is still resolved through them: putting
   * a material out of reach must not blank a circle written while it was in hand.
   */
  const catalog = useMemo(
    () =>
      singularsVisible
        ? [...components, ...grantedSingulars]
        : [...components.filter((component) => component.rarity !== 'singular'), ...grantedSingulars],
    [components, grantedSingulars, singularsVisible],
  )

  const catalogById = useMemo(
    () => new Map(catalog.map((component) => [component.id, component])),
    [catalog],
  )

  const playMode = profile.mode

  const activeCharacter = useMemo(
    () =>
      playMode === 'player'
        ? characters.find((entry) => entry.id === profile.activeCharacterId) ?? null
        : null,
    [characters, playMode, profile.activeCharacterId],
  )

  /** A seat affects only the character assigned to it, never the whole account. */
  const activeGroupMembership = useMemo(
    () =>
      activeCharacter
        ? groupMemberships.find(
            (seat) => seat.status === 'joined' && seat.characterId === activeCharacter.id,
          ) ?? null
        : null,
    [activeCharacter, groupMemberships],
  )
  const groupCasterLevel = activeGroupMembership?.playerLevel ?? null
  const groupCasterLevelForCharacter = useCallback(
    (characterId: string) =>
      groupMemberships.find(
        (seat) => seat.status === 'joined' && seat.characterId === characterId,
      )?.playerLevel ?? null,
    [groupMemberships],
  )

  /**
   * The discipline the bench works under. A character's is fixed at creation and
   * overrides the profile's, which is the sandbox's alone.
   */
  const specialty = playMode === 'player' ? activeCharacter?.specialty ?? null : profile.specialty

  const allowedForms = useMemo(
    () => (specialty ? formsForSpecialty(specialty) : []),
    [specialty],
  )

  /** A character writes at its own scale or any lesser one; the sandbox reads the catalog whole. */
  const maxCasterLevel =
    playMode === 'player'
      ? (groupCasterLevel ?? activeCharacter?.level ?? DEFAULT_CASTER_LEVEL)
      : MAX_CASTER_LEVEL

  const canAuthorComponents = playMode === 'sandbox'

  /**
   * What may be laid in the circle. In player mode that is the satchel, resolved
   * through the catalog this bench may read, so an id left behind by a withdrawn
   * seed — or by a singular the account can no longer reach — simply drops out
   * rather than drawing an empty row.
   */
  const placeableComponents = useMemo(() => {
    if (playMode !== 'player') return catalog
    if (!activeCharacter) return []
    return Object.keys(activeCharacter.inventory)
      .map((id) => catalogById.get(id))
      .filter((component): component is MaterialComponent => Boolean(component))
      .sort(byName)
  }, [activeCharacter, catalog, catalogById, playMode])

  /** The active character's satchel, or nothing carried at the sandbox bench. */
  const inventory: ReagentStock = useMemo(
    () => activeCharacter?.inventory ?? {},
    [activeCharacter],
  )

  /** Each character keeps its own shelf; the sandbox keeps the rites with no character. */
  const spells = useMemo(
    () =>
      allSpells.filter((spell) =>
        playMode === 'player' ? spell.characterId === activeCharacter?.id : spell.characterId === null,
      ),
    [activeCharacter?.id, allSpells, playMode],
  )

  /**
   * Whether the working on the bench has been inscribed, or is still a draft
   * that exists nowhere but here. Read against every rite the account holds
   * rather than the standing bench's shelf: the question is whether this
   * working was ever written down, not whose shelf it would sit on.
   */
  const draftIsInscribed = useMemo(
    () => allSpells.some((spell) => spell.id === draft.id),
    [allSpells, draft.id],
  )

  /** Clears the bench onto a fresh working belonging to the caster now standing at it. */
  const resetDraft = useCallback(
    (nextSpecialty: CasterSpecialty | null, characterId: string | null) => {
      setDraft(
        blankSpell(
          nextSpecialty ? formsForSpecialty(nextSpecialty)[1] : 'prayer',
          nextSpecialty,
          characterId,
        ),
      )
      setDirty(false)
      setMode('edit')
      setArmedComponentId(null)
    },
    [],
  )

  const saveProfile = useCallback(
    async (label: string, next: PlayerProfile) => {
      const ok = await write(label, () => repository.saveProfile(next))
      if (ok) setProfile(next)
      return ok
    },
    [repository, write],
  )

  const setPlayMode = useCallback(
    async (next: PlayMode) => {
      if (next === profile.mode) return
      // Moving benches picks up whichever character was last stood at, or the
      // first one, so the player bench is never blank while characters exist.
      const character =
        next === 'player'
          ? characters.find((entry) => entry.id === profile.activeCharacterId) ?? characters[0] ?? null
          : null
      const updated: PlayerProfile = {
        ...profile,
        mode: next,
        activeCharacterId: next === 'player' ? character?.id ?? null : profile.activeCharacterId,
      }
      const ok = await saveProfile('Could not change bench', updated)
      if (!ok) return
      // The working on the bench belongs to the bench it was started at.
      resetDraft(
        next === 'player' ? character?.specialty ?? null : profile.specialty,
        character?.id ?? null,
      )
    },
    [characters, profile, resetDraft, saveProfile],
  )

  const selectCharacter = useCallback(
    async (id: string | null) => {
      if (id === profile.activeCharacterId && profile.mode === 'player') return
      const character = id ? characters.find((entry) => entry.id === id) ?? null : null
      if (id && !character) return
      const ok = await saveProfile('Could not take up that character', {
        ...profile,
        mode: 'player',
        activeCharacterId: character?.id ?? null,
      })
      if (!ok) return
      resetDraft(character?.specialty ?? null, character?.id ?? null)
    },
    [characters, profile, resetDraft, saveProfile],
  )

  const createCharacter = useCallback(
    async (name: string, characterSpecialty: CasterSpecialty, level: CasterLevel) => {
      const now = Date.now()
      const character: Character = {
        id: newId(),
        name: name.trim() || 'Unnamed caster',
        specialty: characterSpecialty,
        level,
        // A satchel starts empty. Reagents are taken from the pool by hand.
        inventory: {},
        createdAt: now,
        updatedAt: now,
      }
      const ok = await write('Could not enrol the character', () =>
        repository.saveCharacter(character),
      )
      if (!ok) return false

      setCharacters((current) => [...current, character].sort(byCharacterName))
      // Enrolling stands the player bench at the new character, whichever bench
      // the button was pressed from.
      const saved = await saveProfile('Could not take up that character', {
        ...profile,
        mode: 'player',
        activeCharacterId: character.id,
      })
      if (saved) resetDraft(character.specialty, character.id)
      return true
    },
    [profile, repository, resetDraft, saveProfile, write],
  )

  /**
   * Name and level only. A character's discipline is fixed at creation — see
   * `Character` — and `chooseSpecialty` refuses in player mode for the same
   * reason, so there is deliberately no path here that would change it.
   */
  const updateCharacter = useCallback(
    async (id: string, patch: { name?: string; level?: CasterLevel }) => {
      const existing = characters.find((entry) => entry.id === id)
      if (!existing) return false
      const next: Character = {
        ...existing,
        name: patch.name !== undefined ? patch.name.trim() || existing.name : existing.name,
        level: groupCasterLevel === null ? patch.level ?? existing.level : existing.level,
        updatedAt: Date.now(),
      }
      const ok = await write('Could not amend the character', () => repository.saveCharacter(next))
      if (!ok) return false
      setCharacters((current) =>
        current.map((entry) => (entry.id === id ? next : entry)).sort(byCharacterName),
      )
      return true
    },
    [characters, groupCasterLevel, repository, write],
  )

  /**
   * Strikes a character and everything only it held — its shelf and its satchel,
   * which the repository sweeps in the same write. The local shelf is filtered by
   * the same id the query matched on, so state and storage shed the same rites.
   */
  const deleteCharacter = useCallback(
    async (id: string) => {
      const seat = groupMemberships.find(
        (entry) => entry.status === 'joined' && entry.characterId === id,
      )
      if (seat) {
        setError(`${seat.characterName ?? 'That caster'} is still seated at ${seat.groupName}. Leave or assign another character before striking them.`)
        return false
      }
      const ok = await write('Could not strike the character', () => repository.deleteCharacter(id))
      if (!ok) return false

      const remaining = characters.filter((entry) => entry.id !== id)
      setCharacters(remaining)
      setAllSpells((current) => current.filter((spell) => spell.characterId !== id))

      // A working on the bench belonging to the struck caster has just lost its
      // author, whether or not the bench was standing there.
      const strandedDraft = draft.characterId === id

      if (profile.activeCharacterId !== id) {
        if (strandedDraft) resetDraft(specialty, activeCharacter?.id ?? null)
        return true
      }

      // The bench was standing at the struck character, so it steps to whoever
      // is left rather than reading a shelf that no longer has an owner.
      const next = remaining[0] ?? null
      const saved = await saveProfile('Could not take up that character', {
        ...profile,
        activeCharacterId: next?.id ?? null,
      })
      if (saved) resetDraft(next?.specialty ?? null, next?.id ?? null)
      return true
    },
    [
      activeCharacter?.id,
      characters,
      draft.characterId,
      groupMemberships,
      profile,
      repository,
      resetDraft,
      saveProfile,
      specialty,
      write,
    ],
  )

  /** Writes the active character's satchel, given the whole next stock. */
  const setInventory = useCallback(
    async (label: string, inventory: ReagentStock) => {
      if (!activeCharacter) return false
      const next: Character = { ...activeCharacter, inventory, updatedAt: Date.now() }
      const ok = await write(label, () => repository.saveCharacter(next))
      if (!ok) return false
      setCharacters((current) => current.map((entry) => (entry.id === next.id ? next : entry)))
      return true
    },
    [activeCharacter, repository, write],
  )

  const takeReagent = useCallback(
    async (componentId: string, quantity = 1) => {
      if (!activeCharacter) return
      if (!catalogById.has(componentId)) return
      const wanted = Math.floor(quantity)
      if (!Number.isFinite(wanted) || wanted < 1) return
      const held = stockCount(activeCharacter.inventory, componentId)
      // `withStock` holds the ceiling, so a take that would overflow simply
      // lands on it and this only has to notice that nothing moved.
      const next = withStock(activeCharacter.inventory, componentId, held + wanted)
      if (stockCount(next, componentId) === held) return
      await setInventory('Could not take that reagent', next)
    },
    [activeCharacter, catalogById, setInventory],
  )

  /** Puts back the stated number, or the whole stack when none is stated. */
  const dropReagent = useCallback(
    async (componentId: string, quantity?: number) => {
      if (!activeCharacter) return
      const held = stockCount(activeCharacter.inventory, componentId)
      if (held === 0) return
      const giving = quantity === undefined ? held : Math.max(1, Math.floor(quantity))
      const inventory = withStock(activeCharacter.inventory, componentId, held - giving)
      const ok = await setInventory('Could not put that reagent back', inventory)
      if (ok && stockCount(inventory, componentId) === 0) {
        setArmedComponentId((current) => (current === componentId ? null : current))
      }
    },
    [activeCharacter, setInventory],
  )

  /**
   * Speaks an inscribed rite and spends what it stood on.
   *
   * **The only thing in the app that decrements a satchel.** Writing costs
   * nothing — see `lib/casting.ts` — so a working may be drafted against
   * reagents the caster does not own, and refused only here. What a met dirge
   * preserves is required in hand but not spent, which is the clause
   * `Reaction.keptSlots` was built for and what the circle already promises.
   */
  const castSpell = useCallback(
    async (spellId: string): Promise<CastOutcome | null> => {
      const spell = allSpells.find((entry) => entry.id === spellId)
      if (!spell) return null
      if (!activeCharacter) {
        setError('Only an enrolled caster can speak a rite.')
        return null
      }
      const cast = resolvePlacements(spell.slots, componentsById)
      if (cast.length === 0) {
        setError('An empty circle has nothing to speak.')
        return null
      }
      const resolved = computeReaction(cast, spell.form, spell.casterLevel, false, spell.specialty)
      const cost = castingCost(cast, resolved.keptSlots)
      const short = missingReagents(cost, activeCharacter.inventory, componentsById)
      if (short.length > 0) {
        setError(
          `${activeCharacter.name} does not carry ${short
            .map((entry) => `${entry.component.name} (${entry.carried} of ${entry.needed})`)
            .join(', ')}.`,
        )
        return null
      }

      const spentTotal = spentCount(cost)
      const ok = await setInventory(
        'Could not spend the reagents',
        stockAfterCasting(activeCharacter.inventory, cost),
      )
      if (!ok) return null

      // The ring as it was actually spoken, for `CircleFire`. After the write,
      // so a refused casting never burns.
      setLastCast((previous) => ({ nonce: (previous?.nonce ?? 0) + 1, reaction: resolved }))

      return {
        manifestationTotal: resolved.manifestationTotal,
        tollTotal: resolved.tollTotal,
        spentTotal,
        keptTotal: resolved.keptSlots.length,
      }
    },
    [activeCharacter, allSpells, componentsById, setInventory],
  )

  const chooseSpecialty = useCallback(
    async (nextSpecialty: CasterSpecialty) => {
      // A character trains one discipline and keeps it. Refused in state as well
      // as hidden in the markup, since this is the rule player mode exists for.
      if (playMode === 'player') {
        setError('A caster keeps the discipline they trained in. Enrol another character instead.')
        return false
      }
      if (profile.specialty === nextSpecialty) return true
      const ok = await saveProfile('Could not choose your discipline', {
        ...profile,
        specialty: nextSpecialty,
      })
      if (!ok) return false
      // An unsaved rite belongs to the discipline currently chosen. An
      // inscribed rite keeps its historical form, even after its caster trains
      // in a different discipline.
      if (!draftIsInscribed) resetDraft(nextSpecialty, null)
      return true
    },
    [draftIsInscribed, playMode, profile, resetDraft, saveProfile],
  )

  const placements = useMemo(
    () => resolvePlacements(draft.slots, componentsById),
    [draft.slots, componentsById],
  )

  // Form and caster level are both inputs to the resolver, so changing either
  // re-resolves the whole ring. See `data/spellForms.ts` and the eighth law.
  const reaction = useMemo(
    () => computeReaction(placements, draft.form, draft.casterLevel, false, draft.specialty),
    [placements, draft.form, draft.casterLevel, draft.specialty],
  )

  /**
   * Every change to the working funnels through here and `updateDraft`, both of
   * which refuse to touch a working being viewed. Components hide their own
   * affordances in view mode, but a drop can still land from a pointer press that
   * began before the mode changed, so the refusal lives in state, not just markup.
   */
  const patchSlots = useCallback(
    (mutate: (slots: (string | null)[]) => void) => {
      if (mode === 'view') return
      setDraft((current) => {
        const slots = [...current.slots]
        mutate(slots)
        return { ...current, slots }
      })
      setDirty(true)
    },
    [mode],
  )

  const placeComponent = useCallback(
    (slotIndex: number, componentId: string) => {
      // Same belt-and-braces as `patchSlots`: a drag begun before the catalog
      // or the satchel changed can still land here. Nothing this bench cannot
      // read may stand in a slot — a singular put out of reach mid-drag
      // included — and a player lays only what they carry.
      if (!catalogById.has(componentId)) return
      if (playMode === 'player' && stockCount(inventory, componentId) === 0) return
      patchSlots((slots) => {
        // A circle admits each material once: lift it from wherever else it stood
        // rather than duplicate it, or the strongest ring is eight of one reagent.
        const held = slots.indexOf(componentId)
        if (held !== -1) slots[held] = null

        // A circle normally admits one source: a source demands nothing, so
        // stacking them only adds free current. A mourner's parting benediction
        // deliberately makes room for two; a third still displaces the oldest.
        const incoming = componentsById.get(componentId)
        if (incoming && describeRole(incoming) === 'source') {
          const maxSources =
            draft.form === 'benediction' && draft.specialty === 'mourner' ? 2 : 1
          let sourceCount = slots.reduce((count, occupantId) => {
            const occupant = occupantId ? componentsById.get(occupantId) : undefined
            return count + (occupant && describeRole(occupant) === 'source' ? 1 : 0)
          }, 0)
          for (let i = 0; i < slots.length; i++) {
            if (i === slotIndex) continue
            const occupantId = slots[i]
            const occupant = occupantId ? componentsById.get(occupantId) : undefined
            if (
              sourceCount >= maxSources &&
              occupant &&
              describeRole(occupant) === 'source'
            ) {
              slots[i] = null
              sourceCount--
            }
          }
        }

        slots[slotIndex] = componentId
      })
      setArmedComponentId(null)
    },
    [patchSlots, playMode, inventory, catalogById, componentsById, draft.form, draft.specialty],
  )

  const clearSlot = useCallback(
    (slotIndex: number) => {
      patchSlots((slots) => {
        slots[slotIndex] = null
      })
    },
    [patchSlots],
  )

  const moveSlot = useCallback(
    (from: number, to: number) => {
      if (from === to) return
      patchSlots((slots) => {
        const moved = slots[from]
        slots[from] = slots[to]
        slots[to] = moved
      })
    },
    [patchSlots],
  )

  const updateDraft = useCallback(
    (patch: Partial<Omit<Spell, 'id' | 'createdAt'>>) => {
      if (mode === 'view') return
      if (patch.form && !allowedForms.includes(patch.form)) return
      // A working may be set to the caster's own scale or any lesser one.
      if (patch.casterLevel && patch.casterLevel > maxCasterLevel) return
      setDraft((current) => ({ ...current, ...patch }))
      setDirty(true)
    },
    [allowedForms, maxCasterLevel, mode],
  )

  const editDraft = useCallback(() => setMode('edit'), [])

  const saveDraft = useCallback(async () => {
    const isNew = !draftIsInscribed
    if (!specialty || (isNew && !allowedForms.includes(draft.form))) {
      setError('Choose a discipline before inscribing a new working.')
      return
    }
    if (playMode === 'player' && !activeCharacter) {
      setError('Enrol a character before inscribing a working.')
      return
    }
    if (draft.casterLevel > maxCasterLevel) {
      setError(`This caster works at scale ${maxCasterLevel} or below.`)
      return
    }
    const sourceCount = placements.filter((placement) => describeRole(placement.component) === 'source').length
    if (
      sourceCount > 1 &&
      !(draft.form === 'benediction' && draft.specialty === 'mourner')
    ) {
      setError('Only a mourner’s parting benediction may hold two sources.')
      return
    }
    const saved: Spell = {
      ...draft,
      title: draft.title.trim() || 'Untitled rite',
      // A new working is stamped with the caster who wrote it; an existing one
      // keeps the shelf it was inscribed on.
      characterId: isNew ? activeCharacter?.id ?? null : draft.characterId,
      updatedAt: Date.now(),
    }
    const ok = await write('Could not inscribe the working', () => repository.saveSpell(saved))
    if (!ok) return

    setAllSpells((current) => {
      const index = current.findIndex((spell) => spell.id === saved.id)
      const next = index === -1 ? [...current, saved] : current.map((s) => (s.id === saved.id ? saved : s))
      return next.sort(byUpdatedDesc)
    })
    setDraft(saved)
    setDirty(false)
    // Inscribing finishes the working, so the bench falls back to reading it.
    setMode('view')
    setArmedComponentId(null)
  }, [
    activeCharacter,
    allowedForms,
    draft,
    draftIsInscribed,
    maxCasterLevel,
    placements,
    playMode,
    repository,
    specialty,
    write,
  ])

  const newSpell = useCallback(() => {
    if (!specialty) return
    resetDraft(specialty, activeCharacter?.id ?? null)
  }, [activeCharacter?.id, resetDraft, specialty])

  const selectSpell = useCallback(
    (id: string) => {
      const found = spells.find((spell) => spell.id === id)
      if (!found) return
      setDraft(found)
      setDirty(false)
      setMode('view')
      setArmedComponentId(null)
    },
    [spells],
  )

  const deleteSpell = useCallback(
    async (id: string) => {
      const ok = await write('Could not strike the working', () => repository.deleteSpell(id))
      if (!ok) return

      setAllSpells((current) => current.filter((spell) => spell.id !== id))
      if (draft.id === id) resetDraft(specialty, activeCharacter?.id ?? null)
    },
    [activeCharacter?.id, draft.id, repository, resetDraft, specialty, write],
  )

  /** Resolves to false when the write failed, so the editor can stay open on its draft. */
  const upsertComponent = useCallback(
    async (input: ComponentDraft, id?: string) => {
      // The catalog is the sandbox's to write. A player draws on it.
      if (!canAuthorComponents) return false
      // And a singular reagent is a game master's, which is the same rule that
      // keeps one out of a codex this account may not read.
      if (input.rarity === 'singular' && !singularsVisible) {
        setError('A singular reagent is a game master’s to write.')
        return false
      }
      const now = Date.now()
      const existing = id ? componentsById.get(id) : undefined
      const component: MaterialComponent = {
        ...input,
        // Keeps the id it was opened with; falling back to a fresh one would fork
        // the record into a duplicate instead of saving over the original.
        id: id ?? newId(),
        isSeed: existing?.isSeed ?? false,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      const ok = await write('Could not record the component', () =>
        repository.saveComponent(component),
      )
      if (!ok) return false

      setComponents((current) => {
        const index = current.findIndex((entry) => entry.id === component.id)
        const next =
          index === -1
            ? [...current, component]
            : current.map((entry) => (entry.id === component.id ? component : entry))
        return next.sort(byName)
      })
      return true
    },
    [canAuthorComponents, componentsById, repository, singularsVisible, write],
  )

  const deleteComponent = useCallback(
    async (id: string) => {
      if (!canAuthorComponents) return
      const ok = await write('Could not discard the component', () =>
        repository.deleteComponent(id),
      )
      if (!ok) return

      setComponents((current) => current.filter((component) => component.id !== id))
      setArmedComponentId((current) => (current === id ? null : current))

      // A satchel still naming it is left alone: `placeableComponents` resolves
      // ids through the catalog, so a discarded reagent drops out of every
      // character's satchel on its own rather than needing a write apiece.

      // Clearing the deleted component out of the draft is a real edit, so it
      // marks the draft dirty rather than leaving it reading "Saved" over a
      // dangling reference.
      if (draft.slots.includes(id)) {
        setDraft((current) => ({
          ...current,
          slots: current.slots.map((slot) => (slot === id ? null : slot)),
        }))
        setDirty(true)
      }
    },
    [canAuthorComponents, draft.slots, repository, write],
  )

  const value: WorkshopValue = useMemo(
    () => ({
      loading,
      error,
      dismissError,
      profile,
      playMode,
      setPlayMode,
      characters,
      activeCharacter,
      selectCharacter,
      createCharacter,
      updateCharacter,
      deleteCharacter,
      takeReagent,
      dropReagent,
      inventory,
      castSpell,
      lastCast,
      specialty,
      allowedForms,
      chooseSpecialty,
      maxCasterLevel,
      groupCasterLevel,
      groupCasterLevelForCharacter,
      components: catalog,
      placeableComponents,
      canAuthorComponents,
      singularsVisible,
      componentsById,
      spells,
      draft,
      draftIsInscribed,
      dirty,
      mode,
      editDraft,
      placements,
      reaction,
      armedComponentId,
      armComponent: setArmedComponentId,
      placeComponent,
      clearSlot,
      moveSlot,
      updateDraft,
      saveDraft,
      newSpell,
      selectSpell,
      deleteSpell,
      upsertComponent,
      deleteComponent,
    }),
    [
      loading,
      error,
      dismissError,
      profile,
      playMode,
      setPlayMode,
      characters,
      activeCharacter,
      selectCharacter,
      createCharacter,
      updateCharacter,
      deleteCharacter,
      takeReagent,
      dropReagent,
      inventory,
      castSpell,
      lastCast,
      specialty,
      allowedForms,
      chooseSpecialty,
      maxCasterLevel,
      groupCasterLevel,
      groupCasterLevelForCharacter,
      catalog,
      placeableComponents,
      canAuthorComponents,
      singularsVisible,
      componentsById,
      spells,
      draft,
      draftIsInscribed,
      dirty,
      mode,
      editDraft,
      placements,
      reaction,
      armedComponentId,
      placeComponent,
      clearSlot,
      moveSlot,
      updateDraft,
      saveDraft,
      newSpell,
      selectSpell,
      deleteSpell,
      upsertComponent,
      deleteComponent,
    ],
  )

  return <WorkshopContext.Provider value={value}>{children}</WorkshopContext.Provider>
}
