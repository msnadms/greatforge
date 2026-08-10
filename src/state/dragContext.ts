import { createContext, type PointerEvent as ReactPointerEvent } from 'react'

export interface DragPayload {
  componentId: string
  /** Ring slot the drag started from; null when dragging out of the codex. */
  fromSlot: number | null
}

export interface DragPreview extends DragPayload {
  /**
   * Current pointer position, in viewport coordinates. The carried card is
   * centred here — the same anchor a slot uses — so the preview sits exactly
   * where the component will land.
   */
  x: number
  y: number
  /** Slot currently under the pointer. */
  overSlot: number | null
}

export interface DragValue {
  /** Non-null only once a press has travelled past the drag threshold. */
  preview: DragPreview | null
  /** Call from a drag source's onPointerDown. */
  startDrag: (event: ReactPointerEvent<HTMLElement>, payload: DragPayload) => void
}

export const DragContext = createContext<DragValue | null>(null)
