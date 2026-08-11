import type { MaterialComponent } from '../types/worldbuilding'

type SeedSpec = Omit<MaterialComponent, 'id' | 'isSeed' | 'createdAt' | 'updatedAt'>

/**
 * Starter catalog: the base materials of the system, named as a class rather
 * than as one particular specimen, with descriptions that state the mechanism:
 * what the thing does, and why it does it. The numbers are the whole point, so
 * the prose stays out of their way.
 *
 * Five roles run through the catalog, and a workable circle needs most of them:
 *
 *   Sources    demand nothing, so they are the only things that can start a
 *              ring. Three within easy reach (spark, weight, lens), one per
 *              currency raisable without already holding something, plus
 *              Pitchblende (`rare`) reaching charge directly. Kept scarce: a
 *              reagent that demands nothing can never be billed.
 *   Fuels      take a little and give a little more. Four within easy reach —
 *              one apiece in heat, motion and charge, plus Magnesium Ribbon
 *              carrying heat into light — plus Flywheel (`rare`) doubling up
 *              in motion. Together with the sources these are the only seven
 *              reagents that never cost anything to place, one short of a
 *              full ring.
 *   Converters trade one currency for another, mostly at a loss. A handful
 *              turn a real profit and are the reliable routes into mass and
 *              back into light and motion. Tungsten Foil (`singular`) reaches
 *              two currencies from one input at once.
 *   Relays     give back the whole of what they take, so current crosses them
 *              for nothing — the wire of the circle. Quartz Filament
 *              (`singular`) carries two currencies at once, both at ceiling.
 *   Sinks      swallow and give nothing back. Two of them, both demanded by
 *              the dirge, which is spared the spill only while a sink stands
 *              in the ring and is fully fed.
 *
 * The numbers are tuned against facts about the resolver that are easy to miss:
 *
 *  - Transit loss is flat against the current as a whole: a full lap dissipates
 *    8 units total, taken off whatever has been in flight longest. The working
 *    band runs 8–24 against that: a reagent at the front of the ring pays the
 *    whole lap, so below 8 it cannot reach the mouth at all.
 *  - A material may occupy only one slot, so no chain can be repeated — a fire
 *    may feed a fire, but only along eight distinct reagents.
 *  - Nothing common or uncommon sources charge or mass, and nothing at any
 *    rarity sources mass at all; mass is reached only by conversion, and the
 *    converters that reach it carry the catalog's largest numbers.
 *  - Heat is the common input: nearly everything below the sources burns it,
 *    making it the easiest currency to raise and the least profitable to keep.
 *  - Only seven reagents (three sources, four fuels) never cost anything to
 *    place, one short of a full ring — reaching slot VIII always means taking
 *    on at least one converter. Rarity does not track role: seven reagents are
 *    `rare` and two are `singular`, one-off reagents doing at a single slot
 *    what two `rare` reagents would together. See `sim/balance.ts`'s
 *    `naiveChainProbe`, the regression check that a full ring can't be built
 *    on autopilot.
 *
 * These are example data, not fixed rules; they can be edited and deleted like
 * anything the user authors.
 */
const SEEDS: SeedSpec[] = [
  // ---- Sources: nothing is asked of them, so a circle can be lit at slot I ----
  {
    name: 'Flint and Steel',
    description:
      "A bar of hardened steel and a knapped flint. Struck along the flint's edge, the steel sheds a hot shaving that catches fire from the friction and burns as it falls.",
    demands: {},
    yields: { heat: 10 },
    rarity: 'common',
  },
  {
    name: 'Falling Weight',
    description:
      'A lead sinker on a cord, run over a pulley and hung near the ceiling. Released, it falls the height of the room at a steady rate, and the cord can be tied off to whatever needs turning.',
    demands: {},
    yields: { motion: 20 },
    rarity: 'uncommon',
  },
  {
    name: 'Burning Glass',
    description:
      'A ground glass lens the width of a hand, mounted on a swivelling stand. Aimed at the sun, it focuses the light falling across its face into a point hot enough to char oak. Under cloud it does nothing.',
    demands: {},
    yields: { light: 16 },
    rarity: 'uncommon',
  },
  {
    name: 'Pitchblende',
    description:
      "A heavy black-brown ore, mined from a handful of known veins. Left shut in a drawer, it stays faintly warm to the touch and fogs a photographic plate straight through its wrapping. No record shows it ever stopping. What keeps it dear is finding a seam rich enough, rather than the ordinary grey rock it shares its ground with.",
    demands: {},
    yields: { charge: 22 },
    rarity: 'rare',
  },

  // ---- Fuels: they release a little more than they ask, out of what was stored ----
  {
    name: 'Slow Match',
    description:
      "Loosely spun hemp cord, boiled in lye and dried and coiled into a fat roll. Touched to a flame, it smoulders rather than burns, holding a coal at its tip that wind won't blow out. A roll this size holds a coal through a whole night watch.",
    demands: { heat: 10 },
    yields: { heat: 20 },
    rarity: 'common',
  },
  {
    name: 'Grindwheel',
    description:
      'A stone wheel set on a greased iron axle, turned by treading a plank at its rim. Once it is moving, its own weight carries it round long after the treading stops, and a light push at the rim gives back more motion than it cost. Left standing, it slows and stops within the hour.',
    demands: { motion: 10 },
    yields: { motion: 18 },
    rarity: 'common',
  },
  {
    name: 'Torpedo Ray',
    description:
      'A live torpedo ray, kept in a covered tub of seawater and fed sparingly. Touched with a charged rod along its back, it discharges the whole of its organ at once, always more than the rod itself carried, drawn from what it has been building since its last use. Handled bare-handed it does the same to the hand.',
    demands: { charge: 12 },
    yields: { charge: 20 },
    rarity: 'uncommon',
  },
  {
    name: 'Magnesium Ribbon',
    description:
      "Bright metal drawn into a thin strip and coiled on a card. It sits unlit in a candle flame for hours, but at a high enough heat it catches, burning too white to look at directly and impossible to smother. It gives off little warmth for all its glare.",
    demands: { heat: 14 },
    yields: { light: 22 },
    rarity: 'uncommon',
  },
  {
    name: 'Flywheel',
    description:
      "A dense steel disc, cast and balanced true, spun up and left turning on a well-oiled axle in a room shut against draughts. Once it's turning fast enough, air resistance is the only thing slowing it down, so a small push against that drag returns far more than it costs, drawn from the spin already stored in the disc. A disc heavy and true enough to hold that spin for more than an afternoon is hard to cast, and that is what makes a good one rare.",
    demands: { motion: 12 },
    yields: { motion: 20 },
    rarity: 'rare',
  },

  // ---- Converters: one currency traded for another ----
  // A handful profit (the four below, plus Frankincense further down); most
  // cost more than they return. A full ring needs at least one of them.
  {
    name: 'Hoarfrost',
    description:
      'Needles of ice grown overnight on metal and wood, scraped off before sunrise. They form directly from water vapour in the air, skipping the liquid stage, and draw their cold from the air around them. Their whole weight was air an hour before.',
    demands: { heat: 16 },
    yields: { mass: 24 },
    rarity: 'rare',
  },
  {
    name: 'Lodestone',
    description:
      'Magnetite that has taken a natural magnetism, strong enough to hold a nail through a sheet of paper. Drawn past a coil of wire it raises a current in the wire, but only while it is moving.',
    demands: { motion: 16 },
    yields: { charge: 24 },
    rarity: 'rare',
  },
  {
    name: 'Foxfire',
    description:
      'Rotting oak shot through with honey fungus, kept damp in a covered box. The fungus digests the wood and gives off a cold green light as it does, steady enough to read a dial by and carrying no warmth at all. It works through a fair weight of timber each night.',
    demands: { mass: 14 },
    yields: { light: 16 },
    rarity: 'rare',
  },
  {
    name: 'Bismuth Crystal',
    description:
      'Grown out of the cooling melt in stepped square terraces, with an oxide film running pink and gold across the faces. It is repelled by a magnet of either pole, and a small enough crystal will drift away from one across a smooth table.',
    demands: { charge: 16 },
    yields: { motion: 20 },
    rarity: 'rare',
  },
  {
    name: 'Light Mill',
    description:
      'A glass bulb blown thin enough to hold a near-true vacuum, with four vanes on a needle point inside, black on one face and silver on the other. Strong light sets the vanes spinning on their own, faster the harder it falls, and they stop dead the instant a shadow crosses the glass. Blowing one thin enough to hold that vacuum ruins nine bulbs in ten.',
    demands: { light: 16 },
    yields: { motion: 24 },
    rarity: 'rare',
  },
  {
    name: 'Quartz Anvil',
    description:
      "A block of clear quartz set beneath a lead striker cast new for the purpose. Dropped its own height, the striker cracks the crystal lattice, and for an instant the fracturing faces throw off more light than the impact alone can explain: a flash bright enough to read by in a dark room. The striker does not survive the strike, so a fresh one has to be cast and cooled before the next blow.",
    demands: { motion: 16 },
    yields: { light: 18 },
    rarity: 'uncommon',
  },
  {
    name: 'Clock Spring',
    description:
      "A flat steel ribbon wound tight against a sealed brass bellows. Warmth swells the bellows, which takes up the winding a notch at a time and holds it there. A bellows this size can only take up so much before it is fighting the spring's own tension.",
    demands: { heat: 10 },
    yields: { motion: 8 },
    rarity: 'common',
  },
  {
    name: 'Black Powder',
    description:
      'Saltpetre, charcoal and sulphur, milled damp together and corned into hard grains. The grains need a real flame rather than a stray spark. Most of what they hold goes into the crack and the smoke, not into anything that could be called work.',
    demands: { heat: 14 },
    yields: { motion: 12 },
    rarity: 'common',
  },
  {
    name: 'White Phosphorus',
    description:
      "Kept under water, cut under water, and handled wet. Left dry, it catches fire from the air itself within a minute, with nothing touching it. Most of it burns off as smoke; what's left is a hard white light and a heat that sticks to whatever it lands on.",
    demands: { mass: 12 },
    yields: { light: 6, heat: 6 },
    rarity: 'common',
  },
  {
    name: 'Jet',
    description:
      'Fossilised wood, black and polished, light enough to float in brine and soft enough to carve with a knife. It catches flame readily for a mineral, but most of the heat it demands goes into keeping itself lit rather than into the small bright flame it shows.',
    demands: { heat: 12 },
    yields: { light: 10 },
    rarity: 'common',
  },
  {
    name: 'Bone Black',
    description:
      'Bone charred in a shut kiln until only the carbon frame is left, then ground to powder. It makes a deep warm black rather than a true one. A cake this size gives back only a fraction of the light it swallows, as heat.',
    demands: { light: 14 },
    yields: { heat: 12 },
    rarity: 'common',
  },
  {
    name: 'Quicklime',
    description:
      'Burnt limestone, kept sealed because it draws moisture straight out of the air. Given water outright, it slakes and comes to a boil with no flame under it. Most of what it takes goes into cracking its own vessel rather than into the warmth it gives off.',
    demands: { mass: 14 },
    yields: { heat: 12 },
    rarity: 'common',
  },
  {
    name: 'Brine',
    description:
      'Salt water at the point of saturation, kept in a stoppered jar. Boiled down it gives up the water and leaves the salt behind as coarse dry crystal, but most of the heat under the pan goes into the steam rather than the salt.',
    demands: { heat: 12 },
    yields: { mass: 10 },
    rarity: 'common',
  },
  {
    name: 'Frankincense',
    description:
      'Beads of pale resin from a cut Boswellia trunk, hardened where they ran. Scentless in the hand. Set on a coal, it burns almost entirely to a thick white smoke that hangs low and takes a long while to clear. Most of that smoke condenses back into a resin heavier than what fed the coal.',
    demands: { heat: 14 },
    yields: { mass: 16 },
    rarity: 'uncommon',
  },
  {
    name: 'Cinnabar',
    description:
      'Mercury ore, ground fine to the vermilion manuscript painters kept for important words. Roasted hard enough, it gives up the metal as a vapour that comes off bright and settles heavy. Most of the roasting heat goes into the air around it, not into the ore.',
    demands: { heat: 16 },
    yields: { mass: 10, light: 4 },
    rarity: 'common',
  },
  {
    name: 'Tourmaline',
    description:
      'A stubby green crystal, striated down its length. Warmed in the ash, it takes a charge along its axis, drawing ash to one end and pushing it off the other. Only a fraction of the warmth it takes in survives as the charge it holds.',
    demands: { heat: 14 },
    yields: { charge: 12 },
    rarity: 'common',
  },
  {
    name: 'Amber',
    description:
      'Fossil tree resin, warm to the hand and near enough as light as wood. Rubbed hard on wool, it takes a charge that will lift hair and dust off a bench. Most of that effort is lost as warmth in the hand rather than kept as charge.',
    demands: { motion: 14 },
    yields: { charge: 12 },
    rarity: 'common',
  },
  {
    name: 'Zinc and Silver Stack',
    description:
      'Discs of zinc and silver stacked in alternation, each pair divided by cloth soaked in brine. The stack gives a steady current with nothing moving in it at all, but the zinc it eats through carries far more than the current it hands back.',
    demands: { mass: 14 },
    yields: { charge: 10 },
    rarity: 'common',
  },
  {
    name: 'Fulgurite',
    description:
      'A brittle glass tube, rough outside and smooth within, formed where lightning struck wet sand and fused a channel through it. Running current through it again brings back a little of what made it: a flash along the bore, and a fraction of the heat that fused the glass in the first place.',
    demands: { charge: 16 },
    yields: { heat: 10, light: 4 },
    rarity: 'common',
  },

  // ---- Relays: they hand back the whole of what they were given ----
  {
    name: 'Copper Sheet',
    description:
      'Rolled thin and cut square. Heat put to one edge appears at the other almost at once, faster than through any other metal to be had cheaply, though a sheet this thin will only carry so much before it warps.',
    demands: { heat: 18 },
    yields: { heat: 18 },
    rarity: 'common',
  },
  {
    name: 'Bell Metal',
    description:
      'A bronze of about seventy-eight parts copper to twenty-two tin, cast as a disc. Too brittle to take an edge, but struck on the rim it rings a long while, and the note carries the width of the disc undiminished. The metal comes away warm from the striking and does not hold the warmth.',
    demands: { heat: 10, motion: 14 },
    yields: { heat: 10, motion: 14 },
    rarity: 'common',
  },
  {
    name: 'Yew Heartwood',
    description:
      'Dense, close-grained, orange-red wood from the centre of the trunk. Bent hard it stores the bending and returns very nearly all of it on release, over and over without taking a set. It is the wood bowyers cut their staves from.',
    demands: { motion: 24 },
    yields: { motion: 24 },
    rarity: 'uncommon',
  },
  {
    name: 'Selenite',
    description:
      'Clear gypsum, splitting into flat sheets thin enough to read newsprint through. It passes an image without dimming it, though doubled: one copy offset slightly from the other.',
    demands: { light: 18 },
    yields: { light: 18 },
    rarity: 'common',
  },
  {
    name: 'Electrum',
    description:
      'A pale yellow alloy of gold and silver, drawn into wire. It does not tarnish and offers almost no resistance, so a current put in at one end arrives whole at the other.',
    demands: { charge: 18 },
    yields: { charge: 18 },
    rarity: 'uncommon',
  },
  {
    name: 'Nautilus Shell',
    description:
      'Cut lengthwise, it shows a spiral of some thirty sealed chambers, each walled off as the animal outgrew it. A thread of tissue runs the length of the spiral and floods or empties the chambers in turn, shifting the weight along the shell to rise or sink.',
    demands: { mass: 16 },
    yields: { mass: 16 },
    rarity: 'uncommon',
  },

  // ---- Sinks: they swallow and hand back nothing ----
  // Two, against the two currencies easiest to raise. A dirge needs one fed in
  // full to be spared the spill.
  {
    name: 'Lampblack',
    description:
      'Soot taken off a lamp chimney and bound with a little size. Laid on thick it is the blackest surface the bench can make: light falling on it is not thrown back at any angle, and a mark in it reads as a hole rather than as a colour.',
    demands: { light: 18 },
    yields: {},
    rarity: 'common',
  },
  {
    name: "Glauber's Salt",
    description:
      "Clear crystals that hold their water loosely. Warmed a little past blood heat, they collapse into that water, taking a great deal of warmth to do it. The jar stays cold to the touch the whole time it is melting.",
    demands: { heat: 16 },
    yields: {},
    rarity: 'common',
  },

  // ---- Singular: one apiece, doing at a single slot what two rare reagents ----
  // would together. `singular` is a price, not a mechanical rule — nothing in
  // the resolver reads rarity; the catalog just does not carry a second.
  {
    name: 'Tungsten Foil',
    description:
      "Beaten leaf-thin from the one ingot of purest tungsten anyone has managed to refine, down to a few atoms at its finest edge. Hard light striking close enough to the metal does not pass through it: it is caught and converted directly into solid weight and a matched charge. Every foil beaten since has come out a few atoms too thick or too flawed to do it as cleanly, and none has matched this one's yield.",
    demands: { light: 16 },
    yields: { mass: 12, charge: 12 },
    rarity: 'singular',
  },
  {
    name: 'Quartz Filament',
    description:
      "A single filament of quartz glass, drawn out over a flame and stretched thinner than a hair, then thinner again: the longest length anyone has drawn without a single flaw down its run. Heat runs down its length as fast as through any metal tested against it, and the same thread carries a struck pulse the same distance without damping it, arriving at the far end still sharp enough to read. Every attempt to draw a second this long has snapped somewhere along the way, and none has matched this one's whole run.",
    demands: { heat: 24, motion: 24 },
    yields: { heat: 24, motion: 24 },
    rarity: 'singular',
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
