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
 *              reagent that demands nothing can never be billed, so every source
 *              added to the catalog is another way to cast without paying a toll
 *   Fuels      take a little and give a lot; they carry what was stored in them
 *   Converters trade one currency for another and hand back a little more than
 *              they took. The profit is small next to a fuel, but conversion is
 *              the only route into charge and mass
 *   Relays     give back the whole of what they take, so current crosses them
 *              for nothing — the wire of the circle
 *
 *   Sinks      swallow and give nothing back. Two of them, and they were added
 *              for the dirge: that form is spared the spill only while a sink
 *              stands in the ring, and with none in the catalog it could never be
 *              satisfied without the user authoring one first. Before forms were
 *              behavioural the role was deliberately unstocked, on the grounds
 *              that a reagent which only ever lowers what leaves the ring is a
 *              tool for deciding what a spell does *not* do rather than a way to
 *              make one stronger. That is still true of the role; the dirge is now
 *              the reason to reach for it.
 *
 * The numbers are tuned against four facts about the resolver that are easy to
 * miss and dominate everything:
 *
 *  - Transit loss is a flat amount off the current as a whole, so a full lap
 *    dissipates 8 units in total and it comes off whatever has been in flight
 *    longest. That is the loss budget, and the working band runs 4–12 against
 *    it: a reagent at the front of the ring pays the whole lap, so below 8 it
 *    cannot reach the mouth at all.
 *
 *    The band was originally set when a crossing cost one unit of *every*
 *    currency in flight, which made a lap cost 8 per currency and erased
 *    anything under about 4 on the small side of a split ledger. Transit is flat
 *    now, so split ledgers survive far better than these numbers assume and the
 *    band is looser than it needs to be rather than tighter.
 *  - Because a material may occupy only one slot, no chain can be repeated.
 *    That is what keeps the fuels honest: a fire may feed a fire, but only
 *    along eight distinct reagents, so it bounds itself.
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
      'A bar of hardened steel and a knapped flint. Struck along the flint edge, the steel sheds a shaving fine enough to catch fire from the friction of the strike, and it burns as it falls.',
    demands: {},
    yields: { heat: 5 },
    rarity: 'common',
  },
  {
    name: 'Falling Weight',
    description:
      'A lead sinker on a cord, run over a pulley and cocked at the ceiling. Released, it descends the whole height of the room at a steady rate, and the cord can be trained onto whatever needs turning.',
    demands: {},
    yields: { motion: 10 },
    rarity: 'common',
  },
  {
    name: 'Burning Glass',
    description:
      'A ground glass lens the width of a hand, mounted on a swivelling stand. Aimed at the sun, it gathers everything falling across its face into a point small enough to char oak. Under cloud it does nothing.',
    demands: {},
    yields: { light: 8 },
    rarity: 'uncommon',
  },

  // ---- Fuels: they release far more than they ask, out of what was stored ----
  {
    name: 'Slow Match',
    description:
      'Loosely spun hemp cord, boiled in lye and dried. Touched to a flame it does not burn so much as smoulder, holding a coal at its tip that wind will not blow out. A finger’s length of it lasts a morning.',
    demands: { heat: 3 },
    yields: { heat: 9 },
    rarity: 'common',
  },
  {
    name: 'Clock Spring',
    description:
      'A flat steel ribbon wound tight against a sealed brass bellows. Warmth swells the bellows, which takes up the winding a notch at a time and holds it there. Drebbel built a clock on the principle that ran a year in a warm room with no hand on it.',
    demands: { heat: 5 },
    yields: { motion: 11 },
    rarity: 'uncommon',
  },
  {
    name: 'Charcoal',
    description:
      'Wood burnt in a covered pit with the air shut out, until only the carbon is left. A spark will not catch it, but under a fire already going it holds a steady heat for an afternoon and leaves almost no ash.',
    demands: { heat: 5 },
    yields: { heat: 11 },
    rarity: 'common',
  },
  {
    name: 'Rust and Aluminium',
    description:
      'Iron oxide and aluminium filings, stirred dry in equal measure. Nothing short of a burning ribbon will start it. Once started it runs white hot, needs no air, and burns down through the plate it is standing on.',
    demands: { heat: 6 },
    yields: { heat: 12 },
    rarity: 'rare',
  },
  {
    name: 'Magnesium Ribbon',
    description:
      'Bright metal drawn into a thin strip and coiled on a card. It will sit unlit in a candle flame all afternoon, but at a high enough heat it takes, and then it burns too white to look at directly and cannot be smothered. For all the glare there is very little warmth in it.',
    demands: { heat: 7 },
    yields: { light: 12 },
    rarity: 'uncommon',
  },
  {
    name: 'Black Powder',
    description:
      'Saltpetre, charcoal and sulphur, milled damp together and corned into hard grains. The grains want a real flame rather than a stray spark, and they carry their own air, so nothing will slow the burning once it is going. All of it comes out at once, as a shove.',
    demands: { heat: 7 },
    yields: { motion: 12 },
    rarity: 'common',
  },
  {
    name: 'White Phosphorus',
    description:
      'Kept under water, cut under water, and handled wet. Left dry it takes fire from the air itself within a minute, without anything touching it. It burns with a hard white light and a heat that sticks to whatever it has landed on.',
    demands: { mass: 6 },
    yields: { light: 7, heat: 5 },
    rarity: 'rare',
  },

  // ---- Converters: one currency traded for another, at a small profit ----
  // The only routes into charge and mass, and the reason the ring has a middle.
  {
    name: 'Foxfire',
    description:
      'Rotting oak shot through with honey fungus, kept damp in a covered box. The fungus digests the wood and gives off a cold green light while it does, steady enough to read a dial by and with no warmth in it at all. It works through a fair weight of timber a night.',
    demands: { mass: 7 },
    yields: { light: 10 },
    rarity: 'rare',
  },
  {
    name: 'Jet',
    description:
      'Fossilised wood, black and polished, light enough to float in brine and soft enough to carve with a knife. It takes a flame readily for a mineral and burns with a small bright one, giving off far more light than warmth.',
    demands: { heat: 6 },
    yields: { light: 9 },
    rarity: 'uncommon',
  },
  {
    name: 'Lampblack',
    description:
      'Soot collected off a smoking wick and packed into a cake. It is the blackest substance to be had, reflecting almost nothing that falls on it, and everything it fails to reflect it keeps as heat.',
    demands: { light: 7 },
    yields: { heat: 9 },
    rarity: 'common',
  },
  {
    name: 'Quicklime',
    description:
      'Burnt limestone, kept sealed because it draws damp straight out of the air. Given water outright it slakes: it swells, cracks the vessel holding it, and comes to the boil with no flame under it.',
    demands: { mass: 7 },
    yields: { heat: 9 },
    rarity: 'common',
  },
  {
    name: 'Hoarfrost',
    description:
      'Needles of ice grown overnight on metal and wood, scraped off before sunrise. They form straight out of the vapour in the air without passing through water first, so the cold that makes them is drawn from the air, and their whole weight was air an hour before.',
    demands: { heat: 8 },
    yields: { mass: 12 },
    rarity: 'common',
  },
  {
    name: 'Brine',
    description:
      'Salt water at the point of saturation, kept in a stoppered jar. Boiled down it gives up the water and leaves the salt behind as coarse dry crystal.',
    demands: { heat: 6 },
    yields: { mass: 9 },
    rarity: 'common',
  },
  {
    name: 'Frankincense',
    description:
      'Beads of pale resin from a cut Boswellia trunk, hardened where they ran. Scentless in the hand. Set on a coal it goes almost entirely to a thick white smoke that hangs low and takes a long while to clear.',
    demands: { heat: 7 },
    yields: { mass: 10 },
    rarity: 'uncommon',
  },
  {
    name: 'Cinnabar',
    description:
      'Mercury ore, ground fine to the vermilion that manuscript painters kept for important words. Roasted hard enough it gives up the metal as a vapour, which comes off bright and settles heavy.',
    demands: { heat: 8 },
    yields: { mass: 8, light: 4 },
    rarity: 'rare',
  },
  {
    name: 'Lodestone',
    description:
      'Magnetite that has taken a natural magnetism, strong enough to hold a nail through a sheet of paper. Drawn past a coil of wire it raises a current in the wire, but only while it is moving.',
    demands: { motion: 8 },
    yields: { charge: 12 },
    rarity: 'uncommon',
  },
  {
    name: 'Tourmaline',
    description:
      'A stubby green crystal, striated down its length. Warmed in the ash it takes a charge along its axis, drawing ash to one end and pushing it off the other, and it holds that charge until it cools again.',
    demands: { heat: 7 },
    yields: { charge: 10 },
    rarity: 'uncommon',
  },
  {
    name: 'Amber',
    description:
      'Fossil tree resin, warm to the hand and near enough as light as wood. Rubbed hard on wool it takes a charge that will lift hair and dust off a bench, and in a dark room the discharge cracks and shows a thread of light.',
    demands: { motion: 7 },
    yields: { charge: 10 },
    rarity: 'uncommon',
  },
  {
    name: 'Voltaic Pile',
    description:
      'Discs of zinc and silver stacked in alternation, each pair divided by cloth soaked in brine. The stack gives a steady current with nothing moving in it at all, and goes on giving until the zinc discs are eaten through.',
    demands: { mass: 7 },
    yields: { charge: 10 },
    rarity: 'rare',
  },
  {
    name: 'Bismuth Crystal',
    description:
      'Grown out of the cooling melt in stepped square terraces, with an oxide film running pink and gold across the faces. It is repelled by a magnet of either pole, and a small enough crystal will drift away from one across a smooth table.',
    demands: { charge: 8 },
    yields: { motion: 12 },
    rarity: 'uncommon',
  },
  {
    name: 'Fulgurite',
    description:
      'A brittle glass tube, rough on the outside and smooth within, formed where lightning struck wet sand and fused a channel through it. Current run through it again brings back a little of what made it: a flash along the bore, and heat enough to crack the glass.',
    demands: { charge: 8 },
    yields: { heat: 7, light: 5 },
    rarity: 'rare',
  },

  // ---- Relays: they hand back the whole of what they were given ----
  {
    name: 'Copper Sheet',
    description:
      'Rolled thin and cut square. Heat put to one edge appears at the other almost at once, faster than through any other metal to be had cheaply, though a sheet this thin will only carry so much before it warps.',
    demands: { heat: 9 },
    yields: { heat: 9 },
    rarity: 'common',
  },
  {
    name: 'Bell Metal',
    description:
      'A bronze of about seventy-eight parts copper to twenty-two tin, cast as a disc. Too brittle to take an edge, but struck on the rim it rings a long while, and the note carries the width of the disc undiminished. The metal comes away warm from the striking and does not hold the warmth.',
    demands: { heat: 5, motion: 7 },
    yields: { heat: 5, motion: 7 },
    rarity: 'common',
  },
  {
    name: 'Yew Heartwood',
    description:
      'Dense, close-grained, orange-red wood from the centre of the trunk. Bent hard it stores the bending and returns very nearly all of it on release, over and over without taking a set. It is the wood bowyers cut their staves from.',
    demands: { motion: 12 },
    yields: { motion: 12 },
    rarity: 'uncommon',
  },
  {
    name: 'Selenite',
    description:
      'Clear gypsum, cleaving into flat sheets thin enough to read newsprint through. It passes an image without dimming it, but doubled, one copy offset slightly from the other.',
    demands: { light: 9 },
    yields: { light: 9 },
    rarity: 'common',
  },
  {
    name: 'Electrum',
    description:
      'A pale yellow alloy of gold and silver, drawn into wire. It does not tarnish and offers almost no resistance, so a current put in at one end arrives whole at the other.',
    demands: { charge: 9 },
    yields: { charge: 9 },
    rarity: 'rare',
  },
  {
    name: 'Nautilus Shell',
    description:
      'Cut lengthwise, it shows a spiral of some thirty sealed chambers, each walled off as the animal outgrew it. A thread of tissue runs the length of the spiral and floods or empties the chambers in turn, shifting the weight along the shell to rise or sink.',
    demands: { mass: 8 },
    yields: { mass: 8 },
    rarity: 'uncommon',
  },

  // ---- Sinks: they swallow and hand back nothing ----
  // Two, against the two currencies easiest to raise, so there is always something
  // worth taking out of a manifestation. A dirge also needs one of these standing
  // in the ring before it is spared the spill.
  {
    name: 'Lampblack',
    description:
      'Soot taken off a lamp chimney and bound with a little size. Laid on thick it is the blackest surface the bench can make: light falling on it is not thrown back at any angle, and a mark in it reads as a hole rather than as a colour.',
    demands: { light: 9 },
    yields: {},
    rarity: 'common',
  },
  {
    name: "Glauber's Salt",
    description:
      'Clear crystals that hold their water loosely. Warmed a little past blood heat they collapse into that water, and they take a great deal of warmth to do it, so the jar stands cold against the hand the whole while it is melting.',
    demands: { heat: 8 },
    yields: {},
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
