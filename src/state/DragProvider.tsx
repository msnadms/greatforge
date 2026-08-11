import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { DragLayer } from '../components/DragLayer'
import { DragContext, type DragPayload, type DragPreview, type DragValue } from './dragContext'
import { useWorkshop } from './useWorkshop'

/** Pixels the pointer must travel before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4

interface InternalDrag extends DragPayload {
  pointerId: number
  originX: number
  originY: number
  started: boolean
  source: HTMLElement
}

/** The ring slot under the given viewport point, if any. */
function slotUnder(x: number, y: number): number | null {
  const element = document.elementFromPoint(x, y)
  const slot = element?.closest('[data-slot-index]')
  if (!slot) return null
  const index = Number(slot.getAttribute('data-slot-index'))
  return Number.isInteger(index) ? index : null
}

/** A drag ends with a click event on the source; swallow it so a drop doesn't also arm it. */
function swallowNextClick(): void {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  window.setTimeout(() => window.removeEventListener('click', swallow, true), 250)
}

/**
 * Pointer-driven dragging — native HTML5 drag's translucent image lags the
 * cursor, so DragLayer renders the carried card under the cursor instead.
 */
export function DragProvider({ children }: { children: ReactNode }) {
  const { placeComponent, moveSlot } = useWorkshop()
  const [preview, setPreview] = useState<DragPreview | null>(null)
  const dragRef = useRef<InternalDrag | null>(null)

  /** Detaches window listeners on unmount, so a drag in progress can't outlive it. */
  const teardownRef = useRef<(() => void) | null>(null)
  useEffect(() => () => teardownRef.current?.(), [])

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, payload: DragPayload) => {
      // Primary button (or touch/pen) only, and never two drags at once.
      if (event.button !== 0 || dragRef.current) return

      const drag: InternalDrag = {
        ...payload,
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        started: false,
        source: event.currentTarget,
      }
      dragRef.current = drag

      const handleMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== drag.pointerId) return

        if (!drag.started) {
          const travelled = Math.hypot(
            moveEvent.clientX - drag.originX,
            moveEvent.clientY - drag.originY,
          )
          if (travelled < DRAG_THRESHOLD) return
          drag.started = true
          document.body.classList.add('is-dragging')
          drag.source.classList.add('is-dragSource')
        }

        moveEvent.preventDefault()
        setPreview({
          componentId: drag.componentId,
          fromSlot: drag.fromSlot,
          x: moveEvent.clientX,
          y: moveEvent.clientY,
          overSlot: slotUnder(moveEvent.clientX, moveEvent.clientY),
        })
      }

      const teardown = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleEnd)
        window.removeEventListener('pointercancel', handleEnd)
        document.body.classList.remove('is-dragging')
        drag.source.classList.remove('is-dragSource')
        dragRef.current = null
        teardownRef.current = null
      }

      const handleEnd = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== drag.pointerId) return

        teardown()
        setPreview(null)

        if (!drag.started) return
        swallowNextClick()

        // pointercancel has no meaningful drop position; treat it as a release
        // over nothing, which leaves the circle untouched.
        const target = endEvent.type === 'pointercancel'
          ? null
          : slotUnder(endEvent.clientX, endEvent.clientY)
        if (target === null) return

        if (drag.fromSlot === null) placeComponent(target, drag.componentId)
        else moveSlot(drag.fromSlot, target)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleEnd)
      window.addEventListener('pointercancel', handleEnd)
      teardownRef.current = teardown
    },
    [placeComponent, moveSlot],
  )

  const value: DragValue = useMemo(() => ({ preview, startDrag }), [preview, startDrag])

  return (
    <DragContext.Provider value={value}>
      {children}
      <DragLayer />
    </DragContext.Provider>
  )
}
