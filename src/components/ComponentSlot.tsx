import type { CSSProperties } from 'react'
import { componentHue, describeLedger, describeRole } from '../data/currencies'
import type { SlotReport } from '../lib/reaction'
import { useDrag } from '../state/useDrag'
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
  /** This slot is one the spoken form's condition speaks about. */
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

  const armed = Boolean(armedComponentId) && !readOnly
  const over = preview?.overSlot === index
  const hue = component ? componentHue(component) : null
  const role = component ? describeRole(component) : null
  const shortfall = report?.shortfall ?? {}
  const starved = ledgerEntries(shortfall).length > 0

  /**
   * What this slot asked for against what reached it. The badge gives the size of
   * the gap; this gives the two numbers it came from, which is the part that is
   * not obvious on a chain — a reagent short by one unit hands on less than its
   * catalog yield, and the reagent after it starves on numbers that look like
   * they should have fed it.
   *
   * What the shortfall then settles for is the form's business and is stated once,
   * in the panel, from `UNDERFED_RULE`.
   */
  const starvation =
    starved && component && report
      ? `Asked ${describeLedger(component.demands)}, received ${describeLedger(report.received)}.`
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
  // carries both: the glyph is only readable if something says the word.
  const standing = component
    ? readOnly && role
      ? `: ${component.name}, a ${role}`
      : `: ${component.name}`
    : ', empty'
  const where = `Slot ${index + 1}${standing}.`
  // Said in full rather than summarised: the badge is a colour and a number on
  // the card, and this is the only form of it anyone not looking at it gets.
  const toll = starved ? ` Starved by ${ledgerTotal(shortfall)}. ${starvation}` : ''
  // The mark is a colour on the card, so the same fact is said here for anyone
  // who is not looking at it.
  const asked = named ? " Named by the form's condition." : ''
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
      {/*
        A circle being read shows what each reagent does to the current rather
        than which reagent it is, so the token carries the sigil alone: no name,
        and no ledger either. Both are what the card is wide for, and a working
        is read for its shape. The numbers are in the panel, the name is on hover.
      */}
      {component ? (
        readOnly && role ? (
          <RoleSigil role={role} />
        ) : (
          <span className="slot__body">
            <span className="slot__name">{component.name}</span>
            <LedgerLine demands={component.demands} yields={component.yields} labels="none" />
          </span>
        )
      ) : null}
      {starved && (
        <span className="slot__toll" title={starvation}>
          −{ledgerTotal(shortfall)}
        </span>
      )}
    </>
  )

  // A viewed slot is not a button and carries no `data-slot-index`, so it is out
  // of the tab order and a drag released over it finds no target at all. `img`
  // reads the whole card as the one static thing it now is.
  if (readOnly) {
    return (
      <div
        className={classes}
        style={{ ...style, ...(hue === null ? undefined : ({ '--slot-hue': hue } as CSSProperties)) }}
        role="img"
        aria-label={label}
        // The name alone. It is the one thing the token no longer shows, and a
        // paragraph of flavour is the wrong answer to "what is that sigil".
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
