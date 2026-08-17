import { useMemo, type CSSProperties } from 'react'
import { componentHue } from '../data/currencies'
import { componentForCaster } from '../lib/reaction'
import { useDrag } from '../state/useDrag'
import { useWorkshop } from '../state/useWorkshop'
import { LedgerLine } from './LedgerLine'

/**
 * The card that follows the cursor during a drag. Fixed-positioned and
 * pointer-transparent, so hit-testing still finds the slot underneath.
 */
export function DragLayer() {
  const { preview } = useDrag()
  const { componentsById, draft } = useWorkshop()
  const component = preview ? componentsById.get(preview.componentId) : undefined

  // Memoized since `preview` changes on every pointermove but the component
  // and its level don't.
  const scaled = useMemo(
    () => (component ? componentForCaster(component, draft.casterLevel) : null),
    [component, draft.casterLevel],
  )

  if (!preview || !component || !scaled) return null

  // Centred on the cursor, matching how a slot centres its own card.
  const style: CSSProperties = {
    transform: `translate3d(${preview.x}px, ${preview.y}px, 0) translate(-50%, -50%)`,
    '--slot-hue': componentHue(component),
  } as CSSProperties

  return (
    <div
      className={`dragPreview${preview.overSlot === null ? '' : ' dragPreview--over'}`}
      style={style}
      aria-hidden="true"
    >
      <span className="slot__body">
        <span className="slot__name">{component.name}</span>
        <LedgerLine demands={scaled.demands} yields={scaled.yields} />
      </span>
    </div>
  )
}
