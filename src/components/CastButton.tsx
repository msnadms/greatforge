import { useRef, useState } from 'react'
import { useWorkshop } from '../state/useWorkshop'
import { flash } from './flash'

/**
 * Speaks the rite on the bench and spends what stood in it.
 *
 * Only ever offered in player mode, on an inscribed working being read — a
 * draft has nothing to spend against, and the sandbox carries nothing.
 *
 * **The button predicts nothing.** It is always live, a press always reaches
 * `castSpell`, and the line beside it says what that press did. Both bugs this
 * control has had came from it second-guessing the cast with its own live
 * reading of the satchel: `disabled` while short swallowed the click in
 * silence, so taking the missing reagents looked like it fired a queued rite;
 * and a live shortfall note masked the success line the instant a casting spent
 * what the ring stood on, since the caster no longer carried it. Refusals go to
 * `error` like every other failed write, which `StorageAlert` already renders.
 * The two flashes are on the same footing as that line: gold reports a casting
 * that landed and red one that was refused, and neither says anything before
 * `castSpell` has answered.
 */
export function CastButton() {
  const { playMode, draft, draftIsInscribed, castSpell } = useWorkshop()
  const [casting, setCasting] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const button = useRef<HTMLButtonElement>(null)

  // `SpellActions` only renders this in `view`, so the mode needs no test here.
  if (playMode !== 'player' || !draftIsInscribed) return null

  async function speak() {
    setSaid(null)
    setCasting(true)
    const result = await castSpell(draft.id)
    setCasting(false)
    // Both flashes go with the outcome, not the press: gold for a rite spoken,
    // red for one refused. `speak` waits on it either way, and a refusal has
    // already gone to `error`, so the red is the reason's colour arriving on
    // the button while `StorageAlert` says what it was.
    if (!result) {
      flash(button.current, 'btn--flashDanger')
      return
    }
    flash(button.current, 'btn--flash')
    setSaid(
      `Manifested ${result.manifestationTotal}, tolled ${result.tollTotal}. Spent ${result.spentTotal}${
        result.keptTotal > 0 ? `, kept ${result.keptTotal}` : ''
      }.`,
    )
  }

  return (
    <div className="cast">
      <button
        ref={button}
        type="button"
        className="btn btn--small btn--primary"
        disabled={casting}
        title="Speak the rite. What stands in the circle is spent, less whatever a met dirge keeps."
        onClick={() => void speak()}
      >
        {casting ? 'Speaking…' : 'Cast'}
      </button>
      {said ? <span className="cast__note">{said}</span> : null}
    </div>
  )
}
