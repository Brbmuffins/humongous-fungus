# Rot & Bloom

An idle game for phones. You are a mycelium network living in the soil of a
sealed terrarium. Tap to digest fallen leaves, spend nutrients to grow moss,
mushrooms, ferns and animals, and watch the jar fill up in real time, including
while the game is closed.

Working title. The repo is still named `RoD-Online` and can be renamed.

## Run it

```sh
npm install
npm run dev            # local server; open the printed URL on your phone (same Wi-Fi)
npm test               # unit tests for the economy, away time, prestige and saves
npm run build          # type-check, then build one self-contained dist/index.html
npm run build:artifact # also writes dist/artifact.html for sharing as a claude.ai page
npm run sim            # pacing simulator: npm run sim -- [taps/s] [hours] [gap min] [session min]
```

## Layout

| Path | What it holds |
|---|---|
| `src/game/defs.ts` | All content and tuning: producers, upgrades, specimens, constants |
| `src/game/economy.ts` | Pure game rules: costs, rates, time away, cultivation, sealing jars |
| `src/game/state.ts` | Save format, validation, choosing between saves |
| `src/render/` | Canvas drawing: the jar scene and every organism, procedurally |
| `src/ui/` | DOM panels (Grow, Evolve, Cultivate, Spores, Journal) and dialogs |
| `src/storage.ts` | Local save, plus an optional per-player cloud copy when hosted as an artifact |
| `scripts/simulate.ts` | Greedy-player simulator used to tune pacing |
| `docs/DESIGN.md` | Game design notes and the road to the app stores |

No framework and no runtime dependencies: TypeScript, Canvas 2D and Vite.
The build is a single HTML file with fonts inlined, so it runs fully offline.
