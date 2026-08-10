import type { CSSProperties } from 'react'
import { CURRENCY_META, LAWS } from '../data/currencies'
import { FORM_META } from '../data/spellForms'
import { useWorkshop } from '../state/useWorkshop'
import { ledgerEntries, type Ledger } from '../types/worldbuilding'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

/** One ledger rendered as labelled bars, scaled against its own largest entry. */
function LedgerReadout({ ledger, describe }: { ledger: Ledger; describe: 'vent' | 'toll' }) {
  const entries = ledgerEntries(ledger)
  const peak = Math.max(...entries.map(([, amount]) => amount), 1)

  return (
    <dl className="ledger">
      {entries.map(([currency, amount]) => {
        const meta = CURRENCY_META[currency]
        return (
          <div key={currency} className="ledger__row">
            <dt title={meta.gloss}>{meta.label}</dt>
            <dd>
              <span
                className="ledger__bar"
                style={{ width: `${(amount / peak) * 100}%`, background: `hsl(${meta.hue} 70% 55%)` }}
              />
              <span className="ledger__amount">{amount}</span>
            </dd>
            <p className="ledger__note">{meta[describe]}</p>
          </div>
        )
      })}
    </dl>
  )
}

export function ReactionPanel() {
  const { reaction } = useWorkshop()
  const form = FORM_META[reaction.form]
  const shortSlots = reaction.slots.filter((slot) => ledgerEntries(slot.shortfall).length > 0)

  return (
    <section className="panel reaction">
      <h2 className="panel__title">The reaction</h2>

      {/* The form is an input to the resolver, so what it does is stated here, next
          to the numbers it produced — the same reason the laws are on the page. */}
      <div className="reaction__form">
        <p className="reaction__formLine">
          Resolved as {form.article} <strong>{form.label.toLowerCase()}</strong>
          {reaction.named ? (
            <>
              , naming <strong>{CURRENCY_META[reaction.named].label.toLowerCase()}</strong>
            </>
          ) : null}
          .
        </p>
        <p className="reaction__formRule">{form.rule}</p>
      </div>

      {reaction.filled === 0 ? (
        <p className="reaction__empty">
          The circle is cold. Slot I is lit first and fed last — start it with something that
          demands nothing.
        </p>
      ) : (
        <>
          <div className="reaction__block">
            <h3 className="reaction__heading">
              Manifestation
              <span className="reaction__total">{reaction.manifestationTotal}</span>
            </h3>
            {reaction.manifestationTotal === 0 ? (
              <p className="reaction__none">
                Nothing leaves the ring. The circle consumes everything it makes, and does nothing.
              </p>
            ) : (
              <LedgerReadout ledger={reaction.manifestation} describe="vent" />
            )}
          </div>

          <div className={`reaction__block${reaction.tollTotal > 0 ? ' reaction__block--toll' : ''}`}>
            <h3 className="reaction__heading">
              Toll
              <span className="reaction__total">{reaction.tollTotal}</span>
            </h3>
            {reaction.tollTotal === 0 ? (
              <p className="reaction__none">
                The ring supplies itself. This casting costs the caster nothing.
              </p>
            ) : (
              <>
                <LedgerReadout ledger={reaction.toll} describe="toll" />
                {shortSlots.length > 0 ? (
                  <p className="reaction__short">
                    Starved at{' '}
                    {shortSlots.map((slot, i) => (
                      <span key={slot.slotIndex}>
                        {i > 0 && ', '}
                        <strong>{ROMAN[slot.slotIndex]}</strong>
                      </span>
                    ))}
                    .
                  </p>
                ) : null}
              </>
            )}

          </div>

          <p className="reaction__bled">
            <span>Bled in transit</span>
            <span className="ledger__amount">{reaction.bledTotal}</span>
          </p>
          <div className="reaction__bledBars" aria-hidden="true">
            {ledgerEntries(reaction.bled).map(([currency, amount]) => (
              <span
                key={currency}
                style={
                  {
                    flexGrow: amount,
                    background: `hsl(${CURRENCY_META[currency].hue} 45% 45% / 0.55)`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </>
      )}

      <details className="reaction__laws">
        <summary>The {LAWS.length} laws</summary>
        <ol>
          {LAWS.map((law) => (
            <li key={law.title} className={law.title === form.bends ? 'reaction__law--bent' : ''}>
              <strong>{law.title}.</strong> {law.body}
              {law.title === form.bends ? (
                <span className="reaction__bent"> Bent by this {form.label.toLowerCase()}.</span>
              ) : null}
            </li>
          ))}
        </ol>
      </details>
    </section>
  )
}
