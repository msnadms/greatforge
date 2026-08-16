import { useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import {
  CURRENCY_LIST,
  ROLES,
  ROLE_HINT,
  componentHue,
  describeRole,
  type Role,
} from '../data/currencies'
import { ledgerForCaster } from '../lib/reaction'
import { useDrag } from '../state/useDrag'
import { useWorkshop } from '../state/useWorkshop'
import {
  MAX_REAGENT_STOCK,
  RARITIES,
  ledgerTotal,
  stockCount,
  type Currency,
  type Ledger,
  type MaterialComponent,
} from '../types/worldbuilding'
import { ComponentEditor } from './ComponentEditor'
import { flash } from './flash'
import { LedgerLine } from './LedgerLine'

const VIEWS = ['list', 'grid'] as const

type View = (typeof VIEWS)[number]

const VIEW_LABEL: Record<View, string> = {
  list: 'List',
  grid: 'Grid',
}

const SORTS = ['name', 'role', 'rarity', 'gives', 'asks'] as const

type Sort = (typeof SORTS)[number]

const SORT_LABEL: Record<Sort, string> = {
  name: 'By name',
  role: 'By part',
  rarity: 'By rarity',
  gives: 'By what it gives',
  asks: 'By what it asks',
}

function compareBy(sort: Sort, a: MaterialComponent, b: MaterialComponent): number {
  switch (sort) {
    case 'role':
      return ROLES.indexOf(describeRole(a)) - ROLES.indexOf(describeRole(b))
    case 'rarity':
      return RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity)
    // Largest first.
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

/** One group of currency checkboxes — the currencies a reagent asks for, or gives back. */
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

/**
 * Which shelf the tray is reading in player mode: what the caster carries, or
 * the whole pool it may be taken from. Sandbox has only the one, since the
 * codex is the satchel there.
 */
const BROWSING = ['satchel', 'pool'] as const

type Browsing = (typeof BROWSING)[number]

const BROWSING_LABEL: Record<Browsing, string> = {
  satchel: 'Carried',
  pool: 'Pool',
}

/**
 * How many of a pool reagent to take, and the button that takes them.
 *
 * **Declared at module scope, not inside `ComponentTray`.** A component defined
 * during a render is a new type on every render, so React unmounts and remounts
 * it — the number input would lose focus on each keystroke.
 *
 * **The number is this row's own state, not the tray's.** Held above, a
 * keystroke in one pool card re-rendered every other row in the catalog; it is
 * wanted only when Take is pressed, and that is when it is handed up.
 */
function TakeControl({
  component,
  carried,
  compact,
  onTake,
}: {
  component: MaterialComponent
  carried: number
  /** Grid view: a third of the rail, so the word and the prose don't fit. */
  compact?: boolean
  onTake: (quantity: number) => void
}) {
  const [quantity, setQuantity] = useState(1)
  const takeBtn = useRef<HTMLButtonElement>(null)
  const full = carried >= MAX_REAGENT_STOCK
  return (
    <div
      className={`tray__take${compact ? ' tray__take--compact' : ''}`}
      onClick={(event) => event.stopPropagation()}
      role="presentation"
    >
      <input
        type="number"
        className="tray__qty"
        min={1}
        max={MAX_REAGENT_STOCK}
        step={1}
        value={quantity}
        aria-label={`How many ${component.name} to take`}
        disabled={full}
        onChange={(event) => {
          const value = Math.floor(Number(event.target.value))
          setQuantity(Number.isFinite(value) ? Math.min(MAX_REAGENT_STOCK, Math.max(1, value)) : 1)
        }}
      />
      <button
        ref={takeBtn}
        type="button"
        className={`btn btn--small${compact ? ' tray__takeBtn' : ''}`}
        disabled={full}
        aria-label={compact ? `Take ${quantity} ${component.name}` : undefined}
        title={full ? 'The satchel will hold no more of this.' : compact ? 'Take' : undefined}
        onClick={() => {
          // Both satchel flashes acknowledge the press: neither `takeReagent`
          // nor `dropReagent` reports back, and a failed write lands in `error`
          // for `StorageAlert` to render. The cast button, which does get an
          // outcome, flashes on that instead.
          flash(takeBtn.current, 'btn--flash')
          onTake(quantity)
        }}
      >
        {compact ? '+' : 'Take'}
      </button>
      {/* The grid card has no room for the tally, and the satchel shelf is
          where a caster reads what they are carrying anyway. */}
      {!compact && carried > 0 ? <span className="tray__carried">carrying {carried}</span> : null}
    </div>
  )
}

export function ComponentTray() {
  const {
    components,
    placeableComponents,
    canAuthorComponents,
    playMode,
    activeCharacter,
    takeReagent,
    dropReagent,
    inventory,
    armedComponentId,
    armComponent,
    deleteComponent,
    loading,
    mode,
    draft,
  } = useWorkshop()
  const { startDrag } = useDrag()
  const [view, setView] = useState<View>('list')
  const [browsing, setBrowsing] = useState<Browsing>('satchel')
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

  // Sandbox reads the whole codex and lays any of it. A player reads what the
  // caster carries, and steps over to the pool to take more.
  const inPool = playMode === 'player' && browsing === 'pool'
  const shelf = inPool ? components : placeableComponents

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    // Any of the checked currencies within a column, all of the columns across them.
    const matched = shelf.filter((component) => {
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
  }, [shelf, query, roleFilter, sort, asks, gives])

  // Scaled once per catalog, keyed on the two things a scaled ledger actually
  // depends on. Keyed on `visible` it re-scaled every matching row on every
  // keystroke, sort and filter — none of which change what a ledger scales to.
  const scaledLedgers = useMemo(
    () =>
      new Map(
        components.map((component) => [
          component.id,
          {
            demands: ledgerForCaster(component.demands, draft.casterLevel),
            yields: ledgerForCaster(component.yields, draft.casterLevel),
          },
        ]),
      ),
    [components, draft.casterLevel],
  )

  function openEditor(component: MaterialComponent | null) {
    setEditing(component)
    setEditorOpen(true)
  }

  // A reagent is armed and dragged from the shelf it may actually be laid from.
  // The pool is a place to take from, not to place out of.
  const canPlace = mode === 'edit' && !inPool

  /**
   * Right-click puts one back. This is the whole of the return path — the
   * satchel rows carry no buttons of their own — so it takes the browser menu
   * only where there is actually something to give back, and never over the
   * take control, where a number field wants its own menu.
   */
  function handleContextMenu(event: MouseEvent<HTMLLIElement>, component: MaterialComponent) {
    if (playMode !== 'player') return
    if ((event.target as HTMLElement).closest('.tray__take')) return
    if (stockCount(inventory, component.id) === 0) return
    event.preventDefault()
    // The last one of a stack takes its row off the satchel shelf with it, so
    // the flash is what a press on a stack that survives it looks like.
    flash(event.currentTarget, 'tray__item--flash')
    void dropReagent(component.id, 1)
  }

  function handlePointerDown(event: PointerEvent<HTMLLIElement>, component: MaterialComponent) {
    // Let the Edit/Remove buttons take their own presses.
    if ((event.target as HTMLElement).closest('.tray__actions')) return
    if (!canPlace) return
    startDrag(event, { componentId: component.id, fromSlot: null })
  }

  return (
    <section className="panel tray">
      <div className="tray__head">
        <h2 className="panel__title">{playMode === 'player' ? 'Satchel' : 'Codex'}</h2>
        <div className="tray__viewToggle" role="group" aria-label="Codex view">
          {VIEWS.map((option) => (
            <button
              key={option}
              type="button"
              className={`tray__viewStep${option === view ? ' tray__viewStep--active' : ''}`}
              aria-pressed={option === view}
              onClick={() => setView(option)}
            >
              {VIEW_LABEL[option]}
            </button>
          ))}
          {canAuthorComponents ? (
            <button type="button" className="btn btn--small" onClick={() => openEditor(null)}>
              + New
            </button>
          ) : null}
        </div>
      </div>

      {playMode === 'player' ? (
        <div className="tray__viewToggle tray__shelfToggle" role="group" aria-label="Shelf">
          {BROWSING.map((option) => (
            <button
              key={option}
              type="button"
              className={`tray__viewStep${option === browsing ? ' tray__viewStep--active' : ''}`}
              aria-pressed={option === browsing}
              onClick={() => {
                setBrowsing(option)
                armComponent(null)
              }}
            >
              {BROWSING_LABEL[option]}
              {option === 'satchel' ? ` (${placeableComponents.length})` : null}
            </button>
          ))}
        </div>
      ) : null}

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
      ) : playMode === 'player' && !activeCharacter ? (
        <p className="tray__empty">Enrol a caster to carry anything.</p>
      ) : visible.length === 0 ? (
        <p className="tray__empty">
          {filtered
            ? 'No material here answers to that. Loosen the filters.'
            : playMode === 'player'
              ? 'This caster carries nothing. Take what you need from the pool.'
              : 'Nothing here. Add a component to begin.'}
        </p>
      ) : (
        <ul className={`tray__list${view === 'grid' ? ' tray__list--grid' : ''}`}>
          {visible.map((component) => {
            const armed = component.id === armedComponentId
            const role = describeRole(component)
            const demands = scaledLedgers.get(component.id)?.demands ?? {}
            const yields = scaledLedgers.get(component.id)?.yields ?? {}
            // The sandbox carries nothing, so the empty stock answers 0 on its
            // own and needs no mode branch of its own here.
            const carried = stockCount(inventory, component.id)
            return (
              <li
                key={component.id}
                className={`tray__item${view === 'grid' ? ' tray__item--card' : ''}${armed ? ' tray__item--armed' : ''}${canPlace ? '' : ' tray__item--inert'}`}
                style={{ '--slot-hue': componentHue(component) } as CSSProperties}
                title={carried > 0 ? 'Right-click to put one back.' : undefined}
                onPointerDown={(event) => handlePointerDown(event, component)}
                onContextMenu={(event) => handleContextMenu(event, component)}
                onClick={() => {
                  if (canPlace) armComponent(armed ? null : component.id)
                }}
              >
                {view === 'grid' ? (
                  // The same compact card a filled, editable slot on the circle draws:
                  // name and ledger only, no prose. In the pool the card is the
                  // button that takes it, since there is no room for a row of
                  // actions and taking is the only thing to do here.
                  <span className="slot__body">
                    <span className="slot__name">{component.name}</span>
                    <LedgerLine demands={demands} yields={yields} labels="none" />
                    {inPool ? (
                      <TakeControl
                        component={component}
                        carried={carried}
                        compact
                        onTake={(quantity) => void takeReagent(component.id, quantity)}
                      />
                    ) : (
                      <span className="tray__foot">
                        <span
                          className="tray__mark"
                          role="img"
                          aria-label={component.rarity}
                          title={component.rarity}
                        >
                          {component.rarity[0].toUpperCase()}
                        </span>
                        {playMode === 'player' ? (
                          <span className="tray__count tray__count--stack">×{carried}</span>
                        ) : null}
                      </span>
                    )}
                  </span>
                ) : (
                  <>
                    <div className="tray__itemHead">
                      <span className="tray__name">{component.name}</span>
                      <span className="tray__role" title={ROLE_HINT[role]}>
                        {role}
                      </span>
                    </div>

                    <LedgerLine demands={demands} yields={yields} labels="full" />

                    <p className="tray__desc">{component.description}</p>

                    <div className="tray__meta">
                      <span className="tray__rarity">{component.rarity}</span>
                      {playMode === 'player' && !inPool ? (
                        <span className="tray__count tray__count--stack">×{carried}</span>
                      ) : null}
                    </div>

                    {/* Authoring is the sandbox's and the pool is the player's,
                        so the two are never both offered. */}
                    {canAuthorComponents ? (
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
                    ) : inPool ? (
                      <div className="tray__actions">
                        <TakeControl
                          component={component}
                          carried={carried}
                          onTake={(quantity) => void takeReagent(component.id, quantity)}
                        />
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {editorOpen && <ComponentEditor component={editing} onClose={() => setEditorOpen(false)} />}
    </section>
  )
}
