import type { CSSProperties } from 'react'
import { useState } from 'react'
import { CURRENCY_META, describeLedger } from '../data/currencies'
import { FORM_META, UNDERFED_RULE, articleFor, formLabelFor } from '../data/spellForms'
import { generateSpellName } from '../data/spellNames'
import { useWorkshop } from '../state/useWorkshop'
import { ledgerEntries, type Currency, type SpellForm } from '../types/worldbuilding'
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

/**
 * What a working has to move, manifestation and toll together, before the ring
 * is washed at full strength. A hill-climbed frontier manifests in the mid
 * fifties at full power and a careless ring tolls about as much again, so 100
 * is a figure a working reaches rather than an arbitrary ceiling.
 */
const FULL_WASH = 100

/** Paler than the `--gem-s` the numbers outside are drawn at, since the ring
 *  carries a whole wheel at once where a numeral carries one hue. Taken off the
 *  token rather than written flat, so it stays tuned per theme. */
function pigment(hue: number, alpha: number): string {
  return `hsl(${hue} calc(var(--gem-s) * 0.55) var(--gem-l) / ${alpha})`
}

/** The same treatment the toll numbers take: the currency's own hue pulled
 *  darker and toward red, so a cost reads as a cost. The red carries the same
 *  alpha, or a toll would wash heavier than a manifestation of equal size. */
function cost(hue: number, alpha: number): string {
  return `color-mix(in srgb, ${pigment(hue, alpha)} 55%, rgb(122 20 20 / ${alpha}) 20%)`
}

/**
 * Everything the working moves, as a wheel inside the ring: what it manifests
 * and what it tolls in one turn, each currency taking the arc its share of the
 * whole earns, clockwise from the top. What is delivered comes first in its own
 * colours, what is paid follows in the darker ones the toll numbers use.
 *
 * One stop per arc, set at the middle of it rather than at both ends, so the
 * colours turn into each other instead of drawing pie slices; the wheel is a
 * proportion, not a row of separate readings.
 *
 * **The wheel is closed by hand.** A conic gradient holds its first colour flat
 * from 0deg to the first stop and its last flat to 360deg, which draws a hard
 * edge straight up from the centre where the wheel meets itself. The blend the
 * browser will not make across that seam is mixed here instead — the two stops
 * either side of it, weighted by how far apart they sit — and set at both ends,
 * so the gradient runs continuously round.
 *
 * Returns null for a working that neither manifests nor tolls, which leaves the
 * ring bare.
 */
function washGradient(
  manifestEntries: [Currency, number][],
  tollEntries: [Currency, number][],
): string | null {
  const arcs = [
    ...manifestEntries.map(([currency, amount]) => ({ currency, amount, tone: pigment })),
    ...tollEntries.map(([currency, amount]) => ({ currency, amount, tone: cost })),
  ]
  const total = arcs.reduce((sum, arc) => sum + arc.amount, 0)
  if (total === 0) return null

  // Kept well under an opaque fill: this is a page being read, not a signal.
  const alpha = 0.16 + 0.44 * Math.min(1, total / FULL_WASH)

  const colors: string[] = []
  const mids: number[] = []
  let covered = 0
  for (const arc of arcs) {
    const share = arc.amount / total
    colors.push(arc.tone(CURRENCY_META[arc.currency].hue, alpha))
    mids.push((covered + share / 2) * 360)
    covered += share
  }

  // Zero entries are dropped from a ledger, so both halves of the gap are real.
  const last = mids.length - 1
  const toFirst = 360 - mids[last]
  const seam = `color-mix(in srgb, ${colors[0]} ${(toFirst / (toFirst + mids[0])) * 100}%, ${colors[last]})`
  const stops = colors.map((color, i) => `${color} ${mids[i]}deg`)

  return `conic-gradient(${[`${seam} 0deg`, ...stops, `${seam} 360deg`].join(', ')})`
}

/** The book's unwritten text keeps only the consequence, not its currency heading. */
function consequenceAfterColon(description: string): string {
  const colon = description.indexOf(':')
  const consequence = (colon === -1 ? description : description.slice(colon + 1)).trim()
  return `${consequence[0]?.toUpperCase() ?? ''}${consequence.slice(1)}`
}

/** An inscribed working, read rather than edited. No field carries its name here. */
function BookView() {
  const { draft, reaction } = useWorkshop()
  const formLabel = formLabelFor(draft.form, draft.specialty)
  const manifestEntries = ledgerEntries(reaction.manifestation).sort((a, b) => b[1] - a[1])
  const tollEntries = ledgerEntries(reaction.toll).sort((a, b) => b[1] - a[1])
  const manifestLayout = hemisphereLayout(-90, manifestEntries.length)
  const tollLayout = hemisphereLayout(90, tollEntries.length)
  const wash = washGradient(manifestEntries, tollEntries)
  const unwrittenText = [
    ...manifestEntries.map(([currency, amount]) => ({ amount, description: CURRENCY_META[currency].vent })),
    ...tollEntries.map(([currency, amount]) => ({ amount, description: CURRENCY_META[currency].toll })),
  ]
    .sort((a, b) => b.amount - a.amount)
    .map(({ description }) => consequenceAfterColon(description))
    .join('\n\n')

  return (
    <div className="book book--view">
      <div className="book__page book__page--left">
        <h2 className="book__viewTitle">{draft.title || 'Untitled rite'}</h2>
        <p className="book__viewForm">
          {articleFor(draft.form, draft.specialty) === 'an' ? 'An' : 'A'}{' '}
          {formLabel.toLowerCase()}, worked at scale{' '}
          {draft.casterLevel}.
        </p>
        {manifestEntries.length > 0 || tollEntries.length > 0 ? (
          <div className="book__viewCircleWrap">
            {/* A conic gradient, so the wash is an element under the ring rather
                than a fill in it — SVG has no angular gradient to give a circle. */}
            {wash ? <span className="book__viewWash" style={{ background: wash }} /> : null}
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
          </div>
        ) : null}
        {draft.notes ? <p className="book__viewNotes">{draft.notes}</p> : null}
      </div>

      <div className="book__page book__page--right">
        {draft.text ? (
          <p className="book__viewText">{draft.text}</p>
        ) : unwrittenText ? (
          <p className="book__viewText book__viewText--generated">{unwrittenText}</p>
        ) : (
          <p className="book__viewText book__viewText--none">No words were written for this one.</p>
        )}
      </div>
    </div>
  )
}

function BookEditor() {
  const { allowedForms, draft, updateDraft, reaction } = useWorkshop()
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
      </div>
    </div>
  )
}

export function Spellbook() {
  const { mode } = useWorkshop()
  return mode === 'view' ? <BookView /> : <BookEditor />
}
