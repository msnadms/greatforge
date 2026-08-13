import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { firestoreRepository } from '../lib/firestoreRepository'
import { newId } from '../lib/id'
import type { WorkshopRepository } from '../lib/repository'
import { computeReaction, resolvePlacements } from '../lib/reaction'
import { describeRole } from '../data/currencies'
import { formsForSpecialty } from '../data/casterSpecialties'
import {
  DEFAULT_CASTER_LEVEL,
  emptySlots,
  normalizePlayerProfile,
  type CasterSpecialty,
  type MaterialComponent,
  type PlayerProfile,
  type Spell,
  type SpellForm,
} from '../types/worldbuilding'
import {
  WorkshopContext,
  type BenchMode,
  type ComponentDraft,
  type WorkshopValue,
} from './workshopContext'

function blankSpell(form: SpellForm = 'prayer', specialty: CasterSpecialty | null = null): Spell {
  const now = Date.now()
  return {
    id: newId(),
    title: '',
    form,
    specialty,
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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface WorkshopProviderProps {
  children: ReactNode
  /** Overridable so tests can supply a stand-in for Firestore. */
  repository?: WorkshopRepository
}

export function WorkshopProvider({
  children,
  repository = firestoreRepository,
}: WorkshopProviderProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<PlayerProfile>(() => normalizePlayerProfile(undefined))
  const [components, setComponents] = useState<MaterialComponent[]>([])
  const [spells, setSpells] = useState<Spell[]>([])
  const [draft, setDraft] = useState<Spell>(blankSpell)
  const [dirty, setDirty] = useState(false)
  // A blank bench has nothing to read yet; only an inscribed working opens in `view`.
  const [mode, setMode] = useState<BenchMode>('edit')
  const [armedComponentId, setArmedComponentId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [loadedProfile, loadedComponents, loadedSpells] = await Promise.all([
          repository.getProfile(),
          repository.listComponents(),
          repository.listSpells(),
        ])
        if (cancelled) return
        setProfile(loadedProfile)
        setComponents([...loadedComponents].sort(byName))
        setSpells([...loadedSpells].sort(byUpdatedDesc))
        if (loadedProfile.specialty) {
          setDraft(blankSpell(formsForSpecialty(loadedProfile.specialty)[1], loadedProfile.specialty))
        }
      } catch (cause) {
        if (cancelled) return
        setError(`Could not open the workshop: ${describe(cause)}`)
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
  const write = useCallback(async (label: string, action: () => Promise<void>) => {
    try {
      await action()
      setError(null)
      return true
    } catch (cause) {
      setError(`${label}: ${describe(cause)}`)
      return false
    }
  }, [])

  const componentsById = useMemo(
    () => new Map(components.map((component) => [component.id, component])),
    [components],
  )

  const allowedForms = useMemo(
    () => (profile.specialty ? formsForSpecialty(profile.specialty) : []),
    [profile.specialty],
  )

  const chooseSpecialty = useCallback(
    async (specialty: CasterSpecialty) => {
      if (profile.specialty === specialty) return true
      const next: PlayerProfile = { specialty }
      const ok = await write('Could not choose your discipline', () => repository.saveProfile(next))
      if (!ok) return false
      setProfile(next)
      // An unsaved rite belongs to the discipline currently chosen. An
      // inscribed rite keeps its historical form, even after its caster trains
      // in a different discipline.
      if (!spells.some((spell) => spell.id === draft.id)) {
        setDraft(blankSpell(formsForSpecialty(specialty)[1], specialty))
        setDirty(false)
      }
      return true
    },
    [draft.id, profile.specialty, repository, spells, write],
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
    [patchSlots, componentsById, draft.form, draft.specialty],
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
      setDraft((current) => ({ ...current, ...patch }))
      setDirty(true)
    },
    [allowedForms, mode],
  )

  const editDraft = useCallback(() => setMode('edit'), [])

  const saveDraft = useCallback(async () => {
    const isNew = !spells.some((spell) => spell.id === draft.id)
    if (!profile.specialty || (isNew && !allowedForms.includes(draft.form))) {
      setError('Choose a discipline before inscribing a new working.')
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
      updatedAt: Date.now(),
    }
    const ok = await write('Could not inscribe the working', () => repository.saveSpell(saved))
    if (!ok) return

    setSpells((current) => {
      const index = current.findIndex((spell) => spell.id === saved.id)
      const next = index === -1 ? [...current, saved] : current.map((s) => (s.id === saved.id ? saved : s))
      return next.sort(byUpdatedDesc)
    })
    setDraft(saved)
    setDirty(false)
    // Inscribing finishes the working, so the bench falls back to reading it.
    setMode('view')
    setArmedComponentId(null)
  }, [allowedForms, draft, placements, profile.specialty, repository, spells, write])

  const newSpell = useCallback(() => {
    if (!profile.specialty) return
    setDraft(blankSpell(formsForSpecialty(profile.specialty)[1], profile.specialty))
    setDirty(false)
    setMode('edit')
    setArmedComponentId(null)
  }, [profile.specialty])

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

      setSpells((current) => current.filter((spell) => spell.id !== id))
      if (draft.id === id) {
        setDraft(
          blankSpell(
            profile.specialty ? formsForSpecialty(profile.specialty)[1] : 'prayer',
            profile.specialty,
          ),
        )
        setDirty(false)
        setMode('edit')
      }
    },
    [draft.id, profile.specialty, repository, write],
  )

  /** Resolves to false when the write failed, so the editor can stay open on its draft. */
  const upsertComponent = useCallback(
    async (input: ComponentDraft, id?: string) => {
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
    [componentsById, repository, write],
  )

  const deleteComponent = useCallback(
    async (id: string) => {
      const ok = await write('Could not discard the component', () =>
        repository.deleteComponent(id),
      )
      if (!ok) return

      setComponents((current) => current.filter((component) => component.id !== id))
      setArmedComponentId((current) => (current === id ? null : current))

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
    [draft.slots, repository, write],
  )

  const value: WorkshopValue = useMemo(
    () => ({
      loading,
      error,
      dismissError,
      profile,
      allowedForms,
      chooseSpecialty,
      components,
      componentsById,
      spells,
      draft,
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
      allowedForms,
      chooseSpecialty,
      components,
      componentsById,
      spells,
      draft,
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
