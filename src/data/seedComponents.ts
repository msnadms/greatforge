import type { MaterialComponent } from '../types/worldbuilding'

type SeedSpec = Omit<MaterialComponent, 'id' | 'isSeed' | 'createdAt' | 'updatedAt'>

/**
 * Starter catalog: the base materials of the system, named as a class rather
 * than as one particular specimen, with descriptions that state the mechanism —
 * what the thing does, and why it does it. The numbers are the whole point, so
 * the prose stays out of their way.
 *
 * Four roles run through the catalog, and a workable circle needs most of them:
 *
 *   Sources    demand nothing, so they are the only things that can start a ring.
 *              There are exactly three — a spark, a weight, a lens — one for each
 *              currency you can raise without already holding something. They are
 *              ignition and not payload, and they are kept scarce on purpose: a
 *              stone that demands nothing can never be billed, so every source
 *              added to the catalog is another way to cast without paying a toll
 *   Fuels      take a little and give a lot; they carry what was stored in them
 *   Converters trade one currency for another and hand back a little more than
 *              they took. The profit is small next to a fuel, but conversion is
 *              the only route into charge and mass
 *   Relays     give back the whole of what they take, so current crosses them
 *              for nothing — the wire of the circle
 *
 * A fifth role, the sink, is authorable but not stocked: a stone that demands
 * and yields nothing can only ever lower what leaves the ring, so it is a tool
 * for deciding what a spell does *not* do rather than a way to make one stronger.
 * Nothing stops the user writing one; there is just no reason to ship examples.
 *
 * The numbers are tuned against four facts about the resolver that are easy to
 * miss and dominate everything:
 *
 *  - Transit loss is charged per currency per crossing, as a flat unit off the
 *    stream, so a full ring costs each currency in flight 8 units a lap however
 *    much of it there is. That is the loss budget. The working band runs 4–12
 *    against it: below 8 a stone cannot pay its way from the front of the ring,
 *    and above about 11 nothing would ever be worth spending a slot on a relay.
 *    A stone that yields three currencies pays the toll three times over, which
 *    is why split ledgers here are split coarsely — anything under about 4 on
 *    the small side is erased before it reaches the mouth.
 *  - Because a material may occupy only one slot, no chain can be repeated.
 *    That is what keeps the fuels honest: a fire may feed a fire, but only
 *    along eight distinct stones, so it bounds itself.
 *  - Nothing here sources charge or mass. You can strike a spark, wind a spring
 *    or aim a lens, but electricity and matter have to be made out of something
 *    already in the ring — so the deepest currencies are reached only by
 *    conversion, and the converters that reach them carry the largest numbers
 *    in the catalog to pay for the detour.
 *  - Heat is the common input: most fuels and half the converters burn it. It is
 *    therefore the easiest currency to raise and the least profitable to keep,
 *    and the catalog leans on that rather than pretending the five are alike.
 *
 * These are example data, not fixed rules; they can be edited and deleted like
 * anything the user authors.
 */
const SEEDS: SeedSpec[] = [
  // ---- Sources: nothing is asked of them, so a circle can be lit at slot I ----
  // Heat, motion and light only. Charge and mass have to be converted into.
  {
    name: 'Flint and Steel',
    description:
      'A shaving of steel struck off the bar by the flint edge, burning as it goes. The spark is gone before the ring can catch it; what survives the strike is a little heat, and a little is all it takes to open a circle.',
    demands: {},
    yields: { heat: 5 },
    rarity: 'common',
  },
  {
    name: 'Falling Weight',
    description:
      'A lead sinker on a cord over a pulley, cocked at the ceiling. The cheapest thing on the bench and the hardest to argue with: it will go down, and it does not care what the ring wants.',
    demands: {},
    yields: { motion: 10 },
    rarity: 'common',
  },
  {
    name: 'Burning Glass',
    description:
      'A ground lens on a stand, aimed out. What it hands the ring is not its own — it is the sun, borrowed, and it stops working under cloud.',
    demands: {},
    yields: { light: 8 },
    rarity: 'uncommon',
  },

  // ---- Fuels: they release far more than they ask, out of what was stored ----
  {
    name: 'Slow Match',
    description:
      'Loosely spun hemp cord boiled in lye and dried. Touched to a flame it holds a coal at the tip for hours and cannot easily be blown out, so it gives back far more than the moment of lighting cost — but it will not light itself, and a ring that cannot spare the coal pays for it out of the caster.',
    demands: { heat: 3 },
    yields: { heat: 9 },
    rarity: 'common',
  },
  {
    name: 'Clock Spring',
    description:
      'A flat steel ribbon wound tight against a sealed brass bellows. Warm the bellows and it swells, takes up the winding a notch at a time, and holds it — Drebbel’s trick, and the reason a clock in a warm room will run for a year without a hand on it.',
    demands: { heat: 5 },
    yields: { motion: 11 },
    rarity: 'uncommon',
  },
  {
    name: 'Charcoal',
    description:
      'Wood burnt without air until only the carbon is left. It wants a real fire under it rather than a spark, and once it has one it gives back an afternoon — which is the whole reason anyone makes it.',
    demands: { heat: 5 },
    yields: { heat: 11 },
    rarity: 'common',
  },
  {
    name: 'Rust and Aluminium',
    description:
      'Iron oxide and aluminium filings, stirred dry in equal measure. Hard to start and impossible to stop; it will burn through the plate it is standing on.',
    demands: { heat: 6 },
    yields: { heat: 12 },
    rarity: 'rare',
  },
  {
    name: 'Magnesium Ribbon',
    description:
      'Bright metal drawn into a strip, coiled on a card. It wants a hotter start than most things on the bench and will sit unlit in a candle flame all afternoon; once it does take, it cannot be put out by smothering, and it is far too bright to watch directly. What it gives back is all glare and almost no warmth.',
    demands: { heat: 7 },
    yields: { light: 12 },
    rarity: 'uncommon',
  },
  {
    name: 'Black Powder',
    description:
      'Saltpetre, charcoal and sulphur, milled damp and corned into grains. Corned powder needs a real flame at it rather than a stray spark — but it carries its own air, so once it takes, nothing about the ring can slow it down, and everything it holds comes out as a shove.',
    demands: { heat: 7 },
    yields: { motion: 12 },
    rarity: 'common',
  },
  {
    name: 'White Phosphorus',
    description:
      'Kept under water, cut under water, and placed wet. All it asks of the ring is something to burn into, and it takes the air itself the moment it dries. It gives back glare and a hard white heat together, in quantities worth having separately.',
    demands: { mass: 6 },
    yields: { light: 7, heat: 5 },
    rarity: 'rare',
  },

  // ---- Converters: one currency traded for another, at a small profit ----
  // The only routes into charge and mass, and the reason the ring has a middle.
  {
    name: 'Foxfire',
    description:
      'Rotting oak shot through with honey fungus, kept damp in a covered box. It gives a cold green light with no heat behind it at all, and it gives it by eating the wood — set it in a dry ring and it takes the weight it needs from whoever is holding the circle. It eats a great deal of it.',
    demands: { mass: 7 },
    yields: { light: 10 },
    rarity: 'rare',
  },
  {
    name: 'Jet',
    description:
      'Fossilised wood: black, light enough to float in brine, soft enough to carve. It takes a flame more readily than anything else on the bench and burns with a small bright one, giving very little warmth back — a poor bargain for a fire and a good one for a lamp.',
    demands: { heat: 6 },
    yields: { light: 9 },
    rarity: 'uncommon',
  },
  {
    name: 'Lampblack',
    description:
      'Soot collected off a smoking wick and packed into a cake. It is the blackest thing on the bench, and everything it fails to reflect it keeps as heat.',
    demands: { light: 7 },
    yields: { heat: 9 },
    rarity: 'common',
  },
  {
    name: 'Quicklime',
    description:
      'Burnt limestone, stored dry because it will not stay dry long. Given water it slakes, swells, cracks its own vessel, and comes to the boil without a flame.',
    demands: { mass: 7 },
    yields: { heat: 9 },
    rarity: 'common',
  },
  {
    name: 'Hoarfrost',
    description:
      'Ice needles scraped off metal and wood before sunrise. They grow straight out of the vapour in the air, so what they take as heat they hand back as weight — and they take a little more air with them each time.',
    demands: { heat: 8 },
    yields: { mass: 12 },
    rarity: 'common',
  },
  {
    name: 'Brine',
    description:
      'Salt water at the point of saturation, kept in a stoppered jar. Boiled down it gives up the water and keeps the salt, so what the ring spends as heat it gets back as something it can hold in the hand.',
    demands: { heat: 6 },
    yields: { mass: 9 },
    rarity: 'common',
  },
  {
    name: 'Frankincense',
    description:
      'Beads of pale resin from a cut Boswellia trunk, hardened where they ran. Scentless until burned, and then it is almost all smoke — the readiest way to put weight into a ring.',
    demands: { heat: 7 },
    yields: { mass: 10 },
    rarity: 'uncommon',
  },
  {
    name: 'Cinnabar',
    description:
      'Mercury ore, ground to the vermilion pigment manuscript painters used for important words. Roasted hard enough it gives up the metal as a vapour, and the vapour comes off bright as well as heavy.',
    demands: { heat: 8 },
    yields: { mass: 8, light: 4 },
    rarity: 'rare',
  },
  {
    name: 'Lodestone',
    description:
      'Magnetite that has been naturally magnetised. Pushed past a coil of wire it makes current — but only while it is moving, and only as long as something keeps moving it. The readiest way to put charge into a ring at all.',
    demands: { motion: 8 },
    yields: { charge: 12 },
    rarity: 'uncommon',
  },
  {
    name: 'Tourmaline',
    description:
      'A stubby green crystal, striated down its length. Warmed in the ash it draws ash to itself at one end and pushes it away at the other, and it will keep doing it until it cools — the only stone here that turns a fire straight into current.',
    demands: { heat: 7 },
    yields: { charge: 10 },
    rarity: 'uncommon',
  },
  {
    name: 'Amber',
    description:
      'Fossil tree resin, warm to the hand and about as light as wood. Rubbed hard on wool it lifts hair and dust off the bench and cracks audibly in a dark room; the rubbing is the price, and it is a steep one.',
    demands: { motion: 7 },
    yields: { charge: 10 },
    rarity: 'uncommon',
  },
  {
    name: 'Voltaic Pile',
    description:
      'Discs of zinc and silver stacked in alternation, each pair divided by cloth soaked in brine. It gives steadily and cleanly until the zinc is eaten through — and the zinc is what it asks the ring for, because eating the metal is the whole mechanism.',
    demands: { mass: 7 },
    yields: { charge: 10 },
    rarity: 'rare',
  },
  {
    name: 'Bismuth Crystal',
    description:
      'Grown from the cooling melt in stepped square terraces, the oxide film on it running pink and gold. It is repelled by any field put near it, and will climb out of the ring if it can — the lodestone run backwards, and at the same rate.',
    demands: { charge: 8 },
    yields: { motion: 12 },
    rarity: 'uncommon',
  },
  {
    name: 'Fulgurite',
    description:
      'A brittle glass tube formed where lightning struck wet sand and fused it. Run current through it again and it repeats, in miniature, what made it — the flash and the heat both.',
    demands: { charge: 8 },
    yields: { heat: 7, light: 5 },
    rarity: 'rare',
  },

  // ---- Relays: they hand back the whole of what they were given ----
  {
    name: 'Copper Sheet',
    description:
      'Rolled thin and cut to the slot. Heat crosses it faster than through any other cheap metal and comes off the far edge whole — though a thin sheet can only carry so much at once.',
    demands: { heat: 9 },
    yields: { heat: 9 },
    rarity: 'common',
  },
  {
    name: 'Bell Metal',
    description:
      'A bronze of about seventy-eight parts copper to twenty-two tin, cast as a disc. Too brittle for tools, but a blow struck on one edge arrives undiminished at the other, and the disc comes away warm from the striking without keeping any of it. The only relay that will carry two things at once.',
    demands: { heat: 5, motion: 7 },
    yields: { heat: 5, motion: 7 },
    rarity: 'common',
  },
  {
    name: 'Yew Heartwood',
    description:
      'Dense, close-grained, orange-red wood from the centre of the trunk. Bent, it returns very nearly all of what was put into it — the property that made it the bowyer’s wood, and the reason it will carry a shove no other relay can hold.',
    demands: { motion: 12 },
    yields: { motion: 12 },
    rarity: 'uncommon',
  },
  {
    name: 'Selenite',
    description:
      'Clear gypsum, cleaving into flat sheets you can read newsprint through. It passes an image on undimmed but doubled, which is a nuisance and not a fault.',
    demands: { light: 9 },
    yields: { light: 9 },
    rarity: 'common',
  },
  {
    name: 'Electrum',
    description:
      'An alloy of gold and silver, pale yellow, drawn into wire. It does not tarnish, so it does not resist, so it gives back the whole of what it takes. The reason it is expensive.',
    demands: { charge: 9 },
    yields: { charge: 9 },
    rarity: 'rare',
  },
  {
    name: 'Nautilus Shell',
    description:
      'Cut lengthwise, it shows a spiral of about thirty sealed chambers, each walled off as the animal outgrew it. The chambers flood and empty in turn, passing weight along the spiral without spilling any.',
    demands: { mass: 8 },
    yields: { mass: 8 },
    rarity: 'uncommon',
  },
]

/** Materializes the seed catalog with ids and timestamps. */
export function buildSeedComponents(makeId: () => string, now = Date.now()): MaterialComponent[] {
  return SEEDS.map((seed) => ({
    ...seed,
    id: makeId(),
    isSeed: true,
    createdAt: now,
    updatedAt: now,
  }))
}
