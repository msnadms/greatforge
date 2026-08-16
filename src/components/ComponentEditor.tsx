import { useState, type CSSProperties, type FormEvent } from 'react'
import { CURRENCY_LIST, ROLE_HINT, describeRole, isInert } from '../data/currencies'
import { useWorkshop } from '../state/useWorkshop'
import type { ComponentDraft } from '../state/workshopContext'
import { EditorDialog } from './EditorDialog'
import {
  MAX_LEDGER_ENTRY,
  RARITIES,
  ledgerAmount,
  ledgerTotal,
  normalizeLedger,
  type Currency,
  type MaterialComponent,
  type Rarity,
} from '../types/worldbuilding'

type LedgerSide = 'demands' | 'yields'

function initialDraft(component: MaterialComponent | null): ComponentDraft {
  return {
    name: component?.name ?? '',
    description: component?.description ?? '',
    demands: component?.demands ?? {},
    yields: component?.yields ?? {},
    rarity: component?.rarity ?? 'common',
  }
}

interface ComponentEditorProps {
  /** null creates a new component. */
  component: MaterialComponent | null
  onClose: () => void
}

export function ComponentEditor({ component, onClose }: ComponentEditorProps) {
  const { upsertComponent } = useWorkshop()
  const [draft, setDraft] = useState<ComponentDraft>(() => initialDraft(component))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const inert = isInert(draft)
  const role = describeRole(draft)

  function setEntry(side: LedgerSide, currency: Currency, raw: string) {
    const amount = Math.min(MAX_LEDGER_ENTRY, Math.max(0, Math.round(Number(raw) || 0)))
    setDraft((current) => {
      const next = { ...current[side] }
      if (amount > 0) next[currency] = amount
      else delete next[currency]
      return { ...current, [side]: next }
    })
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('A component needs a name.')
      return
    }
    if (inert) {
      setError('A reagent needs numbers. With both ledgers empty the ring cannot tell it from an empty slot.')
      return
    }
    setError(null)
    setSaving(true)
    void upsertComponent(
      {
        ...draft,
        name: draft.name.trim(),
        // Normalized here as well as on read, so a stray value never reaches storage.
        demands: normalizeLedger(draft.demands),
        yields: normalizeLedger(draft.yields),
      },
      component?.id,
    ).then((saved) => {
      // Only close on a write that landed, so a Firestore failure doesn't lose the draft.
      setSaving(false)
      if (saved) onClose()
      else setError('That could not be saved. The workshop is still holding your changes.')
    })
  }

  return (
    <EditorDialog
      title={component ? 'Edit component' : 'New component'}
      ariaLabel={component ? `Edit ${component.name}` : 'New component'}
      error={error}
      onClose={onClose}
      onSubmit={handleSubmit}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : component ? 'Save' : 'Add to codex'}
          </button>
        </>
      }
    >
        <label className="field">
          <span className="field__label">Name</span>
          <input
            autoFocus
            value={draft.name}
            onChange={(event) => setDraft((c) => ({ ...c, name: event.target.value }))}
            placeholder="Quicklime"
          />
        </label>

        <label className="field">
          <span className="field__label">Description</span>
          <textarea
            rows={3}
            value={draft.description}
            onChange={(event) => setDraft((c) => ({ ...c, description: event.target.value }))}
            placeholder="What it is, and what it does"
          />
        </label>

        <fieldset className="field">
          <legend className="field__label">
            Ledger
            <span className="field__note">
              Demands are drawn from upstream; yields are released once it fires.
            </span>
          </legend>

          <div className="ledgerGrid">
            <span className="ledgerGrid__corner" />
            <span className="ledgerGrid__head">Demands</span>
            <span className="ledgerGrid__head">Yields</span>

            {CURRENCY_LIST.map((meta) => (
              <div key={meta.currency} className="ledgerGrid__row" role="group" aria-label={meta.label}>
                <span
                  className="chip chip--tiny"
                  style={{ '--chip-hue': meta.hue } as CSSProperties}
                  title={meta.gloss}
                >
                  {meta.label}
                </span>
                {(['demands', 'yields'] as const).map((side) => (
                  <input
                    key={side}
                    type="number"
                    className="ledgerGrid__input"
                    min={0}
                    max={MAX_LEDGER_ENTRY}
                    step={1}
                    value={ledgerAmount(draft[side], meta.currency) || ''}
                    placeholder="0"
                    aria-label={`${meta.label} ${side}`}
                    onChange={(event) => setEntry(side, meta.currency, event.target.value)}
                  />
                ))}
              </div>
            ))}

            <span className="ledgerGrid__corner" />
            <span className="ledgerGrid__total">{ledgerTotal(draft.demands)}</span>
            <span className="ledgerGrid__total">{ledgerTotal(draft.yields)}</span>
          </div>

          {inert ? (
            <p className="editor__role editor__role--inert">
              Nothing in, nothing out - the ring cannot tell this from an empty slot. Give it
              numbers, or leave the slot empty instead.
            </p>
          ) : (
            <p className="editor__role">
              <strong>{role}</strong> — {ROLE_HINT[role]}
            </p>
          )}
        </fieldset>

        <label className="field">
          <span className="field__label">Rarity</span>
          <select
            value={draft.rarity}
            onChange={(event) => setDraft((c) => ({ ...c, rarity: event.target.value as Rarity }))}
          >
            {RARITIES.map((rarity) => (
              <option key={rarity} value={rarity}>
                {rarity[0].toUpperCase() + rarity.slice(1)}
              </option>
            ))}
          </select>
        </label>

    </EditorDialog>
  )
}
