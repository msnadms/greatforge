import { CASTER_LEVELS, MAX_CASTER_LEVEL, type CasterLevel } from '../types/worldbuilding'

interface LevelStepsProps {
  value: CasterLevel
  onChange: (level: CasterLevel) => void
  /** Accessible name for the group. */
  label: string
  /**
   * Highest step this control may reach. The steps beyond it are drawn dashed
   * and barred rather than hidden: what a caster cannot yet work at is part of
   * what the control says about them.
   */
  max?: CasterLevel
  /** Said on a barred step. Only read when `max` bars anything. */
  beyondHint?: string
}

/**
 * The five scale steps, as a widget with no opinion about what it is setting.
 *
 * Two things bind it: `LevelControl` to the working on the bench, and
 * `CharacterEditor` to a caster's own reach. They were the same markup written
 * twice, and had already drifted — only one of them knew how to bar a step.
 */
export function LevelSteps({
  value,
  onChange,
  label,
  max = MAX_CASTER_LEVEL,
  beyondHint,
}: LevelStepsProps) {
  return (
    <div className="level__steps" role="group" aria-label={label}>
      {CASTER_LEVELS.map((level) => {
        const beyond = level > max
        return (
          <button
            key={level}
            type="button"
            className={`level__step${level === value ? ' level__step--active' : ''}${beyond ? ' level__step--beyond' : ''}`}
            aria-pressed={level === value}
            aria-label={`Scale ${level}`}
            disabled={beyond}
            title={beyond ? beyondHint : undefined}
            onClick={() => onChange(level)}
          >
            {level}
          </button>
        )
      })}
    </div>
  )
}
