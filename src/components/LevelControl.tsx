import { useWorkshop } from '../state/useWorkshop'
import { LevelSteps } from './LevelSteps'

/**
 * The scale this working is set to. Scales what every reagent demands and
 * yields, and the flat transit cost on a shallower curve; the spill at an
 * open slot never moves. See the eighth law in `data/currencies.ts`.
 */
export function LevelControl() {
  const { draft, updateDraft, maxCasterLevel, playMode } = useWorkshop()

  return (
    <div
      className="field"
      title="Scales what every reagent in this working demands and yields, together, and the lap's cost with them. The spill at an open slot stays the same."
    >
      <span className="field__label">
        Scale
        {/* A character writes at its own scale or any lesser one, so the steps
            above it are shown and barred rather than hidden — what a caster
            cannot yet reach is part of what the control says. */}
        {playMode === 'player' ? (
          <span className="field__note">This caster reaches {maxCasterLevel}.</span>
        ) : null}
      </span>
      <LevelSteps
        value={draft.casterLevel}
        max={maxCasterLevel}
        label="Spell scale"
        beyondHint="Beyond this caster’s reach."
        onChange={(casterLevel) => updateDraft({ casterLevel })}
      />
    </div>
  )
}
