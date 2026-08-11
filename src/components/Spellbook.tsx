import { FORM_LIST, FORM_META, UNDERFED_RULE } from '../data/spellForms'
import { generateSpellName } from '../data/spellNames'
import { useWorkshop } from '../state/useWorkshop'
import { RING_SLOT_COUNT, type SpellForm } from '../types/worldbuilding'
import { LevelControl } from './LevelControl'

/** An inscribed working, read rather than edited. No field carries its name here. */
function BookView() {
  const { draft, editDraft } = useWorkshop()
  const form = FORM_META[draft.form]

  return (
    <div className="book book--view">
      <div className="book__page book__page--left">
        <h2 className="book__viewTitle">{draft.title || 'Untitled working'}</h2>
        <p className="book__viewForm">
          {form.article === 'an' ? 'An' : 'A'} {form.label.toLowerCase()}, worked at level{' '}
          {draft.casterLevel}.
        </p>
        {draft.notes ? <p className="book__viewNotes">{draft.notes}</p> : null}
      </div>

      <div className="book__page book__page--right">
        {draft.text ? (
          <p className="book__viewText">{draft.text}</p>
        ) : (
          <p className="book__viewText book__viewText--none">No words were written for this one.</p>
        )}

        <div className="book__actions book__actions--end">
          <button type="button" className="btn btn--primary" onClick={editDraft}>
            Edit
          </button>
        </div>
      </div>
    </div>
  )
}

function BookEditor() {
  const { draft, dirty, updateDraft, saveDraft, reaction } = useWorkshop()

  return (
    <div className="book">
      <div className="book__page book__page--left">
        <button
          type="button"
          className="btn btn--small book__randomName"
          title="Name it for the form and whatever the ring manifests most of"
          aria-label="Random name"
          onClick={() => updateDraft({ title: generateSpellName(draft.form, reaction.manifestation) })}
        >
          🎲
        </button>

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
              <option key={entry.form} value={entry.form} title={UNDERFED_RULE[entry.underfed]}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <LevelControl />

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
            {draft.form}
            <span className="book__count">
              {reaction.filled}/{RING_SLOT_COUNT} reagents
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

export function Spellbook() {
  const { mode } = useWorkshop()
  return mode === 'view' ? <BookView /> : <BookEditor />
}
