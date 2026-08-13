import { useMemo, type CSSProperties } from 'react'
import { componentHue, describeLedger, describeRole } from '../data/currencies'
import { ledgerForCaster, type SlotReport } from '../lib/reaction'
import { useDrag } from '../state/useDrag'
import { useWorkshop } from '../state/useWorkshop'
import { ledgerEntries, ledgerTotal, type MaterialComponent } from '../types/worldbuilding'
import { LedgerLine } from './LedgerLine'
import { RoleSigil } from './RoleSigil'

interface ComponentSlotProps {
  index: number
  component: MaterialComponent | null
  /** Component selected in the tray; a click on a slot places it. */
  armedComponentId: string | null
  /** How the ring resolved this slot. Null for an empty slot and a cold circle. */
  report: SlotReport | null
  /** This slot is one the spoken form's melody speaks about. */
  named?: boolean
  /** Viewing an inscribed working: the slot is a diagram, not a control. */
  readOnly?: boolean
  style: CSSProperties
  onPlace: (index: number, componentId: string) => void
  onClear: (index: number) => void
}

export function ComponentSlot({
  index,
  component,
  armedComponentId,
  report,
  named = false,
  readOnly = false,
  style,
  onPlace,
  onClear,
}: ComponentSlotProps) {
  const { preview, startDrag } = useDrag()
  const { draft } = useWorkshop()

  const armed = Boolean(armedComponentId) && !readOnly
  const over = preview?.overSlot === index
  const hue = component ? componentHue(component) : null
  const role = component ? describeRole(component) : null
  const shortfall = report?.shortfall ?? {}
  const starved = ledgerEntries(shortfall).length > 0
  // Scaled to what this caster can command, memoized since a slot re-renders
  // on every pointermove during a drag.
  const { demands, yields } = useMemo(
    () =>
      component
        ? {
            demands: ledgerForCaster(component.demands, draft.casterLevel),
            yields: ledgerForCaster(component.yields, draft.casterLevel),
          }
        : { demands: {}, yields: {} },
    [component, draft.casterLevel],
  )

  /** What this slot asked for against what it actually received. */
  const starvation =
    starved && component && report
      ? `Asked ${describeLedger(demands)}, received ${describeLedger(report.received)}.`
      : ''

  const classes = [
    'slot',
    component ? 'slot--filled' : 'slot--empty',
    over ? 'slot--over' : '',
    armed && !component ? 'slot--armed' : '',
    starved ? 'slot--starved' : '',
    named ? 'slot--named' : '',
    readOnly ? 'slot--readOnly' : '',
  ]
    .filter(Boolean)
    .join(' ')

  // A viewed card shows the role as a sigil and drops the name, so the label
  // states both.
  const standing = component
    ? readOnly && role
      ? `: ${component.name}, a ${role}`
      : `: ${component.name}`
    : ', empty'
  const where = `Slot ${index + 1}${standing}.`
  const toll = starved ? ` Starved by ${ledgerTotal(shortfall)}. ${starvation}` : ''
  const asked = named ? " Named by the form's melody." : ''
  const label = readOnly
    ? `${where}${toll}${asked}`
    : armed
      ? `${where}${toll}${asked} Activate to place the selected component here.`
      : component
        ? `${where}${toll}${asked} Activate to empty this slot.`
        : `${where}${asked} Select a component first, or drag one here.`

  const inside = (
    <>
      <span className="slot__rune" aria-hidden="true">
        {ROMAN[index] ?? index + 1}
      </span>
      {/* A viewed token shows only the role sigil, no name or ledger. */}
      {component ? (
        readOnly && role ? (
          <RoleSigil role={role} />
        ) : (
          <span className="slot__body">
            <span className="slot__name">{component.name}</span>
            <LedgerLine demands={demands} yields={yields} labels="none" />
          </span>
        )
      ) : null}
      {starved && !readOnly && (
        <span className="slot__toll" title={starvation}>
          −{ledgerTotal(shortfall)}
        </span>
      )}
    </>
  )

  // A viewed slot renders as a `div role="img"` with no `data-slot-index`, so
  // it drops out of the tab order and a drag released over it finds no target.
  if (readOnly) {
    return (
      <div
        className={classes}
        style={{ ...style, ...(hue === null ? undefined : ({ '--slot-hue': hue } as CSSProperties)) }}
        role="img"
        aria-label={label}
        title={component ? component.name : undefined}
      >
        {inside}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={classes}
      data-slot-index={index}
      style={{ ...style, ...(hue === null ? undefined : ({ '--slot-hue': hue } as CSSProperties)) }}
      aria-label={label}
      title={component ? `${component.name} — ${component.description}` : undefined}
      onPointerDown={(event) => {
        if (component) startDrag(event, { componentId: component.id, fromSlot: index })
      }}
      onClick={() => {
        if (armedComponentId) onPlace(index, armedComponentId)
        else if (component) onClear(index)
      }}
    >
      {inside}
    </button>
  )
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
