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

- **`src/types/worldbuilding.ts`** — the domain. Currencies, `Ledger`, `MaterialComponent`, `Spell`, the ring constants (`RING_SLOT_COUNT`, the three `TRANSIT_LOSS_*` values, `MAX_LEDGER_ENTRY`), and the normalizers. No React, no storage.
- **`src/data/currencies.ts`** — currency metadata (labels, hues, prose for vent/toll), the six `LAWS`, and `describeRole` / `isRelay` / `isInert`. **Roles are derived from the ledgers, never stored**, so an edited component is re-labelled the moment its numbers change.
- **`src/lib/reaction.ts`** — `computeReaction`, the pure resolver. Walks the eight slots clockwise from slot I, closes the ring, and returns `manifestation` / `toll` / `bled` plus per-slot reports and the transfer arcs the circle draws.
- **`src/lib/repository.ts`** — `WorkshopRepository`, the storage seam. `firestoreRepository.ts` is the only implementation; `WorkshopProvider` takes one as an overridable prop.
- **`src/state/`** — two contexts. `WorkshopProvider` owns components, spells, the unsaved `draft` spell, and derives `placements`/`reaction` via `useMemo`. `DragProvider` implements pointer-based dragging (native HTML5 drag was rejected — its drag image lags the cursor).
- **`src/components/`** — presentational; all state comes from `useWorkshop()` / `useDrag()` / `useAuth()`.

`App.tsx` gates the whole workshop behind Google sign-in and keys `WorkshopProvider` by `user.uid` so switching accounts remounts rather than leaking the previous codex.

### The bench has two modes

`WorkshopProvider.mode` is `'view'` or `'edit'`. **An inscribed working opens in `view`** — `selectSpell` sets it, and `editDraft` (the book's Edit button) is the only way out. `newSpell` and a deleted-out-from-under draft go to `'edit'`; a successful `saveDraft` returns to `'view'`, which is what closes the round trip.

In `view` the book is a written page rather than a form: `Spellbook` renders `BookView`, which shows the title, a form-and-count subtitle, the notes and the text as prose. **No field carries its name there** — what separates notes from text is the page and the typeface, which is how the two already differ. The circle's slots render as `div`s with `role="img"` instead of buttons and drop their `data-slot-index`, so they leave the tab order and a drag finds no target; the codex still reads and its components are still editable, but nothing in it can be armed.

`patchSlots` and `updateDraft` both refuse to run in `view`. That is deliberate belt-and-braces: a pointer press that began before the mode changed can still release over the circle, so the refusal lives in the state and not only in the markup.

### The magic system is load-bearing

It is a hard magic system: `computeReaction` is authoritative about what a spell does, and the `LAWS` array in `data/currencies.ts` is rendered in the UI as the player-facing statement of exactly what the resolver does. **Changing a resolver rule means editing `LAWS` in the same change**, or the app is lying to the user.

Five rules that look arbitrary and are not — each was derived, and reverting one silently breaks balance:

- **Transit loss is a flat amount off the current as a whole**: two units to leap a gap, one across an ordinary reagent, taken from the oldest parcels first (see `crossInto`). Not per parcel, and — since August 2026 — not per currency either. Per-currency charging priced the *breadth* of a spell rather than its shape: a five-currency ring paid five times what a one-currency ring paid for the same walk, and every small flow was erased before the mouth. Per-parcel charging is worse again, making any partial draw evaporate twice as fast.
- **A relay is an ordinary reagent but for one thing: the current crosses it for nothing, wherever it stands.** That one line in `baseTransitCost` is the entire role, and it is the only place in `computeReaction` that asks what a component is. Everything else about a relay is resolved exactly like any other reagent — it is asked for its demands, billed in full for what the ring could not give it, releases its whole yield, and closes its slot.

  The free crossing is unconditional, holes on both sides included. A source at slot II and a relay at slot IV with a gap between them costs 2, where an ordinary reagent at slot IV costs 3: the hole is charged as the hole, and the relay adds nothing on top. `relayProbe` in the harness asserts exactly that pair of numbers using two synthetic reagents with identical demands, one a relay and one a converter, so it cannot drift with the catalog.

  **What qualifies as a relay is decided by `ledgersMatch`, and the test is exact — the two ledgers must agree to the unit, currency by currency.** It used to compare only which currencies each side *mentioned*, which ignored the amounts and so handed the free crossing to two things that are not relays: a reagent giving back more of the same currency than it took (heat 8 for heat 12 — half again, and under the strict 1.5x fuel bar, so it fell through to the relay branch), and a reagent genuinely trading across the same pair of currencies (heat 1 and motion 12 for heat 12 and motion 1, which converts eleven motion into eleven heat). Both were labelled relays in the tray and the editor under a hint that says a relay adds nothing of its own, and both crossed for free. The balance cost was bounded — the crossing is worth one lap, 8 units, so a ring of the fattest legal "relay" netted 160 against 152 for the same reagent one unit dearer — but `isRelay` is the only question the resolver asks about a component, so a wrong answer has teeth rather than being cosmetic. Tightening it changed 0 of the 30 catalog reagents and left every number in the Balance table byte-identical.

  A reagent that profits without giving anything up is a fuel however slim the margin (`givesUpNothing`, checked before the 1.5x ratio), so heat 8 for heat 12 reads as a weak fuel rather than a "converter" that converts nothing. The ratio now only ever decides between fuel and converter for reagents that *did* give something up.

  **What keeps that honest is that a relay is billed like anything else,** and it did not used to be: its demand was a *rating* rather than a requirement, so an underfed relay was never charged, and it handed on only what it actually took. The rating exemption was the bug. A relay dropped into a far-off hole raised `completion` and could not be charged for the demand it then failed to meet, so it was free profit — two of them took a four-reagent ring from 8 delivered to 14 with the toll unmoved at 7, where a starving fuel in the same slot took the toll from 0 to 5. Billing it like anything else fixes that at the root: padding a sparse ring now gains 12.6 manifestation and pays 11.5 toll for it, and there is no ring in 4000 where a starved relay is still free.

  Two other fixes were tried first and both are wrong, for the same reason: conditioning the free crossing on the neighbours, and excluding an isolated relay from `completion` or making it inert. They close the numbers but they make relays look broken in the app — an inert relay draws no arcs and reads as a reagent that refuses to connect, and a conditional crossing makes the same relay cost different amounts in different slots for no reason the player can see. **Keep the special-casing to the one line.**
- **A circle admits each material once** (law 5's first clause) — `placeComponent` lifts a reagent from any slot it already occupies. With repeats allowed the optimal ring for every objective is eight copies of one source. Law 5's *second* clause, that a reagent is asked only once, used to be bent by the litany's second lap; nothing bends it now, so the ring is walked exactly once in every casting.
- **`completion` is apportioned across the currencies by largest remainder**, not by rounding each one on its own. Per-currency `Math.round` rounds half *up* once per currency in flight, so a wide ring delivered more than the share law 4 states and the overshoot grew with the ring's *width* — the wrong axis entirely for a rule about how closed the ring is. A four-reagent ring holding 3/5/5/5/5 delivered 14 where half is 11.5. Rounding the total once and giving the leftover units to the largest fractional parts holds the error to half a unit for the whole ring at any width. It is worth ~2% of average manifestation on random rings and much more than that on the wide sparse ones, and it is invisible to the conservation check, which balances either way.

**Unmet demand is the only thing the caster is ever charged for.** There is no per-casting cost on top of it (`SPEAKING_TOLL`/`BEND_TOLL` is gone), so a ring that feeds every reagent standing in it is free to speak however large it is — 100% of fully fed rings now cost zero. Law 6 says this in as many words; anything new that bills the body means editing law 6 in the same change.

The catalog in `data/seedComponents.ts` is tuned against these numbers: every currency circulates in a 4–9 band. A lap now costs 8 units in total rather than 8 of *each* currency, so the pressure on small flows is far lighter than the band was originally chosen against — the band is currently more generous than it needs to be rather than too tight. Retuning a seed's ledgers without re-checking the frontier is still how a currency goes dead.

### Spell forms are cosmetic

`Spell.form` is a label and nothing else. `computeReaction(placements)` does not take a form and never reads one: the same reagents in the same slots produce the same manifestation, toll and bleed in all seven. The picker changes what the panel *says*, not what the circle *does*.

A form carries `label`, `article` and one piece of prose, `gloss`: what kind of saying it is — the occasion, who it is addressed to, the manner. One or two plain sentences, in-world, no em dashes, and **no mechanics whatever**. The laws now hold without exception, so a gloss that reads like a rule is the app lying to the user in the other direction. (This is the exact inverse of the old rule, when a form carried `rule`, a mechanical statement, and an in-world gloss was forbidden.)

Forms *were* resolver inputs until August 2026, each bending exactly one law, and the shape of that is still visible: the resolver is now the `PLAIN` baseline that used to be the circle nobody could cast. What went with the change:

- `FORM_META`'s knobs (`reach`, `laps`, `shortfall`, `transit`, `gaps`), the `PLAIN` spread, `bends`, and `namedCurrency`.
- `Reaction.form` and `Reaction.named`; `ReactionPanel` now reads the form off `draft`, and the bent-law highlight in the laws list is gone along with `.reaction__law--bent` / `.reaction__bent`.
- `WARD_HOLD_RATE`, `TRANSIT_FUSED`, `DIRGE_KEPT_SHARE`, `DIRGE_SUBSTITUTION_RATE` — every constant that existed to tune one form.
- `BEND_TOLL`, the price of speaking a form that bent a law. It briefly survived as `SPEAKING_TOLL` on the grounds that it was uniform and so never distinguished the forms; that was overruled, because unmet demand is meant to be the only thing the caster pays. **There are now six laws, not seven** — law 6 lost its "a form may move the cost off the body" clause and absorbed the statement that nothing else is charged, and the old law 7 (**A form is one law, bent**) is gone entirely. `LAWS.length` is rendered in the panel, so the count follows the array.

**If forms are ever made behavioural again, `LAWS` changes in the same commit.** That constraint has not moved: the laws are rendered in the UI as the statement of what the resolver does, and they currently promise seven interchangeable manners of speaking.

### Balance

With one resolver there is no form map to own a region of, so `sim/balance.ts` checks the circle instead: law 1 on every ring (`manifestation + bled + drawn === released`, thrown on rather than reported), the shape of output against reagent count, that every currency still reaches the mouth, and a paired probe for the relay condition. Over 136k rings — random and source-first, plus a "fully fed" builder that only places a reagent if the ring still starves nowhere:

| reagents | manifestation | toll | bled | dead rings |
| --- | --- | --- | --- | --- |
| 2 | 2.3 | 12.0 | 16.9 | 6% |
| 4 | 11.8 | 19.0 | 21.5 | 0% |
| 6 | 26.9 | 22.6 | 17.4 | 0% |
| 8 | 47.1 | 24.7 | 6.4 | 0% |

Four things to look at when the numbers move:

- **Output is superlinear in reagents** — a full ring beats two half rings, which is what makes slot order a craft rather than a chore.
- **A fully fed eight-reagent ring makes 31 and pays 0, against a random one's 47 and 24.7.** That is the whole trade the game is about, and it must stay a trade: raw output is bought with the caster's body, and the deliberate ring gives up most of the output to pay nothing. If fed rings ever start winning on output too, the tuning has collapsed.
- **Every currency stays between 16% and 24% of everything delivered.** A currency drifting toward zero means a seed's ledgers were retuned without re-checking the frontier.
- **The two relay checks, both hard assertions rather than readings to interpret.** `the relay crossing` must print `OK`: 8 units reach a relay across a gap against 7 for an ordinary reagent, so the relay is free and the hole still costs its two. `padding a sparse ring with two isolated relays` must print `0/4000 OK`, meaning no ring lets a starved relay raise the manifestation without paying for it — that is the free-completion exploit, and it is the one a relay change is most likely to reopen.

Note that bled *falls* as the ring fills (21.5 at four reagents, 6.4 at eight) even though a fuller ring is a longer walk. That is the completion spill in law 4, not transit: a four-reagent ring throws away half of what it still holds at the mouth. Transit itself is now at most 8 units a lap.

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
- **A thing standing in a slot is a *reagent*.** `MaterialComponent` and "material" are the formal names; "reagent" is the countable word prose uses — "an ordinary reagent", "eight reagents deliver all of it". It replaced "stone" (August 2026), which came from the ring being a physical circle and belonged to neither of the system's two metaphors: the ledgers are stoichiometry (law 1 is conservation of mass), while `current`/`source`/`fuel`/`relay`/`sink`/`transit` is a circuit. Note `Lodestone` is a catalog entry and `limestone` is flavour text — neither is the noun.

## Browser verification

There is no Playwright on this machine. Run `npm run dev`, launch Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`) with `--headless=new --remote-debugging-port=9222 --user-data-dir=<temp>`, then drive it over raw CDP from Node (v22, global `WebSocket`) via `Page.navigate` / `Runtime.evaluate` / `Page.captureScreenshot`.

Gotcha: React has not re-rendered between two `.click()` calls issued in the *same* `Runtime.evaluate`. Arming a component and clicking a slot must be separate evaluates — otherwise the placement silently no-ops and it looks exactly like an app bug.
