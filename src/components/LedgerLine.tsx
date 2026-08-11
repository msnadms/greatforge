import type { CSSProperties } from 'react'
import { CURRENCY_META } from '../data/currencies'
import { ledgerEntries, type Ledger } from '../types/worldbuilding'

/** How much of the currency's name a pip spells out. */
export type LedgerLabels = 'full' | 'short' | 'none'

function Pips({
  ledger,
  kind,
  labels,
}: {
  ledger: Ledger
  kind: 'demand' | 'yield'
  labels: LedgerLabels
}) {
  return (
    <>
      {ledgerEntries(ledger).map(([currency, amount]) => {
        const meta = CURRENCY_META[currency]
        return (
          <span
            key={currency}
            className={`pip pip--${kind}`}
            style={{ '--chip-hue': meta.hue } as CSSProperties}
            // Carries the currency for hover and for assistive tech, which is
            // what makes the bare-number form legible rather than a guess.
            title={`${meta.label} ${amount}`}
          >
            {labels === 'full' ? `${meta.label} ` : labels === 'short' ? meta.short : ''}
            {amount}
          </span>
        )
      })}
    </>
  )
}

/** A material's ledger at a glance: what it asks on the left, what it gives on the right. */
export function LedgerLine({
  demands,
  yields,
  labels = 'short',
}: {
  demands: Ledger
  yields: Ledger
  labels?: LedgerLabels
}) {
  const asks = ledgerEntries(demands).length > 0
  const gives = ledgerEntries(yields).length > 0

  return (
    <span className={`ledgerLine ledgerLine--${labels}`}>
      {asks ? (
        <Pips ledger={demands} kind="demand" labels={labels} />
      ) : (
        <span className="pip pip--none">—</span>
      )}
      <span className="ledgerLine__arrow" aria-hidden="true">
        ▸
      </span>
      {gives ? (
        <Pips ledger={yields} kind="yield" labels={labels} />
      ) : (
        <span className="pip pip--none">—</span>
      )}
    </span>
  )
}
