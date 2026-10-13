# Humongous Fungus: App Store listing

Copy these into App Store Connect. Character limits are Apple's; every field here fits.

| Field | Value |
|---|---|
| Name (30) | Humongous Fungus |
| Subtitle (30) | Idle terrarium: rot & bloom |
| Bundle ID | com.muffindevelopment.humongousfungus |
| SKU | humongous-fungus-ios |
| Primary category | Games → Simulation |
| Secondary category | Games → Casual |
| Price | Free |
| Age rating | 4+ (answer "None" to every question in the questionnaire) |
| Copyright | 2026 Muffin Development |
| Privacy | Data Not Collected |
| Privacy policy URL | where you host `site/humongous-fungus/privacy.html` |
| Support URL | where you host `site/humongous-fungus/support.html` |

## Keywords (100, comma-separated, no spaces)

```
idle,incremental,clicker,terrarium,mushroom,fungi,mycelium,cozy,garden,nature,offline,frog,moss,jar
```

## Promotional text (170, can change any time without review)

```
Tap to digest fallen leaves, then grow moss, mushrooms, ferns and frogs. Your jar keeps growing while you're away.
```

## Description (4000)

```
Small jar. Humongous fungus.

You are a fungus: a web of threads living in the soil of a sealed terrarium. Tap the soil to digest fallen leaves into nutrients, then spend them to grow life above ground. Everything that grows eventually sheds and dies back into the soil, and feeds you more.

WATCH IT GROW
Your network visibly branches through the soil as it grows. Moss, bonnet mushrooms, ferns, springtails, pill bugs, snails and dart frogs move in, and the jar fills up a little more every time you look.

IT KEEPS GROWING WHILE YOU'RE AWAY
Close the app and come back to a jar that kept digesting without you. Upgrades let it keep going for longer.

GROW RARE SPECIMENS IN REAL TIME
Plant a Glowcap, a Cape sundew or a Ghost pipe and wait. Some take minutes, some take a day. Once harvested, they're yours forever. Get a reminder when one is ready.

SEAL THE JAR, START A NEW ONE
When a jar is full, seal it to release spores and begin again in a new biome: Cloud Forest, Peat Bog, Limestone Cave. Every spore makes the next jar grow faster.

A FIELD JOURNAL OF REAL SPECIES
Fourteen species to find, each with its real Latin name, from Mycena galericulata to Dendrobates tinctorius.

- Plays fully offline
- No ads, no accounts, no data collected
- Made by one person at Muffin Development
```

## Screenshots

`store/screenshots/` holds five 1320×2868 PNGs for the 6.9-inch iPhone slot, which
is the only size Apple requires. Upload them in order:

1. `1-jar.png`: the jar, mid-game
2. `2-away.png`: the welcome-back screen
3. `3-cultivate.png`: a specimen growing in real time
4. `4-new-biome.png`: the Cloud Forest jar after sealing
5. `5-journal.png`: the species journal

Regenerate them after visual changes with the script in `docs/app-store-checklist.md`.

## App Review notes

```
Humongous Fungus is an offline idle game. No account or login is needed.
Tap the jar to earn nutrients, and spend them in the Grow tab. Local
notifications are optional and only remind the player when a specimen they
planted has finished growing or the jar has stopped growing.
```
