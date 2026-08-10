import { type Role } from '../data/currencies'

/**
 * The five roles as sigils, for a working being read rather than built.
 *
 * Keyed by role and never by material. Roles are derived from the ledgers
 * (`describeRole`), so a sigil follows an edited reagent the moment its numbers
 * change, exactly as the tray's label and the card's hue already do. A glyph per
 * material would have nothing to draw for a reagent the user wrote themselves.
 *
 * They are cut from one vocabulary rather than drawn as five separate pictures,
 * so a laid circle reads as a single notation: a triangle rising gives back more
 * than it was handed, a triangle falling is where something goes to be taken, a
 * disc is a body, and a bar is either the road a current runs or the floor it
 * stops against.
 */

/** Rounded so React emits `16.24` rather than sixteen decimal places of it. */
function at(centre: number, radius: number, trig: number): number {
  return Number((centre + radius * trig).toFixed(2))
}

/**
 * The source's rays, struck at the eight compass points. Generated rather than
 * typed out for the same reason `SpellCircle` generates its spokes: eight hand
 * written coordinate pairs drift.
 */
const RAYS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i * Math.PI) / 4
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x1: at(12, 6, cos),
    y1: at(12, 6, sin),
    x2: at(12, 9.5, cos),
    y2: at(12, 9.5, sin),
  }
})

function Glyph({ role }: { role: Role }) {
  switch (role) {
    // A sun: the one thing in the ring that gives without being fed. Filled, so
    // it cannot be taken for the relay's hollow ring at a glance.
    case 'source':
      return (
        <>
          <circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none" />
          {RAYS.map((ray, i) => (
            <line key={i} {...ray} />
          ))}
        </>
      )

    // The ascending triangle, which is fire in every alchemical hand. It asks
    // for a little and what leaves is larger.
    case 'fuel':
      return <path d="M12 3.5 L20.5 19 L3.5 19 Z" />

    // Two triangles meeting at a point: one currency narrows to nothing and
    // another opens out of it. The figure for transmutation, doing here what it
    // has always meant.
    case 'converter':
      return (
        <>
          <path d="M4.5 3.5 L19.5 3.5 L12 12 Z" />
          <path d="M4.5 20.5 L19.5 20.5 L12 12 Z" />
        </>
      )

    // A ring with the road driven straight through it. The bar crosses the body
    // and comes out the far side unchanged, which is the whole of the role.
    // A ring with the road driven straight through it. The bar crosses the body
    // and comes out the far side unchanged, which is the whole of the role. The
    // ring is cut wide because a small one reads as a lighter mark than the four
    // that fill their box, and a relay is not a lesser reagent.
    case 'relay':
      return (
        <>
          <circle cx="12" cy="12" r="6.75" />
          <line x1="1.5" y1="12" x2="22.5" y2="12" />
        </>
      )

    // The descending triangle, closed off underneath. The bar sits below rather
    // than through it: alchemy puts it through for earth, but a floor says
    // swallowed and a crossbar says qualified, and swallowed is the meaning.
    //
    // The triangle is cut short of where the fuel's would end to keep four clear
    // units under the point. At 22px a narrower gap closes up and the pair reads
    // as one shape rather than a fall arrested.
    case 'sink':
      return (
        <>
          <path d="M3.5 4.5 L20.5 4.5 L12 16.5 Z" />
          <line x1="5.5" y1="20.5" x2="18.5" y2="20.5" />
        </>
      )
  }
}

/**
 * The sigil takes its colour from `--slot-hue` on the card, so a reagent is the
 * same pigment here as in its border, its glow and its pips.
 *
 * Silent to assistive tech, and carrying no `title` of its own. A glyph standing
 * in for a word is only readable if something says the word, and both jobs belong
 * to the caller: the sigil covers most of a collapsed token, so a tooltip here
 * would win every hover aimed at the card. `ComponentSlot` names the reagent on
 * hover and its role in the `aria-label`.
 */
export function RoleSigil({ role }: { role: Role }) {
  return (
    <span className="slot__sigil">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Glyph role={role} />
      </svg>
    </span>
  )
}
