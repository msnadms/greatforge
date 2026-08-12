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
  /**
   * CSS hue used for slot glow, flow arcs and ledger chips. Saturation and
   * lightness are not stored with it — those are the `--gem-s` / `--gem-l`
   * tokens in `index.css`, so both themes stay tunable from one place and a hue
   * here only ever decides *which* pigment, never how loud it is.
   *
   * The five are spaced wider apart than a bright palette would need. They are
   * rendered at around a third saturation, and muted colours lose their identity
   * to each other long before saturated ones do: ember and old gold thirty
   * degrees apart both read as plain brown once the saturation comes off.
   */
  hue: number
}

export const CURRENCY_META: Record<Currency, CurrencyMeta> = {
  heat: {
    currency: 'heat',
    label: 'Heat',
    short: 'Ht',
    gloss: 'Thermal energy - what burning releases and melting consumes',
    vent: 'Scorch marks, flame, a room gone suddenly hot',
    toll: 'Taken from your warmth: chill, then shivering, then the cold that will not lift',
    // Ember, banked rather than flame.
    hue: 10,
  },
  motion: {
    currency: 'motion',
    label: 'Motion',
    short: 'Mo',
    gloss: 'Kinetic force - pressure, momentum, the blow and the recoil',
    vent: 'Wind, a shove, glass out of its frame',
    toll: "Taken from the blood: grey vision, then a faint, then the heart stumbling",
    // Verdigris on old bronze.
    hue: 158,
  },
  charge: {
    currency: 'charge',
    label: 'Charge',
    short: 'Ch',
    gloss: 'Electrical and magnetic potential - what a struck flint has and a wet rope does not',
    vent: 'Arcing, hair lifting, iron dragged off the bench',
    toll: 'Taken from the nerves: numb hands, then palsy, then a fit',
    // Amethyst.
    hue: 278,
  },
  light: {
    currency: 'light',
    label: 'Light',
    short: 'Li',
    gloss: 'Illumination - emitted by what burns hot enough',
    vent: 'A warm glow, a sickening radiance',
    toll: 'Taken from the eyes: dimming, then afterimages, then darkness',
    // Old gold leaf, not lamplight.
    hue: 48,
  },
  mass: {
    currency: 'mass',
    label: 'Mass',
    short: 'Ma',
    gloss: 'Substance itself — water, vapour, smoke, anything with weight to spend',
    vent: 'Deposition: frost, fog, salt, a fall of ash on every surface',
    toll: 'Taken from the body: weakness, starvation, then disintegration',
    // Slate.
    hue: 214,
  },
}

export const CURRENCY_LIST: CurrencyMeta[] = CURRENCIES.map((c) => CURRENCY_META[c])

/**
 * The whole system, stated. A hard magic is one the reader can do arithmetic in,
 * so these are shown in the app rather than kept in a designer's notebook.
 *
 * Six of the eight hold without exception. The seventh bounds the two things a
 * form is permitted to change — the underfed rule and which loss its condition
 * spares or doubles — and any law a form can touch points at it. The eighth
 * just says what number a reagent's ledger holds before the walk reads it, so
 * it needed nothing above it to bend.
 *
 * This array is the statement of what `lib/reaction.ts` does. Changing a
 * resolver rule means editing it in the same change, or the app is lying to
 * the user.
 */
export const LAWS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'Nothing is made',
    body: 'Every unit came out of a reagent, and nothing in flight is multiplied — a slot hands on what it was given, less what the crossing took. A reagent that has spoken is spent.',
  },
  {
    title: 'The current runs one way',
    body: 'Clockwise, and each crossing is charged against the current as a whole, one currency or five: four units through a gap, two through an ordinary reagent, none through a relay, wherever it stands. A relay is a reagent whose two columns read alike to the unit; one unit either way and it is something else, costing the ordinary crossing. The price is billed to the currency the next slot demanded first, so a supply pays its own way to the reagent waiting on it, and whatever is left is shared across everything else still in flight in proportion to what it carries, its unrounded share banked and carried to the next crossing rather than forgiven. A form may waive these prices or double them; see the seventh law.',
  },
  {
    title: 'The circle is walked once, then closed',
    body: 'Slot I is lit first and fed last; slot VIII stands nearest the mouth, its surplus leaving across one slot. A lap costs sixteen, so what you set late is what you get, and what you set early must be large enough to survive the walk.',
  },
  {
    title: 'An open slot is a hole in the circle',
    body: 'Whatever the ring still holds at the mouth leaves it in the proportion the ring was closed: eight reagents deliver all of it, four deliver half, two a quarter. A reagent that stands without reacting still closes its hole. A form may waive the spill or double it; see the seventh law.',
  },
  {
    title: 'Each material stands once, and only one source stands at all',
    body: 'Set a reagent down where it already lies and it is lifted from the old slot, not copied into the new, so eight slots mean eight materials and the order is most of the craft. A second source lifts the first the same way: a source demands nothing, so it never competes for a slot and never costs a toll, and stacking them buys free current a transit charged per crossing rather than per parcel cannot tax back. Each material is asked once, as the current reaches it, and has nothing left when the current comes back around.',
  },
  {
    title: 'A reagent the ring underfeeds is paid for, or it gives less',
    body: 'Every demand the ring cannot meet is settled one of two ways, and the form decides which. Under a volatile form (prayer, elegy, litany, invocation, dirge) the reagent reacts in full and the shortfall is drawn out of the caster. That toll is the only thing a casting ever costs the body, so a circle that feeds itself is free to speak at any size. Under a stable form (ward, benediction) it hands back only the share of its yield the ring fed it, rounded down, and nothing is charged.',
  },
  {
    title: 'A form asks one thing, and can only ever spare a loss',
    body: 'Every form but the prayer states one condition, printed with the rite. Meet it and the loss it names is waived — the crossings, the spill at the mouth, or both; fail it and that same loss doubles, to eight units across a gap and four across a reagent, or the share squared, or both together. No form adds: where a loss falls is all a form decides, so the first law holds in all seven.',
  },
  {
    title: 'A working commands only some of a reagent',
    body: "A spell's own level scales what a reagent demands and what it yields, together and by the same fraction, so a lesser working is reading a smaller reagent rather than a subsidized one. The lap costs less too, on a shallower curve reaching its full price sooner, so a low level pays less to cross the same ring; the spill at the mouth does not move with level at all.",
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

/**
 * A ledger as running text: "Heat 5, Motion 2".
 *
 * For the places prose has to *say* a ledger rather than draw it — tooltips and
 * the labels read aloud — where `LedgerLine`'s chips are not available. `empty`
 * is the word for a ledger with nothing in it, which reads differently in
 * different sentences.
 */
export function describeLedger(ledger: Ledger, empty = 'nothing'): string {
  const entries = ledgerEntries(ledger)
  if (entries.length === 0) return empty
  return entries.map(([currency, amount]) => `${CURRENCY_META[currency].label} ${amount}`).join(', ')
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
    'Demands nothing, so it can open a circle at slot I and can never charge a toll. Only one stands in a circle at a time — setting down a second lifts the first back out — since stacking them would only ever add free current. There are only three at common and uncommon rarity — a spark, a weight, a lens — and nothing sources charge or mass at all; those have to be made out of something the ring is already carrying.',
  fuel: 'Gives back more than it asks and gives up nothing to do it — it was carrying the difference already. Most give back far more.',
  converter:
    'Trades one currency for another. A few hand back more than they took; most cost more than they return. Conversion is the only route into charge and mass and the only way back into light or motion from anything else, so a ring that wants any of those has to know which converters are worth the slot.',
  relay:
    'Gives back exactly what it asks for, unit for unit and currency for currency, so it adds nothing of its own — change either column by one and it is no longer a relay. What it gives instead is the crossing: the current passes through it for nothing, wherever it stands, so a reagent reached across a relay keeps a unit that any other slot would have taken. It is asked and billed like any other reagent, so an underfed relay costs the caster the difference — it buys distance, not slack.',
  sink:
    'Swallows and gives nothing back. It can only ever lower what leaves the ring, so it is not a way to make a spell stronger — it is how you keep something out of the manifestation, when what a spell must not do matters as much as what it does.',
}

/**
 * A reagent with two empty ledgers, which the ring cannot tell from an empty slot.
 * Not a role — there is nothing it can be for. The editor refuses to save one and
 * the repository drops any it finds, so this exists only to catch them.
 */
export function isInert(component: Ledgered): boolean {
  return ledgerTotal(component.demands) === 0 && ledgerTotal(component.yields) === 0
}

/**
 * True when the two ledgers are the same to the unit, currency by currency.
 *
 * This is the relay test, and it has to be exact rather than a comparison of
 * which currencies each side mentions — matching currency *sets* alone ignores
 * the amounts and lets a profitable or genuinely-trading reagent through as a
 * "relay" that then crosses for free. It's also a brighter line for the user
 * than a ratio: a relay is a relay while its two columns read alike and stops
 * the moment they don't.
 */
function ledgersMatch(a: Ledger, b: Ledger): boolean {
  return CURRENCIES.every((currency) => (a[currency] ?? 0) === (b[currency] ?? 0))
}

/**
 * True when no currency comes back smaller than it went in — the reagent
 * multiplies what it was handed rather than trading one thing for another.
 * Only reached once `ledgersMatch` has failed, so a pass here means profit
 * without a trade, which is a fuel however slim the margin.
 */
function givesUpNothing(demands: Ledger, yields: Ledger): boolean {
  return CURRENCIES.every((currency) => (yields[currency] ?? 0) >= (demands[currency] ?? 0))
}

/**
 * A relay is resolved exactly like any other reagent but for one thing: the
 * current crosses it for nothing. That is the whole role, and it is the only
 * place in `computeReaction` that asks what a component is — see
 * `baseTransitCost` in `lib/reaction.ts`.
 *
 * The free crossing is unconditional, and what qualifies is decided by
 * `ledgersMatch`, to the unit. Otherwise a relay is billed for its own unmet
 * demand exactly like anything else, which is what keeps the free crossing
 * from being free profit.
 */
export function isRelay(component: Ledgered): boolean {
  return describeRole(component) === 'relay'
}

/**
 * The material's part in a circle, read off its ledgers rather than stored — so
 * a component the user edits is re-labelled the moment its numbers change.
 *
 * Assumes the component is not inert; those are refused on save and dropped on
 * load, so every reagent that reaches here gives something, asks something, or both.
 */
export function describeRole(component: Ledgered): Role {
  const asks = ledgerTotal(component.demands)
  const gives = ledgerTotal(component.yields)
  if (gives === 0) return 'sink'
  if (asks === 0) return 'source'

  // Checked first, and exact: the only role `computeReaction` reads
  // (`isRelay` -> `baseTransitCost`), so a wrong label here crosses for free.
  if (ledgersMatch(component.demands, component.yields)) return 'relay'

  // Profit without a trade is a fuel however slim the margin, checked before
  // the ratio since the ratio only measures how much came back, not whether
  // anything was given up for it.
  if (givesUpNothing(component.demands, component.yields)) return 'fuel'

  // Past here the reagent gave something up. The ratio decides whether it
  // traded at a big enough profit to read as a fuel instead of a converter.
  if (gives > asks * 1.5) return 'fuel'
  return 'converter'
}
