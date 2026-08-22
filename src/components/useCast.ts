import { useCallback, useMemo, useState } from 'react'
import { castingCost, missingReagents } from '../lib/casting'
import { useWorkshop } from '../state/useWorkshop'
import { flash } from './flash'

/**
 * Speaking the rite on the bench, shared by the two controls that offer it:
 * `CastButton` beside the page, and the ring drawn in the middle of it.
 *
 * **It predicts nothing**, which is the rule `CastButton` was rebuilt around
 * twice. `speak` always reaches `castSpell`, and what comes back is the only
 * thing either control reports. Refusals go to `error` like every other failed
 * write, which `StorageAlert` renders; the gold and red flashes are the same
 * report arriving on whichever element was pressed.
 *
 * Each caller holds its own `casting` and `said`, so a rite spoken at the ring
 * leaves the button's line alone. That line is the button's own account of what
 * the press it received did, and the ring answers in fire instead.
 *
 * **Which is exactly why neither flag may be the thing that stops a second
 * casting.** Two controls, two flags, and neither can see the other's press:
 * `casting` disables the element that was pressed and nothing more. The rule
 * that a rite is spoken once lives in `WorkshopProvider.castSpell`, which
 * refuses a call made while one is still in flight whichever control made it.
 */
export function useCast() {
  const { draft, castSpell } = useWorkshop()
  const [casting, setCasting] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  const speak = useCallback(
    async (pressed: HTMLElement | null) => {
      setSaid(null)
      setCasting(true)
      const result = await castSpell(draft.id)
      setCasting(false)
      if (!result) {
        flash(pressed, 'btn--flashDanger')
        return
      }
      flash(pressed, 'btn--flash')
      setSaid(
        `Manifested ${result.manifestationTotal}, tolled ${result.tollTotal}. Spent ${result.spentTotal}${
          result.keptTotal > 0 ? `, kept ${result.keptTotal}` : ''
        }.`,
      )
    },
    [castSpell, draft.id],
  )

  return { casting, said, speak }
}

/** Whether the bench is offering a casting at all: the test `CastButton`,
 *  `CircleFire` and the read page's ring all render themselves on. */
export function useCastable(): boolean {
  const { playMode, draftIsInscribed } = useWorkshop()
  return playMode === 'player' && draftIsInscribed
}

/**
 * Whether the caster carries everything standing in the circle, which is what
 * the read page's ring radiates on.
 *
 * **A reading, never a gate.** Nothing here decides what a press does. The one
 * control that reads it stays live either way, so a rite the satchel cannot
 * cover is still spoken, still refused by `castSpell`, and still says why in
 * `error`. Wiring this into `disabled` is the first bug written up on
 * `CastButton`.
 *
 * It goes false the moment a casting lands, since spending is exactly what
 * stops the caster carrying what the ring stood on. That is the truth about the
 * satchel and it belongs on the page. The second `CastButton` bug is the same
 * flip masking the outcome of the press that caused it, which is why this is
 * read by rings and never by a line of text.
 *
 * `castSpell` costs the *stored* rite rather than the bench's working. A read
 * page holds the rite it opened, so the two agree wherever this is asked.
 */
export function useSatchelCovers(): boolean {
  const { activeCharacter, placements, reaction, componentsById } = useWorkshop()
  return useMemo(() => {
    if (!activeCharacter || placements.length === 0) return false
    const cost = castingCost(placements, reaction.keptSlots)
    return missingReagents(cost, activeCharacter.inventory, componentsById).length === 0
  }, [activeCharacter, componentsById, placements, reaction.keptSlots])
}
