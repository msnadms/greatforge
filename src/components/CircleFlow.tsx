import { useMemo } from 'react'
import {
  buildFlowArcs,
  buildManifestLines,
  dominantCurrency,
  type FlowGeometry,
} from '../lib/circleFlow'
import type { SlotReport } from '../lib/reaction'
import { RING_SLOT_COUNT, type Ledger } from '../types/worldbuilding'

interface CircleFlowProps {
  /** The BEM block the strokes belong to — `circle` on the bench, `spells` on
   * the shelf. Both draw the same paths at different weights. */
  block: 'circle' | 'spells'
  geometry: FlowGeometry
  /** What is still in flight leaving each slot, straight off the reaction. */
  carrying: Ledger[]
  /** Slot I's report, which decides whether the ring is drawn closing. */
  first: SlotReport | null
  /** What left through the mouth. Drawn only where the geometry states a fan
   * to draw it in. */
  manifestation?: Ledger
  /** Hover text naming what each stroke carries. Off where the whole circle is
   * one control and already says what it is. */
  titles?: boolean
}

/**
 * The current, drawn: one stroke per unbroken run of the ring, plus the closing
 * lap over the mouth, plus a fan of exit lines for what left. Geometry is in
 * `lib/circleFlow`, so the bench and a codex entry differ only in scale.
 */
export function CircleFlow({ block, geometry, carrying, first, manifestation, titles }: CircleFlowProps) {
  const flows = useMemo(() => buildFlowArcs(carrying, first, geometry), [carrying, first, geometry])

  const manifestLines = useMemo(
    () => buildManifestLines(manifestation ?? {}, geometry),
    [manifestation, geometry],
  )

  /** Whichever currency is leaving slot VIII for the mouth — its exit line is
   * painted last so overlaps never hide the colour actually in flight there. */
  const mouthCurrency = useMemo(
    () => dominantCurrency(carrying[RING_SLOT_COUNT - 1] ?? {}),
    [carrying],
  )

  /** `manifestLines` in paint order. Kept separate so the fan layout stays fixed. */
  const manifestPaintOrder = useMemo(
    () =>
      [...manifestLines].sort(
        (a, b) => Number(a.currency === mouthCurrency) - Number(b.currency === mouthCurrency),
      ),
    [manifestLines, mouthCurrency],
  )

  return (
    <>
      {(flows.length > 0 || manifestLines.length > 0) && (
        <defs>
          {flows.map((flow) => (
            <linearGradient
              key={flow.gradientId}
              id={flow.gradientId}
              gradientUnits="userSpaceOnUse"
              x1={flow.x1}
              y1={flow.y1}
              x2={flow.x2}
              y2={flow.y2}
            >
              {flow.stops.map((stop, index) => (
                <stop key={index} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
          ))}
          {manifestLines.map((line) => (
            <linearGradient
              key={line.gradientId}
              id={line.gradientId}
              gradientUnits="userSpaceOnUse"
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
            >
              <stop offset="0%" stopColor={line.color} stopOpacity="1" />
              <stop offset="55%" stopColor={line.color} stopOpacity="0.15" />
              <stop offset="100%" stopColor={line.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
      )}

      {flows.map((flow) => (
        <path
          key={flow.key}
          className={`${block}__flow`}
          d={flow.path}
          stroke={`url(#${flow.gradientId})`}
        >
          {titles && <title>{flow.title}</title>}
        </path>
      ))}

      {manifestPaintOrder.map((line) => (
        <path
          key={line.currency}
          className={`${block}__manifest`}
          d={line.path}
          stroke={`url(#${line.gradientId})`}
        >
          {titles && <title>{line.title}</title>}
        </path>
      ))}
    </>
  )
}
