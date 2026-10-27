# Last Muffin Standing: design notes

A survivors game (the Vampire Survivors and Megabonk kind) in a bakery. You
are a muffin on the bakery floor after closing, and everything that eats
muffins is coming for you. You only move; your weapons fire on their own. Kill
pests, pick up the sprinkles they drop, level up, pick an upgrade, repeat,
until 6 AM when the bakery opens. Then spend the crumbs you brought home on
upgrades that make the next night easier.

The rules are in `games/lastmuffin/src/run.ts`, a pure simulation with its own
seeded random numbers and no DOM, so tests (`tests/lastmuffin/`) and a
headless bot can play whole runs. Every number is in `src/defs.ts`.

## A night

- **12 minutes**, shown as a clock on the wall from 12:00 AM to 6:00 AM.
  Survive until sunrise and you win (+100 crumbs). Then you can head home or
  keep going in overtime, where the pests keep coming and get tougher fast.
- **Moving:** put your thumb anywhere and drag (the stick appears where you
  touched), or WASD and the arrow keys. **Hop** (the button, Space or Shift)
  is a quick dash you can't be hurt during, every 3.5 seconds.
- **Health:** 100, plus upgrades. Every pest touching you hurts (at most once
  every 0.6 seconds each); armor takes some off every hit, but never below 1.
  Milk heals 30.
- **Sprinkles** are experience: every pest drops some, and they fly to you
  when you're close. Level 2 takes 5, and each level after needs 8 more than
  the last (11 more from level 20, 14 from 40).
- **Crumbs** are the money you keep. Some pests drop them, bosses' pie tins
  hold 40, sunrise is worth 100, and the Tip Jar adds more.

## Leveling up

Each level offers three picks: a new weapon, a level for one you have, a new
passive or a level for one you have. You can carry five weapons and five
passives, each up to level 5. Rerolls come from the Pantry; skipping heals 10.
With everything maxed, the picks are a snack (+25 crumbs) or milk.

### Weapons

| Weapon | What it does | Evolves with | Into |
|---|---|---|---|
| Blueberry Blaster | Fires blueberries at the nearest pests | Yeast | Blueberry Gatling |
| Butter Knives | Knives circle you | Baking Powder | The Cutlery Drawer |
| Crumb Burst | A ring of crumbs bursts out of you | Extra Batter | Crumb Apocalypse |
| Hot Coffee | Steam around you burns and slows pests | Preservatives | Espresso Field (heals you a little per kill) |
| Rolling Pin | Thrown, spins out and back, hits everything | Big Bonk | The Bonkinator (every hit BONKs) |
| Sprinkle Storm | Sprinkles fall on random pests on screen | Muffin Top | Sprinkle Monsoon |
| Whisk | Swipes in front of you, then behind, sending pests flying | Sugar Rush | Stand Mixer (all four sides) |
| Frosting Bomb | Lobs frosting that leaves sticky, hurting puddles | Oven Mitts | Frosting Flood |

**Evolution:** a weapon at level 5, plus its passive at any level, plus a pie
tin from a boss. Pie tins without an evolution level up one to three things
you already have.

### Passives

Extra Batter (+20 health), Oven Mitts (+1 armor), Sugar Rush (+8% speed),
Baking Powder (+10% weapon size), Yeast (7% shorter cooldowns), Muffin Top
(+25% pickup range), Preservatives (+0.25 health a second) and **Big Bonk**
(+5% chance to BONK).

### BONK

Every hit has a chance (3% to start) to be a BONK: triple damage, a huge
knockback, a big yellow BONK! over the pest and the best sound in the game.

## Pests

Ants and fruit flies first, then mice, cockroaches, mold (which splits into
three little molds), raccoons and seagulls. Each minute of the night has its
own mix, spawn rate and cap (`WAVES`), and pests get 10% more health every
minute. Pests spawn just off screen, mostly ahead of you when you run, and
ones left far behind come back around ahead of you, so you can't just outrun
the night.

At set times: a ring of pests closes in around you (ants at 1:15, cockroaches,
mold, raccoons later), flocks of pigeons and seagulls fly straight across, and
three bosses arrive:

- **3:00 The Queen Ant** keeps laying ants.
- **6:00 The Rat King** charges at you every few seconds.
- **9:00 The Toaster** fires toast.

Red arrows at the edge of the screen point at bosses you can't see, yellow
ones at pie tins.

## Muffins

| Muffin | Starts with | Perk | Unlock |
|---|---|---|---|
| Blueberry | Blueberry Blaster | Balanced | Free |
| Chocolate Chip | Rolling Pin | +15% damage | 150 crumbs |
| Bran | Hot Coffee | +50 health, 10% slower | 250 |
| Lemon Poppyseed | Sprinkle Storm | +15% speed, +5% bonk | 400 |
| Banana Nut | Butter Knives | +1 armor, +20% weapon size | 600 |
| Corn Muffin | Crumb Burst | +40% pickup range, +10% sprinkles | 900 |
| Double Chocolate | Whisk and Big Bonk | +10% bonk | Win a night |

## The Pantry

Upgrades bought with crumbs between runs, kept forever: damage, health,
armor, speed, pickup range, sprinkles, crumbs, cooldowns, rerolls and one
revive a run (Day-Old Discount: back at half health, everything nearby
knocked away).

## Balance

`scripts/lastmuffin-sim.ts` has a bot that kites the swarm, grabs sprinkles
and picks weapon upgrades first play whole nights
(`npx tsx scripts/lastmuffin-sim.ts blueberry 6 2`). Roughly: with no Pantry
upgrades, most nights end between 5 and 10 minutes and one in six to one in
three reaches sunrise; with every Pantry upgrade at level 2, about a third
do; at level 4, all of them. (It's a poor player with melee weapons: it runs
away from everything, so the Whisk and Hot Coffee look worse than they are.) A night brings home 30 to 400 crumbs, so the first few
Pantry levels and muffins come within a handful of nights.

## Saving

Only what carries over is saved (crumbs, Pantry, muffins, records, pests
met, weapons evolved), in local storage, the phone's own storage in the app,
and a per-player cloud copy when played as a claude.ai artifact. A run isn't
saved: going to the background pauses it, and if the game is closed mid-run
the crumbs from that run are banked the next time it opens.

## Ideas for later

- More maps: the walk-in fridge (slippery floor), the dumpster out back.
- Arcanas-style run modifiers bought in the Pantry.
- Native iOS and Android projects and store listings, like the other games.
