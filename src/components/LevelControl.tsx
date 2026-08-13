import { useWorkshop } from '../state/useWorkshop'
import { CASTER_LEVELS } from '../types/worldbuilding'

/**
 * The scale this working is set to. Scales what every reagent demands and
 * yields, and the flat transit cost on a shallower curve; the spill at an
 * open slot never moves. See the eighth law in `data/currencies.ts`.
 */
export function LevelControl() {
  const { draft, updateDraft } = useWorkshop()

  return (
    <div
      className="field"
      title="Scales what every reagent in this working demands and yields, together, and the lap's cost with them. The spill at an open slot stays the same."
    >
      <span className="field__label">Scale</span>
      <div className="level__steps" role="group" aria-label="Spell scale">
        {CASTER_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            className={`level__step${level === draft.casterLevel ? ' level__step--active' : ''}`}
            aria-pressed={level === draft.casterLevel}
            aria-label={`Scale ${level}`}
            onClick={() => updateDraft({ casterLevel: level })}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  )
}
