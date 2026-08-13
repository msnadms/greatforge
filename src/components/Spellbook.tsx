import type { CSSProperties } from 'react'
import { useState } from 'react'
import { CURRENCY_META, describeLedger } from '../data/currencies'
import { FORM_META, UNDERFED_RULE, formLabelFor } from '../data/spellForms'
import { generateSpellName } from '../data/spellNames'
import { useWorkshop } from '../state/useWorkshop'
import { ledgerEntries, type SpellForm } from '../types/worldbuilding'
import { LevelControl } from './LevelControl'

/** A point on the number circle, by angle in degrees clockwise from due right. */
function radialPoint(degrees: number, radius: number) {
  const angle = degrees * (Math.PI / 180)
  return { x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) }
}

/** Radius the drawn ring is stroked at — the numbers curve further out than
 * this, so there's a visible gap between the ring and what's written outside it. */
const RING_RADIUS = 24

/** Radius the manifestation/toll numbers curve along. */
const NUM_RADIUS = 44

/** How much the bottom arc's radius grows to keep its flipped baseline on the same circle. */
const NUM_SIZE = 9

/**
 * Degrees between neighbouring numbers, wide enough that two adjacent
 * two-digit numbers never overlap along the arc — at `NUM_RADIUS` this
 * clears roughly 26 stage units of arc length per step against a number at
 * most ~14 units wide, so nothing paints over its neighbour and disappears.
 */
const ITEM_GAP = 34

/** Hard ceiling on the span the outermost two numbers sit apart, short of
 * running into the other row. */
const MAX_ITEM_SPAN = 140

/**
 * Degrees the path extends past the outermost number on each side. A
 * `textPath` drops any character that falls outside the path's own length —
 * `text-anchor: middle` centres a number's glyphs on its point, so a number
 * sitting exactly at the path's start or end has half its digits pushed past
 * that edge and silently dropped, not merely mis-drawn. This margin, plus
 * never letting the path collapse to zero length for a single number (below,
 * `pathHalf` floors at `EDGE_PAD` even when there's nothing to space out),
 * keeps every digit inside the path's valid range.
 */
const EDGE_PAD = 18

/**
 * The arc one hemisphere's numbers curve along, top or bottom, plus each
 * number's `startOffset` on it. A bottom arc hangs upside down if drawn the
 * same way as the top, so — exactly as the slot names on the circle itself
 * do — it's drawn the other direction, on a radius nudged out by `NUM_SIZE`
 * to land its flipped baseline on one circle with the top's; the same sign
 * flip that reverses the arc's direction also reverses reading order along
 * it, which is fine since nothing here depends on left-to-right order.
 */
function hemisphereLayout(center: number, count: number): { path: string; offsets: number[] } {
  const itemSpan = count <= 1 ? 0 : Math.min(MAX_ITEM_SPAN, ITEM_GAP * (count - 1))
  const pathHalf = itemSpan / 2 + EDGE_PAD
  const flipped = center > 0 && center < 180
  const radius = flipped ? NUM_RADIUS + NUM_SIZE : NUM_RADIUS
  const half = flipped ? -pathHalf : pathHalf
  const from = radialPoint(center - half, radius)
  const to = radialPoint(center + half, radius)
  const path = `M ${from.x} ${from.y} A ${radius} ${radius} 0 0 ${flipped ? 0 : 1} ${to.x} ${to.y}`

  const gap = count > 1 ? itemSpan / (count - 1) : 0
  const offsets = Array.from({ length: count }, (_, i) => {
    const relOffset = count > 1 ? -itemSpan / 2 + i * gap : 0
    return ((relOffset + half) / (2 * half)) * 100
  })
  return { path, offsets }
}

/** An inscribed working, read rather than edited. No field carries its name here. */
function BookView() {
  const { draft, editDraft, reaction } = useWorkshop()
  const form = FORM_META[draft.form]
  const formLabel = formLabelFor(draft.form, draft.specialty)
  const manifestEntries = ledgerEntries(reaction.manifestation).sort((a, b) => b[1] - a[1])
  const tollEntries = ledgerEntries(reaction.toll).sort((a, b) => b[1] - a[1])
  const manifestLayout = hemisphereLayout(-90, manifestEntries.length)
  const tollLayout = hemisphereLayout(90, tollEntries.length)

  return (
    <div className="book book--view">
      <div className="book__page book__page--left">
        <h2 className="book__viewTitle">{draft.title || 'Untitled rite'}</h2>
        <p className="book__viewForm">
          {form.article === 'an' ? 'An' : 'A'} {formLabel.toLowerCase()}, worked at scale{' '}
          {draft.casterLevel}.
        </p>
        {manifestEntries.length > 0 || tollEntries.length > 0 ? (
          <svg
            className="book__viewCircle"
            viewBox="0 0 100 100"
            role="img"
            aria-label={`Manifests ${describeLedger(reaction.manifestation)}. Tolls ${describeLedger(reaction.toll)}.`}
          >
            <circle className="book__viewCircleRing" cx="50" cy="50" r={RING_RADIUS} />
            <defs>
              <path id="book-arc-top" d={manifestLayout.path} />
              <path id="book-arc-bottom" d={tollLayout.path} />
            </defs>
            {manifestEntries.map(([currency, amount], i) => (
              <text
                key={currency}
                className="book__viewNumber"
                style={{ '--num-hue': CURRENCY_META[currency].hue } as CSSProperties}
              >
                <textPath href="#book-arc-top" startOffset={`${manifestLayout.offsets[i]}%`}>
                  {amount}
                </textPath>
              </text>
            ))}
            {tollEntries.map(([currency, amount], i) => (
              <text
                key={currency}
                className="book__viewNumber book__viewNumber--toll"
                style={{ '--num-hue': CURRENCY_META[currency].hue } as CSSProperties}
              >
                <textPath href="#book-arc-bottom" startOffset={`${tollLayout.offsets[i]}%`}>
                  {amount}
                </textPath>
              </text>
            ))}
          </svg>
        ) : null}
        {draft.notes ? <p className="book__viewNotes">{draft.notes}</p> : null}
      </div>

      <div className="book__page book__page--right">
        {draft.text ? (
          <p className="book__viewText">{draft.text}</p>
        ) : (
          <p className="book__viewText book__viewText--none">No words were written for this one.</p>
        )}

        <div className="book__actions book__actions--end">
          <button type="button" className="btn btn--primary" onClick={editDraft}>
            Edit
          </button>
        </div>
      </div>
    </div>
  )
}

function BookEditor() {
  const { allowedForms, draft, updateDraft, saveDraft, reaction } = useWorkshop()
  const [expanded, setExpanded] = useState<boolean>(false)

  return (
    <div className="book">
      <div className="book__page book__page--left">
        <button
          type="button"
          className="btn btn--small book__randomName"
          title="Name it for the form and whatever the ring manifests most of"
          aria-label="Random name"
          onClick={() => updateDraft({ title: generateSpellName(draft.form, reaction.manifestation) })}
        >
          🎲
        </button>

        <label className="field">
          <span className="field__label">Title</span>
          <input
            className="book__title"
            value={draft.title}
            placeholder="Untitled Rite"
            onChange={(event) => updateDraft({ title: event.target.value })}
          />
        </label>

        <label className="field">
          <span className="field__label">Form</span>
          <select
            className="book__form"
            value={draft.form}
            onChange={(event) => updateDraft({ form: event.target.value as SpellForm })}
          >
            {!allowedForms.includes(draft.form) ? (
              <option value={draft.form} disabled>
                {formLabelFor(draft.form, draft.specialty)} (legacy rite)
              </option>
            ) : null}
            {allowedForms.map((form) => {
              const entry = FORM_META[form]
              return (
              <option key={entry.form} value={entry.form} title={UNDERFED_RULE[entry.underfed]}>
                {formLabelFor(entry.form, draft.specialty)}
              </option>
              )
            })}
          </select>
        </label>

        <LevelControl />

        <div className="last__item">
          <button type="button" className="btn__expandable field__label" title="Notes" onClick={() => setExpanded(!expanded)}>
              <u>Notes</u>{expanded ? '^' : '˅'}
          </button>
          {expanded &&
            <label className="field field--grow">
              <textarea
                className="book__notes"
                value={draft.notes}
                placeholder="Conditions, who may speak it, what went wrong last time…"
                onChange={(event) => updateDraft({ notes: event.target.value })}
              />
            </label>
          }
        </div>
      </div>

      <div className="book__page book__page--right">
        <label className="field field--grow">
          <span className="field__label">
            {draft.form}
          </span>
          <textarea
            className="book__text"
            value={draft.text}
            placeholder={'By the salt that will not dry,\nby the name I gave the water…'}
            onChange={(event) => updateDraft({ text: event.target.value })}
          />
        </label>

        <div className="book__actions">
          <button type="button" className="btn btn--primary" onClick={() => void saveDraft()}>
            Inscribe
          </button>
        </div>
      </div>
    </div>
  )
}

export function Spellbook() {
  const { mode } = useWorkshop()
  return mode === 'view' ? <BookView /> : <BookEditor />
}
