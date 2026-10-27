# Fungus games

Two mobile games that share one codebase.

| Game | What it is | Folder |
|---|---|---|
| **Humongous Fungus** | Idle game: you are a mycelium network growing a terrarium in real time, even while the game is closed | `games/fungus` |
| **Sporemonger** | Trading game: buy and sell goods on a live market in a mushroom town, before they rot | `games/sporemonger` |

## Run it

```sh
npm install
npm run dev              # Humongous Fungus on a local server; open the URL on your phone (same Wi-Fi)
npm run dev:sporemonger  # Sporemonger
npm test                 # unit tests for both games and the shared code
npm run build            # type-check, then build each game into one self-contained dist/<game>/index.html
npm run build:artifact   # also writes dist/<game>/artifact.html for sharing as claude.ai pages
npm run sim              # Humongous Fungus pacing simulator: npm run sim -- [taps/s] [hours] [gap min] [session min]
```

## Phone apps

Both games are packaged for iOS and Android with [Capacitor](https://capacitorjs.com):
each game folder has its native projects in `ios/` and `android/`, and its
`src/native.ts` adds the phone-only features (durable saves, reminder
notifications, haptics). Builds run on GitHub Actions: iPhone builds upload to
TestFlight (`ios-humongous-fungus.yml`, `ios-sporemonger.yml`), and Android
builds produce a signed bundle for Google Play (`android-humongous-fungus.yml`,
`android-sporemonger.yml`).

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
| `shared/market.ts` | Live market engine: seeded price walk, moods, trades, rot |
| `shared/chart.ts` | Live price chart with crosshair readout |
| `shared/storage.ts` | Local save, plus an optional per-player cloud copy when hosted as an artifact |
| `shared/` (rest) | Number formatting, seeded random numbers, DOM helpers |
| `docs/` | Design notes for each game and the road to the app stores |

No framework and no runtime dependencies: TypeScript, Canvas 2D and Vite. Each
build is a single HTML file with fonts inlined, so it runs fully offline.

## Releases

Each game is released from its own branch, as a draft GitHub release with the
game's single-file HTML attached:

1. Bump the version in `games/<game>/package.json` (and, for games with phone
   apps, `versionName` in `android/app/build.gradle` and `MARKETING_VERSION`
   in the iOS project).
2. Write the notes in `docs/releases/<branch>-v<version>.md` and push them on
   the game's branch, for example `docs/releases/ticker-rush-v1.0.0.md` on
   `ticker-rush`.
3. The Release workflow (`.github/workflows/release.yml`) tests and builds the
   game and opens the draft (pushing changed notes updates it).
4. Publish the draft from the repo's Releases page. That creates the tag,
   like `ticker-rush-v1.0.0`.

Pushing a tag yourself works too. Phone builds still go through the game's
`android-*` and `ios-*` workflows.
