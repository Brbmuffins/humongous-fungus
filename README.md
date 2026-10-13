# Fungus games

Two mobile games that share one codebase.

| Game | What it is | Folder |
|---|---|---|
| **Humongous Fungus** | Idle game: you are a mycelium network growing a terrarium in real time, even while the game is closed | `games/fungus` |
| **Sporeggar** (working title) | Trading game: buy and sell goods on a live market in a mushroom town, before they rot | `games/sporeggar` |

## Run it

```sh
npm install
npm run dev              # Humongous Fungus on a local server; open the URL on your phone (same Wi-Fi)
npm run dev:sporeggar    # Sporeggar
npm test                 # unit tests for both games and the shared code
npm run build            # type-check, then build each game into one self-contained dist/<game>/index.html
npm run build:artifact   # also writes dist/<game>/artifact.html for sharing as claude.ai pages
npm run sim              # Humongous Fungus pacing simulator: npm run sim -- [taps/s] [hours] [gap min] [session min]
```

## Phone apps

Humongous Fungus is packaged for iOS and Android with [Capacitor](https://capacitorjs.com):
the native projects are in `games/fungus/ios` and `games/fungus/android`, and
`games/fungus/src/native.ts` adds the phone-only features (durable saves,
reminder notifications, haptics). iPhone builds run on GitHub Actions
(`.github/workflows/ios-humongous-fungus.yml`) and upload to TestFlight.

- **Getting it on the App Store:** [docs/app-store-checklist.md](docs/app-store-checklist.md)
- **Store text and screenshots:** `games/fungus/store/`
- **Privacy policy and support pages:** `site/humongous-fungus/`

After changing the game, copy it into the native projects with
`cd games/fungus && npm run sync`.

## Layout

| Path | What it holds |
|---|---|
| `games/fungus/src/game/` | Humongous Fungus rules and content: producers, upgrades, specimens, away time, sealing jars |
| `games/fungus/src/render/` | The jar scene and every organism, drawn procedurally on a canvas |
| `games/fungus/src/ui/` | Panels (Grow, Evolve, Cultivate, Spores, Journal) and dialogs |
| `games/fungus/src/native.ts` | Phone-only features through Capacitor; no-ops in a browser |
| `games/fungus/ios`, `android` | Native app projects (Capacitor) |
| `games/fungus/tools/` | Renders the app icon and launch screen from the game's own art |
| `games/sporeggar/src/` | Sporeggar rules (`game.ts`), content (`defs.ts`), banner art (`scene.ts`) and screens (`ui.ts`) |
| `shared/market.ts` | Live market engine: seeded price walk, moods, trades, rot |
| `shared/chart.ts` | Live price chart with crosshair readout |
| `shared/storage.ts` | Local save, plus an optional per-player cloud copy when hosted as an artifact |
| `shared/` (rest) | Number formatting, seeded random numbers, DOM helpers |
| `docs/` | Design notes for each game and the road to the app stores |

No framework and no runtime dependencies: TypeScript, Canvas 2D and Vite. Each
build is a single HTML file with fonts inlined, so it runs fully offline.
