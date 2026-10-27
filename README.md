# Fungus games

Three mobile games that share one codebase.

| Game | What it is | Folder |
|---|---|---|
| **Humongous Fungus** | Idle game: you are a mycelium network growing a terrarium in real time, even while the game is closed | `games/fungus` |
| **Sporemonger** | Trading game: buy and sell goods on a live market in a mushroom town, before they rot | `games/sporemonger` |
| **Sugar Crash** | A crash game for play money: a multiplier climbs until it crashes, and you cash out before it does. Provably fair rounds, a table of made-up players, auto cash-out, and five picks of look (Sugar Rush, Hot Wing Challenge, Grandma's Balloons, Shopping Cart Hill, Espresso Intern) | `games/sugarcrash` |

## Branches

Each game has its own branch, off `main`: `humongous-fungus`, `sporemonger`,
`hammygotchi`, `last-muffin-standing`, `ticker-rush` and `sugar-crash`. Work
on a game happens on its branch.

## Run it

```sh
npm install
npm run dev              # Humongous Fungus on a local server; open the URL on your phone (same Wi-Fi)
npm run dev:sporemonger  # Sporemonger
npm run dev:sugarcrash   # Sugar Crash
npm test                 # unit tests for every game and the shared code
npm run build            # type-check, then build each game into one self-contained dist/<game>/index.html
npm run build:artifact   # also writes dist/<game>/artifact.html for sharing as claude.ai pages
npm run sim              # Humongous Fungus pacing simulator: npm run sim -- [taps/s] [hours] [gap min] [session min]
npm run sim:sugarcrash   # Sugar Crash balance check: what each cash-out target pays back over a million rounds
```

## Phone apps

Humongous Fungus and Sporemonger are packaged for iOS and Android with [Capacitor](https://capacitorjs.com):
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

Sugar Crash has its Capacitor config and phone features (`src/native.ts`:
durable saves, haptics, going quiet in the background) ready; its native
projects can be added with `npx cap add ios` / `npx cap add android` in
`games/sugarcrash` when it's headed for the stores. It's a simulated gambling
game (play money only), so expect a 17+ rating on the App Store and an adult
audience on Google Play: see [docs/sugarcrash.md](docs/sugarcrash.md).

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
| `games/sugarcrash/src/` | Sugar Crash: provably fair crash points (`fair.ts`), the round table and the crowd (`game.ts`), your coins, bets and saves (`meta.ts`), numbers and names (`defs.ts`), the chart and shouts on screen (`scene.ts`), controls and cards (`ui.ts`), sounds (`sound.ts`); one file per look in `themes/` (`sugar`, `wings`, `balloons`, `cart`, `espresso`: art, colors, words, crowd, sound) |
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
   the game's branch, for example `docs/releases/sugar-crash-v1.0.0.md` on
   `sugar-crash`.
3. The Release workflow (`.github/workflows/release.yml`) tests and builds the
   game and opens the draft (pushing changed notes updates it).
4. Publish the draft from the repo's Releases page. That creates the tag,
   like `sugar-crash-v1.0.0`.

Pushing a tag yourself works too.
