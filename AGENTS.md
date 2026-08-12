# Repository Guidelines

## Project Structure & Architecture

Greatforge is a React/TypeScript Vite worldbuilding app backed by Firebase.

- `src/types/` contains domain types and normalizers; keep it free of React and storage code.
- `src/data/` holds catalog data, currency metadata, and spell-form definitions.
- `src/lib/` contains pure domain logic (`reaction.ts`) and the repository seam. Firebase access belongs only in `firestoreRepository.ts`.
- `src/state/` provides application state; `src/components/` should remain presentational.
- `src/App.css` holds BEM component styles; `src/index.css` defines shared tokens and both themes.
- `sim/` contains standalone balance-analysis scripts and is intentionally outside the app TypeScript configuration.

Respect the dependency direction: `types` <- `data`/`lib` <- `state` <- `components`.

## Build, Lint, and Development

- `npm install` installs dependencies.
- `npm run dev` starts Vite locally on port 5173.
- `npm run emulators` starts Firebase Auth, Firestore, and the emulator UI.
- `npm run build` type-checks with TypeScript and creates the production bundle in `dist/`.
- `npm run lint` runs ESLint across the project.

Copy `.env.example` to `.env.local`. Keep it out of commits; set `VITE_USE_FIREBASE_EMULATOR=true` for local Firebase services.

## Coding Style & Naming

Use TypeScript and React function components. Follow the existing two-space indentation, single quotes, and semicolon-free style. Use PascalCase for components/providers (`SpellCircle.tsx`, `WorkshopProvider.tsx`) and camelCase for functions, hooks, and values (`computeReaction`, `useWorkshop`).

Keep contexts split into `fooContext.ts`, `FooProvider.tsx`, and `useFoo.ts`. Normalize persisted domain data on both reads and writes, and route mutations through `WorkshopProvider.write()`. Use CSS custom properties rather than literal colors so both themes remain complete. Comments should explain balance or Firebase decisions, not restate code.

## Testing & Verification

There is no test runner or committed test suite. Before submitting changes, run:

```sh
npm run lint
npm run build
```

Manually verify UI changes in the browser. For resolver or balancing changes, also exercise `src/lib/reaction.ts` with a scratch script or relevant `sim/` analysis. Do not add simulations to the application `tsconfig`.

## Commits & Pull Requests

Recent commits use brief, imperative subjects such as `fix forms` and `Add reagent variety`. Keep each commit focused and use a clear summary of the user-visible or domain change.

Pull requests should describe intent, affected layers, and verification performed. Link related issues when available, and include screenshots for visual changes. Call out Firebase schema, seed-catalog, or balance changes explicitly; bump `SEED_VERSION` when changing the seeded component shape.
