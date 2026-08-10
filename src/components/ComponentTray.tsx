import { useMemo, useState, type CSSProperties, type PointerEvent } from 'react'
import { ROLES, ROLE_HINT, componentHue, describeRole, type Role } from '../data/currencies'
import { useDrag } from '../state/useDrag'
import { useWorkshop } from '../state/useWorkshop'
import type { MaterialComponent } from '../types/worldbuilding'
import { ComponentEditor } from './ComponentEditor'
import { LedgerLine } from './LedgerLine'

export function ComponentTray() {
  const { components, armedComponentId, armComponent, deleteComponent, loading } = useWorkshop()
  const { startDrag } = useDrag()
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')
  const [editing, setEditing] = useState<MaterialComponent | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return components.filter((component) => {
      if (roleFilter !== 'all' && describeRole(component) !== roleFilter) return false
      if (!needle) return true
      return (
        component.name.toLowerCase().includes(needle) ||
        component.description.toLowerCase().includes(needle)
      )
    })
  }, [components, query, roleFilter])

  function openEditor(component: MaterialComponent | null) {
    setEditing(component)
    setEditorOpen(true)
  }

  function handlePointerDown(event: PointerEvent<HTMLLIElement>, component: MaterialComponent) {
    // Let the Edit/Remove buttons take their own presses.
    if ((event.target as HTMLElement).closest('.tray__actions')) return
    startDrag(event, { componentId: component.id, fromSlot: null })
  }

  return (
    <section className="panel tray">
      <div className="tray__head">
        <h2 className="panel__title">Codex of components</h2>
        <button type="button" className="btn btn--small" onClick={() => openEditor(null)}>
          + New
        </button>
      </div>

      <div className="tray__filters">
        <input
          className="tray__search"
          value={query}
          placeholder="Search the codex…"
          onChange={(event) => setQuery(event.target.value)}
        />
        <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as Role | 'all')}>
          <option value="all">Every part</option>
          {ROLES.map((role) => (
            <option key={role} value={role} title={ROLE_HINT[role]}>
              {role[0].toUpperCase() + role.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <p className="tray__hint">
        Drag a component onto a slot, or select it and click a slot. Order matters: the current runs
        clockwise from slot I, paying nothing through a relay, one through any other stone, and two
        across a gap.
      </p>

      {loading ? (
        <p className="tray__empty">Opening the codex…</p>
      ) : visible.length === 0 ? (
        <p className="tray__empty">Nothing here. Add a component to begin.</p>
      ) : (
        <ul className="tray__list">
          {visible.map((component) => {
            const armed = component.id === armedComponentId
            const role = describeRole(component)
            return (
              <li
                key={component.id}
                className={`tray__item${armed ? ' tray__item--armed' : ''}`}
                style={{ '--slot-hue': componentHue(component) } as CSSProperties}
                onPointerDown={(event) => handlePointerDown(event, component)}
                onClick={() => armComponent(armed ? null : component.id)}
              >
                <div className="tray__itemHead">
                  <span className="tray__name">{component.name}</span>
                  <span className="tray__role" title={ROLE_HINT[role]}>
                    {role}
                  </span>
                </div>

                <LedgerLine demands={component.demands} yields={component.yields} labels="full" />

                <p className="tray__desc">{component.description}</p>

                <div className="tray__meta">
                  <span className="tray__rarity">{component.rarity}</span>
                </div>

                <div className="tray__actions">
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={(event) => {
                      event.stopPropagation()
                      openEditor(component)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn--small btn--danger"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (confirm(`Remove "${component.name}" from the codex?`)) {
                        void deleteComponent(component.id)
                      }
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editorOpen && <ComponentEditor component={editing} onClose={() => setEditorOpen(false)} />}
    </section>
  )
}
