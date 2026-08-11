import type { MaterialComponent } from '../types/worldbuilding'

type SeedSpec = Omit<MaterialComponent, 'id' | 'isSeed' | 'createdAt' | 'updatedAt'>

/**
 * Starter catalog: the base materials of the system, named as a class rather
 * than as one particular specimen, with descriptions that state the mechanism:
 * what the thing does, and why it does it. The numbers are the whole point, so
 * the prose stays out of their way.
 *
 * Four roles run through the catalog, and a workable circle needs most of them:
 *
 *   Sources    demand nothing, so they are the only things that can start a ring.
 *              There are three within easy reach (a spark, a weight, a lens),
 *              one for each currency you can raise without already holding
 *              something. They are ignition and not payload, and they are kept
 *              scarce on purpose: a reagent that demands nothing can never be
 *              billed, so every source added to the catalog is another way to
 *              cast without paying a toll. Pitchblende, priced `rare`, is a
 *              fourth, the one source that reaches charge directly rather than
 *              through a converter
 *   Fuels      take a little and give a little more, carrying what was stored in
 *              them. There are four within easy reach, on purpose: three that
 *              stay within heat and one that carries into light, and together
 *              with the three easy sources they are the seven reagents that never
 *              cost anything before rarity enters into it. Seven is one short of
 *              a ring: an eight-reagent working built from common and uncommon
 *              stock alone is guaranteed to need at least one thing from below,
 *              and charge and mass are entirely shut behind that door. Flywheel,
 *              priced `rare`, is a fifth fuel, the one that stays within
 *              motion instead
 *   Converters trade one currency for another, and most of them lose on the
 *              trade. A handful turn a real profit and are the most reliable way
 *              into mass and the return trip into light and motion; the rest
 *              still move the currency you need, just at a cost, which is what
 *              makes knowing the few good routes worth learning rather than a
 *              thing the ring does for you. Tungsten Foil, priced `singular`,
 *              reaches two currencies from one input at once, doing at a slot
 *              what two `rare` converters would together
 *   Relays     give back the whole of what they take, so current crosses them
 *              for nothing, the wire of the circle. Quartz Filament, the one
 *              priced `singular`, is the only one that carries two currencies
 *              at once, both at the ceiling
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
 * The numbers are tuned against five facts about the resolver that are easy to
 * miss and dominate everything:
 *
 *  - Transit loss is a flat amount off the current as a whole, so a full lap
 *    dissipates 8 units in total and it comes off whatever has been in flight
 *    longest. That is the loss budget, and the working band runs 4–12 against
 *    it: a reagent at the front of the ring pays the whole lap, so below 8 it
 *    cannot reach the mouth at all.
 *  - Because a material may occupy only one slot, no chain can be repeated.
 *    That is what keeps the fuels honest: a fire may feed a fire, but only
 *    along eight distinct reagents, so it bounds itself.
 *  - Nothing common or uncommon sources charge or mass, and nothing at any
 *    rarity sources mass at all. Pitchblende, priced `rare`, is the one
 *    source that skips the usual route into charge; matter still has to be
 *    made out of something already in the ring, so mass is reached only by
 *    conversion, and the converters that reach it carry the largest numbers in
 *    the catalog to pay for the detour.
 *  - Heat is the common input: nearly everything below the sources burns it.
 *    It is therefore the easiest currency to raise and the least profitable to
 *    keep, and the catalog leans on that rather than pretending the five are
 *    alike.
 *  - Only seven reagents in the catalog's common and uncommon stock (three
 *    sources, four fuels) never cost anything to place, and stacking every one
 *    of them still falls one short of a full ring. Reaching slot VIII from that
 *    stock always means taking on at least one converter. Rarity does not track
 *    role: seven reagents are priced `rare` (five converters spread across the
 *    currency pairs, plus a fourth source and a fifth fuel, so a lucky ring can
 *    occasionally skip the converter after all), and two rarer still are priced
 *    `singular`, one-off reagents that do at a single slot what two `rare`
 *    reagents would together, each grounded in a real mechanism that has only
 *    ever gone right once. The rest are `common` regardless of the currency
 *    they move. August 2026: this
 *    was not always true. Every fuel and converter used to hand back more than
 *    it took, so the ring could not run out of current, only out of matching
 *    currencies. An eight-reagent working was reachable by grabbing anything
 *    that fit the last slot's colour, with no penalty for not knowing the
 *    catalog. It reached zero toll on every attempt. Thinning the free reagents
 *    to seven and making most conversions cost more than they return is what
 *    makes that no longer true; see `sim/balance.ts`'s `naiveChainProbe`.
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
      "A bar of hardened steel and a knapped flint. Struck along the flint's edge, the steel sheds a hot shaving that catches fire from the friction and burns as it falls.",
    demands: {},
    yields: { heat: 5 },
    rarity: 'common',
  },
  {
    name: 'Falling Weight',
    description:
      'A lead sinker on a cord, run over a pulley and hung near the ceiling. Released, it falls the height of the room at a steady rate, and the cord can be tied off to whatever needs turning.',
    demands: {},
    yields: { motion: 10 },
    rarity: 'uncommon',
  },
  {
    name: 'Burning Glass',
    description:
      'A ground glass lens the width of a hand, mounted on a swivelling stand. Aimed at the sun, it focuses the light falling across its face into a point hot enough to char oak. Under cloud it does nothing.',
    demands: {},
    yields: { light: 8 },
    rarity: 'uncommon',
  },
  {
    name: 'Pitchblende',
    description:
      "A heavy black-brown ore, mined from a handful of known veins. Left shut in a drawer, it stays faintly warm to the touch and fogs a photographic plate straight through its wrapping. No record shows it ever stopping. What keeps it dear is finding a seam rich enough, rather than the ordinary grey rock it shares its ground with.",
    demands: {},
    yields: { charge: 11 },
    rarity: 'rare',
  },

  // ---- Fuels: they release a little more than they ask, out of what was stored ----
  // Only four: the rest of what used to stand here converts at a loss now, see below.
  {
    name: 'Slow Match',
    description:
      "Loosely spun hemp cord, boiled in lye and dried. Touched to a flame, it smoulders rather than burns, holding a coal at its tip that wind won't blow out. A finger's length lasts a morning.",
    demands: { heat: 3 },
    yields: { heat: 5 },
    rarity: 'common',
  },
  {
    name: 'Charcoal',
    description:
      'Wood burnt in a covered pit with the air shut out, until only the carbon is left. A spark will not catch it, but under a fire already going it holds a steady heat for an afternoon and leaves almost no ash.',
    demands: { heat: 5 },
    yields: { heat: 9 },
    rarity: 'common',
  },
  {
    name: 'Iron and Brimstone',
    description:
      'Iron filings and ground brimstone, milled together and packed tight and damp. Nothing short of a live coal will start it. Once it catches it needs no more air, runs hot enough to crack its own vessel, and keeps burning down through whatever it is standing on.',
    demands: { heat: 6 },
    yields: { heat: 10 },
    rarity: 'common',
  },
  {
    name: 'Magnesium Ribbon',
    description:
      "Bright metal drawn into a thin strip and coiled on a card. It sits unlit in a candle flame for hours, but at a high enough heat it catches, burning too white to look at directly and impossible to smother. It gives off little warmth for all its glare.",
    demands: { heat: 7 },
    yields: { light: 11 },
    rarity: 'uncommon',
  },
  {
    name: 'Flywheel',
    description:
      "A dense steel disc, cast and balanced true, spun up and left turning on a well-oiled axle in a room shut against draughts. Once it's turning fast enough, air resistance is the only thing slowing it down, so a small push against that drag returns far more than it costs, drawn from the spin already stored in the disc. A disc heavy and true enough to hold that spin for more than an afternoon is hard to cast, and that is what makes a good one rare.",
    demands: { motion: 6 },
    yields: { motion: 10 },
    rarity: 'rare',
  },

  // ---- Converters: one currency traded for another ----
  // A handful profit; most cost more than they return. Both kinds still move a
  // currency nothing above this line touches, so a full ring always needs at
  // least one of them and usually several. The four right below turn a real
  // profit, and Frankincense further down does too. Mass gets two routes since
  // nothing else reaches it, and together with them that is the whole of what
  // mass, charge, and the way back into light and motion have.
  {
    name: 'Hoarfrost',
    description:
      'Needles of ice grown overnight on metal and wood, scraped off before sunrise. They form directly from water vapour in the air, skipping the liquid stage, and draw their cold from the air around them. Their whole weight was air an hour before.',
    demands: { heat: 8 },
    yields: { mass: 12 },
    rarity: 'rare',
  },
  {
    name: 'Lodestone',
    description:
      'Magnetite that has taken a natural magnetism, strong enough to hold a nail through a sheet of paper. Drawn past a coil of wire it raises a current in the wire, but only while it is moving.',
    demands: { motion: 8 },
    yields: { charge: 12 },
    rarity: 'rare',
  },
  {
    name: 'Foxfire',
    description:
      'Rotting oak shot through with honey fungus, kept damp in a covered box. The fungus digests the wood and gives off a cold green light as it does, steady enough to read a dial by and carrying no warmth at all. It works through a fair weight of timber each night.',
    demands: { mass: 7 },
    yields: { light: 8 },
    rarity: 'rare',
  },
  {
    name: 'Bismuth Crystal',
    description:
      'Grown out of the cooling melt in stepped square terraces, with an oxide film running pink and gold across the faces. It is repelled by a magnet of either pole, and a small enough crystal will drift away from one across a smooth table.',
    demands: { charge: 8 },
    yields: { motion: 10 },
    rarity: 'rare',
  },
  {
    name: 'Light Mill',
    description:
      'A glass bulb blown thin enough to hold a near-true vacuum, with four vanes on a needle point inside, black on one face and silver on the other. Strong light sets the vanes spinning on their own, faster the harder it falls, and they stop dead the instant a shadow crosses the glass. Blowing one thin enough to hold that vacuum ruins nine bulbs in ten.',
    demands: { light: 8 },
    yields: { motion: 12 },
    rarity: 'rare',
  },
  {
    name: 'Quartz Anvil',
    description:
      "A block of clear quartz set beneath a lead striker cast new for the purpose. Dropped its own height, the striker cracks the crystal lattice, and for an instant the fracturing faces throw off more light than the impact alone can explain: a flash bright enough to read by in a dark room. The striker does not survive the strike, so a fresh one has to be cast and cooled before the next blow.",
    demands: { motion: 8 },
    yields: { light: 9 },
    rarity: 'uncommon',
  },
  {
    name: 'Clock Spring',
    description:
      "A flat steel ribbon wound tight against a sealed brass bellows. Warmth swells the bellows, which takes up the winding a notch at a time and holds it there. A bellows this size can only take up so much before it is fighting the spring's own tension.",
    demands: { heat: 5 },
    yields: { motion: 4 },
    rarity: 'common',
  },
  {
    name: 'Black Powder',
    description:
      'Saltpetre, charcoal and sulphur, milled damp together and corned into hard grains. The grains need a real flame rather than a stray spark. Most of what they hold goes into the crack and the smoke, not into anything that could be called work.',
    demands: { heat: 7 },
    yields: { motion: 6 },
    rarity: 'common',
  },
  {
    name: 'White Phosphorus',
    description:
      "Kept under water, cut under water, and handled wet. Left dry, it catches fire from the air itself within a minute, with nothing touching it. Most of it burns off as smoke; what's left is a hard white light and a heat that sticks to whatever it lands on.",
    demands: { mass: 6 },
    yields: { light: 3, heat: 3 },
    rarity: 'common',
  },
  {
    name: 'Jet',
    description:
      'Fossilised wood, black and polished, light enough to float in brine and soft enough to carve with a knife. It catches flame readily for a mineral, but most of the heat it demands goes into keeping itself lit rather than into the small bright flame it shows.',
    demands: { heat: 6 },
    yields: { light: 5 },
    rarity: 'common',
  },
  {
    name: 'Bone Black',
    description:
      'Bone charred in a shut kiln until only the carbon frame is left, then ground to powder. It makes a deep warm black rather than a true one. A cake this size gives back only a fraction of the light it swallows, as heat.',
    demands: { light: 7 },
    yields: { heat: 6 },
    rarity: 'common',
  },
  {
    name: 'Quicklime',
    description:
      'Burnt limestone, kept sealed because it draws moisture straight out of the air. Given water outright, it slakes and comes to a boil with no flame under it. Most of what it takes goes into cracking its own vessel rather than into the warmth it gives off.',
    demands: { mass: 7 },
    yields: { heat: 6 },
    rarity: 'common',
  },
  {
    name: 'Brine',
    description:
      'Salt water at the point of saturation, kept in a stoppered jar. Boiled down it gives up the water and leaves the salt behind as coarse dry crystal, but most of the heat under the pan goes into the steam rather than the salt.',
    demands: { heat: 6 },
    yields: { mass: 5 },
    rarity: 'common',
  },
  {
    name: 'Frankincense',
    description:
      'Beads of pale resin from a cut Boswellia trunk, hardened where they ran. Scentless in the hand. Set on a coal, it burns almost entirely to a thick white smoke that hangs low and takes a long while to clear. Most of that smoke condenses back into a resin heavier than what fed the coal.',
    demands: { heat: 7 },
    yields: { mass: 8 },
    rarity: 'uncommon',
  },
  {
    name: 'Cinnabar',
    description:
      'Mercury ore, ground fine to the vermilion manuscript painters kept for important words. Roasted hard enough, it gives up the metal as a vapour that comes off bright and settles heavy. Most of the roasting heat goes into the air around it, not into the ore.',
    demands: { heat: 8 },
    yields: { mass: 5, light: 2 },
    rarity: 'common',
  },
  {
    name: 'Tourmaline',
    description:
      'A stubby green crystal, striated down its length. Warmed in the ash, it takes a charge along its axis, drawing ash to one end and pushing it off the other. Only a fraction of the warmth it takes in survives as the charge it holds.',
    demands: { heat: 7 },
    yields: { charge: 6 },
    rarity: 'common',
  },
  {
    name: 'Amber',
    description:
      'Fossil tree resin, warm to the hand and near enough as light as wood. Rubbed hard on wool, it takes a charge that will lift hair and dust off a bench. Most of that effort is lost as warmth in the hand rather than kept as charge.',
    demands: { motion: 7 },
    yields: { charge: 6 },
    rarity: 'common',
  },
  {
    name: 'Zinc and Silver Stack',
    description:
      'Discs of zinc and silver stacked in alternation, each pair divided by cloth soaked in brine. The stack gives a steady current with nothing moving in it at all, but the zinc it eats through carries far more than the current it hands back.',
    demands: { mass: 7 },
    yields: { charge: 5 },
    rarity: 'common',
  },
  {
    name: 'Fulgurite',
    description:
      'A brittle glass tube, rough outside and smooth within, formed where lightning struck wet sand and fused a channel through it. Running current through it again brings back a little of what made it: a flash along the bore, and a fraction of the heat that fused the glass in the first place.',
    demands: { charge: 8 },
    yields: { heat: 5, light: 2 },
    rarity: 'common',
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
      'Clear gypsum, splitting into flat sheets thin enough to read newsprint through. It passes an image without dimming it, though doubled: one copy offset slightly from the other.',
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
    rarity: 'uncommon',
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
      "Clear crystals that hold their water loosely. Warmed a little past blood heat, they collapse into that water, taking a great deal of warmth to do it. The jar stays cold to the touch the whole time it is melting.",
    demands: { heat: 8 },
    yields: {},
    rarity: 'common',
  },

  // ---- Singular: one apiece, doing at a single slot what two rare reagents ----
  // would together. Priced `singular` rather than made mechanically unique, since
  // nothing in the resolver reads rarity; the catalog just does not carry a second.
  // Grounded the same way the rest of the catalog is, in a real mechanism rather
  // than an invented one, just one that has only ever been produced or recovered
  // once.
  {
    name: 'Tungsten Foil',
    description:
      "Beaten leaf-thin from the one ingot of purest tungsten anyone has managed to refine, down to a few atoms at its finest edge. Hard light striking close enough to the metal does not pass through it: it is caught and converted directly into solid weight and a matched charge. Every foil beaten since has come out a few atoms too thick or too flawed to do it as cleanly, and none has matched this one's yield.",
    demands: { light: 8 },
    yields: { mass: 6, charge: 6 },
    rarity: 'singular',
  },
  {
    name: 'Quartz Filament',
    description:
      "A single filament of quartz glass, drawn out over a flame and stretched thinner than a hair, then thinner again: the longest length anyone has drawn without a single flaw down its run. Heat runs down its length as fast as through any metal tested against it, and the same thread carries a struck pulse the same distance without damping it, arriving at the far end still sharp enough to read. Every attempt to draw a second this long has snapped somewhere along the way, and none has matched this one's whole run.",
    demands: { heat: 12, motion: 12 },
    yields: { heat: 12, motion: 12 },
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
