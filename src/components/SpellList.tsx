import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FORM_LIST } from '../data/spellForms'
import type { FlowGeometry } from '../lib/circleFlow'
import { computeReaction, resolvePlacements } from '../lib/reaction'
import { useWorkshop } from '../state/useWorkshop'
import type { MaterialComponent, Spell, SpellForm } from '../types/worldbuilding'
import { CircleFlow } from './CircleFlow'

/**
 * The band a rite's title is engraved along, in the 100-unit box the entry is
 * drawn in. A full circle from the bottom, clockwise, so `startOffset="50%"`
 * centres the title at the top and it runs down both sides evenly.
 */
const TITLE_RADIUS = 40

const TITLE_PATH = `M 50 ${50 + TITLE_RADIUS} A ${TITLE_RADIUS} ${TITLE_RADIUS} 0 0 1 50 ${
  50 - TITLE_RADIUS
} A ${TITLE_RADIUS} ${TITLE_RADIUS} 0 0 1 50 ${50 + TITLE_RADIUS}`

/** The whole band, which is what a title is free to use before it laps itself. */
const BAND_LENGTH = 2 * Math.PI * TITLE_RADIUS

/** The disc the title is engraved around, and the current runs on the edge of. */
const DISC_RADIUS = TITLE_RADIUS - 8

/**
 * The same current the bench draws, at the size of an entry. It runs at the
 * disc's own radius rather than inside it, so the current *is* the entry's
 * rim: an unbroken circle where the ring carries all the way round, and a rim
 * with gaps in it where the current dies. The disc's own stroke stays
 * underneath as the socket it runs in, which is what an entry holding nothing
 * still draws.
 *
 * The ring alone, with no `manifest` fan: what a rite delivers is already the
 * figure standing in the middle of the entry, and the lines drawn for it on the
 * bench have a margin to reach into that an entry does not.
 */
const RITE_FLOW: Omit<FlowGeometry, 'idPrefix'> = {
  flowRadius: DISC_RADIUS,
}

/**
 * A title runs the whole way round, and is cut only if it would come back over
 * its own opening. Where that falls is a question about width, not about
 * characters — the band holds around 50 letters of ordinary prose but half that
 * of wide ones — so it is measured off the drawn glyphs rather than counted.
 */
function EngravedTitle({ pathId, title }: { pathId: string; title: string }) {
  const ref = useRef<SVGTextElement>(null)
  const [shown, setShown] = useState(title)
  const [measured, setMeasured] = useState(title)

  // A renamed rite starts over from its whole title, adjusted during the render
  // that brings the new one in rather than in an effect after it.
  if (measured !== title) {
    setMeasured(title)
    setShown(title)
  }

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const length = node.getComputedTextLength()
    if (length <= BAND_LENGTH || shown.length <= 1) return
    // Trimmed by what overran, then measured again on the next pass. The floor
    // and the minus one keep every pass strictly shorter, so this settles.
    const fits = Math.floor((shown.length * BAND_LENGTH) / length)
    const keep = Math.max(1, Math.min(fits, shown.length - 1))
    setShown(`${title.slice(0, keep).trimEnd()}…`)
  }, [shown, title])

  return (
    <text ref={ref} className="spells__engraved">
      <textPath href={`#${pathId}`} startOffset="50%">
        {shown}
      </textPath>
    </text>
  )
}

interface RiteProps {
  spell: Spell
  active: boolean
  componentsById: Map<string, MaterialComponent>
  onOpen: () => void
  onDelete: () => void
}

function Rite({ spell, active, componentsById, onOpen, onDelete }: RiteProps) {
  const title = spell.title || 'Untitled rite'
  const filled = spell.slots.filter(Boolean).length

  // The same resolution the bench runs, on the rite's own form, level and
  // discipline, so a listed figure matches what opening it shows.
  const reaction = useMemo(
    () =>
      computeReaction(
        resolvePlacements(spell.slots, componentsById),
        spell.form,
        spell.casterLevel,
        false,
        spell.specialty,
      ),
    [componentsById, spell.slots, spell.form, spell.casterLevel, spell.specialty],
  )

  const summary = `${spell.form} · ${filled} component${filled === 1 ? '' : 's'}`

  // Gradient ids are document-wide and the shelf draws one circle per rite, so
  // each entry mints its own under its own id.
  const geometry = useMemo<FlowGeometry>(
    () => ({ ...RITE_FLOW, idPrefix: `rite-${spell.id}` }),
    [spell.id],
  )

  const first = useMemo(
    () => reaction.slots.find((slot) => slot.slotIndex === 0) ?? null,
    [reaction.slots],
  )

  return (
    <li className={`spells__item${active ? ' spells__item--active' : ''}`}>
      <button
        type="button"
        className="spells__open"
        title={`${title} — ${summary}`}
        aria-label={`${title}. ${summary}. Manifestation ${reaction.manifestationTotal}, toll ${reaction.tollTotal}.`}
        onClick={onOpen}
      >
        <svg className="spells__band" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <path id={`rite-title-${spell.id}`} d={TITLE_PATH} />
          </defs>
          <circle className="spells__disc" cx="50" cy="50" r={DISC_RADIUS} />
          <CircleFlow block="spells" geometry={geometry} carrying={reaction.carrying} first={first} />
          {/* Engraved after the rim, so a title crossing it is legible. */}
          <EngravedTitle pathId={`rite-title-${spell.id}`} title={title} />
        </svg>
        <span className="spells__figures">
          <span className="spells__figure spells__figure--manifest">
            {reaction.manifestationTotal}
          </span>
          <span className="spells__rule" />
          <span className="spells__figure spells__figure--toll">{reaction.tollTotal}</span>
        </span>
      </button>
      <button
        type="button"
        className="btn btn--small btn--danger spells__strike"
        aria-label={`Delete ${title}`}
        onClick={onDelete}
      >
        ✕
      </button>
    </li>
  )
}

export function SpellList() {
  const { spells, draft, dirty, componentsById, selectSpell, newSpell, deleteSpell, loading } =
    useWorkshop()
  const [folded, setFolded] = useState<ReadonlySet<SpellForm>>(() => new Set())

  /** Anything unsaved on the workbench would be lost by loading another spell. */
  function confirmLeave(): boolean {
    return !dirty || confirm('The current rite has unsaved changes. Discard them?')
  }

  function toggle(form: SpellForm) {
    setFolded((current) => {
      const next = new Set(current)
      if (!next.delete(form)) next.add(form)
      return next
    })
  }

  // Grouped in the catalog's own order rather than by what the shelf happens to
  // hold, so a form keeps its place as rites come and go. Within a group the
  // provider's most-recent-first order stands.
  const groups = useMemo(
    () =>
      FORM_LIST.map(({ form, label }) => ({
        form,
        label,
        rites: spells.filter((spell) => spell.form === form),
      })).filter((group) => group.rites.length > 0),
    [spells],
  )

  return (
    <section className="panel spells">
      <div className="tray__head">
        <h2 className="panel__title">Rites</h2>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => {
            if (confirmLeave()) newSpell()
          }}
        >
          + New
        </button>
      </div>

      {loading ? (
        <p className="tray__empty">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="tray__empty">No rites inscribed yet.</p>
      ) : (
        groups.map(({ form, label, rites }) => {
          const open = !folded.has(form)
          return (
            <div className="spells__group" key={form}>
              <button
                type="button"
                className="spells__groupHead"
                aria-expanded={open}
                onClick={() => toggle(form)}
              >
                <span className="spells__groupName">{label}</span>
                <span className="spells__groupCount">{rites.length}</span>
                <span className="spells__groupFold" aria-hidden="true">
                  {open ? '^' : '˅'}
                </span>
              </button>

              {open && (
                <ul className="spells__list">
                  {rites.map((spell) => {
                    const active = spell.id === draft.id
                    return (
                      <Rite
                        key={spell.id}
                        spell={spell}
                        active={active}
                        componentsById={componentsById}
                        onOpen={() => {
                          if (!active && confirmLeave()) selectSpell(spell.id)
                        }}
                        onDelete={() => {
                          if (confirm(`Delete "${spell.title || 'Untitled rite'}"?`)) {
                            void deleteSpell(spell.id)
                          }
                        }}
                      />
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })
      )}
    </section>
  )
}
