import { useCallback, useEffect, useRef } from 'react'
import type { Application, Particle, ParticleContainer, Texture } from 'pixi.js'
import {
  BURST_SECONDS,
  EMBER_DARK,
  EMBER_LIGHT,
  EXIT_REACH,
  HOLD_SECONDS,
  JET_SPEED,
  PARTICLE_SECONDS,
  SAMPLE_STEP,
  TAIL_SPEED,
  currencyTone,
  emberColor,
  exitHeading,
  exitLength,
  exitPoint,
  gaussian,
  sampleTone,
  type EmberPalette,
  type Jet,
  type JetExit,
  type JetSample,
} from '../lib/fire'

/**
 * The fire, drawn. Everything about *what* burns is decided in `lib/fire.ts`;
 * this is the particle loop and nothing else.
 *
 * **Pixi is imported dynamically and not before the first casting.** The
 * renderer is several hundred kilobytes and only ever runs when a rite is
 * spoken in player mode. A static import would put it in the entry bundle for
 * every sandbox session that will never fire it. Vite splits the dynamic
 * import into its own chunk with no config.
 */

/**
 * The wisp texture is deliberately taller than it is wide. Its local up axis
 * becomes the ember's leading edge, so rotating it into its travel turns a
 * cloud of particles into a continuous, licking flame.
 */
const WISP_WIDTH = 42
const WISP_HEIGHT = 84

/** Shared scale keeps the ring and its exit streams in the same visual family. */
const WISP_SCALE = 2

/**
 * Enough for a whole ring alight at once, plus the burst, with room over. Far
 * larger than a comet trail needed, because the body below keeps every stretch
 * the flame has reached burning rather than letting it die behind the head.
 * The pool has to cover the hold, where the ring at full and every gout at full
 * are alight at the same time for three seconds rather than for an instant, and
 * a gout now spans four times the fan's own length at the ring's own density,
 * so its blobs are in the air for about a second each instead of a quarter of
 * one and there are twice as many of them. A five-currency rite at full is the
 * case to size this by: roughly 3000 on the ring and 5300 on the gouts.
 */
const MAX_EMBERS = 10000

/** Blobs a second at full heat at the flame front. */
const RING_RATE = 1400

/**
 * Blobs a second per sample of ring already alight. This is a density rather
 * than a rate: the wider the lit stretch, the more it takes to keep it burning,
 * so the whole ring holds an even brightness instead of thinning out as it
 * grows. Live count is roughly this times the lit samples times a lifetime.
 *
 * A thicker flame spreads the same count over more area, so this carries a
 * little of the widening: without it the band comes out mottled rather than
 * fat, since a blob twice as wide does not on its own fill twice the ring.
 */
const BODY_DENSITY = 27

/** The body burns a little under the front, so the head still reads as leading. */
const BODY_WEIGHT = 0.78

/** The closing lap is what the ring gave back, not what it delivered. */
const TAIL_RATE_SHARE = 0.3

/**
 * Blobs a second up one exit line, before its share of the manifestation.
 *
 * Exit embers live about three times as long as the ring's embers, so each
 * stream needs a lower birth rate to remain a secondary detail rather than
 * becoming the brightest part of the casting.
 */
const EXIT_RATE = 700

/** Exit flame stays present, but the circle remains the visual focus. */
const EXIT_WEIGHT = 0.65

/**
 * Stage units a second an ember climbs its exit line. Fast enough that the
 * average blob covers the whole of `EXIT_REACH` inside its life, so a gout is a
 * stream running off the screen rather than one that peters out short of it.
 */
const EXIT_SPEED = 165

/**
 * How long a blob on an exit line lives. Its own figure rather than the ring's
 * `PARTICLE_SECONDS`: an exit ember has a journey to finish now, where a ring
 * ember only has to cover the width of the band it was thrown into.
 */
const EXIT_SECONDS = 1.6

/** How fast a free ember loses its throw, per second. */
const DRAG = 0.12

/**
 * How far along the ring a blob scatters from where it was emitted, in samples,
 * before `shade` widens it. `SAMPLE_STEP` is 1.5 degrees, which is about one
 * stage unit at the flow radius, so this is roughly a unit of sigma per sample.
 * Multiplied by `0.3 + shade`, a core blob lands within a couple of units of the
 * head and an ember can be seven or eight behind or ahead of it.
 */
const LENGTHWISE_SIGMA = 3.2 / SAMPLE_STEP

/** The same scatter at a gout's root, as a share of the exit line's length. */
const EXIT_SIGMA = 0.16

/**
 * How far off its own line a blob sits at birth, in stage units. **The ring and
 * the gouts draw from this one function, which is what makes them the same
 * thickness.**
 *
 * A gout used to take its whole width from `drift * age`, which is nothing at
 * all at birth: every blob started exactly on the line, so a gout left the
 * mouth as a needle and only opened out once it was well clear of it. The ring
 * never looked like that, because it scatters a blob off the line the instant
 * it is emitted. Sharing the draw means the two meet at the mouth at the same
 * width, and a gout reads as the band carrying on rather than as a thread
 * pulled out of it. `drift` still opens a gout further with distance on top.
 */
function bandSpread(shade: number): number {
  return gaussian() * (0.45 + 2.3 * shade)
}

/**
 * How much wider than the ring band a gout runs, and how much bigger its blobs
 * are. **Matching the band's numbers exactly did not produce a matching flame**,
 * because the band's width is not only its emission spread: a ring blob is also
 * thrown outward at `out` and carried clear over its whole life, where an exit
 * blob is pinned to its line and only leaves it by `drift`. Reusing the spread
 * alone therefore reproduced about half the width. This is the difference, as
 * one number rather than as a second set of coefficients.
 */
const EXIT_WIDTH = 1.8

/**
 * How far up its own line a gout takes to open from the band's width to
 * `EXIT_WIDTH`, as a share of that line's length.
 *
 * **The extra width is earned over distance rather than granted at the mouth.**
 * `EXIT_WIDTH` applied at birth put a gout's whole spread on the origin, which
 * is a point on the flow ring: the root sigma runs to seven stage units, so half
 * of that flame sat off the line on the normal pointing back into the circle,
 * and the fan read as starting a few units short of slot VIII rather than at it.
 * A ring blob does not get its width that way either. It leaves the line at the
 * band's own spread and is carried clear by `out` over its life, which is the
 * distance this ramp stands in for.
 *
 * A third of the line is long enough that the widening is not a visible flare
 * and short enough that a gout is at full width well before the fan's tip.
 */
const EXIT_FLARE = 0.35

/**
 * How wide a gout runs at `u`, as a multiple of the ring band's spread. One at
 * the mouth, where the gout is the band carrying on, `EXIT_WIDTH` from
 * `EXIT_FLARE` on.
 */
function exitWidth(u: number): number {
  return 1 + (EXIT_WIDTH - 1) * Math.min(1, u / EXIT_FLARE)
}

interface Firing {
  /** Rises with every casting, so two identical rites still burn twice. */
  nonce: number
  jet: Jet
}

interface Ember {
  particle: Particle
  live: boolean
  age: number
  life: number
  x: number
  y: number
  vx: number
  vy: number
  size: number
  fade: number
  /** Set where this ember is climbing an exit line rather than flying free. */
  exit: JetExit | null
  u: number
  du: number
  /** How far off the line it sits at birth, so a gout has width at its root. */
  root: number
  /**
   * How fast it leaves the line on top of that, so a gout spreads as it goes.
   * Signed. The direction is not stored: it is the normal of the line's own
   * heading where the blob currently is, read fresh each frame. See the loop.
   */
  drift: number
}

/**
 * One soft, asymmetric wisp, drawn once. The tapered silhouette removes the
 * visible circular boundary from each particle; overlapping wisps then join
 * into a flame without a filter or another rendering dependency.
 */
function blobCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WISP_WIDTH
  canvas.height = WISP_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) return canvas
  const middle = WISP_WIDTH / 2

  // The pointed end is at local up. `frame` rotates it in the direction of
  // travel, leaving a broad, smoky tail behind each bright lick.
  context.beginPath()
  context.moveTo(middle, 2)
  context.bezierCurveTo(middle + 5, 15, WISP_WIDTH - 2, 31, WISP_WIDTH - 7, 58)
  context.bezierCurveTo(WISP_WIDTH - 10, 77, middle + 8, 92, middle, WISP_HEIGHT - 1)
  context.bezierCurveTo(middle - 11, 89, 3, 76, 6, 57)
  context.bezierCurveTo(9, 33, middle - 6, 16, middle, 2)
  context.closePath()
  context.clip()

  // Keep the hot part compact. A wide radial glow turns a dense line of
  // particles into a soft ribbon before the pointed silhouette can read.
  const glow = context.createRadialGradient(middle, 57, 1, middle, 57, 24)
  glow.addColorStop(0, 'rgba(255, 255, 255, 1)')
  glow.addColorStop(0.2, 'rgba(255, 255, 255, 0.9)')
  glow.addColorStop(0.48, 'rgba(255, 255, 255, 0.36)')
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = glow
  context.fillRect(0, 0, WISP_WIDTH, WISP_HEIGHT)

  // The faint upper tongue joins the bright base to the point, but never
  // becomes the wide, foggy tail that made the motion read as cloth.
  const tongue = context.createLinearGradient(middle, 8, middle, 70)
  tongue.addColorStop(0, 'rgba(255, 255, 255, 0)')
  tongue.addColorStop(0.42, 'rgba(255, 255, 255, 0.14)')
  tongue.addColorStop(0.82, 'rgba(255, 255, 255, 0.34)')
  tongue.addColorStop(1, 'rgba(255, 255, 255, 0)')
  context.fillStyle = tongue
  context.fillRect(0, 0, WISP_WIDTH, WISP_HEIGHT)
  return canvas
}

/** Pixi's `Particle`, handed in so the stage can mint one without a second import. */
type ParticleClass = new (options: { texture: Texture; anchorX: number; anchorY: number }) => Particle

class FireStage {
  private readonly app: Application
  private readonly layer: ParticleContainer
  private readonly texture: Texture
  private readonly Particle: ParticleClass
  /** The circle itself: what the 100-unit box is laid over. See `fitStage`. */
  private readonly frameBox: HTMLElement
  private readonly embers: Ember[] = []
  /**
   * Dead embers, ready to be lit again. An explicit free list rather than a scan
   * for the first `live: false`: a whole ring alight is thousands of embers and
   * several thousand births a second, and a scan over a nearly full pool is
   * quadratic enough to show up as dropped frames.
   */
  private readonly free: Ember[] = []
  /** Re-read on every casting, so switching the desk's light mid-session lands. */
  private palette: EmberPalette = EMBER_LIGHT

  private jet: Jet | null = null
  private elapsed = 0
  private runSeconds = 0
  private tailSeconds = 0
  private head = 0
  private tailHead = 0
  private budget = 0
  private bodyBudget = 0
  private tailBudget = 0
  private tailBodyBudget = 0
  private exitBudget: number[] = []
  private settled = false
  private unit = 0
  private left = 0
  private top = 0

  constructor(
    app: Application,
    layer: ParticleContainer,
    texture: Texture,
    particle: ParticleClass,
    frameBox: HTMLElement,
  ) {
    this.app = app
    this.layer = layer
    this.texture = texture
    this.Particle = particle
    this.frameBox = frameBox
    this.app.ticker.add(this.frame)
  }

  /**
   * The stage draws in the same 100-unit box `circle__engraving` does, so every
   * number reaching it is a number out of `lib/circleFlow.ts`.
   *
   * **The canvas is the viewport and the box is the circle**, so this both
   * scales and places: the box's origin goes wherever the circle's top-left
   * corner currently is. The canvas is `position: fixed`, so its own coordinates
   * are viewport coordinates and a client rect needs no correction. Nothing here
   * depends on the canvas being any particular size — a wider desk is simply
   * more room for the gouts to run into.
   *
   * Re-read each frame rather than hooked to a resize event: it is three float
   * compares, the ticker only runs while something is burning, and the circle
   * can move without the window resizing — a rail scrolling, or the alert
   * appearing, shifts it.
   */
  private fitStage() {
    const box = this.frameBox.getBoundingClientRect()
    const unit = box.width / 100
    if (unit === this.unit && box.left === this.left && box.top === this.top) return
    this.unit = unit
    this.left = box.left
    this.top = box.top
    this.app.stage.scale.set(unit)
    this.app.stage.position.set(box.left, box.top)
  }

  private take(): Ember | null {
    const spare = this.free.pop()
    if (spare) return spare
    if (this.embers.length >= MAX_EMBERS) return null
    const particle = new this.Particle({ texture: this.texture, anchorX: 0.5, anchorY: 0.5 })
    const ember: Ember = {
      particle,
      live: false,
      age: 0,
      life: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 0,
      fade: 0,
      exit: null,
      u: 0,
      du: 0,
      root: 0,
      drift: 0,
    }
    this.embers.push(ember)
    this.layer.addParticle(particle)
    return ember
  }

  private retire(ember: Ember) {
    if (!ember.live) return
    ember.live = false
    ember.particle.alpha = 0
    this.free.push(ember)
  }

  /**
   * One blob thrown off the ring somewhere near sample index `at`, licking
   * outward as it dies.
   *
   * **`shade` is the whole shape of the flame.** It runs 0 at the core to 1 at
   * the ember, and everything else is read off it: a core blob is small, dense,
   * tight to the line the current runs on and close to where the head actually
   * is, an ember blob is broad, faint, flung wide and smeared far along the
   * ring. Rolling size and colour independently gave a rope of discrete
   * coloured discs. The structure is what makes it fire.
   *
   * **The lengthwise scatter is what softens the colour changes.** A blob reads
   * its hue from wherever it lands, not from where it was emitted, so the
   * boundary between a stretch carrying mass and the next carrying heat comes
   * out as the two colours interleaving over several units rather than as a
   * seam. Confining every blob to the arc the head swept this frame put hard
   * edges at each slot.
   */
  private lightRing(path: JetSample[], at: number, weight: number) {
    const shade = Math.random()
    const along = at + gaussian() * LENGTHWISE_SIGMA * (0.3 + shade)
    // Resolved before an ember is taken: an early return after `take` would drop
    // one off the free list without ever lighting it, and leak it for good.
    const sample = path[Math.min(path.length - 1, Math.max(0, Math.round(along)))]
    if (!sample) return

    const ember = this.take()
    if (!ember) return

    // The ring's outward normal. Tangent is (-sin, cos), so this is (cos, sin).
    const nx = sample.ty
    const ny = -sample.tx
    // **The three widths move together.** How far off the line a blob sits, how
    // hard it is thrown clear, and how big it is are one decision: widening the
    // scatter alone thins the band into haze, and growing the blobs alone gives
    // a fat rope with a hard edge. All three at once is what reads as a thicker
    // flame rather than a bigger one.
    const spread = bandSpread(shade)
    // The flame traces the ring, but each tongue rises away from it. Moving
    // mostly along the tangent joined the long wisps into a scarf; a small
    // forward carry keeps the cast progressing while the stronger outward
    // throw gives it a visible flame direction.
    const carry = 6 + Math.random() * 14
    const out = (12 + 28 * shade * Math.random()) * (Math.random() < 0.92 ? 1 : -0.2)

    ember.live = true
    ember.age = 0
    ember.life = PARTICLE_SECONDS * (0.5 + shade * 0.9)
    ember.x = sample.x + nx * spread
    ember.y = sample.y + ny * spread
    ember.vx = sample.tx * carry + nx * out
    ember.vy = sample.ty * carry + ny * out
    ember.size = (0.55 + 1.35 * sample.heat) * (0.55 + 1.25 * shade) * weight
    ember.fade = this.palette.alpha * (0.3 + 0.7 * sample.heat) * (1 - 0.5 * shade) * weight
    ember.exit = null

    ember.particle.tint = emberColor(this.palette, sampleTone(sample, shade), shade)
    ember.particle.alpha = ember.fade
  }

  /**
   * One blob climbing an exit line, in one colour out of that currency's own
   * palette — `currencyTone` rather than `exit.hue`, so a gout has the depth the
   * ring has instead of being the fan's flat stroke made of particles. Scattered
   * along the line at birth for the same reason the ring's are, so a gout leaves
   * the mouth as a stream rather than as a pulse of blobs all starting together.
   * `weight` is the douse, so a gout dims with the ring instead of stopping dead.
   */
  private lightExit(exit: JetExit, share: number, weight: number) {
    const ember = this.take()
    if (!ember) return

    const shade = Math.random()
    ember.live = true
    ember.age = 0
    ember.life = EXIT_SECONDS * (0.7 + shade * 0.6)
    ember.exit = exit
    ember.u = Math.min(0.9, Math.abs(gaussian()) * EXIT_SIGMA)
    ember.du = (EXIT_SPEED * (0.75 + Math.random() * 0.6)) / exitLength(exit)
    // The gout's width at the root, off the same draw the ring band uses, and
    // its size and fade off the ring's own expressions with `share` standing in
    // for `heat`. A gout is the same flame, so it is drawn to the same numbers.
    ember.root = bandSpread(shade)
    ember.drift = gaussian() * 7 * shade
    ember.size = (0.55 + 1.35 * share) * (0.55 + 1.25 * shade) * 1.1
    ember.fade =
      this.palette.alpha * (0.3 + 0.7 * share) * (1 - 0.5 * shade) * weight * EXIT_WEIGHT

    ember.particle.tint = emberColor(this.palette, currencyTone(exit.currency, shade), shade)
    ember.particle.alpha = ember.fade
  }

  /**
   * Emits `count` blobs over the stretch the head covered this frame, rather
   * than all of them at the head. A frame at 60Hz moves the head five degrees,
   * and five degrees of unlit ring between clumps reads as stutter. Each blob
   * then scatters further along the ring from there, in `lightRing`.
   */
  private emitAlong(path: JetSample[], from: number, to: number, count: number, weight: number) {
    for (let i = 0; i < count; i++) {
      this.lightRing(path, from + ((to - from) * (i + Math.random())) / count, weight)
    }
  }

  private frame = () => {
    const dt = Math.min(0.05, this.app.ticker.deltaMS / 1000)
    this.fitStage()

    const jet = this.jet
    if (jet) {
      this.elapsed += dt

      // Everything past the ring starts the instant the head lands at slot VIII.
      const after = this.elapsed - this.runSeconds

      /**
       * How hard what is already alight still burns. It holds at full while the
       * figure is still growing — the closing lap is the last of the route to
       * be traced — and for `HOLD_SECONDS` past that, then falls away across
       * the burst, so the ring gutters out rather than being switched off.
       */
      const spent = after - this.tailSeconds - HOLD_SECONDS
      const douse = spent <= 0 ? 1 : Math.max(0, 1 - spent / BURST_SECONDS)

      // The ring, from the first reagent round to slot VIII.
      const progress = this.runSeconds > 0 ? Math.min(1, this.elapsed / this.runSeconds) : 1
      const target = progress * (jet.path.length - 1)
      const tip = jet.path[Math.min(jet.path.length - 1, Math.round(target))]
      if (tip && this.elapsed <= this.runSeconds + dt) {
        this.budget += dt * RING_RATE * (0.25 + 0.75 * tip.heat)
        const count = Math.floor(this.budget)
        this.budget -= count
        this.emitAlong(jet.path, this.head, target, count, 1)
      }
      this.head = target

      // **What the flame has already reached goes on burning.** The front above
      // only ever lights the arc it crossed this frame, so on its own it draws a
      // comet: the start of the ring goes dark a particle's lifetime after the
      // head leaves it. This re-lights the whole lit stretch every frame, at a
      // rate proportional to how much of it there is, so slot I is still alight
      // when the head reaches slot VIII. The travel is then read from the ring
      // lighting up in order, not from a moving gap.
      if (douse > 0) {
        this.bodyBudget += dt * BODY_DENSITY * (target + 1) * douse
        const count = Math.floor(this.bodyBudget)
        this.bodyBudget -= count
        this.emitAlong(jet.path, 0, target, count, BODY_WEIGHT * douse)
      }

      if (after >= 0) {
        const maxAmount = Math.max(1, ...jet.exits.map((exit) => exit.amount))
        // The gouts leave for as long as the ring behind them burns, and thin
        // out on the same curve. Cutting them at a fixed span instead left the
        // mouth dry while the ring was still lit through the hold.
        jet.exits.forEach((exit, index) => {
          if (douse <= 0) return
          const share = exit.amount / maxAmount
          this.exitBudget[index] =
            (this.exitBudget[index] ?? 0) + dt * EXIT_RATE * (0.35 + 0.65 * share) * douse
          while (this.exitBudget[index] >= 1) {
            this.exitBudget[index] -= 1
            this.lightExit(exit, share, douse)
          }
        })

        if (jet.tail.length > 0) {
          const tailProgress = Math.min(1, after / this.tailSeconds)
          const tailTarget = tailProgress * (jet.tail.length - 1)
          const tailTip = jet.tail[Math.min(jet.tail.length - 1, Math.round(tailTarget))]
          if (tailTip && after <= this.tailSeconds) {
            this.tailBudget += dt * RING_RATE * TAIL_RATE_SHARE * (0.25 + 0.75 * tailTip.heat)
            const count = Math.floor(this.tailBudget)
            this.tailBudget -= count
            this.emitAlong(jet.tail, this.tailHead, tailTarget, count, 0.55)
            this.tailHead = tailTarget
          }
          // The closing lap stays lit on the same terms the ring does.
          if (douse > 0) {
            this.tailBodyBudget +=
              dt * BODY_DENSITY * TAIL_RATE_SHARE * (this.tailHead + 1) * douse
            const count = Math.floor(this.tailBodyBudget)
            this.tailBodyBudget -= count
            this.emitAlong(jet.tail, 0, this.tailHead, count, BODY_WEIGHT * 0.55 * douse)
          }
        }
      }

      // Everything is emitted off `douse`, so once the burst has run there is
      // nothing left to light and only the last embers have to die.
      if (spent > BURST_SECONDS) this.jet = null
    }

    let live = 0
    for (const ember of this.embers) {
      if (!ember.live) continue
      ember.age += dt
      if (ember.age >= ember.life) {
        this.retire(ember)
        continue
      }

      const k = ember.age / ember.life
      let fade = 1 - k

      if (ember.exit) {
        ember.u += ember.du * dt
        if (ember.u >= EXIT_REACH) {
          this.retire(ember)
          continue
        }
        const point = exitPoint(ember.exit, ember.u)
        // **Across the line as it runs, not as it left.** A fan line turns
        // between 20 and 100 degrees from the tangent it departs on, so a normal
        // frozen at birth ends up pointing most of the way back down the line:
        // at the middle of the fan it is 87% backwards, at the outer edge 98%.
        // The offset reaches fifteen units, so what was meant to be a blob's
        // width was dragging it that far back along its own path instead, and
        // the whole gout sat below the mouth it was supposed to leave from.
        // Clamped at 1 because past the tip the route runs straight on the
        // heading it finished with, which is what `exitPoint` does there too.
        const heading = exitHeading(ember.exit, Math.min(1, ember.u))
        const off = ember.root * exitWidth(ember.u) + ember.drift * ember.age
        ember.x = point.x - heading.y * off
        ember.y = point.y + heading.x * off
        // Thins as it goes without ever reaching nothing. The fan's own strokes
        // fade out at the tip; the fire runs on past there, and a gout that had
        // already faded to nothing by the tip would never make the screen's
        // edge. What ends it is the ember's own life, out of sight.
        fade *= 1 - 0.55 * Math.min(1, ember.u / EXIT_REACH)
      } else {
        ember.x += ember.vx * dt
        ember.y += ember.vy * dt
        const damp = Math.pow(DRAG, dt)
        ember.vx *= damp
        ember.vy *= damp
      }

      // The longer tail develops as an ember ages. The tapered texture and its
      // travel-facing rotation let adjacent particles merge into wisps instead
      // of showing up as a procession of circles.
      const scale = (ember.size / WISP_WIDTH) * WISP_SCALE
      const direction = ember.exit
        ? exitHeading(ember.exit, Math.min(1, ember.u))
        : { x: ember.vx, y: ember.vy }
      ember.particle.x = ember.x
      ember.particle.y = ember.y
      ember.particle.scaleX = scale * (0.62 + 0.16 * k)
      ember.particle.scaleY = scale * (0.9 + 0.8 * k)
      ember.particle.rotation =
        Math.atan2(direction.y, direction.x) + Math.PI / 2 + Math.sin(ember.age * 16 + ember.drift) * 0.045 * k
      ember.particle.alpha = ember.fade * fade
      live += 1
    }

    // Nothing left to draw. One more frame lands the cleared particles on the
    // canvas, then the ticker stops and an idle bench costs no frames at all.
    if (!this.jet && live === 0) {
      if (this.settled) this.app.stop()
      this.settled = true
    }
  }

  run(jet: Jet, palette: EmberPalette) {
    this.palette = palette
    this.layer.blendMode = palette.blend
    this.jet = jet
    this.elapsed = 0
    this.head = 0
    this.tailHead = 0
    this.budget = 0
    this.bodyBudget = 0
    this.tailBudget = 0
    this.tailBodyBudget = 0
    this.exitBudget = jet.exits.map(() => 0)
    this.settled = false

    // Constant angular speed, so a ring the current crosses in full genuinely
    // takes longer to burn through than one it only reaches late.
    this.runSeconds = ((jet.path.length - 1) * SAMPLE_STEP) / JET_SPEED
    this.tailSeconds = Math.max(0.01, ((jet.tail.length - 1) * SAMPLE_STEP) / TAIL_SPEED)

    this.app.resize()
    this.fitStage()
    this.app.start()
  }

  /**
   * A bench that can no longer cast must not keep showing the previous
   * caster's rite. Keep the renderer warm for a later eligible casting, but
   * clear the transient event and stop spending frames immediately.
   */
  stop() {
    this.jet = null
    for (const ember of this.embers) this.retire(ember)
    this.settled = true
    this.app.stop()
  }

  destroy() {
    this.app.ticker.remove(this.frame)
    this.app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true })
  }
}

async function createStage(host: HTMLDivElement, frameBox: HTMLElement): Promise<FireStage> {
  const { Application, CanvasSource, Particle, ParticleContainer, Rectangle, Texture } = await import(
    'pixi.js'
  )

  const app = new Application()
  await app.init({
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio,
    resizeTo: host,
    // Started per casting; an idle bench runs no frames.
    autoStart: false,
  })
  host.appendChild(app.canvas)

  const texture = new Texture({ source: new CanvasSource({ resource: blobCanvas() }) })
  const layer = new ParticleContainer({
    texture,
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true },
    // A ParticleContainer reports empty bounds unless told otherwise, and is
    // then culled as invisible. Far larger than the 100-unit box: the gouts run
    // out to `EXIT_REACH` past the fan, which on a small circle is several
    // hundred units from the middle. Bounds that stop at the circle cull the
    // whole layer the moment a blob leaves them.
    boundsArea: new Rectangle(-600, -600, 1400, 1400),
  })
  app.stage.addChild(layer)

  return new FireStage(app, layer, texture, Particle, frameBox)
}

/** Which palette the desk is lit by, read fresh so a theme change is picked up. */
function currentPalette(): EmberPalette {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? EMBER_DARK : EMBER_LIGHT
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface CircleFireProps {
  firing: Firing | null
  /**
   * Whether this bench could be cast from at all. The renderer is built the
   * moment it could be wanted rather than on the press itself, so the first
   * casting of a session burns as promptly as the second.
   */
  armed: boolean
}

/**
 * A rite being spoken, burning along the current's own route. Builds nothing
 * until a casting is possible, and nothing ever under reduced motion.
 */
export function CircleFire({ firing, armed }: CircleFireProps) {
  const host = useRef<HTMLDivElement>(null)
  const stage = useRef<FireStage | null>(null)
  const booting = useRef<Promise<FireStage | null> | null>(null)
  const teardown = useRef<number | null>(null)
  /** A cast is an event, not state to replay when a bench becomes armed again. */
  const handledNonce = useRef<number | null>(null)

  /**
   * **Teardown is deferred a tick, and a remount cancels it.** StrictMode
   * mounts, unmounts and mounts again synchronously, so a flag set in cleanup
   * and never cleared leaves the whole thing permanently disposed, which is
   * exactly what happened here first: every boot destroyed itself on arrival
   * and no canvas ever appeared. Building a renderer twice for that is also
   * not worth it, so the timeout is cancelled rather than the flag reset.
   */
  useEffect(() => {
    if (teardown.current !== null) {
      clearTimeout(teardown.current)
      teardown.current = null
    }
    return () => {
      teardown.current = window.setTimeout(() => {
        teardown.current = null
        const pending = booting.current
        booting.current = null
        stage.current = null
        void Promise.resolve(pending).then((built) => built?.destroy())
      }, 0)
    }
  }, [])

  /**
   * The same `inFlight` discipline `firestoreRepository` uses: `app.init` is
   * async, so a casting arriving mid-boot waits on the boot already running
   * rather than starting a second renderer.
   */
  const ensure = useCallback((): Promise<FireStage | null> => {
    if (stage.current) return Promise.resolve(stage.current)
    const element = host.current
    // The canvas covers the viewport, so the circle it draws over has to be
    // named separately. It is this element's own parent: `.circle` is where
    // `SpellCircle` renders the fire, and the 100-unit box is that square.
    const frameBox = element?.parentElement
    if (!element || !frameBox) return Promise.resolve(null)
    booting.current ??= createStage(element, frameBox)
      .then((created) => {
        stage.current = created
        return created
      })
      // A browser with no WebGL at all still has a working bench. The fire is
      // the one thing here that may simply not happen.
      .catch(() => {
        booting.current = null
        return null
      })
    return booting.current
  }, [])

  useEffect(() => {
    // The whole answer to reduced motion: Pixi is never even fetched.
    if (!armed || reducedMotion()) return
    void ensure()
  }, [armed, ensure])

  useEffect(() => {
    if (!armed || !firing || reducedMotion() || handledNonce.current === firing.nonce) return
    // Mark this cast before the asynchronous renderer boot begins. If the
    // player leaves this bench before it arrives, the rite is not replayed on
    // whichever bench is armed next.
    handledNonce.current = firing.nonce
    let cancelled = false
    void ensure().then((ready) => {
      // Torn down while the renderer was building. Nothing left to burn on.
      if (cancelled || !ready || stage.current !== ready) return
      ready.run(firing.jet, currentPalette())
    })
    return () => {
      cancelled = true
    }
  }, [armed, ensure, firing])

  useEffect(() => {
    if (!armed) stage.current?.stop()
  }, [armed])

  return <div ref={host} className="circle__fire" aria-hidden="true" />
}
