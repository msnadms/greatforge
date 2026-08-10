import type { CSSProperties } from 'react'
import { CURRENCY_META, LAWS } from '../data/currencies'
import { FORM_META, LOSS_RELIEF_RULE, UNDERFED_LABEL, UNDERFED_RULE } from '../data/spellForms'
import type { SlotReport } from '../lib/reaction'
import { useWorkshop } from '../state/useWorkshop'
import { ledgerEntries, type Ledger } from '../types/worldbuilding'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

/**
 * The three verdicts a condition can be in, as the panel words them. `cold` is the
 * circle with nothing in it: it has not failed its form, it has not been judged.
 */
const CONDITION_HEAD = {
  cold: 'Condition',
  met: 'Condition met',
  unmet: 'Condition not met',
} as const

/** A list of slot numerals, comma separated. The stinted and starved lines both name slots. */
function SlotRun({ slots }: { slots: SlotReport[] }) {
  return (
    <>
      {slots.map((slot, i) => (
        <span key={slot.slotIndex}>
          {i > 0 && ', '}
          <strong>{ROMAN[slot.slotIndex]}</strong>
        </span>
      ))}
    </>
  )
}

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
              {/* Hue only: the saturation and lightness are theme tokens in the
                  stylesheet, so a bar cannot drift out of the palette. */}
              <span
                className="ledger__bar"
                style={{ width: `${(amount / peak) * 100}%`, '--bar-hue': meta.hue } as CSSProperties}
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
  // The form the numbers below were resolved under, not the one the picker is
  // showing, so the prose and the totals beside it can never describe different
  // castings.
  const form = FORM_META[reaction.form]
  const shortSlots = reaction.slots.filter((slot) => ledgerEntries(slot.shortfall).length > 0)
  // Under a measuring form these are the slots that gave back less than their
  // yield instead of billing the caster. They are the whole cost of the casting, so
  // a zero toll must not be reported as a circle that fed itself when it did not.
  const stintedSlots = reaction.slots.filter((slot) => slot.measured)
  const verdict =
    reaction.conditionMet === null ? 'cold' : reaction.conditionMet ? 'met' : 'unmet'

  return (
    <section className="panel reaction">
      <h2 className="panel__title">The reaction</h2>

      {/* The form is an input, so what it does is stated here in full. Two of the
          three sentences are hover text: the form is named, the underfed setting is
          named, and hovering either gives the prose behind the name. The condition
          stays on the page because it is a verdict on the ring as placed rather than
          a description, and it changes as reagents move.

          Everything is read from `FORM_META`, so the panel cannot describe a rule
          the resolver is not applying. */}
      <div className="reaction__form">
        <p className="reaction__formLine">
          Spoken as {form.article}{' '}
          <strong title={form.gloss}>{form.label.toLowerCase()}</strong>.{' '}
          <span className="reaction__formTag" title={UNDERFED_RULE[form.underfed]}>
            {UNDERFED_LABEL[form.underfed]}
          </span>
          .
        </p>

        {form.condition ? (
          /* One verdict drives the heading, the border and the cost. A form that
             states a condition reports `null` only for a cold circle, which is
             neither met nor failed: it is shown the rule it will be judged against
             and no forfeit, because none is in force yet. */
          <div className={`reaction__condition reaction__condition--${verdict}`}>
            <p className="reaction__conditionHead">{CONDITION_HEAD[verdict]}</p>
            <p className="reaction__conditionText">{form.condition.statement}</p>
            {reaction.conditionMet === null ? null : (
              <p className="reaction__conditionCost">
                {LOSS_RELIEF_RULE[form.condition.loss][reaction.conditionMet ? 'spared' : 'doubled']}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {reaction.filled === 0 ? (
        <p className="reaction__empty">
          The circle is cold.
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
              stintedSlots.length > 0 ? (
                <p className="reaction__none">
                  Nothing is charged to you, but the ring did not feed itself. Stinted at{' '}
                  <SlotRun slots={stintedSlots} />. Each gave back only the share it was fed.
                </p>
              ) : (
                <p className="reaction__none">
                  The ring supplies itself. This casting costs the caster nothing.
                </p>
              )
            ) : (
              <>
                <LedgerReadout ledger={reaction.toll} describe="toll" />
                {shortSlots.length > 0 ? (
                  <p className="reaction__short">
                    Starved at <SlotRun slots={shortSlots} />.
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
                    '--bar-hue': CURRENCY_META[currency].hue,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </>
      )}

      <details className="reaction__laws" hidden={true}>
        <summary>The {LAWS.length} laws</summary>
        <ol>
          {LAWS.map((law) => (
            <li key={law.title}>
              <strong>{law.title}.</strong> {law.body}
            </li>
          ))}
        </ol>
      </details>
    </section>
  )
}
