import { useWorkshop } from '../state/useWorkshop'

export function SpellList() {
  const { spells, draft, dirty, selectSpell, newSpell, deleteSpell, loading } = useWorkshop()

  /** Anything unsaved on the workbench would be lost by loading another spell. */
  function confirmLeave(): boolean {
    return !dirty || confirm('The current working has unsaved changes. Discard them?')
  }

  return (
    <section className="panel spells">
      <div className="tray__head">
        <h2 className="panel__title">Workings</h2>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            if (confirmLeave()) newSpell()
          }}
        >
          + New
        </button>
      </div>

      {loading ? (
        <p className="tray__empty">Loading…</p>
      ) : spells.length === 0 ? (
        <p className="tray__empty">No workings inscribed yet.</p>
      ) : (
        <ul className="spells__list">
          {spells.map((spell) => {
            const active = spell.id === draft.id
            const filled = spell.slots.filter(Boolean).length
            return (
              <li key={spell.id} className={`spells__item${active ? ' spells__item--active' : ''}`}>
                <button
                  type="button"
                  className="spells__open"
                  onClick={() => {
                    if (!active && confirmLeave()) selectSpell(spell.id)
                  }}
                >
                  <span className="spells__title">{spell.title || 'Untitled working'}</span>
                  <span className="spells__meta">
                    {spell.form} · {filled} component{filled === 1 ? '' : 's'}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--danger"
                  aria-label={`Delete ${spell.title || 'untitled working'}`}
                  onClick={() => {
                    if (confirm(`Delete "${spell.title || 'Untitled working'}"?`)) {
                      void deleteSpell(spell.id)
                    }
                  }}
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
