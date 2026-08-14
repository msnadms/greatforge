import { useState, type CSSProperties } from 'react'
import { CURRENCY_META, LAWS } from '../data/currencies'
import {
  FORM_META,
  UNDERFED_LABEL,
  UNDERFED_RULE,
  conditionCostRule,
  conditionFor,
  articleFor,
  formLabelFor,
} from '../data/spellForms'
import type { SlotReport } from '../lib/reaction'
import { useWorkshop } from '../state/useWorkshop'
import { ledgerEntries, type Ledger } from '../types/worldbuilding'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

/**
 * The three verdicts a melody can be in, as the panel words them. `cold` is the
 * circle with nothing in it: it has not failed its form, it has not been judged.
 */
const CONDITION_HEAD = {
  cold: 'Melody',
  met: 'Melody met',
  unmet: 'Melody not met',
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
  const [expanded, setExpanded] = useState(true)
  // The form the numbers below were resolved under, not the one the picker is
  // currently showing.
  const form = FORM_META[reaction.form]
  const condition = conditionFor(reaction.form, reaction.specialty)
  const formLabel = formLabelFor(reaction.form, reaction.specialty)
  const shortSlots = reaction.slots.filter((slot) => ledgerEntries(slot.shortfall).length > 0)
  // Under a measuring form, slots that gave back less than their yield instead
  // of billing the caster — a zero toll must not read as a ring that fed itself.
  const stintedSlots = reaction.slots.filter((slot) => slot.measured)
  const keptSlots = reaction.slots.filter((slot) => reaction.keptSlots.includes(slot.slotIndex))
  // A met invocation leaves exactly one currency standing, so the manifestation
  // itself names what it folded into rather than the reaction carrying a field
  // for it.
  const foldedInto =
    reaction.foldLossTotal > 0
      ? (CURRENCY_META[ledgerEntries(reaction.manifestation)[0]?.[0]]?.label.toLowerCase() ?? 'one currency')
      : null
  const verdict =
    reaction.conditionMet === null ? 'cold' : reaction.conditionMet ? 'met' : 'unmet'

  return (
    <section className="panel reaction">
      <div className="reaction__titleRow">
        <h2 className="panel__title">The reaction</h2>
        <button
          type="button"
          className="btn__expandable"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '^' : '˅'}
        </button>
      </div>

      {expanded && (
        <>
          {/* The form's name and underfed setting are named with the prose behind them
              as hover text; the melody stays on the page since it's a verdict on
              the ring as placed and changes as reagents move. */}
          <div className="reaction__form">
            <p className="reaction__formLine">
              Spoken as {articleFor(reaction.form, reaction.specialty)}{' '}
              <strong title={form.gloss}>{formLabel.toLowerCase()}</strong>.{' '}
              <span className="reaction__formTag" title={UNDERFED_RULE[form.underfed]}>
                {UNDERFED_LABEL[form.underfed]}
              </span>
              .
            </p>

            {condition ? (
              // `null` only for a cold circle, which is neither met nor failed.
              <div className={`reaction__condition reaction__condition--${verdict}`}>
                <p className="reaction__conditionHead">{CONDITION_HEAD[verdict]}</p>
                <p className="reaction__conditionText">{condition.statement}</p>
                {reaction.conditionMet === null ? null : (
                  <p className="reaction__conditionCost">
                    {conditionCostRule(condition, reaction.conditionMet)}
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
                  <>
                    <LedgerReadout ledger={reaction.manifestation} describe="vent" />
                    {reaction.griefBonusTotal > 0 ? (
                      <p className="reaction__short">
                        Grief made {reaction.griefBonusTotal} more manifestation out of the toll.
                      </p>
                    ) : null}
                    {reaction.wardBonusTotal > 0 ? (
                      <p className="reaction__short">
                        The threshold gave back {reaction.wardBonusTotal} of what slots I and VIII were fed.
                      </p>
                    ) : null}
                    {keptSlots.length > 0 ? (
                      <p className="reaction__short">
                        The dirge keeps <SlotRun slots={keptSlots} />. It preserves the nearest non-sinks on either side of its fed sink.
                      </p>
                    ) : null}
                    {reaction.foldLossTotal > 0 ? (
                      <p className="reaction__short">
                        The name gathered everything into {foldedInto}. {reaction.foldLossTotal}{' '}
                        {reaction.foldLossTotal === 1 ? 'unit' : 'units'} did not fit.
                      </p>
                    ) : null}
                  </>
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
        </>
      )}
    </section>
  )
}
