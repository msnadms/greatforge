import { type Role } from '../data/currencies'

/**
 * The five roles as sigils, for a working being read rather than built.
 *
 * Keyed by role, never by material — roles are derived from the ledgers
 * (`describeRole`), so a sigil follows an edited reagent the moment its
 * numbers change.
 */

/** Rounded so React emits `16.24` rather than sixteen decimal places of it. */
function at(centre: number, radius: number, trig: number): number {
  return Number((centre + radius * trig).toFixed(2))
}

/** The source's rays, struck at the eight compass points. */
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
    // A sun, filled so it isn't mistaken for the relay's hollow ring.
    case 'source':
      return (
        <>
          <circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none" />
          {RAYS.map((ray, i) => (
            <line key={i} {...ray} />
          ))}
        </>
      )

    // Ascending triangle: asks for a little, what leaves is larger.
    case 'fuel':
      return <path d="M12 3.5 L20.5 19 L3.5 19 Z" />

    // Two triangles meeting at a point: one currency narrows to nothing, another
    // opens out of it.
    case 'converter':
      return (
        <>
          <path d="M4.5 3.5 L19.5 3.5 L12 12 Z" />
          <path d="M4.5 20.5 L19.5 20.5 L12 12 Z" />
        </>
      )

    // A ring with the road driven straight through it, unchanged on the far side.
    case 'relay':
      return (
        <>
          <circle cx="12" cy="12" r="6.75" />
          <line x1="1.5" y1="12" x2="22.5" y2="12" />
        </>
      )

    // Descending triangle closed off underneath — a floor, not a crossbar,
    // because the meaning is "swallowed" rather than "qualified".
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
 * Takes its colour from `--slot-hue` on the card. Silent to assistive tech and
 * carries no `title` of its own — the sigil covers most of the token, so a
 * tooltip here would win every hover; `ComponentSlot` names the reagent and its
 * role in the `aria-label` instead.
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
