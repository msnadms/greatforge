import type { CSSProperties } from 'react'
import { componentHue } from '../data/currencies'
import { useDrag } from '../state/useDrag'
import { ledgerEntries, ledgerTotal, type Ledger, type MaterialComponent } from '../types/worldbuilding'
import { LedgerLine } from './LedgerLine'

interface ComponentSlotProps {
  index: number
  component: MaterialComponent | null
  /** Component selected in the tray; a click on a slot places it. */
  armedComponentId: string | null
  /** Demand the ring could not deliver here, paid by the caster. Empty when fed. */
  shortfall: Ledger
  style: CSSProperties
  onPlace: (index: number, componentId: string) => void
  onClear: (index: number) => void
}

export function ComponentSlot({
  index,
  component,
  armedComponentId,
  shortfall,
  style,
  onPlace,
  onClear,
}: ComponentSlotProps) {
  const { preview, startDrag } = useDrag()

  const armed = Boolean(armedComponentId)
  const over = preview?.overSlot === index
  const hue = component ? componentHue(component) : null
  const starved = ledgerEntries(shortfall).length > 0

  const classes = [
    'slot',
    component ? 'slot--filled' : 'slot--empty',
    over ? 'slot--over' : '',
    armed && !component ? 'slot--armed' : '',
    starved ? 'slot--starved' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const where = `Slot ${index + 1}${component ? `: ${component.name}` : ', empty'}.`
  const toll = starved ? ` Starved by ${ledgerTotal(shortfall)}, taken from the caster.` : ''
  const label = armed
    ? `${where}${toll} Activate to place the selected component here.`
    : component
      ? `${where}${toll} Activate to empty this slot.`
      : `${where} Select a component first, or drag one here.`

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
      <span className="slot__rune" aria-hidden="true">
        {ROMAN[index] ?? index + 1}
      </span>
      {component ? (
        <span className="slot__body">
          <span className="slot__name">{component.name}</span>
          <LedgerLine demands={component.demands} yields={component.yields} labels="none" />
        </span>
      ) : null}
      {starved && (
        <span className="slot__toll" title="Unmet demand, paid by the caster">
          −{ledgerTotal(shortfall)}
        </span>
      )}
    </button>
  )
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
