# Fungus games

Three mobile games that share one codebase.

| Game | What it is | Folder |
|---|---|---|
| **Humongous Fungus** | Idle game: you are a mycelium network growing a terrarium in real time, even while the game is closed | `games/fungus` |
| **Sporemonger** | Trading game: buy and sell goods on a live market in a mushroom town, before they rot | `games/sporemonger` |
| **Hammygotchi** | Virtual pet: keep Hammy fed, clean and called in his tank, or he rots into mushrooms | `games/hammygotchi` |

## Run it

```sh
npm install
npm run dev              # Humongous Fungus on a local server; open the URL on your phone (same Wi-Fi)
npm run dev:sporemonger  # Sporemonger
npm run dev:hammygotchi  # Hammygotchi
npm test                 # unit tests for every game and the shared code
npm run build            # type-check, then build each game into one self-contained dist/<game>/index.html
npm run build:artifact   # also writes dist/<game>/artifact.html for sharing as claude.ai pages
npm run sim              # Humongous Fungus pacing simulator: npm run sim -- [taps/s] [hours] [gap min] [session min]
```

## Phone apps

Humongous Fungus and Sporemonger are packaged for iOS and Android with [Capacitor](https://capacitorjs.com):
each game folder has its native projects in `ios/` and `android/`, and its
`src/native.ts` adds the phone-only features (durable saves, reminder
notifications, haptics). Builds run on GitHub Actions: iPhone builds upload to
TestFlight (`ios-humongous-fungus.yml`, `ios-sporemonger.yml`), and Android
builds produce a signed bundle for Google Play (`android-humongous-fungus.yml`,
`android-sporemonger.yml`).
Hammygotchi has its Capacitor config and `src/native.ts`, but its native
projects aren't generated yet (see [docs/hammygotchi.md](docs/hammygotchi.md#on-phones)).

- **Getting them on the App Store and Google Play:** [docs/app-store-checklist.md](docs/app-store-checklist.md)
- **Store text and screenshots:** `games/<game>/store/` (Apple) and `games/<game>/store/play/` (Google)
- **Privacy policy and support pages:** `site/humongous-fungus/` and `site/sporemonger/`

After changing a game, copy it into its native projects with
`cd games/fungus && npm run sync` (or `games/sporemonger`).

## Layout

| Path | What it holds |
|---|---|
| `games/fungus/src/game/` | Humongous Fungus rules and content: producers, upgrades, specimens, away time, sealing jars |
| `games/fungus/src/render/` | The jar scene and every organism, drawn procedurally on a canvas |
| `games/fungus/src/ui/` | Panels (Grow, Evolve, Cultivate, Spores, Journal) and dialogs |
| `games/fungus/src/native.ts` | Phone-only features through Capacitor; no-ops in a browser |
| `games/fungus/ios`, `android` | Native app projects (Capacitor) |
| `games/*/tools/` | Renders each game's app icon, launch screen and Play feature graphic |
| `games/sporemonger/src/` | Sporemonger rules (`game.ts`), content (`defs.ts`), banner art (`scene.ts`), screens (`ui.ts`) and phone features with price-move reminders (`native.ts`) |
| `games/sporemonger/ios`, `android` | Native app projects (Capacitor) |
| `games/hammygotchi/src/` | Hammygotchi rules (`game.ts`), content and every line he says (`defs.ts`), the tank and its physics (`scene.ts`), Hammy and his fits (`hammy.ts`), synthesized sounds (`sound.ts`), screens (`ui.ts`) and phone features (`native.ts`) |
| `shared/market.ts` | Live market engine: seeded price walk, moods, trades, rot |
| `shared/chart.ts` | Live price chart with crosshair readout |
| `shared/storage.ts` | Local save, plus an optional per-player cloud copy when hosted as an artifact |
| `shared/` (rest) | Number formatting, seeded random numbers, DOM helpers |
| `docs/` | Design notes for each game and the road to the app stores |

No framework and no runtime dependencies: TypeScript, Canvas 2D and Vite. Each
build is a single HTML file with fonts inlined, so it runs fully offline.
