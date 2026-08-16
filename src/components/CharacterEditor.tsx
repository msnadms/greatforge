import { useState, type FormEvent } from 'react'
import { CASTER_SPECIALTY_META } from '../data/casterSpecialties'
import { useWorkshop } from '../state/useWorkshop'
import {
  CASTER_SPECIALTIES,
  DEFAULT_CASTER_LEVEL,
  stockTotal,
  type CasterLevel,
  type CasterSpecialty,
  type Character,
} from '../types/worldbuilding'
import { EditorDialog } from './EditorDialog'
import { LevelSteps } from './LevelSteps'

interface CharacterEditorProps {
  /** null enrols a new caster. */
  character: Character | null
  onClose: () => void
}

/**
 * Enrols a caster, or amends the name and scale of one already enrolled.
 *
 * **The discipline is chosen once and then only read back.** A player who wants
 * to work another one enrols another caster; that is what characters are for,
 * and the provider refuses a change even if this form were bypassed.
 *
 * Striking a caster lives here rather than beside the select, because it takes
 * their whole shelf and satchel with them and the confirmation says so by count.
 * A single ✕ in the header read as closing something.
 */
export function CharacterEditor({ character, onClose }: CharacterEditorProps) {
  const { createCharacter, updateCharacter, deleteCharacter, activeCharacter, spells } =
    useWorkshop()
  const [name, setName] = useState(character?.name ?? '')
  const [specialty, setSpecialty] = useState<CasterSpecialty>(character?.specialty ?? 'warden')
  const [level, setLevel] = useState<CasterLevel>(character?.level ?? DEFAULT_CASTER_LEVEL)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // The shelf on the context is the standing bench's. It is this caster's only
  // when this caster is the one standing there, which is how the editor is
  // opened; anything else counts nothing rather than counting the wrong shelf.
  const shelved = character && character.id === activeCharacter?.id ? spells.length : null
  const carried = character ? stockTotal(character.inventory) : 0

  /** Closes on a write that landed, and holds the form open on one that did not. */
  function run(action: Promise<boolean>, failure: string) {
    setError(null)
    setSaving(true)
    void action.then((ok) => {
      setSaving(false)
      if (ok) onClose()
      else setError(failure)
    })
  }

  function handleStrike() {
    if (!character) return
    const takes = [
      shelved === null ? 'their rites' : `${shelved} ${shelved === 1 ? 'rite' : 'rites'}`,
      `${carried} ${carried === 1 ? 'reagent' : 'reagents'} carried`,
    ].join(' and ')
    if (!confirm(`Strike "${character.name}"? ${takes} go with them. This cannot be undone.`)) return
    run(deleteCharacter(character.id), 'That could not be struck. The caster stands.')
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('A caster needs a name.')
      return
    }
    run(
      character ? updateCharacter(character.id, { name, level }) : createCharacter(name, specialty, level),
      'That could not be saved. Your changes are still here.',
    )
  }

  return (
    <EditorDialog
      title={character ? 'Edit caster' : 'New caster'}
      ariaLabel={character ? `Edit ${character.name}` : 'New caster'}
      error={error}
      onClose={onClose}
      onSubmit={handleSubmit}
      actions={
        <>
          {character ? (
            <button
              type="button"
              className="btn btn--danger editor__strike"
              disabled={saving}
              onClick={handleStrike}
            >
              Strike caster
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : character ? 'Save' : 'Enroll'}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">Name</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Aldis of the Low Fen"
        />
      </label>

      <label className="field">
        <span className="field__label">
          Discipline
          <span className="field__note">
            {character
              ? 'Trained once and kept. Enroll another caster to work a different one.'
              : 'Chosen once. It cannot be changed afterwards.'}
          </span>
        </span>
        <select
          value={specialty}
          disabled={Boolean(character)}
          onChange={(event) => setSpecialty(event.target.value as CasterSpecialty)}
        >
          {CASTER_SPECIALTIES.map((entry) => (
            <option key={entry} value={entry} title={CASTER_SPECIALTY_META[entry].description}>
              {CASTER_SPECIALTY_META[entry].label}
            </option>
          ))}
        </select>
      </label>

      <p className="editor__role">{CASTER_SPECIALTY_META[specialty].description}</p>

      <div className="field">
        <span className="field__label">
          Scale
          <span className="field__note">Writes rites at this scale or any below it.</span>
        </span>
        <LevelSteps value={level} label="Caster scale" onChange={setLevel} />
      </div>
    </EditorDialog>
  )
}
