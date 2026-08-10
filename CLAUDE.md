# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Greatforge is a worldbuilding app (React 19 + TypeScript + Vite, Firebase behind a repository seam). The shipped module is a **spell workshop**; a conlang module is planned and should reuse the same storage seam.

`README.md` is still the untouched Vite template — ignore it.

## Commands

```
npm run dev        # Vite dev server on :5173
npm run emulators  # Firebase auth (:9099) + Firestore (:8080) + UI (:4000)
npm run build      # tsc -b && vite build — this is the typecheck
npm run lint       # eslint .
```

There is **no test runner and no test files**. `npm run build` plus `npm run lint` are the only automated checks; behavioural changes to the reaction resolver are verified by driving the app in a browser, or by a throwaway Node script in the scratchpad that imports `lib/reaction.ts` logic. Nothing on this machine runs TypeScript directly — compile such a script out of the tree with `npx tsc <file>.ts --ignoreConfig --outDir <scratch> --module commonjs --target es2022 --moduleResolution node --skipLibCheck --ignoreDeprecations 6.0` and run the emitted `.js` under node.

Setup: copy `.env.example` to `.env.local`. `VITE_USE_FIREBASE_EMULATOR=true` points auth and Firestore at the local emulator suite; the real `greatforge` project's config goes in the same file with the flag off. `.env.local` is gitignored.

## Architecture

Four layers, strictly one-directional (`types` ← `data`/`lib` ← `state` ← `components`):

- **`src/types/worldbuilding.ts`** — the domain. Currencies, `Ledger`, `MaterialComponent`, `Spell`, the ring constants (`RING_SLOT_COUNT`, the three `TRANSIT_LOSS_*` values, and the numbers the forms are tuned by: `BEND_TOLL`, `TRANSIT_FUSED`, `PRAYER_WALKING_SHARE`, `WARD_HOLD_RATE`, `DIRGE_KEPT_SHARE`, `DIRGE_SUBSTITUTION_RATE`, `MAX_LEDGER_ENTRY`), and the normalizers. No React, no storage.
- **`src/data/currencies.ts`** — currency metadata (labels, hues, prose for vent/toll), the seven `LAWS`, and `describeRole` / `isRelay` / `isInert`. **Roles are derived from the ledgers, never stored**, so an edited component is re-labelled the moment its numbers change.
- **`src/lib/reaction.ts`** — `computeReaction`, the pure resolver. Walks the eight slots clockwise from slot I, closes the ring, and returns `manifestation` / `toll` / `bled` plus per-slot reports and the transfer arcs the circle draws.
- **`src/lib/repository.ts`** — `WorkshopRepository`, the storage seam. `firestoreRepository.ts` is the only implementation; `WorkshopProvider` takes one as an overridable prop.
- **`src/state/`** — two contexts. `WorkshopProvider` owns components, spells, the unsaved `draft` spell, and derives `placements`/`reaction` via `useMemo`. `DragProvider` implements pointer-based dragging (native HTML5 drag was rejected — its drag image lags the cursor).
- **`src/components/`** — presentational; all state comes from `useWorkshop()` / `useDrag()` / `useAuth()`.

`App.tsx` gates the whole workshop behind Google sign-in and keys `WorkshopProvider` by `user.uid` so switching accounts remounts rather than leaking the previous codex.

### The magic system is load-bearing

It is a hard magic system: `computeReaction` is authoritative about what a spell does, and the `LAWS` array in `data/currencies.ts` is rendered in the UI as the player-facing statement of exactly what the resolver does. **Changing a resolver rule means editing `LAWS` in the same change**, or the app is lying to the user.

Three rules that look arbitrary and are not — each was derived, and reverting one silently breaks balance:

- **Transit loss is charged once per currency per crossing**, not once per parcel (see `crossInto`). Per-parcel charging makes any partial draw evaporate twice as fast, which makes relays strictly worse than gaps.
- **A relay's demand is a rating, not a requirement** — an underfed relay carries less and never bills the caster. Combined with the free crossing (`TRANSIT_LOSS_RELAY = 0`), this is the only thing that makes a same-currency pass-through worth a slot at all.
- **A circle admits each material once** (law 5's first clause) — `placeComponent` lifts a stone from any slot it already occupies. With repeats allowed the optimal ring for every objective is eight copies of one source. Note that law 5's *second* clause, that a stone is asked only once, is bent by the litany, and only by the litany.

The catalog in `data/seedComponents.ts` is tuned against these numbers: every currency circulates in a 4–9 band, because transit costs roughly 8 units of each currency per lap regardless of flow size, so small flows are erased outright. Retuning a seed's ledgers without re-checking the frontier is how a currency goes dead.

### Spell forms are a resolver input

`Spell.form` is not a label. `computeReaction(placements, form)` resolves the same stones differently under each of the seven, and `data/spellForms.ts` is where both halves live: the prose the UI renders and the knobs the resolver reads, deliberately in one file so they cannot drift.

A form carries exactly one piece of prose: `rule`, the mechanical statement rendered in the reaction panel beside the numbers it produced. Currencies, slots and rates in plain sentences, no atmosphere and no em dashes. There is deliberately no in-world gloss and no "what it's for" blurb — both existed and both were cut. The picker in the spellbook shows the bare label, and the law a form bends is conveyed by highlighting it in the laws list in the reaction panel rather than by restating it under the picker.

**The invariant is that the `LAWS` describe a circle nobody casts, and every one of the seven forms is that circle with exactly one law bent** — that is what keeps seven options learnable, and it is enforced by construction: each entry in `FORM_META` spreads the `PLAIN` baseline and overrides a single knob. A form that turns two knobs is a bug in the design, not just the code. Each entry names the law it bends in `bends`, matched against `LAWS` titles by string, so renaming a law means editing both files.

**There is deliberately no obedient form.** The prayer used to be one, and a form that bends nothing is free, so it was the right answer on every ring whose bend went untested — which is most rings. `PLAIN` is now a baseline nobody can cast, and every form pays `BEND_TOLL`.

| form | knob | what it does |
| --- | --- | --- |
| prayer | `answer: 'closing'` | a stone gives one part in three (`PRAYER_WALKING_SHARE`) where it stands and the ring holds the rest back until it closes, when all of it is given having crossed nothing; the walk therefore runs on a third of the current, and most demands go unmet and are billed |
| elegy | `reach: 'neighbour'` | a stone draws only from the one behind it; undrawn current leaves the ring where it stands, paying a gap's worth of transit on the way out, and the ring never closes |
| litany | `laps: 2` | the ring is walked twice and every stone demands and gives its whole measure again on the second lap, better fed than on the first; the lap is charged at the ordinary rate, which is eight of every currency in flight |
| dirge | `shortfall: 'substituted'` | at the close, surplus still in the ring covers unmet demand at **two units for one**, keeping a third of what it holds back (`DIRGE_KEPT_SHARE`) so it always makes something; everything left is billed to the caster as normal |
| invocation | `transit: 'named'` | the currency the ring yields most of crosses at half loss; everything else crosses stones as usual and pays **double at gaps**, so an invocation is free on a closed ring and ruinous on a holed one |
| ward | `gaps: 'sealed'` | open slots leak nothing and dim nothing, and completion is 1 at any stone count; what the holes would have taken is bought out of the caster at `WARD_HOLD_RATE` (2) for one |
| benediction | `transit: 'fused'` | the current crosses as one stream: `TRANSIT_FUSED` (2) units in total per stone rather than one of every currency in flight, four at a gap, taken off whichever currency is largest |

**No form may waive the toll.** Law 6's last clause is the one thing that is stated and then never bent — a form may change what counts as the ring being *unable* to supply (the dirge does), but whatever shortfall survives that is charged in full. An earlier dirge exempted the caster outright and was far too strong; the rule now is that the toll is only ever *reduced*, and always at a price paid out of the manifestation. If a new form needs a toll exemption to be worth picking, the form is wrong, not the law.

The dirge's 2:1 rate is load-bearing: it is what stops toll relief from simply being the best thing on the board to buy. Bought out of the manifestation at two for one, it earns its slot on the one thing nothing else in the book can do at all — cover a demand in a currency nothing upstream produces.

**The prayer, litany and benediction were reworked in August 2026**, and each of the three numbers below was chosen off the win-region map rather than by taste. None of them is free:

- **Prayer, `PRAYER_WALKING_SHARE = 3`.** Transit is the largest cost in the system, so a form that skips it is powerful and the fraction is the whole tuning. Holding *everything* back — the walk raises nothing, every demand strands — beat every other form on nearly every ring at every price. Holding *half* back landed on the elegy's aggregate numbers almost exactly, and two forms with the same numbers are one form with two names. A third walking gives the prayer wide rings and rings whose stones do not feed each other, and gives up chains entirely.
- **Litany, second lap at the ordinary rate.** Halving the second saying's two ledgers killed the form outright, and so did charging the lap double: a lap costs eight of every currency in flight, which is more than eight stones can raise. It is priced instead by the toll, which roughly doubles, and by the first lap's output having to survive a second lap of transit.
- **Benediction, `TRANSIT_FUSED = 2`.** A crossing costs two units in total rather than one of each currency in flight, so the form is a loss at one currency, a wash at two and a large saving at four or five. At 3 it was dead on every ring the catalog can build. Taking the loss off the *largest* stream is the other half of it, and it is the only answer in the book to the catalog's small flows being erased before they reach the mouth.

Note the pairing that produces: the **invocation** makes one currency cheap and the rest dear, so it wants a *closed* ring; the **benediction** flattens the difference between currencies, so it wants a *wide* one. They bend the same law from opposite ends.

**The remaining four were balanced in the pass immediately after, and three of them moved.** The elegy did not: it came out owning the middle of the board on its own numbers and was left alone.

- **Ward, `WARD_HOLD_RATE = 2`, and the price made proportional.** It used to be billed as the current crossed, against whatever happened to be in flight at that moment, which made it nearly free on exactly the rings it is best on: put two stones in slots VII and VIII and the six gaps in front of them are crossed before anything has been released, so nothing is charged and the ring still delivers four times what any other form gets off it. It owned 39 cells of 84 and every sparse cell up to `w = 1`. Billing it at the close against what the holes would have taken cannot be dodged by where the stones stand; at par it was still worth taking below `w = 1` (50 cells), and at two for one it settles into the region it should have had all along, which is raw output on a holed ring and nothing whatever above `w = 0.5`.
- **Invocation, the penalty confined to gaps.** Doubling *every* crossing costs each unnamed currency eight a lap, which is exactly what naming saves on the named one, so the form was a loss at two currencies and a rout at three: it owned nothing, at any width, at any price, and never had. Charged only at gaps, the bargain is about the shape of the ring rather than its width, which makes it the ward's exact opposite. It now takes 57% of full rings at `w = 2`.
- **Dirge, `DIRGE_KEPT_SHARE = 3`.** It used to spend everything it held, which on a catalog where nearly every ring starves somewhere meant an average manifestation of 1.4 against 20 for every other form. Keeping a third back makes it a form that trades rather than one that empties. The 2:1 rate did not move, and that is load-bearing: at par the dirge takes the whole `w = 2` column and pushes the invocation and the benediction off the map entirely.

**The dirge substitutes once, at the close, and never during the walk.** Taking current out of flight at a starved stone robbed the stones behind it, so covering one shortfall opened another and the dirge could come out with a *higher* toll than a prayer on the same ring — the one thing its rule promises cannot happen. Held to the close it can only spend what would otherwise have reached the mouth, which is the trade the form is supposed to offer. It will still never make a large spell — high-manifestation rings are shortfall-heavy, and the dirge spends the manifestation to spare the caster — but with a third of the ring kept back it always makes *something*, which is the difference between a trade and a refusal.

**Speaking is charged.** Every form costs the caster `BEND_TOLL` (1) of each currency the ring raised, whether or not the law it bends was one this circle needed bent — see law 7, which states it. It is uniform across the seven, so it never decides between them; it exists so that no form is ever free. It used to exempt the prayer, and that exemption is exactly what made the prayer a baseline rather than a choice.

**The ward is the only form that touches `completion`,** and that is deliberate. It is also where the form's entire price comes from: `completion` is forced to 1 and the difference against what the ring would otherwise have delivered is billed to the caster at two for one, in the same loop. An earlier benediction also zeroed the spill, which made it a strict superset of the ward. Nothing may seal gaps but the ward — the sparse ring is the ward's and nothing else's. It is also why a prayer's held-back measure is *not* exempt from the spill: it is standing in the ring when the ring is counted, so a sparse prayer leaks it like anything else.

One thing worth knowing before touching `reaction.ts`: `toll` is accumulated during the walk as well as summed from shortfalls at the end, because a ward bills for its gaps as the current crosses them. Everything in `SlotReport.received` now comes out of the ring under every form, which was not true before — the old benediction fed its slots out of the caster, and any accounting that treated `received` as drawn from the circle had to special-case it.

Balance is checked by resolving the same rings under all seven forms and confirming no form dominates another on both axes, plus a conservation check that `manifestation + bled + drawn === released`. Law 1 is the one thing no form may bend, and every form currently balances to the unit.

**`manifestation − toll` is not the yardstick** — it prices a unit of the caster's eyesight at a unit of fire, and judged that way four forms look worthless. Score instead as `manifestation − w × toll` for `w` in 0, 0.5, 1, 2, and ask which form wins each (w, stone-count) cell: a form is balanced if it *owns a region*, not if its average is high. On the current numbers, over 64k rings (random rings and source-first rings, every stone count from 1 to 8):

The map reads as *cost tolerance against ring shape*, and every form has a corner of it:

| | `w = 0` | `w = 0.5` | `w = 1` | `w = 2` |
| --- | --- | --- | --- | --- |
| holed ring | ward | ward | elegy | dirge |
| closed ring | litany | prayer, litany | elegy, prayer | invocation |
| wide ring | prayer | prayer | elegy, prayer | benediction |

Cells owned, of 84: ward 28, elegy 21, prayer 12, dirge 9, litany 8, benediction 4, invocation 2. The tail two look thin and are not, because both are width plays and only 20 of the 84 cells are bucketed by width at all: inside the wide-ring buckets the split is prayer 3, benediction 2, elegy 2, ward 1, and the invocation takes 57% of eight-stone rings at `w = 2`. No form dominates another on both axes on more than 60% of rings.

**There is a second axis, and the invocation is the only form built for it.** A caster who wants a fire does not care how much frost came with it, so the harness also scores the largest *single* currency delivered. On that map the invocation owns 26 cells of 84 against 2 on the total: it is the concentration form, and it is invisible on a total-units map by construction. The benediction owns nothing there and should not — flattening the difference between currencies is the whole of what it does.

## Firestore

```
users/{uid}                          -> { seedVersion, seededAt }
users/{uid}/components/{componentId} -> MaterialComponent (id stripped; document id carries it)
users/{uid}/spells/{spellId}         -> Spell
```

`firestore.rules` restricts everything under `users/{uid}` to that uid. Ids are minted client-side (`lib/id.ts`).

Traps in `firestoreRepository.ts`:

- **StrictMode double-invokes the load effect.** Seeding claims its version marker inside a `runTransaction`, and `listComponents` de-dupes concurrent calls through an `inFlight` promise. Any new "write once on first load" logic needs the same treatment.
- **`SEED_VERSION` (currently 3) must be bumped whenever `seedComponents.ts` changes shape** — existing users never see the change otherwise. A new catalog installs *alongside* what the user has, never over it.
- **`loadComponents` is not read-only**: `pruneInert` deletes any component whose two ledgers are both empty, which is how pre-ledger leftovers get cleared.
- Firestore uses `persistentLocalCache` with multi-tab support, so the workshop stays readable and writable offline.

## Conventions

- **Context files are split three ways** — `fooContext.ts` (createContext + value type), `FooProvider.tsx`, `useFoo.ts` — to satisfy `eslint-plugin-react-refresh`. Keep the split when adding a context.
- **Ledgers are normalized on both read and write** (`normalizeLedger`, `normalizeComponent`, `normalizeSlots`), so hand-edited documents and records from older data models still load. Zero entries are dropped rather than stored, keeping documents small and free of `undefined`.
- **Persisted mutations go through `write()` in `WorkshopProvider`**: local state updates only after the write lands, and failures surface in `error` (rendered by `StorageAlert`).
- Styling is hand-written BEM in `src/App.css` (~1100 lines) over CSS custom properties in `src/index.css`. Both themes are defined there — light is "ink on parchment", dark is the same desk by candlelight — and every colour must be a token so both keep working.
- Comments in this codebase explain *why* a rule exists, especially where the reason is a balance decision or a Firebase quirk. Match that when touching `reaction.ts`, `currencies.ts`, or `firestoreRepository.ts`.
- Prose in the UI is in-world and deliberately specific (a spell is a prayer/elegy/litany; unmet demand is a toll paid out of the caster's body). New copy should be computable and stated, not evocative and vague.

## Browser verification

There is no Playwright on this machine. Run `npm run dev`, launch Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`) with `--headless=new --remote-debugging-port=9222 --user-data-dir=<temp>`, then drive it over raw CDP from Node (v22, global `WebSocket`) via `Page.navigate` / `Runtime.evaluate` / `Page.captureScreenshot`.

Gotcha: React has not re-rendered between two `.click()` calls issued in the *same* `Runtime.evaluate`. Arming a component and clicking a slot must be separate evaluates — otherwise the placement silently no-ops and it looks exactly like an app bug.
