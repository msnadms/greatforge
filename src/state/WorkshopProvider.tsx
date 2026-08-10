import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { firestoreRepository } from '../lib/firestoreRepository'
import { newId } from '../lib/id'
import type { WorkshopRepository } from '../lib/repository'
import { computeReaction, resolvePlacements } from '../lib/reaction'
import { emptySlots, type MaterialComponent, type Spell } from '../types/worldbuilding'
import { WorkshopContext, type ComponentDraft, type WorkshopValue } from './workshopContext'

function blankSpell(): Spell {
  const now = Date.now()
  return {
    id: newId(),
    title: '',
    form: 'prayer',
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

  /**
   * Runs a persisted change, applying local state only once the write lands. Call sites
   * fire these with `void`, so a rejection here would otherwise go unreported.
   */
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

  // The form is an input to the resolver, not a label on it: changing the picker
  // re-resolves the same stones under a different law. See `data/spellForms.ts`.
  const reaction = useMemo(
    () => computeReaction(placements, draft.form),
    [placements, draft.form],
  )

  const patchSlots = useCallback((mutate: (slots: (string | null)[]) => void) => {
    setDraft((current) => {
      const slots = [...current.slots]
      mutate(slots)
      return { ...current, slots }
    })
    setDirty(true)
  }, [])

  const placeComponent = useCallback(
    (slotIndex: number, componentId: string) => {
      patchSlots((slots) => {
        // A circle admits each material once, so setting a stone down lifts it
        // from wherever else it was standing rather than duplicating it. Without
        // this the strongest ring is always eight of whatever yields most, and
        // every other material in the codex is dead weight.
        const held = slots.indexOf(componentId)
        if (held !== -1) slots[held] = null
        slots[slotIndex] = componentId
      })
      setArmedComponentId(null)
    },
    [patchSlots],
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

  const updateDraft = useCallback((patch: Partial<Omit<Spell, 'id' | 'createdAt'>>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setDirty(true)
  }, [])

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
  }, [draft, repository, write])

  const newSpell = useCallback(() => {
    setDraft(blankSpell())
    setDirty(false)
    setArmedComponentId(null)
  }, [])

  const selectSpell = useCallback(
    (id: string) => {
      const found = spells.find((spell) => spell.id === id)
      if (!found) return
      setDraft(found)
      setDirty(false)
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
      }
    },
    [draft.id, repository, write],
  )

  const upsertComponent = useCallback(
    async (input: ComponentDraft, id?: string) => {
      const now = Date.now()
      const existing = id ? componentsById.get(id) : undefined
      const component: MaterialComponent = {
        ...input,
        id: existing?.id ?? newId(),
        isSeed: existing?.isSeed ?? false,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      const ok = await write('Could not record the component', () =>
        repository.saveComponent(component),
      )
      if (!ok) return

      setComponents((current) => {
        const index = current.findIndex((entry) => entry.id === component.id)
        const next =
          index === -1
            ? [...current, component]
            : current.map((entry) => (entry.id === component.id ? component : entry))
        return next.sort(byName)
      })
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

      // Clear the deleted component out of the draft rather than leaving a dangling id.
      setDraft((current) =>
        current.slots.includes(id)
          ? { ...current, slots: current.slots.map((slot) => (slot === id ? null : slot)) }
          : current,
      )

      // Saved spells keep their reference until re-saved; resolvePlacements skips
      // dangling ids, so they simply render as empty slots.
    },
    [repository, write],
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
