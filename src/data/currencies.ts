import {
  CURRENCIES,
  ledgerEntries,
  ledgerTotal,
  type Currency,
  type Ledger,
  type MaterialComponent,
} from '../types/worldbuilding'

/** Anything carrying the two ledgers — a stored component, or an unsaved draft. */
export type Ledgered = Pick<MaterialComponent, 'demands' | 'yields'>

export interface CurrencyMeta {
  currency: Currency
  label: string
  /** Two-letter tag for the cramped readouts on slot and tray cards. */
  short: string
  /** What a unit of it is. Shown on hover and in the component editor. */
  gloss: string
  /** What it looks like when it escapes the circle unabsorbed. */
  vent: string
  /** What the caster's body pays when the ring comes up short. */
  toll: string
  /** CSS hue used for slot glow, flow arcs and ledger chips. */
  hue: number
}

export const CURRENCY_META: Record<Currency, CurrencyMeta> = {
  heat: {
    currency: 'heat',
    label: 'Heat',
    short: 'Ht',
    gloss: 'Thermal energy — what burning releases and melting consumes',
    vent: 'Scorch marks, flame, a room gone suddenly hot',
    toll: 'Taken from your warmth: chill, then shivering, then the cold that will not lift',
    hue: 22,
  },
  motion: {
    currency: 'motion',
    label: 'Motion',
    short: 'Mo',
    gloss: 'Kinetic force — pressure, momentum, the blow and the recoil',
    vent: 'Wind, a shove, glass out of its frame',
    toll: "Taken from the blood: grey vision, then a faint, then the heart stumbling",
    hue: 168,
  },
  charge: {
    currency: 'charge',
    label: 'Charge',
    short: 'Ch',
    gloss: 'Electrical and magnetic potential — what a struck flint has and a wet rope does not',
    vent: 'Arcing, hair lifting, iron dragged off the bench',
    toll: 'Taken from the nerves: numb hands, then palsy, then a fit',
    hue: 268,
  },
  light: {
    currency: 'light',
    label: 'Light',
    short: 'Li',
    gloss: 'Radiance — emitted by what burns hot enough, swallowed by what is black',
    vent: 'Glare, glow, shadows thrown from the wrong side',
    toll: 'Taken from the eyes: dimming, then afterimages, then dark',
    hue: 52,
  },
  mass: {
    currency: 'mass',
    label: 'Mass',
    short: 'Ma',
    gloss: 'Substance itself — water, vapour, smoke, anything with weight to spend',
    vent: 'Deposition: frost, fog, salt, a fall of ash on every surface',
    toll: 'Taken from your flesh: weight you do not get back',
    hue: 210,
  },
}

export const CURRENCY_LIST: CurrencyMeta[] = CURRENCIES.map((c) => CURRENCY_META[c])

/**
 * The whole system, stated. A hard magic is one the reader can do arithmetic in,
 * so these are shown in the app rather than kept in a designer's notebook.
 *
 * These describe the circle itself, which nobody casts: every form bends one of
 * them, the prayer included. The last law says so and names the price. The bends
 * themselves live in `data/spellForms.ts`, one per form, and a form's `bends`
 * field cites a law by the titles here — so renaming one means editing both files.
 */
export const LAWS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'Nothing is made',
    body: 'Every unit in the circle came out of a stone, and nothing in flight is ever multiplied: a slot hands on what it was given, less what the crossing took. What a material has to give it was already carrying, and it gives it out of its own substance — a stone that has spoken is spent.',
  },
  {
    title: 'The current runs one way',
    body: 'Clockwise, from slot to slot, paying what each slot is made of: nothing through a relay, one through any other stone, two to leap a gap. Loss belongs to the medium, and it is charged on each currency separately — so a stream carrying three currencies pays three times over, and a ring is cheapest to run when it carries few things in quantity rather than many things thinly.',
  },
  {
    title: 'The circle is walked once, then closed',
    body: 'Slot I is lit first and so is fed last, when the current comes back around. Slot VIII stands nearest the mouth: its surplus leaves having crossed only one slot, and a lap costs eight — so what you put late is what you get, and what you put early has to be large enough to survive the walk.',
  },
  {
    title: 'An open slot is a hole in the circle',
    body: 'Current spills out of a hole. Whatever the ring still holds at the mouth leaves it in the proportion the ring was closed: eight stones deliver all of it, four deliver half, two deliver a quarter. Filling the circle creates nothing — a full ring is simply the one that does not leak.',
  },
  {
    title: 'Each material stands once and is asked once',
    body: 'No stone may stand in two places at the same time: set one down where it already lies further round the ring and it is lifted from the old slot, not copied into the new, so eight slots mean eight different materials and the order you set them in is most of the craft. Nor may the ring ask a material twice. It is asked as the current reaches it, it gives the measure it holds, and the current comes back around to a stone with nothing left in it.',
  },
  {
    title: 'What the ring cannot supply, the body supplies',
    body: 'Every unmet demand is drawn out of the caster at the published rate. This is the toll, and it is never waived.',
  },
  {
    title: 'A form is one law, bent',
    body: 'Everything above describes a circle that nobody casts. A spell is spoken in one of the seven forms, and each form breaks exactly one of these laws, in one stated way; none breaks two, and none breaks the first. What a form gives back it takes somewhere else, so choosing one is choosing which cost to pay rather than how much power to have. The speaking is itself charged, at the same price in every form: one of each currency the ring raised, whether or not the law you bent was one this circle needed bent. No form waives the toll. A dirge can change what counts as a demand the ring cannot meet, but whatever shortfall survives that is charged in full.',
  },
]

export function currencyHue(currency: Currency): number {
  return CURRENCY_META[currency].hue
}

/** Blends hues on the unit circle, so values near 0/360 average sensibly. */
export function blendHues(currencies: Currency[]): number {
  if (currencies.length === 0) return 40
  let x = 0
  let y = 0
  for (const currency of currencies) {
    const rad = (currencyHue(currency) * Math.PI) / 180
    x += Math.cos(rad)
    y += Math.sin(rad)
  }
  const deg = (Math.atan2(y, x) * 180) / Math.PI
  return (deg + 360) % 360
}

function currenciesIn(ledger: Ledger): Currency[] {
  return ledgerEntries(ledger).map(([currency]) => currency)
}

/**
 * A material is coloured by what it gives. Sinks give nothing, so they take the
 * colour of what they swallow instead.
 */
export function componentHue(component: Ledgered): number {
  const given = currenciesIn(component.yields)
  return blendHues(given.length > 0 ? given : currenciesIn(component.demands))
}

export const ROLES = ['source', 'fuel', 'converter', 'relay', 'sink'] as const

export type Role = (typeof ROLES)[number]

export const ROLE_HINT: Record<Role, string> = {
  source:
    'Demands nothing, so it can open a circle at slot I and can never charge a toll. There are only three — a spark, a weight, a lens — and nothing sources charge or mass at all; those have to be made out of something the ring is already carrying.',
  fuel: 'Gives back far more than it asks — it was carrying it already.',
  converter:
    'Trades one currency for another and hands back a little more than it took. The profit is small next to a fuel, but conversion is the only route into charge and mass, so a ring that wants either is built around these.',
  relay:
    'Carries up to its rating and passes on what it took, in the same currency. The current crosses it for free and it never charges a toll. It adds nothing of its own, so it earns its slot only where a crossing is dear — most of all at slot I, which is crossed once, at the close, with the whole lap in flight.',
  sink:
    'Swallows and gives nothing back. It can only ever lower what leaves the ring, so it is not a way to make a spell stronger — it is how you keep something out of the manifestation, when what a spell must not do matters as much as what it does.',
}

/**
 * A stone with two empty ledgers, which the ring cannot tell from an empty slot.
 * Not a role — there is nothing it can be for. The editor refuses to save one and
 * the repository drops any it finds, so this exists only to catch them.
 */
export function isInert(component: Ledgered): boolean {
  return ledgerTotal(component.demands) === 0 && ledgerTotal(component.yields) === 0
}

function sameCurrencies(a: Ledger, b: Ledger): boolean {
  const left = currenciesIn(a)
  const right = currenciesIn(b)
  return left.length === right.length && left.every((c) => right.includes(c))
}

/**
 * Relays are resolved differently by the reaction in two ways: the current crosses
 * one for free, and their demand is a rating rather than a requirement, so an
 * underfed relay carries less instead of billing the caster the difference.
 *
 * Both are needed. Under law 1 a same-currency pass-through can at best hand back
 * what it took, so if crossing a relay cost anything it would be worse than an
 * empty slot; and if falling short of its rating charged a toll, a chain of them
 * would bill the caster at every hop once the current dipped.
 */
export function isRelay(component: Ledgered): boolean {
  return describeRole(component) === 'relay'
}

/**
 * The material's part in a circle, read off its ledgers rather than stored — so
 * a component the user edits is re-labelled the moment its numbers change.
 *
 * Assumes the component is not inert; those are refused on save and dropped on
 * load, so every stone that reaches here gives something, asks something, or both.
 */
export function describeRole(component: Ledgered): Role {
  const asks = ledgerTotal(component.demands)
  const gives = ledgerTotal(component.yields)
  if (gives === 0) return 'sink'
  if (asks === 0) return 'source'
  // Tested before the relay check: a stone that takes heat and gives back three
  // times the heat is a fuel, however matched its two ledgers look.
  if (gives > asks * 1.5) return 'fuel'
  return sameCurrencies(component.demands, component.yields) ? 'relay' : 'converter'
}
