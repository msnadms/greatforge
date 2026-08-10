import { FORM_LIST } from '../data/spellForms'
import { useWorkshop } from '../state/useWorkshop'
import { RING_SLOT_COUNT, type SpellForm } from '../types/worldbuilding'

export function Spellbook() {
  const { draft, dirty, updateDraft, saveDraft, reaction } = useWorkshop()

  return (
    <div className="book">
      <div className="book__page book__page--left">
        <label className="field">
          <span className="field__label">Title</span>
          <input
            className="book__title"
            value={draft.title}
            placeholder="Untitled working"
            onChange={(event) => updateDraft({ title: event.target.value })}
          />
        </label>

        <label className="field">
          <span className="field__label">Form</span>
          <select
            className="book__form"
            value={draft.form}
            onChange={(event) => updateDraft({ form: event.target.value as SpellForm })}
          >
            {FORM_LIST.map((entry) => (
              <option key={entry.form} value={entry.form}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        {/* The picker carries no description of its own. What the form does is
            stated in the reaction panel beside the numbers it produced, and the law
            it bends is marked in the list of laws there. */}

        <label className="field field--grow">
          <span className="field__label">Notes</span>
          <textarea
            className="book__notes"
            value={draft.notes}
            placeholder="Conditions, who may speak it, what went wrong last time…"
            onChange={(event) => updateDraft({ notes: event.target.value })}
          />
        </label>
      </div>

      <div className="book__page book__page--right">
        <label className="field field--grow">
          <span className="field__label">
            The {draft.form}
            <span className="book__count">
              {reaction.filled}/{RING_SLOT_COUNT} stones
            </span>
          </span>
          <textarea
            className="book__text"
            value={draft.text}
            placeholder={'By the salt that will not dry,\nby the name I gave the water…'}
            onChange={(event) => updateDraft({ text: event.target.value })}
          />
        </label>

        <div className="book__actions">
          <span className="book__status">{dirty ? 'Unsaved changes' : 'Saved'}</span>
          <button type="button" className="btn btn--primary" onClick={() => void saveDraft()}>
            Inscribe
          </button>
        </div>
      </div>
    </div>
  )
}
