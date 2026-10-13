# Humongous Fungus — design notes

## The pitch

Small jar, humongous fungus. A cozy idle game where decay is the engine. You
play the fungus in a sealed terrarium. The name is the nickname of the world's
largest living thing, a honey fungus (*Armillaria*) under an Oregon forest. Everything you grow above ground eventually sheds or dies back into
the soil and feeds you, so the jar fills with life the longer you play.

## Core loop

1. **Tap** the jar to digest leaf litter into **nutrients**.
2. **Grow** producers that digest for you (Grow tab). Each costs 15% more than
   the last. Owning 25, 50, 100, 150… of one doubles its output.
3. **Evolve** one-time upgrades (×2 per species, partnerships between species,
   stronger taps, whole-jar bonuses, longer time away).
4. **Cultivate** rare specimens that take real time to grow (5 minutes up to 24
   hours) and give permanent bonuses. One bed, one at a time.
5. **Seal the jar** (prestige) once a jar has digested 10B nutrients: release
   spores (+10% production each, forever) and start a new jar in a new biome.

## Things that make waiting feel good

- **Time away counts.** The game simulates the gap since the last save:
  full base rate for up to 2 hours, raised by Dormancy upgrades and the Ghost
  pipe specimen. The welcome-back screen shows what the jar earned.
- **The jar visibly changes.** The mycelium network branches through the soil
  as it grows, and each producer appears in the scene (counts scale with the
  square root of what you own, so there is always a bit more to see).
- **Blooms.** A golden mushroom appears every few minutes while the game is
  open. Tap it for a 30-second ×7 frenzy or a lump of nutrients.
- **Collection.** The Journal tracks 14 species with their real Latin names.

## Species

| Producer | Real species | Base cost | Base rate |
|---|---|---|---|
| Hyphae | (your own threads) | 15 | 0.1/s |
| Bonnet mushrooms | *Mycena galericulata* | 100 | 1/s |
| Cushion moss | *Leucobryum glaucum* | 1.1K | 8/s |
| Springtails | *Folsomia candida* | 12K | 47/s |
| Boston ferns | *Nephrolepis exaltata* | 130K | 260/s |
| Pill bugs | *Armadillidium vulgare* | 1.4M | 1.4K/s |
| Garden snails | *Cornu aspersum* | 20M | 7.8K/s |
| Dyeing dart frogs | *Dendrobates tinctorius* | 330M | 44K/s |

Specimens: Glowcap (5m), Cape sundew (30m), Pixie-cup lichen (2h),
Coral fungus (4h), Ghost pipe (8h), Golden stag beetle (24h).

## Pacing (from `npm run sim`)

A greedy simulated player, tapping 3/s while the game is open:

| Opens the game | First possible jar seal (10B) |
|---|---|
| Every 30 min for 3 min | about 4.5 hours |
| Every hour for 3 min | about 6 hours |
| Every 2 hours for 3 min | about 10 hours |

Real players buy less efficiently, so expect the first seal on day one or two.
Tune with `SPORE_REQUIREMENT`, `COST_GROWTH` and `MILESTONES` in `defs.ts`.

## Money (planned, not built)

Idle players accept a specific model, and it works offline:

- **Optional rewarded ads only**: double the welcome-back haul, or 2× speed
  for 4 hours. Never forced ads.
- **One purchase, $3–5**: removes ads and makes 2× earnings permanent.
- Later, optional cosmetic packs (jar shapes, lids, biome themes).
- No energy systems or pay-to-skip walls.

## Road to the stores

1. **Wrap with Capacitor** (`@capacitor/core`, `ios`, `android`). The web
   build already runs offline in a WebView.
2. **Saves** through `@capacitor/preferences` instead of local storage, which
   iOS can evict.
3. **Local notifications** when a specimen finishes growing or the away limit
   fills up. This is the biggest retention lever for the genre.
4. **Haptics** on taps and purchases.
5. **Ads and purchases**: AdMob rewarded ads plus RevenueCat for the one-time
   purchase, with the iOS tracking prompt and Google's consent form.
6. **Builds without a Mac**: iOS builds on GitHub Actions macOS runners or a
   cloud build service.
7. **Store accounts**: Apple Developer ($99/yr) and Google Play ($25 once).
   Google requires new personal accounts to run a closed test with 12+ testers
   for 14 days before release, so recruit testers early.

## Ideas for later


- Biomes with real rules (Peat Bog: moss is stronger, frogs weaker).
- A second cultivation bed bought with spores.
- Seasons on a real-world calendar.
- Spore upgrade tree instead of a flat +10% per spore.
