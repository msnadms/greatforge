import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { firestoreRepository } from '../lib/firestoreRepository'
import { newId } from '../lib/id'
import type { WorkshopRepository } from '../lib/repository'
import { computeReaction, resolvePlacements } from '../lib/reaction'
import { describeRole } from '../data/currencies'
import {
  DEFAULT_CASTER_LEVEL,
  emptySlots,
  type MaterialComponent,
  type Spell,
} from '../types/worldbuilding'
import {
  WorkshopContext,
  type BenchMode,
  type ComponentDraft,
  type WorkshopValue,
} from './workshopContext'

function blankSpell(): Spell {
  const now = Date.now()
  return {
    id: newId(),
    title: '',
    form: 'prayer',
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
        const [loadedComponents, loadedSpells] = await Promise.all([
          repository.listComponents(),
          repository.listSpells(),
        ])
        if (cancelled) return
        setComponents([...loadedComponents].sort(byName))
        setSpells([...loadedSpells].sort(byUpdatedDesc))
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

  const placements = useMemo(
    () => resolvePlacements(draft.slots, componentsById),
    [draft.slots, componentsById],
  )

  // Form and caster level are both inputs to the resolver, so changing either
  // re-resolves the whole ring. See `data/spellForms.ts` and the eighth law.
  const reaction = useMemo(
    () => computeReaction(placements, draft.form, draft.casterLevel),
    [placements, draft.form, draft.casterLevel],
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

        // A circle admits one source too: a source demands nothing, so stacking
        // them only ever adds free current. Placing a second bumps the first back
        // to the tray, the same way an occupied slot already gets displaced.
        const incoming = componentsById.get(componentId)
        if (incoming && describeRole(incoming) === 'source') {
          for (let i = 0; i < slots.length; i++) {
            if (i === slotIndex) continue
            const occupantId = slots[i]
            const occupant = occupantId ? componentsById.get(occupantId) : undefined
            if (occupant && describeRole(occupant) === 'source') slots[i] = null
          }
        }

        slots[slotIndex] = componentId
      })
      setArmedComponentId(null)
    },
    [patchSlots, componentsById],
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
      setDraft((current) => ({ ...current, ...patch }))
      setDirty(true)
    },
    [mode],
  )

  const editDraft = useCallback(() => setMode('edit'), [])

  const saveDraft = useCallback(async () => {
    const saved: Spell = {
      ...draft,
      title: draft.title.trim() || 'Untitled working',
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
  }, [draft, repository, write])

  const newSpell = useCallback(() => {
    setDraft(blankSpell())
    setDirty(false)
    setMode('edit')
    setArmedComponentId(null)
  }, [])

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
        setDraft(blankSpell())
        setDirty(false)
        setMode('edit')
      }
    },
    [draft.id, repository, write],
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
