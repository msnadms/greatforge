import { useState } from 'react'
import { CASTER_SPECIALTY_META } from '../data/casterSpecialties'
import { useWorkshop } from '../state/useWorkshop'
import { PLAY_MODES, type PlayMode } from '../types/worldbuilding'
import { CharacterEditor } from './CharacterEditor'
import { SpecialtyControl } from './SpecialtyControl'

const MODE_LABEL: Record<PlayMode, string> = {
  sandbox: 'Sandbox',
  player: 'Player',
}

const MODE_HINT: Record<PlayMode, string> = {
  sandbox:
    'The workshop as a drafting table: one discipline, changed at will, the whole codex in reach, any scale.',
  player:
    'The workshop read through a caster: their discipline is fixed, their scale is the ceiling, and only what they carry may be laid in the circle.',
}

/** The caster the player bench is standing at, and the way between casters. */
function CharacterControl() {
  const { activeCharacter, characters, selectCharacter, groupCasterLevel } = useWorkshop()
  const [editing, setEditing] = useState<'new' | 'current' | null>(null)

  return (
    <div className="caster__character">
      {characters.length > 0 ? (
        <select
          className="caster__select"
          aria-label="Caster"
          value={activeCharacter?.id ?? ''}
          onChange={(event) => void selectCharacter(event.target.value)}
        >
          {!activeCharacter ? (
            <option value="" disabled>
              Choose a caster
            </option>
          ) : null}
          {characters.map((character) => (
            <option key={character.id} value={character.id}>
              {character.name} · {CASTER_SPECIALTY_META[character.specialty].label} ·{' '}
              {groupCasterLevel ?? character.level}
            </option>
          ))}
        </select>
      ) : (
        <span className="caster__none">No casters enrolled</span>
      )}

      <button type="button" className="btn btn--small" onClick={() => setEditing('new')}>
        + New
      </button>

      {activeCharacter ? (
        <button type="button" className="btn btn--small" onClick={() => setEditing('current')}>
          Edit
        </button>
      ) : null}

      {editing ? (
        <CharacterEditor
          character={editing === 'current' ? activeCharacter : null}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}

/**
 * Which bench the workshop is standing at. Sits with the account rather than
 * with the caster: it is a switch on the whole workshop, the same kind of thing
 * as signing out, and not a property of whoever is standing at the bench.
 */
export function BenchToggle() {
  const { playMode, setPlayMode } = useWorkshop()

  return (
    <div className="bench" role="group" aria-label="Bench">
      {PLAY_MODES.map((option) => (
        <button
          key={option}
          type="button"
          className={`bench__step${option === playMode ? ' bench__step--active' : ''}`}
          aria-pressed={option === playMode}
          title={MODE_HINT[option]}
          onClick={() => void setPlayMode(option)}
        >
          {MODE_LABEL[option]}
        </button>
      ))}
    </div>
  )
}

/**
 * Who is standing at the bench, centred over the header. Sandbox chooses a
 * discipline outright; player mode reads one off the caster and offers no way
 * to change it. See `PlayMode`.
 */
export function CasterBar() {
  const { playMode } = useWorkshop()

  return (
    <div className="caster">
      {playMode === 'player' ? <CharacterControl /> : <SpecialtyControl />}
    </div>
  )
}
