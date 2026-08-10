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
    gloss: 'Thermal energy — what burning releases and melting consumes',
    vent: 'Scorch marks, flame, a room gone suddenly hot',
    toll: 'Taken from your warmth: chill, then shivering, then the cold that will not lift',
    // Ember, banked rather than flame.
    hue: 10,
  },
  motion: {
    currency: 'motion',
    label: 'Motion',
    short: 'Mo',
    gloss: 'Kinetic force — pressure, momentum, the blow and the recoil',
    vent: 'Wind, a shove, glass out of its frame',
    toll: "Taken from the blood: grey vision, then a faint, then the heart stumbling",
    // Verdigris on old bronze.
    hue: 158,
  },
  charge: {
    currency: 'charge',
    label: 'Charge',
    short: 'Ch',
    gloss: 'Electrical and magnetic potential — what a struck flint has and a wet rope does not',
    vent: 'Arcing, hair lifting, iron dragged off the bench',
    toll: 'Taken from the nerves: numb hands, then palsy, then a fit',
    // Amethyst.
    hue: 278,
  },
  light: {
    currency: 'light',
    label: 'Light',
    short: 'Li',
    gloss: 'Radiance — emitted by what burns hot enough, swallowed by what is black',
    vent: 'Glare, glow, shadows thrown from the wrong side',
    toll: 'Taken from the eyes: dimming, then afterimages, then dark',
    // Old gold leaf, not lamplight.
    hue: 48,
  },
  mass: {
    currency: 'mass',
    label: 'Mass',
    short: 'Ma',
    gloss: 'Substance itself — water, vapour, smoke, anything with weight to spend',
    vent: 'Deposition: frost, fog, salt, a fall of ash on every surface',
    toll: 'Taken from your flesh: weight you do not get back',
    // Slate.
    hue: 214,
  },
}

export const CURRENCY_LIST: CurrencyMeta[] = CURRENCIES.map((c) => CURRENCY_META[c])

/**
 * The whole system, stated. A hard magic is one the reader can do arithmetic in,
 * so these are shown in the app rather than kept in a designer's notebook.
 *
 * Six of the seven hold without exception. The seventh states the two things a
 * form is permitted to change and bounds them: a form decides what an underfed
 * reagent does, and its condition spares or doubles one named loss. Where a form
 * can touch a law, that law says so and points at the seventh.
 *
 * Forms have been through three arrangements now. They began as seven separate
 * knobs, one law bent apiece, with a seventh law stating the bargain and a toll
 * charged for the bending. They were then cosmetic, and the seventh law went. They
 * are behavioural again, but as two mechanisms shared by all seven rather than as
 * seven special cases, and the seventh law is back to bound them — this time
 * saying what a form may *never* do, which is add.
 *
 * They are the statement of what `lib/reaction.ts` does. Changing a resolver rule
 * means editing this array in the same change, or the app is lying to the user.
 */
export const LAWS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'Nothing is made',
    body: 'Every unit came out of a reagent, and nothing in flight is multiplied — a slot hands on what it was given, less what the crossing took. A reagent that has spoken is spent.',
  },
  {
    title: 'The current runs one way',
    body: 'Clockwise, and each crossing is charged against the current as a whole, one currency or five: two units through a gap, one through an ordinary reagent, none through a relay, wherever it stands. A relay is a reagent whose two columns read alike to the unit; one unit either way and it is something else, costing the ordinary unit. The price is billed to the currency the next slot demanded and the remainder to the oldest in flight, so a supply pays its own way to the reagent waiting on it. A form may waive these prices or double them; see the seventh law.',
  },
  {
    title: 'The circle is walked once, then closed',
    body: 'Slot I is lit first and fed last; slot VIII stands nearest the mouth, its surplus leaving across one slot. A lap costs eight, so what you set late is what you get, and what you set early must be large enough to survive the walk.',
  },
  {
    title: 'An open slot is a hole in the circle',
    body: 'Whatever the ring still holds at the mouth leaves it in the proportion the ring was closed: eight reagents deliver all of it, four deliver half, two a quarter. A reagent that stands without reacting still closes its hole. A form may waive the spill or double it; see the seventh law.',
  },
  {
    title: 'Each material stands once and is asked once',
    body: 'Set a reagent down where it already lies and it is lifted from the old slot, not copied into the new, so eight slots mean eight materials and the order is most of the craft. Each is asked once, as the current reaches it, and has nothing left when the current comes back around.',
  },
  {
    title: 'A reagent the ring underfeeds is paid for, or it gives less',
    body: 'Every demand the ring cannot meet is settled one of two ways, and the form decides which. Under a volatile form (prayer, elegy, litany, invocation) the reagent reacts in full and the shortfall is drawn out of the caster. That toll is the only thing a casting ever costs the body, so a circle that feeds itself is free to speak at any size. Under a stable form (dirge, ward, benediction) it hands back only the share of its yield the ring fed it, rounded down, and nothing is charged.',
  },
  {
    title: 'A form asks one thing, and can only ever spare a loss',
    body: 'Every form but the prayer states one condition, printed with the working. Meet it and one loss is waived — the crossings, or the spill at the mouth; fail it and that same loss doubles, to four units across a gap and two across a reagent, or the share squared. No form adds: where a loss falls is all a form decides, so the first law holds in all seven.',
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
    'Demands nothing, so it can open a circle at slot I and can never charge a toll. There are only three — a spark, a weight, a lens — and nothing sources charge or mass at all; those have to be made out of something the ring is already carrying.',
  fuel: 'Gives back more than it asks and gives up nothing to do it — it was carrying the difference already. Most give back far more.',
  converter:
    'Trades one currency for another and hands back a little more than it took. The profit is small next to a fuel, but conversion is the only route into charge and mass, so a ring that wants either is built around these.',
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
 * which currencies each side mentions. Matching the currency *sets* alone ignores
 * the amounts, which handed the free crossing to two things that are not relays
 * at all: a reagent that hands back more of the same currency than it took (heat 8
 * for heat 12 — a flat half again, and under the 1.5x fuel bar, so it fell
 * through to the relay branch), and a reagent that genuinely trades while touching
 * the same two currencies on both sides (heat 1 and motion 12 for heat 12 and
 * motion 1, which converts eleven motion into eleven heat). Both were labelled
 * relays in the tray and the editor, under a hint that says a relay adds nothing
 * of its own, and both crossed for free.
 *
 * The exact test is also a brighter line for the user than a ratio: a relay is
 * a relay while its two columns read alike and stops being one the moment they
 * do not, which is legible on the card in a way "within half again" is not.
 */
function ledgersMatch(a: Ledger, b: Ledger): boolean {
  return CURRENCIES.every((currency) => (a[currency] ?? 0) === (b[currency] ?? 0))
}

/**
 * True when no currency comes back smaller than it went in — the reagent multiplies
 * what it was handed rather than trading one thing for another.
 *
 * Only reached once `ledgersMatch` has failed, so something is strictly larger and
 * the reagent is turning a profit without giving anything up. That is a fuel however
 * small the profit is, and saying so is what keeps the ratio below from calling
 * heat 8 for heat 12 a *converter* — it converts nothing.
 */
function givesUpNothing(demands: Ledger, yields: Ledger): boolean {
  return CURRENCIES.every((currency) => (yields[currency] ?? 0) >= (demands[currency] ?? 0))
}

/**
 * A relay is resolved exactly like any other reagent but for one thing: the current
 * crosses it for nothing. That is the whole of the role, and it is the only place
 * in `computeReaction` that asks what a component is — see `baseTransitCost` in
 * `lib/reaction.ts`.
 *
 * The free crossing has to be free, and unconditionally. Under law 1 a reagent that
 * hands back exactly what it took can at best break even, so a relay that cost
 * anything to cross would never be worth a slot.
 *
 * What qualifies is decided by `ledgersMatch`, to the unit and currency by
 * currency. That test is deliberately unforgiving, because this is the one role
 * with teeth: it is the only question `computeReaction` asks about a component, so
 * anything the predicate lets through crosses the ring for nothing.
 *
 * A relay used to be special in two further ways — its demand was a rating rather
 * than a requirement, so an underfed one was never billed, and it handed on only
 * what it actually took. Both are gone, and the rating rule is why. It made a
 * relay free profit anywhere: dropped into a far-off hole it raised the share of
 * the ring that reached the mouth and could not be charged for the demand it then
 * failed to meet, where any other reagent in that slot paid its shortfall in full.
 * Billing it like anything else is what keeps the free crossing honest.
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

  // The relay test comes first, and it is exact. It is the only role the resolver
  // reads (`isRelay` -> `baseTransitCost`), so a reagent that lands here wrongly does
  // not merely wear the wrong label — it crosses for free. Nothing is a relay
  // unless its two columns read alike to the unit.
  //
  // Mind how sharp that is when retuning a ledger, because roles are derived and a
  // reagent crosses the line silently: raise Copper Sheet from heat 9 for 9 to heat 9
  // for 10 and it is a fuel, which costs it the free crossing. That is the intended
  // reading — a reagent handing back more than it took is not carrying the current,
  // it is adding to it — but the ledger edit does not look like it is asking for it.
  if (ledgersMatch(component.demands, component.yields)) return 'relay'

  // Profit without a trade is a fuel however slim the margin, so heat 8 for heat 12
  // is a weak fuel rather than a "converter" that converts nothing. This is checked
  // before the ratio because the ratio only measures how *much* came back, not
  // whether anything was given up for it.
  if (givesUpNothing(component.demands, component.yields)) return 'fuel'

  // Past here the reagent gave something up, so it is trading. The ratio decides
  // whether it traded at a big enough profit to read as a fuel instead. The
  // comparison is strict, so the seven catalog entries sitting at exactly 1.5x —
  // Hoarfrost, Lodestone, Bismuth Crystal, Cinnabar and Fulgurite at 8 for 12,
  // Brine and Jet at 6 for 9 — are converters only just.
  if (gives > asks * 1.5) return 'fuel'
  return 'converter'
}
