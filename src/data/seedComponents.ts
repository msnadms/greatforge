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
 *              Pitchblende (`rare`) reaching charge directly and Ice XV
 *              (`singular`) doing the same at a hundred times the scale. Kept
 *              scarce: a reagent that demands nothing can never be billed.
 *   Fuels      take a little and give a little more. Four within easy reach —
 *              one apiece in heat, motion and charge, plus Magnesium Ribbon
 *              carrying heat into light — plus three more at `rare`:
 *              Flywheel doubling up in motion, Seed Crystal doing the same
 *              in mass, and Sun-Cured Tinder carrying light back into heat.
 *              Superfluid Helium (`singular`) hands its heat back whole and
 *              adds motion on top, which no other reagent does.
 *              Together with the sources, the four common/uncommon fuels are
 *              the only seven reagents in the tuned envelope that never cost
 *              anything to place, one short of a full ring — the `rare`
 *              fuels sit outside that envelope by design (`sim/balance.ts`
 *              excludes `rare`/`singular` from the checks this catalog is
 *              tuned against).
 *   Converters trade one currency for another, mostly at a loss. A handful
 *              turn a real profit and are the reliable routes into mass and
 *              back into light and motion. Every ordered pair of currencies
 *              has one at common or uncommon rarity, so no currency can be
 *              reached only through `rare` stock. Tungsten Foil (`singular`)
 *              reaches two currencies from one input at once. A third
 *              `singular` entry, the Trapped Antiproton, sits outside even
 *              that: a deliberate outlier priced for scarcity of a different
 *              kind — there is one of it, full stop — rather than for balance.
 *              Blood Iron and Ice VI (both `singular`) run at the abyssal
 *              scale instead, taking Ice XV's charge round to heat and then to
 *              motion. The three of them are a whole ring's output in three
 *              slots, and they only chain into each other.
 *   Relays     give back the whole of what they take, so current crosses them
 *              for nothing — the wire of the circle. One per currency, plus
 *              two that carry a pair at once. What a pair is worth against a
 *              single wire is stated at Steam Main below.
 *   Sinks      swallow and give nothing back. Five of them, one per currency.
 *              The dirge's condition names a fully fed one, so each is priced
 *              to take a ring built around it rather than a slot dropped in.
 *
 * The numbers are tuned against facts about the resolver that are easy to miss:
 *
 *  - Transit loss is flat against the current as a whole, and a full lap costs
 *    RING_SLOT_COUNT × TRANSIT_LOSS_REAGENT. A reagent at the front of the ring
 *    pays the whole of it, so
 *    anything yielding less than that cannot reach the mouth unaided.
 *  - A material may occupy only one slot, so no chain can be repeated — a fire
 *    may feed a fire, but only along eight distinct reagents.
 *  - Nothing common or uncommon sources charge or mass, and nothing at any
 *    rarity sources mass at all; mass is reached only by conversion, and the
 *    converters that reach it carry the catalog's largest numbers. A sink
 *    stands against each of the five, so any currency can be buried as well as
 *    raised.
 *  - Heat is the common input: nearly everything below the sources burns it,
 *    making it the easiest currency to raise and the least profitable to keep.
 *  - Only seven reagents (three sources, four fuels) never cost anything to
 *    place, one short of a full ring, so reaching slot VIII always means taking
 *    on at least one converter. `sim/balance.ts`'s `naiveChainProbe` is the
 *    regression check on that.
 *  - Rarity does not track role: seven reagents are `rare` and six `singular`,
 *    the latter exempt from `MAX_LEDGER_ENTRY` and outside every cohort the
 *    harness measures.
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
  {
    name: 'Seed Crystal',
    description:
      'A single true crystal, lowered into a jar of its own solution held just short of turning cloudy. Left standing overnight, more of the same substance sets onto every face, faster than the seed alone weighed going in. A solution held that close to turning without doing so is hard to keep, and harder to keep still.',
    demands: { mass: 12 },
    yields: { mass: 20 },
    rarity: 'rare',
  },
  {
    name: 'Sun-Cured Tinder',
    description:
      'A twist of tinder cured a whole season in direct sun, dried past what an ordinary twist ever reaches. A struck spark or a beam through a lens sets it alight at once, and it burns hotter and longer than tinder cut fresh, giving off far more heat than the light that lit it. A season is a long time to leave anything out where weather and thieves can reach it.',
    demands: { light: 10 },
    yields: { heat: 18 },
    rarity: 'rare',
  },

  // ---- Converters: one currency traded for another ----
  // A handful profit (the four below, plus Frankincense and Silt Trap further
  // down); most cost more than they return. A full ring needs at least one of
  // them. Frankincense and Silt Trap are mass's only two non-rare routes, and
  // were repriced together so mass would not depend on a single reagent.
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
    name: 'Fire Piston',
    description:
      'A hardwood tube bored true, with a greased piston and a scrap of char cloth set in a recess at its tip. One hard stroke of the palm squeezes the air ahead of the piston fast enough to light the cloth. Most of the stroke goes into the tube walls and the rebound, and the ember is what is left over.',
    demands: { motion: 14 },
    yields: { heat: 12 },
    rarity: 'common',
  },
  {
    name: 'Solenoid',
    description:
      'A long coil of insulated wire with a loose iron slug lying in its bore. Wired to a jar battery, the coil hauls the slug to its centre and holds it there, hard enough to trip a latch across the bench. The windings come away hot, and that heat is the part of the current the slug never saw.',
    demands: { charge: 18 },
    yields: { motion: 16 },
    rarity: 'common',
  },
  {
    name: 'Young Sunflower',
    description:
      'A sunflower a few weeks old, potted and stood where nothing shades it. The stem grows longer on its shaded side than its lit one, so the head swings east to west across the day and back again overnight. A whole morning of sun on a wide leaf buys that one slow turn.',
    demands: { light: 14 },
    yields: { motion: 12 },
    rarity: 'common',
  },
  {
    name: 'Duckweed Mat',
    description:
      "A green skin of duckweed on standing water, thick enough to lift off in sheets. In strong light it doubles the weight of a pond's whole surface inside a week, and every ounce of that comes out of the air and the water rather than out of anything fed to it. It is slow, and it wants a great deal of light for what it lays down.",
    demands: { light: 14 },
    yields: { mass: 15 },
    rarity: 'uncommon',
  },
  {
    name: 'Glow-worm Jar',
    description:
      'A dozen female glow-worms in a stoppered jar with a little damp moss. Each carries a lit patch beneath her last segments and burns her own substance to keep it lit, giving off a cold green light steady enough to work by for hours. They eat nothing while they glow, and weigh less by morning.',
    demands: { mass: 14 },
    yields: { light: 12 },
    rarity: 'common',
  },
  {
    name: 'Limelight',
    description:
      'A pencil of quicklime held in the flame of a blowpipe fed with oxygen. The lime neither melts nor burns away: past a certain heat it simply begins to glow, white enough to throw a hard shadow the width of a stage. Keeping the flame at that heat costs more than the light comes back worth.',
    demands: { heat: 16 },
    yields: { light: 14 },
    rarity: 'uncommon',
  },
  {
    name: 'Thermopile',
    description:
      'Twenty short bars of bismuth and antimony soldered alternately into a block, one face blacked and the other held in a water jacket. Warmth on the blacked face raises a current across the junctions and keeps raising it for as long as the two faces disagree. What it is paid for is that disagreement, not the warmth, so most of the warmth crosses the block and is gone.',
    demands: { heat: 14 },
    yields: { charge: 16 },
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
    demands: { heat: 12 },
    yields: { mass: 16 },
    rarity: 'uncommon',
  },
  {
    name: 'Cinnabar',
    description:
      'Mercury ore, ground fine to the vermilion manuscript painters kept for important words. Roasted hard enough, it gives up the metal as a vapour that comes off bright and settles heavy. Most of the roasting heat goes into the air around it, not into the ore.',
    demands: { heat: 16 },
    yields: { mass: 8, light: 8 },
    rarity: 'uncommon',
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
  {
    name: 'Resistance Coil',
    description:
      "A coil of iron wire, wound tight and wired to a jar battery. Driven hard enough it glows dull red, throwing real heat into the room. Most of what the battery gives up is spent driving the current through the coil's own resistance, and only the rest escapes as heat you can feel.",
    demands: { charge: 14 },
    yields: { heat: 12 },
    rarity: 'common',
  },
  {
    name: 'Silt Trap',
    description:
      'A stone-lined basin set where a fast leat slows and widens before the wheel. The current drops the grit and sand it carries as it slackens, and slack water already loose with silt settles into the same basin overnight, well beyond what the current itself brought down.',
    demands: { motion: 12 },
    yields: { mass: 14 },
    rarity: 'common',
  },
  {
    name: 'Galvanic Plating',
    description:
      'A copper plate hung in a bath of blue vitriol, wired to a jar battery. Left long enough, metal drawn out of the solution builds up on the plate as a solid skin. Most of the current spent on the bath goes into heating the liquid rather than laying down metal.',
    demands: { charge: 16 },
    yields: { mass: 14 },
    rarity: 'common',
  },
  {
    name: 'Sand Ballast',
    description:
      "A canvas sack of sand, slung on a line run over a high beam and cut loose to fall. The drop hauls whatever is tied to the line's other end up behind it, but the sack bursts on landing, and most of the fall is spent in the burst and the scatter rather than the haul.",
    demands: { mass: 14 },
    yields: { motion: 12 },
    rarity: 'common',
  },
  {
    name: 'Arc Lamp',
    description:
      "Two carbon rods wired to a jar battery, touched together and drawn a hair's width apart. Held there, the gap keeps arcing, throwing a light too bright to look at straight on. The rods burn away at the tip as they arc, and most of the current goes into that burning rather than the light.",
    demands: { charge: 14 },
    yields: { light: 12 },
    rarity: 'common',
  },
  {
    name: 'Selenium Cell',
    description:
      'A thin selenium film pressed between two brass plates. Struck with light it raises a small current between the plates, stronger the brighter the light falling on it, though most of what strikes the film passes straight through without raising anything at all.',
    demands: { light: 14 },
    yields: { charge: 15 },
    rarity: 'uncommon',
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
  // A relay is neutral when it is fed and pure risk when it is not: it hands
  // back exactly what it drew, so its demand buys nothing and its shortfall is
  // billed like anything else's. Transit is flat per crossing rather than per
  // currency, so carrying two currencies saves no more than carrying one, and
  // either shortfall is billed while the return is identical. A pair therefore
  // has to be cheaper than a single wire to be worth reaching for. Priced above
  // that line this was the least useful reagent in the catalog barring the
  // sinks; priced below it, it is the most useful of the relays.
  {
    name: 'Steam Main',
    description:
      'A run of iron pipe from the boiler house to the shop, lagged thick in felt and horsehair and clamped every few feet. Live steam driven in at one end arrives at the far end still hot and still moving. A hand laid on the lagging feels no more than the room, so what the boiler put in is what the machine gets.',
    demands: { heat: 8, motion: 8 },
    yields: { heat: 8, motion: 8 },
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
    name: 'Rock Salt Window',
    description:
      'A slab of clear halite, cut and polished dry because a wet cloth ruins the face. Glass stops radiant heat and passes light; rock salt passes both, so a beam through the window arrives on the far side with its warmth still in it. It adds nothing of its own and holds nothing back.',
    demands: { heat: 12, light: 12 },
    yields: { heat: 12, light: 12 },
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
  // One per currency, so a dirge can be built to bury any of the five. It needs
  // one of them fed in full to be spared the spill.
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
  {
    name: "Fuller's Earth",
    description:
      'A fine, greasy clay dug from a handful of pits, used by fullers to work the lanolin out of raw wool. Worked into cloth or hide it draws grease and moisture into itself and holds them there for good.',
    demands: { mass: 16 },
    yields: {},
    rarity: 'common',
  },
  {
    name: 'Dashpot',
    description:
      'A brass cylinder of thick oil with a loose piston run down into it. A blow on the piston head arrives at the far end as nothing: the oil has to squeeze past the piston before anything can move, and the whole of the blow goes into shoving oil about. The rod never springs back.',
    demands: { motion: 16 },
    yields: {},
    rarity: 'common',
  },
  {
    name: 'Earthing Rod',
    description:
      'A copper rod driven eight feet into wet ground and clamped to whatever must not be allowed to hold a charge. Current put onto it runs off into the earth and keeps going. There is no far end to draw it back from.',
    demands: { charge: 18 },
    yields: {},
    rarity: 'common',
  },

  // ---- Singular: one apiece, doing at a single slot what two rare reagents ----
  // would together. `singular` is a price, not a mechanical rule — nothing in
  // the resolver reads rarity; the catalog just does not carry a second.
  //
  // The Antiproton below is priced apart from these two: not twice a rare
  // reagent but an outlier by design, catalogued because there is exactly one
  // and never will be a second, not because its ratio was tuned to fit
  // alongside the rest. `sim/balance.ts` excludes the whole rarity from the
  // checks the common/uncommon catalog is held to, which is what makes room
  // for it to exist at all.
  {
    name: 'Tungsten Foil',
    description:
      "Beaten leaf-thin from the one ingot of purest tungsten anyone has managed to refine, down to a few atoms at its finest edge. Hard light striking close enough to the metal does not pass through it: it is caught and converted directly into solid weight and a matched charge. Every foil beaten since has come out a few atoms too thick or too flawed to do it as cleanly, and none has matched this one's yield.",
    demands: { light: 16 },
    yields: { mass: 12, charge: 12 },
    rarity: 'singular',
  },
  {
    name: 'Superfluid Helium',
    description:
      'Helium chilled to within two degrees of the bottom of the scale, where it stops behaving like a liquid. It has no thickness left to it at all, so a warmth held to the inner flask drives the stuff up through a packed plug of emery and out of the spout in a standing jet, and the same warmth crosses the flask and arrives whole on the far side rather than being spent on the driving. The plant that filled this one was broken up for its copper, and no one has built a second.',
    demands: { heat: 12 },
    yields: { heat: 12, motion: 12 },
    rarity: 'singular',
  },
  {
    name: 'Trapped Antiproton',
    description:
      "A single antiproton, caught off a collision no one has managed to repeat and held clear of the vessel walls in a ring of opposed magnets that has not been switched off since. Given passage to a speck of ordinary matter, the two do not react: they cease, both at once, and the whole mass of either leaves as a burst of heat, light, motion and charge, none of it recognisable afterward as the matter it was. The field that caught it has never been built a second time, and nothing about keeping this one alive gets easier with practice.",
    demands: { mass: 2 },
    yields: { heat: 24, motion: 24, charge: 24, light: 24 },
    rarity: 'singular',
  },
  {
    name: 'Ice VI',
    description:
      'Heavy ice formed beneath an ocean so deep that water remains solid despite warmth. Its crystals are denser than the liquid above them and sink rather than float. Given heat through liturgy, they loosen into common water and force themselves violently outward.',
    demands: { heat: 300 },
    yields: { motion: 600 },
    rarity: 'singular',
  },
  {
    name: 'Ice XV',
    description:
      'A proton-ordered form of the sixth ice, grown only where the abyss is both cold and under crushing pressure. Its water molecules all lie in a fixed arrangement, giving the crystal opposed electrical faces. Under liturgy, that order collapses at once and the charge runs out through whatever touches it, leaving ordinary Ice VI behind.',
    demands: {},
    yields: { charge: 320 },
    rarity: 'singular',
  },
  {
    name: 'Blood Iron',
    description:
      'Dark iron formed where hydrogen from the mantle is forced into the metal under abyssal pressure. Charge drives the hidden hydrogen through the iron faster than the lattice can bear, heating it white at the fractures. Once spent, it leaves porous red iron and a stream of bubbles.',
    demands: { charge: 320 },
    yields: { heat: 300 },
    rarity: 'singular',
  },
]

/**
 * A seed's document id, derived from its name so the same reagent lands on the
 * same document every time the catalog is installed. That is what lets a changed
 * seed be written over its old self instead of installed beside it. Names are
 * unique across `SEEDS`, and the prefix keeps these clear of `newId`'s uuids.
 */
export function seedComponentId(seed: SeedSpec): string {
  const slug = seed.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `seed-${slug}`
}

/**
 * A fingerprint of the catalog as written here, stored beside the installed copy
 * so a load can tell whether this build's seeds differ from the ones on record.
 * It replaces the hand-bumped seed version: editing any seed's numbers, prose or
 * rarity, or adding or removing one, changes this by itself.
 *
 * FNV-1a over the specs — short, stable across runs, and not a security boundary.
 */
export const SEED_CATALOG_SIGNATURE: string = (() => {
  const source = JSON.stringify(SEEDS)
  let hash = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${SEEDS.length}-${hash.toString(36)}`
})()

/** Materializes the seed catalog with ids and timestamps. */
export function buildSeedComponents(
  makeId: (seed: SeedSpec) => string = seedComponentId,
  now = Date.now(),
): MaterialComponent[] {
  return SEEDS.map((seed) => ({
    ...seed,
    id: makeId(seed),
    isSeed: true,
    createdAt: now,
    updatedAt: now,
  }))
}
