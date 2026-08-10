import { useMemo, useState, type CSSProperties, type PointerEvent } from 'react'
import {
  CURRENCY_LIST,
  ROLES,
  ROLE_HINT,
  componentHue,
  describeRole,
  type Role,
} from '../data/currencies'
import { useDrag } from '../state/useDrag'
import { useWorkshop } from '../state/useWorkshop'
import {
  RARITIES,
  ledgerTotal,
  type Currency,
  type Ledger,
  type MaterialComponent,
} from '../types/worldbuilding'
import { ComponentEditor } from './ComponentEditor'
import { LedgerLine } from './LedgerLine'

const SORTS = ['name', 'role', 'rarity', 'gives', 'asks'] as const

type Sort = (typeof SORTS)[number]

const SORT_LABEL: Record<Sort, string> = {
  name: 'By name',
  role: 'By part',
  rarity: 'By rarity',
  gives: 'By what it gives',
  asks: 'By what it asks',
}

/**
 * Sorting a reagent against the *other* reagents, which is the order a shelf is kept
 * in. Ties fall back to the name so the list never reshuffles under an edit that
 * did not touch the key being sorted on.
 */
function compareBy(sort: Sort, a: MaterialComponent, b: MaterialComponent): number {
  switch (sort) {
    case 'role':
      return ROLES.indexOf(describeRole(a)) - ROLES.indexOf(describeRole(b))
    case 'rarity':
      return RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity)
    // Largest first: what you are looking for on these two axes is the fat reagent,
    // not the thin one.
    case 'gives':
      return ledgerTotal(b.yields) - ledgerTotal(a.yields)
    case 'asks':
      return ledgerTotal(b.demands) - ledgerTotal(a.demands)
    default:
      return 0
  }
}

/** True when the ledger carries a non-zero amount of any of the checked currencies. */
function touchesAny(ledger: Ledger, currencies: ReadonlySet<Currency>): boolean {
  for (const currency of currencies) {
    if ((ledger[currency] ?? 0) > 0) return true
  }
  return false
}

/**
 * One group of currency checkboxes — the currencies a reagent asks for, or the
 * ones it gives back.
 *
 * A checkbox rather than the role select's one-at-a-time, because the question
 * being asked of the codex is nearly always a disjunction: building a ring that
 * has heat and motion in flight, what will take *either* of them.
 */
function CurrencyFilter({
  legend,
  hint,
  selected,
  onToggle,
}: {
  legend: string
  hint: string
  selected: ReadonlySet<Currency>
  onToggle: (currency: Currency) => void
}) {
  // A `div role="group"` rather than a fieldset: a legend is not laid out as a
  // flex item — Chromium keeps it in the fieldset's border band — and this label
  // has to sit on the same line as its chips.
  const labelId = `tray-filter-${legend.toLowerCase()}`
  return (
    <div className="tray__group" role="group" aria-labelledby={labelId}>
      <span className="tray__groupLabel" id={labelId} title={hint}>
        {legend}
      </span>
      {CURRENCY_LIST.map((meta) => {
        const on = selected.has(meta.currency)
        return (
          <label
            key={meta.currency}
            className={`chip chip--check${on ? ' chip--active' : ''}`}
            style={{ '--chip-hue': meta.hue } as CSSProperties}
            title={meta.gloss}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => onToggle(meta.currency)}
            />
            {meta.label}
          </label>
        )
      })}
    </div>
  )
}

export function ComponentTray() {
  const { components, armedComponentId, armComponent, deleteComponent, loading, mode } =
    useWorkshop()
  const { startDrag } = useDrag()
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')
  const [sort, setSort] = useState<Sort>('name')
  const [asks, setAsks] = useState<ReadonlySet<Currency>>(new Set())
  const [gives, setGives] = useState<ReadonlySet<Currency>>(new Set())
  const [editing, setEditing] = useState<MaterialComponent | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  const filtered = query.trim() !== '' || roleFilter !== 'all' || asks.size > 0 || gives.size > 0

  function toggle(
    set: (next: ReadonlySet<Currency>) => void,
    current: ReadonlySet<Currency>,
    currency: Currency,
  ) {
    const next = new Set(current)
    if (!next.delete(currency)) next.add(currency)
    set(next)
  }

  function clearFilters() {
    setQuery('')
    setRoleFilter('all')
    setAsks(new Set())
    setGives(new Set())
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    // Any of the checked currencies within a column, all of the columns across
    // them: "asks heat or motion, and gives light" is the shape of the question a
    // half-built ring poses, and checking a second box should widen the answer
    // rather than empty it.
    const matched = components.filter((component) => {
      if (roleFilter !== 'all' && describeRole(component) !== roleFilter) return false
      if (asks.size > 0 && !touchesAny(component.demands, asks)) return false
      if (gives.size > 0 && !touchesAny(component.yields, gives)) return false
      if (!needle) return true
      return (
        component.name.toLowerCase().includes(needle) ||
        component.description.toLowerCase().includes(needle)
      )
    })

    return matched.sort(
      (a, b) => compareBy(sort, a, b) || a.name.localeCompare(b.name),
    )
  }, [components, query, roleFilter, sort, asks, gives])

  function openEditor(component: MaterialComponent | null) {
    setEditing(component)
    setEditorOpen(true)
  }

  // The codex stays readable while a working is being viewed, but nothing in it
  // may be aimed at the circle: a viewed circle refuses the placement, and an
  // armed reagent with nowhere to go reads as the app having broken.
  const canPlace = mode === 'edit'

  function handlePointerDown(event: PointerEvent<HTMLLIElement>, component: MaterialComponent) {
    // Let the Edit/Remove buttons take their own presses.
    if ((event.target as HTMLElement).closest('.tray__actions')) return
    if (!canPlace) return
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

        <CurrencyFilter
          legend="Asks"
          hint="Show only materials whose demands include one of these"
          selected={asks}
          onToggle={(currency) => toggle(setAsks, asks, currency)}
        />
        <CurrencyFilter
          legend="Gives"
          hint="Show only materials whose yields include one of these"
          selected={gives}
          onToggle={(currency) => toggle(setGives, gives, currency)}
        />

        <div className="tray__sortRow">
          <select
            className="tray__sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
          >
            {SORTS.map((option) => (
              <option key={option} value={option}>
                {SORT_LABEL[option]}
              </option>
            ))}
          </select>
          {filtered && (
            <>
              <span className="tray__count">
                {visible.length} of {components.length}
              </span>
              <button type="button" className="btn btn--small" onClick={clearFilters}>
                Clear
              </button>
            </>
          )}
        </div>
      </div>
      {loading ? (
        <p className="tray__empty">Opening the codex…</p>
      ) : visible.length === 0 ? (
        <p className="tray__empty">
          {filtered
            ? 'No material in the codex answers to that. Loosen the filters, or write one that does.'
            : 'Nothing here. Add a component to begin.'}
        </p>
      ) : (
        <ul className="tray__list">
          {visible.map((component) => {
            const armed = component.id === armedComponentId
            const role = describeRole(component)
            return (
              <li
                key={component.id}
                className={`tray__item${armed ? ' tray__item--armed' : ''}${canPlace ? '' : ' tray__item--inert'}`}
                style={{ '--slot-hue': componentHue(component) } as CSSProperties}
                onPointerDown={(event) => handlePointerDown(event, component)}
                onClick={() => {
                  if (canPlace) armComponent(armed ? null : component.id)
                }}
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
