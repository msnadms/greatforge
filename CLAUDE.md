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

There is **no test runner and no test files**. `npm run build` plus `npm run lint` are the only automated checks; behavioural changes to the reaction resolver are verified by driving the app in a browser, or by `sim/balance.ts` (kept out of `tsconfig`, see "Balance") or another throwaway Node script that imports `lib/reaction.ts` directly. Nothing on this machine runs TypeScript directly — compile such a script out of the tree with `npx tsc <file>.ts --ignoreConfig --outDir <scratch> --module commonjs --target es2022 --moduleResolution node --skipLibCheck --ignoreDeprecations 6.0` and run the emitted `.js` under node.

Setup: copy `.env.example` to `.env.local`. `VITE_USE_FIREBASE_EMULATOR=true` points auth and Firestore at the local emulator suite; the real `greatforge` project's config goes in the same file with the flag off. `.env.local` is gitignored.

## Architecture

Four layers, strictly one-directional (`types` ← `data`/`lib` ← `state` ← `components`):

- **`src/types/worldbuilding.ts`** — the domain. Currencies, `Ledger`, `MaterialComponent`, `Spell`, `Placement`, the ring constants (`RING_SLOT_COUNT`, the three `TRANSIT_LOSS_*` values, `MAX_LEDGER_ENTRY`), `LossRelief` with `transitScale` / `completionFactor`, and the normalizers. No React, no storage. `Placement` lives here rather than beside the resolver because a form's condition is a question about the ring, and the conditions are written in `data/`.
- **`src/data/currencies.ts`** — currency metadata (labels, hues, prose for vent/toll), the seven `LAWS`, and `describeRole` / `isRelay` / `isInert`. **Roles are derived from the ledgers, never stored**, so an edited component is re-labelled the moment its numbers change.
- **`src/data/spellForms.ts`** — `FORM_META`: what each of the seven forms does to the resolver, and the prose stating it. Imports `describeRole` from `currencies.ts`; imported by `reaction.ts`.
- **`src/lib/reaction.ts`** — `computeReaction(placements, form)`, the pure resolver. Walks the eight slots clockwise from slot I, closes the ring, and returns `manifestation` / `toll` / `bled` plus per-slot reports and the transfer arcs the circle draws.
- **`src/lib/repository.ts`** — `WorkshopRepository`, the storage seam. `firestoreRepository.ts` is the only implementation; `WorkshopProvider` takes one as an overridable prop.
- **`src/state/`** — two contexts. `WorkshopProvider` owns components, spells, the unsaved `draft` spell, and derives `placements`/`reaction` via `useMemo`. `DragProvider` implements pointer-based dragging (native HTML5 drag was rejected — its drag image lags the cursor).
- **`src/components/`** — presentational; all state comes from `useWorkshop()` / `useDrag()` / `useAuth()`.

`App.tsx` gates the whole workshop behind Google sign-in and keys `WorkshopProvider` by `user.uid` so switching accounts remounts rather than leaking the previous codex.

### The bench has two modes

`WorkshopProvider.mode` is `'view'` or `'edit'`. **An inscribed working opens in `view`** — `selectSpell` sets it, and `editDraft` (the book's Edit button) is the only way out. `newSpell` and a deleted-out-from-under draft go to `'edit'`; a successful `saveDraft` returns to `'view'`, which is what closes the round trip.

In `view` the book is a written page rather than a form: `Spellbook` renders `BookView`, which shows the title, a form-and-count subtitle, the notes and the text as prose. **No field carries its name there** — what separates notes from text is the page and the typeface, which is how the two already differ. The circle's slots render as `div`s with `role="img"` instead of buttons and drop their `data-slot-index`, so they leave the tab order and a drag finds no target; the codex still reads and its components are still editable, but nothing in it can be armed.

A viewed slot collapses to the round 58px token an empty slot already is, and carries a sigil instead of a name and a ledger. The card is wide because it holds words; a token holds none, so the ring becomes eight of one shape and the flow arcs are the loudest thing on the circle.

`RoleSigil` draws the role in the reagent's own hue: a rayed disc for a source, the ascending triangle for a fuel, two triangles point to point for a converter, a ring with a bar through it for a relay, a descending triangle over a floor for a sink. **The sigils are keyed by `describeRole`, never by material.** Roles are derived from the ledgers, so a reagent the user writes or retunes gets the right glyph with nothing to add to a catalog, and a glyph per material would have nothing to draw for a component that was not seeded. The role is spelled out in the token's `aria-label`, because a glyph standing in for a word is only readable if something says the word.

The names are engraved on a band around the outside of the circle (`namePath`, `.circle__name`), each centred on its own slot's angle. Three things about it are load-bearing:

- **`NAME_RADIUS` is set for the small end of the size range.** The tokens are a fixed 58px whatever size the stage is drawn at, so how far out they reach *in stage units* depends on how big the circle is: wider on a small stage, narrower on a large one. A band tuned for a wide desk runs under the tokens on a narrow one. It reads a little airy at 820px, which is the right way round to be wrong.
- **The band sits outside the viewBox, and only renders because `.circle__engraving` carries `overflow: visible`.** Radius 56 is past the 50 the box clips at.
- **A name on the lower half of the rim is drawn along the anticlockwise arc**, or it hangs upside down. Reversing the path throws the glyphs to the other side of the baseline, so those arcs take a radius one line larger to put the whole band back on one circle.

Per-token inscriptions, curving around each 58px token instead, were tried and dropped. They needed their own SVG per slot measured in pixels rather than stage units, and had to be flung outward from the circle's centre to stay off the flow ring, which passes within a few pixels of every token.

`patchSlots` and `updateDraft` both refuse to run in `view`. That is deliberate belt-and-braces: a pointer press that began before the mode changed can still release over the circle, so the refusal lives in the state and not only in the markup.

### The magic system is load-bearing

It is a hard magic system: `computeReaction` is authoritative about what a spell does, and the `LAWS` array in `data/currencies.ts` is rendered in the UI as the player-facing statement of exactly what the resolver does. **Changing a resolver rule means editing `LAWS` in the same change**, or the app is lying to the user.

Five rules that look arbitrary and are not — each was derived, and reverting one silently breaks balance:

- **Transit loss is a flat amount off the current as a whole**: two units to leap a gap, one across an ordinary reagent (see `crossInto`). Not per parcel, and — since August 2026 — not per currency either. Per-currency charging priced the *breadth* of a spell rather than its shape: a five-currency ring paid five times what a one-currency ring paid for the same walk, and every small flow was erased before the mouth. Per-parcel charging is worse again, making any partial draw evaporate twice as fast.
- **The crossing is charged to the current the destination demanded, and only what that cannot cover falls on the oldest in flight.** A leap over a hole is billed to the slot it is aimed at (`destinationOf`), not to the hole, so three crossings over two holes are paid by the one reagent waiting at the end of them. Billing the oldest outright — the rule until this change — made an arc's loss depend on a reagent with nothing to do with it: a source at slot I is the oldest current for the whole lap, so it absorbed every crossing until it was spent and everything downstream travelled free. A ring of weight I / fulgurite III / black powder VI delivered 7 heat across two holes and a reagent, where the same ring without the source delivered 2. That is unreadable on the circle — the arc says 7 and the five units are bled elsewhere, under another currency.

  **The fallback is not optional.** Without it a crossing whose destination demands nothing in flight costs nothing, which frees gaps entirely (the relay probe goes to 10 vs 9) and lets a lone source ride the whole ring untouched — the same bug from the other end. With it the cost is never waived, only reassigned, which is why the change is nearly balance-neutral: manifestation moved 42.8 → 43.5 at eight reagents, bled is unchanged at 6.5, the fed cohort is unchanged, and every currency stays in band. `transitPayerProbe` asserts both halves.

  **The remainder used to fall to the oldest parcel outright; it now spreads across everything still in flight, in proportion to what each parcel carries, with the unrounded remainder banked as debt rather than dropped.** Oldest-first paid the same defect one step further down: a run of holes with nothing demanded ahead of them drained whichever parcel had been released first to zero before touching any other, so an arc's survival still turned on release order rather than on the crossing itself. A litany of weight I, amber II, fulgurite IV, slow match V used to cross three open slots and the closing lap on Fulgurite's spent heat and light alone, so Slow Match's own heat — released last — reached the mouth as 9, untouched, though nothing about the slot demanded that outcome. A flat proportional split without memory traded one bias for another: a crossing's toll is one or two units split across every parcel in flight, so any one parcel's exact share is usually under a unit and rounds to nothing, which taxes whichever parcel is currently largest every single time and lets every smaller one ride free indefinitely — the same reagent that had been shielded before was now shielded for the opposite reason. `Parcel.debt` fixes that: a parcel's unrounded share is added to what it already owed, and only once the running total clears a whole unit is it actually taken, so a small parcel still pays once enough crossings have accumulated its due, and a large one is not singled out simply for being the only one big enough to round up on its own. Under debt, that same litany delivers heat 8 / motion 1 / light 3 rather than heat 9 / motion 2 / light 3 — the leftover motion finally gets billed instead of dodging every crossing. Both changes together are nearly balance-neutral: manifestation moves 43.5 → 43.4 at eight reagents, bled is unchanged, and every currency still reaches the mouth, in a band that widens slightly to 15–25%. `crossInto` names the two passes for this: `spend` for the destination's own demand, `spendProportional` for what is left.
- **A relay is an ordinary reagent but for one thing: the current crosses it for nothing, wherever it stands.** That one line in `baseTransitCost` is the entire role, and it is the only place in `computeReaction` that asks what a component is. Everything else about a relay is resolved exactly like any other reagent — it is asked for its demands, billed in full for what the ring could not give it, releases its whole yield, and closes its slot.

  The free crossing is unconditional, holes on both sides included. A source at slot II and a relay at slot IV with a gap between them costs 2, where an ordinary reagent at slot IV costs 3: the hole is charged as the hole, and the relay adds nothing on top. `relayProbe` in the harness asserts exactly that pair of numbers using two synthetic reagents with identical demands, one a relay and one a converter, so it cannot drift with the catalog.

  **What qualifies as a relay is decided by `ledgersMatch`, and the test is exact — the two ledgers must agree to the unit, currency by currency.** It used to compare only which currencies each side *mentioned*, which ignored the amounts and so handed the free crossing to two things that are not relays: a reagent giving back more of the same currency than it took (heat 8 for heat 12 — half again, and under the strict 1.5x fuel bar, so it fell through to the relay branch), and a reagent genuinely trading across the same pair of currencies (heat 1 and motion 12 for heat 12 and motion 1, which converts eleven motion into eleven heat). Both were labelled relays in the tray and the editor under a hint that says a relay adds nothing of its own, and both crossed for free. The balance cost was bounded — the crossing is worth one lap, 8 units, so a ring of the fattest legal "relay" netted 160 against 152 for the same reagent one unit dearer — but `isRelay` is the only question the resolver asks about a component, so a wrong answer has teeth rather than being cosmetic. Tightening it changed 0 of the catalog reagents and left every number in the Balance table byte-identical.

  A reagent that profits without giving anything up is a fuel however slim the margin (`givesUpNothing`, checked before the 1.5x ratio), so heat 8 for heat 12 reads as a weak fuel rather than a "converter" that converts nothing. The ratio now only ever decides between fuel and converter for reagents that *did* give something up.

  **What keeps that honest is that a relay is billed like anything else,** and it did not used to be: its demand was a *rating* rather than a requirement, so an underfed relay was never charged, and it handed on only what it actually took. The rating exemption was the bug. A relay dropped into a far-off hole raised `completion` and could not be charged for the demand it then failed to meet, so it was free profit — two of them took a four-reagent ring from 8 delivered to 14 with the toll unmoved at 7, where a starving fuel in the same slot took the toll from 0 to 5. Billing it like anything else fixes that at the root: padding a sparse ring now gains 12.6 manifestation and pays 11.5 toll for it, and there is no ring in 4000 where a starved relay is still free.

  Two other fixes were tried first and both are wrong, for the same reason: conditioning the free crossing on the neighbours, and excluding an isolated relay from `completion` or making it inert. They close the numbers but they make relays look broken in the app — an inert relay draws no arcs and reads as a reagent that refuses to connect, and a conditional crossing makes the same relay cost different amounts in different slots for no reason the player can see. **Keep the special-casing to the one line.**
- **A circle admits each material once** (law 5's first clause) — `placeComponent` lifts a reagent from any slot it already occupies. With repeats allowed the optimal ring for every objective is eight copies of one source. Law 5's *second* clause, that a reagent is asked only once, used to be bent by the litany's second lap; nothing bends it now, so the ring is walked exactly once in every casting.
- **`completion` is apportioned across the currencies by largest remainder**, not by rounding each one on its own. Per-currency `Math.round` rounds half *up* once per currency in flight, so a wide ring delivered more than the share law 4 states and the overshoot grew with the ring's *width* — the wrong axis entirely for a rule about how closed the ring is. A four-reagent ring holding 3/5/5/5/5 delivered 14 where half is 11.5. Rounding the total once and giving the leftover units to the largest fractional parts holds the error to half a unit for the whole ring at any width. It is worth ~2% of average manifestation on random rings and much more than that on the wide sparse ones, and it is invisible to the conservation check, which balances either way.

**Unmet demand is the only thing the caster is ever charged for.** There is no per-casting cost on top of it (`SPEAKING_TOLL`/`BEND_TOLL` is gone), so a ring that feeds every reagent standing in it is free to speak however large it is — 100% of fully fed rings cost zero, under every form. A measuring form charges nothing at all, ever, because it takes the difference out of the yield instead. Law 6 says both halves in as many words; anything new that bills the body means editing law 6 in the same change.

The catalog in `data/seedComponents.ts` is tuned against these numbers: every currency circulates in a 4–9 band. It stocks two sinks (Lampblack, Glauber's Salt), added with the forms — the dirge is spared the spill only while a sink stands in the ring, and the role had deliberately shipped empty until then. Retuning a seed's ledgers without re-checking the frontier is still how a currency goes dead.

**August 2026: only seven reagents in the whole catalog — three sources, four fuels — never cost anything to place, and that is one short of a full ring.** Before this every fuel and converter handed back more than it took, so an eight-reagent working could be built by reading only the slot immediately behind the one being filled and grabbing anything that fit its colour: `sim/balance.ts`'s `naiveChainProbe` found that heuristic reached a toll-free ring on every single attempt, at output matching the deliberate `fedRing` search elsewhere in the harness. Carelessness was not a worse strategy, just a faster one. The fix was not to bill a fully fed ring — law 6 still means a ring that feeds everything standing in it speaks for free — but to make that state harder to fall into by accident: fuels were cut from seven to four, and most of what used to stand under "Converters" now costs more than it returns. A full ring is left needing at least one converter and usually several, and only five of them (four listed with the converters, plus Frankincense, repriced back into profit to give mass a second route) are worth the slot. `naiveChainProbe` is a permanent regression check on this — its toll-free rate must stay well under what a shrug used to buy — and it is why the numbers below read lower than they used to: a lap still costs 8 units in total rather than 8 of *each* currency, but the catalog can no longer be threaded on autopilot to outrun that cost.

### Spell forms are behavioural

`computeReaction(placements, form)` takes a form and reads it. A form decides **two** things and nothing else, and the same two mechanisms serve all seven — there is no per-form special case in the walk:

- **`underfed: 'credit' | 'measure'`** — what a reagent does when the ring did not meet its demands. `credit` releases the whole yield and bills the caster the shortfall (the old, and only, behaviour). `measure` releases the share of the yield the ring actually fed it, rounded down, and charges nothing. **A measuring form resolves every possible ring at a toll of exactly zero**, which the harness asserts. **The UI never says `credit` or `measure`: the two settings are named *volatile* and *stable* (`UNDERFED_LABEL`)**, in the reaction panel and in law 6. The form picker's options carry the form's name alone. The union keeps the resolver's words, which name the settlement the walk branches on. **The prose behind a name is hover text**, not a line beside it: `UNDERFED_RULE` hangs off the setting's name and `gloss` off the form's, using the plain `title` attribute the tray and the slots already use. The condition stays on the page, because it is a verdict on the ring as placed and changes as reagents move.
- **`condition`** — one stated requirement on the ring, `null` for the prayer. Met, one named loss is *spared*; unmet, that same loss is *doubled*. The losses are `transit` (a crossing costs 0, or 4/2 instead of 2/1) and `spill` (`completionFactor` returns 1, or squares the share).

**A form can never add.** Both mechanisms only move where a loss falls, so law 1 holds under all seven and `sim/balance.ts`'s conservation check passes unchanged. There is deliberately no fourth `LossRelief`. This is also why the condition cannot spare a *toll*: a reagent releasing a yield the ring never fed it would make units, and cutting the yield instead (`measure`) is the only settlement law 1 permits — the two mechanisms are the same idea from opposite ends.

| form | underfed | condition | spares / doubles |
| --- | --- | --- | --- |
| prayer | credit | — (asks nothing) | — |
| elegy | credit | slot I empty, no source in the ring | spill |
| litany | credit | reagents in pairs; every run exactly 2 long, more than one run | spill |
| dirge | measure | a sink stands in the ring | spill |
| invocation | credit | every slot filled | transit |
| ward | measure | slots I and VIII filled, at least one slot empty | transit |
| benediction | measure | three reagents or fewer | spill |

Four things here look arbitrary and are not:

- **The share a measuring form releases is proportional, not binary.** The first cut had an underfed reagent not react at all. Feeding a reagent to the exact unit is rare, so the rule was switched off almost always and the three measuring forms were dead: on rings answering their own conditions the dirge delivered 1.2 and the ward 3.2, where the same rings spoken as a prayer delivered 21.0 and 22.4.
- **The ward's condition has that "at least one slot empty" clause to keep it off the invocation's ground.** Without it a full ring satisfies both, and the ward — which measures, and so can never be tolled — strictly dominates the form built for the closed circle.
- **`spill: doubled` squares the share rather than halving it,** so the forfeit is nil on a closed ring and severe on a sparse one. It stays pointed at the shape the form asked for instead of at the size of the working.
- **Rotations and reflections were considered and rejected.** Starting the walk at another slot, or running it anticlockwise, is a *symmetry of the ring*: indistinguishable from rotating or mirroring the reagents the caster placed. It would read as a rule while adding no decision at all.

`SpellFormMeta` keeps flavour and mechanics in separate fields on purpose. `gloss` is the occasion and the manner, in-world, **no mechanics**; `condition.statement` is the rule, plainly stated, **no atmosphere**, and it must be exactly what `condition.test` checks. `UNDERFED_RULE` states the other half. Writing the mechanic into `gloss` too is how the two drift apart and the app starts lying.

`condition.slots` is the third face of the same sentence: the slots the statement speaks about, washed pale gilt on the circle (`.slot--named`) whether the condition holds or not. It names the same slots the sentence does — slot I and the sources for an elegy, slots I and VIII for a ward, every reagent the rule counts for the three that measure the ring's shape — so a new condition means writing all three of `statement`, `test` and `slots` together. `conditionSlots` returns nothing for a cold circle, matching `conditionRelief`: an empty ring is not failing its form. The mark is gilt and never red — red is unmet demand alone, and a reagent washed in it reads as starved when the form has only pointed at it — and it is a fill rather than an edge, which is where `.slot--starved` lives.

**There are seven laws again.** Law 6 forked into the credit/measure settlement, law 7 (**A form asks one thing, and can only ever spare a loss**) bounds what a form may do, and laws 2 and 4 each gained a clause pointing at law 7. `LAWS.length` renders in the panel, so the count follows the array. **Any change to a form mechanism means editing `LAWS` in the same commit.**

Forms have now been through three arrangements: seven separate resolver knobs (`reach`, `laps`, `shortfall`, `transit`, `gaps`) with one law bent apiece and a `BEND_TOLL` for the bending; then cosmetic, with the seventh law deleted; now two shared mechanisms. Do not reintroduce per-form knobs — the point of this arrangement is that a form is a *choice of setting*, not a branch in the resolver.

### Balance

`sim/balance.ts` checks two separable things: the circle, and the forms.

**The circle** is measured under the prayer, the one form that asks nothing and spares nothing, so these numbers stay directly comparable across form changes — a change that moves the prayer has moved the circle. Law 1 on every ring and under every form (`manifestation + bled + drawn === released`, thrown on rather than reported), the shape of output against reagent count, that every currency still reaches the mouth, and a paired probe for the relay condition. Over 136k rings — random and source-first, plus a "fully fed" builder that only places a reagent if the ring still starves nowhere:

| reagents | manifestation | toll | bled | dead rings |
| --- | --- | --- | --- | --- |
| 2 | 1.3 | 12.8 | 12.7 | 28% |
| 4 | 7.6 | 22.0 | 17.0 | 1% |
| 6 | 17.6 | 27.8 | 14.2 | 0% |
| 8 | 30.4 | 31.6 | 6.4 | 0% |

These read lower across the board than the pre-August-2026 table (2.2 / 11.0 / 25.0 / 43.4), and two reagents now goes dead nearly three times as often (11% → 28%): thinning the free reagents and pricing most conversions underwater (see above) shrank the whole catalog's output, not only the one-hop shortcut it targeted. The resolver under a prayer is otherwise byte-identical.

Five things to look at when the numbers move:

- **Output is superlinear in reagents** — a full ring beats two half rings, which is what makes slot order a craft rather than a chore.
- **A fully fed eight-reagent ring makes 18.8 and pays 0, against a random one's 30.4 and 31.6.** Random no longer clearly outscores fed on raw output either — the toll now runs slightly ahead of it — which is the point of the August 2026 retune: a careless ring used to win outright and only paid for winning, and now it is a wash at best. The trade is still the same shape — a fed ring gives up output for a toll of exactly zero — but carelessness is no longer the higher-expectation play. If fed rings start winning on output outright, the tuning has collapsed the other way.
- **Every currency stays between 15% and 25% of everything delivered.** A currency drifting toward zero means a seed's ledgers were retuned without re-checking the frontier.
- **`naiveChainProbe`'s toll-free rate must stay well under 50%.** It is the harness's model of a player who never looks further back than the slot immediately before the one they are filling; before the August 2026 retune it printed 100% at a manifestation matching `fedRing`'s own deliberate search, which meant reading only the last card placed was a complete strategy. It now prints 0%.
- **The two relay checks and the transit payer, all hard assertions rather than readings to interpret.** `the relay crossing` must print `OK`: 8 units reach a relay across a gap against 7 for an ordinary reagent, so the relay is free and the hole still costs its two. It is pinned to the prayer, since a form sparing the transit makes relay and reagent cost the same — correct behaviour, useless as a probe. `padding a sparse ring with two isolated relays` must print `0/4000 OK`, meaning no ring lets a starved relay raise the manifestation without paying for it. `the transit payer` must print `OK` twice: a chain fed across two holes receives the same whether or not an unrelated source stands at slot I, and a lone source still loses its whole yield to the lap.

Note that bled *falls* as the ring fills (17.0 at four reagents, 6.4 at eight) even though a fuller ring is a longer walk. That is the completion spill in law 4, not transit: a four-reagent ring throws away half of what it still holds at the mouth. Transit itself is at most 8 units a lap under a prayer.

**The forms** get three more checks, and two hard assertions:

- **A measuring form must never charge.** Thrown on, over every ring in the sweep.
- **Every form must win somewhere.** Two objectives, because there is no single one: `loud` (most delivered) and `cheap` (best on manifestation minus toll). Read `cheap` with care — it prices a unit out of the caster exactly like a unit delivered, so doing nothing scores well, and a measuring form taking `cheap` on a ring it delivered 1.0 on is not a win in any sense a player would recognise.
- **Each form against the prayer on rings that answer its condition**, in two cohorts, and the pair is the point:

| form | fed: own | fed: prayer | careless: own | careless: prayer |
| --- | --- | --- | --- | --- |
| litany | 11.6 | 6.0 | 14.6 | 7.5 |
| dirge | 9.3 | 8.8 | 1.2 | 14.8 |
| invocation | 26.2 | 18.9 | 36.0 | 31.9 |
| ward | 17.9 | 11.1 | 2.8 | 16.4 |
| benediction | 5.2 | 1.7 | 0.2 | 1.4 |
| elegy | cannot be fed | — | 9.3 | 4.8 |

  **The fed cohort is the one to tune against.** On a fed ring a measuring form and a prayer resolve identically, so whatever separates them there is the condition alone — and every form beats the prayer on ground it chose. The careless cohort is the same rings thrown together, where the average slot gets 38% of what it asked; a prayer's output there is almost entirely reagents firing on credit, which is exactly what its toll of 20-odd is buying, so the measuring forms reading 1.5 and 3.4 is the credit rule showing up and not a broken form. **An elegy can never be fed** — it forbids a source anywhere, so the first reagent the current reaches must starve. It always pays something, by construction, and the harness says so rather than reporting a failure.

Conditions are found by rejection sampling against the real predicates in `FORM_META`, so shapes are never described twice and cannot drift. `fedRingIn` fills an arbitrary slot set, which `fedRing` cannot: `fedRing` lays reagents contiguously from slot I, and three conditions ask for shapes it never produces, which reports them unreachable when they are merely unbuilt.

## Firestore

```
users/{uid}                          -> { seedVersion, seededAt }
users/{uid}/components/{componentId} -> MaterialComponent (id stripped; document id carries it)
users/{uid}/spells/{spellId}         -> Spell
```

`firestore.rules` restricts everything under `users/{uid}` to that uid. Ids are minted client-side (`lib/id.ts`).

Traps in `firestoreRepository.ts`:

- **StrictMode double-invokes the load effect.** Seeding claims its version marker inside a `runTransaction`, and `listComponents` de-dupes concurrent calls through an `inFlight` promise. Any new "write once on first load" logic needs the same treatment.
- **`SEED_VERSION` (currently 5) must be bumped whenever `seedComponents.ts` changes shape** — existing users never see the change otherwise. A new catalog installs *alongside* what the user has, never over it.
- **`loadComponents` is not read-only**: `pruneInert` deletes any component whose two ledgers are both empty, which is how pre-ledger leftovers get cleared.
- Firestore uses `persistentLocalCache` with multi-tab support, so the workshop stays readable and writable offline.

## Conventions

- **Context files are split three ways** — `fooContext.ts` (createContext + value type), `FooProvider.tsx`, `useFoo.ts` — to satisfy `eslint-plugin-react-refresh`. Keep the split when adding a context.
- **Ledgers are normalized on both read and write** (`normalizeLedger`, `normalizeComponent`, `normalizeSlots`), so hand-edited documents and records from older data models still load. Zero entries are dropped rather than stored, keeping documents small and free of `undefined`.
- **Persisted mutations go through `write()` in `WorkshopProvider`**: local state updates only after the write lands, and failures surface in `error` (rendered by `StorageAlert`).
- Styling is hand-written BEM in `src/App.css` (~1100 lines) over CSS custom properties in `src/index.css`. Both themes are defined there — light is "ink on parchment", dark is the same desk by candlelight — and every colour must be a token so both keep working.
- Comments in this codebase explain *why* a rule exists, especially where the reason is a balance decision or a Firebase quirk. Match that when touching `reaction.ts`, `currencies.ts`, or `firestoreRepository.ts`.
- Prose in the UI is in-world and deliberately specific (a spell is a prayer/elegy/litany; unmet demand is a toll paid out of the caster's body). New copy should be computable and stated, not evocative and vague.
- **Write succinct sentences and vary their structure.** The failure mode to avoid is corny: a colon-and-restatement in every line, a trailing subordinate clause explaining the thing that was just said, atmosphere welded onto a rule. "The spill is squared. Four reagents deliver a quarter, not a half." — not "Until it does, the spill is squared, and what reaches the mouth falls away with every hole." Say the mechanic, give the number, stop. Keep flavour and mechanics in separate fields where the data model allows it (`SpellFormMeta.gloss` vs `condition.statement`) rather than in the same sentence.
- **A thing standing in a slot is a *reagent*.** `MaterialComponent` and "material" are the formal names; "reagent" is the countable word prose uses — "an ordinary reagent", "eight reagents deliver all of it". It replaced "stone" (August 2026), which came from the ring being a physical circle and belonged to neither of the system's two metaphors: the ledgers are stoichiometry (law 1 is conservation of mass), while `current`/`source`/`fuel`/`relay`/`sink`/`transit` is a circuit. Note `Lodestone` is a catalog entry and `limestone` is flavour text — neither is the noun.

## Browser verification

There is no Playwright on this machine. Run `npm run dev`, launch Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`) with `--headless=new --remote-debugging-port=9222 --user-data-dir=<temp>`, then drive it over raw CDP from Node (v22, global `WebSocket`) via `Page.navigate` / `Runtime.evaluate` / `Page.captureScreenshot`.

Gotcha: React has not re-rendered between two `.click()` calls issued in the *same* `Runtime.evaluate`. Arming a component and clicking a slot must be separate evaluates — otherwise the placement silently no-ops and it looks exactly like an app bug.
