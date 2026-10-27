# Hammygotchi — design notes

A virtual pet who is a burden. Cube Hammy lives in a human containment unit:
two floors behind glass, with a bed, an armchair, a gaming PC, a toilet, a
shower, a fridge and an oven. He only eats delivery (DoorDosh, mostly
Dorkitos) or what you cook him, he farts, he stinks, and he's too lazy to use
the toilet or the shower by himself. The scientist watching him through the
window can't stand him. Keep him fed, clean and happy, or he dies, rots,
turns into mushrooms, and leaves a skeleton that says YOU LOSE.

He's based on a real person, War, who asked for all of this.

Everything runs in real time, also while the game is closed.

## Needs

Four meters, all full is good:

| Meter | Drains | Fills from |
|---|---|---|
| Belly | 7 an hour | DoorDosh orders, steak from the oven |
| Fresh | 2 an hour, plus 2.5 an hour for each poop on the floor, plus every fart | Scooping poop, the shower, the toilet, a side salad |
| Mood | 5 an hour, faster with a pile of unread texts, and 3 for each missed call | Texts, calls, petting, throwing him, his bed, chair and PC, most food |
| Health | Only while a need is empty: 5 an hour for each empty one | Recovers 10 an hour while every need is at least 25 |

From full, about a day of complete neglect kills him: mood runs out first, at
about 10 hours, then fresh, and he dies at about 23. A night's sleep leaves him
sad but alive.

## The containment unit

Two floors. Downstairs: the shower, the toilet, his armchair, the fridge, the
oven and a ladder. Upstairs, on a loft: his bed, a plant and his gaming PC.
The scientist's window is in the back wall downstairs, and DoorDosh comes
through a hatch in the ceiling. Everything is drawn in `src/room.ts`;
`src/scene.ts` runs it.

How it looks: glazed tiles, strip lights with soft beams and pools of light on
the floors, shade in the corners and under the loft, and a shadow under every
piece of furniture and under Hammy (smaller the higher he's thrown). The walls
have a HANG IN THERE poster, a NO FARTING sign nobody reads, a spice shelf,
pizza boxes on the fridge, a security camera with its recording light, and a
clock that tells your real time. The lab follows your clock too: from 6pm the
unit dims and the lamps take over, back to daylight by 8am. The PC plays a
little platformer with RGB on everything, the fridge lights up inside, and the
oven glows when something's cooking. All of that is painted once into a
cached layer (repainted only when the light level steps), so the frame cost is
just the moving parts.

Hammy walks around on whichever floor he's on, sits in his chair, goes to bed
and games at his PC on his own, and now and then climbs the ladder or walks
off the edge of the loft. What he won't do by himself:

- **The toilet.** Every meal comes out 2–5 minutes later. When one's due he
  does a pee dance and tells you, and you have 75 seconds to pick him up and
  drop him on the toilet (or tap Toilet in the Care tab): +4 coins and a
  little freshness for each one. Too slow and it lands on the floor behind
  him, on whichever floor he's on. Tap a poop to scoop it for 3 coins. Up to
  8 on the floors.
- **The shower.** Drop him in it (or tap Shower): +40 fresh, a little mood
  lost, and the hot water needs 90 seconds to come back. Soap from the shop
  adds more fresh, and the better soaps stop him minding.
- **Food on the other floor.** He eats what lands on his floor and whines
  about the rest. "Bring it here."

Furniture is a drop target. Let go of him over it (or throw him onto it) and
he uses it: the bed and the chair lift his mood a little every few seconds,
up to a point, and the PC does too and earns a coin every 30 seconds from his
stream. He gets up after a while, or when food lands near him.

## Being a burden

- **DoorDosh.** Seven things on the menu, Dorkitos are free. Food arrives
  7–16 seconds after you order (the bag drops through the hatch, onto the
  loft if he's up there, and he waddles over to eat it). More food than his
  belly holds turns into gas. Gas station sushi is cheap and costs him health;
  if he's already weak it kills him.
- **Cooking.** Tap the fridge for a raw steak (5 coins). Drag it onto the
  oven: after 6 seconds it's a steak (+40 belly, +8 mood), after 16 it's
  charcoal and the smoke alarm goes off. Drag it to him to eat. He'll eat it
  raw too, and it costs him health and gives him gas.
- **He orders for himself.** When his belly drops below 20, he orders on your
  coins and tips the driver 5 more. His own orders take 10–25 minutes because
  the driver gets lost. With no coins he can't, and starves.
- **Gas.** He farts every few minutes on an empty stomach and every ~12
  seconds after a burrito. Each fart costs some freshness, makes a green cloud,
  a noise (synthesized, no two the same), and pushes him across the unit.
- **The scientist.** Watches him through the window, says things when it
  smells, puts on a gas mask below 45 fresh and evacuates below 18 (back
  above 33). The plant on the loft wilts as it gets worse.

## Stuff for the unit

Bought with coins in the Shop, and kept when he dies:

| Item | Price | What it does |
|---|---|---|
| Robot vacuum | 150 | Drives around the ground floor and eats poop. While you're away, eats one every 45 seconds. |
| Second robot vacuum | 400 | One on the loft too; away, they eat twice as fast |
| Bar soap | 30 | Showers: +12 fresh |
| Body wash | 90 | Showers: +24 fresh, and he minds less |
| Fancy soap | 220 | Showers: +40 fresh, and he comes out happy |

## The phone

- **Texts.** He texts you every 10–30 minutes about whatever is going on
  (hungry, stinky, lonely, or random road-trip nonsense). You pick from three
  replies; each text is worth 7 mood and a coin. Five texts in a row and he
  tells you to chill; one comes back every 3 minutes.
- **Calls.** Call him from the Phone tab: mood builds 1.2 a second, up to 30.
  Calls over 8 seconds pay coins. Afterwards he's "in a game" for 4 minutes.
  He calls you too, every 6–14 minutes while you're watching: answering is
  worth extra, declining hurts more than missing it. While you're away he
  calls every 1–3 hours, and you miss every one.

## Cube Hammy, and some days a meatball sub

Hammy is an avatar: mostly Cube Hammy, a cube with War's eyes, eyeshadow and
lips, little arms and sneakers. His first day he's
always a cube; after that, every day at local midnight, he wakes up as one
of four forms, never the same two days running and a cube three times as
often as the others: cube, hamster, meatball sub or train (`formOnDay` in
`src/game.ts`, walked from his first day so it's the same on every device).
The first time you open the game on a new day he changes in a puff of smoke
and says so.

The face is drawn until War's photos are added: put `eyes.png`, `mouth.png`
and optionally `mouth-open.png` in `assets/face/` (see the README there) and
the cube uses them, squashing the eyes to blink and swapping mouths to talk.

Hats and glasses go on whatever he is (a cowboy hat sits on the train's cab
roof); shirts and costumes show on cube and hamster days. Each form has its
own size and physics box, its own lines ("Choo choo.", "I'm a sandwich today.
Don't ask.") and its own fart: a train toots its whistle. A dead hamster keels
over; everything else goes belly-up, and the skeleton underneath is always a
hamster's.

## The toy box

Like the item bar in the old Flash pet games: a row of toy icons under the
unit. Pick one (a toast says what it does), then use it in the unit.

| Toy | Price | How | Per hit |
|---|---|---|---|
| Hand | free | Drag to throw him or drop him on furniture, tap to pet, tap poop to scoop, tap the fridge, drag steaks | mood from throws and pets |
| Feather | free | Rub it on him: he giggles | +3 mood, +1 coin |
| Bouncy ball | free | Drag and let go to throw; he kicks resting balls back | +2 mood, +1 coin |
| Boxing glove | 30 | Tap him: a glove on a spring punches out of the nearest wall | −5 mood, +3 coins |
| Water balloon | 40 | Tap above him: it drops and splashes | −3 mood, +10 fresh, +2 coins |
| Cream pie | 60 | Tap anywhere: it always finds his face | −1 mood, +4 belly, +3 coins |
| Whoopee cushion | 80 | Tap the floor to put it down; he walks over to sit on it | +4 mood, +2 coins |
| Magnet | 120 | Hold to pull him around the unit | +1 mood, +1 coin |
| Firecracker | 200 | Tap to light; after the fuse it blows him across the unit, with soot | −7 mood, +6 coins |

Nice toys lift his mood; mean ones pay more and cost mood, so farming coins
with the glove has a price. A toy only counts once every 1.5 seconds
(`PLAY_COOLDOWN`), though every use still plays out in the unit. Toys are kept
when he dies.

## Hammy coins and fits

Coins come from scooping poop, the toilet, texting, calls, toys, his stream,
and 12 an hour while he's in a good mood (he won't say how). They buy fits: Road trip (40), Gamer (90),
Cowboy (150), Shroom hat (220), Hot dog (320), Astronaut (480, the stink
fogs up the helmet), Wizard (650) and Golden Hammy (1000). Fits are kept
when he dies; coins start over at 50.

## Weird physics

He's a soft body with too much bounce. Grab him and throw him (he loves it,
a little mood every couple of seconds), and he bonks off the glass, lands on
the loft if he comes down on it, and squashes on landing. Every few minutes gravity glitches for a few seconds:
he floats to the lid, goes moon-bouncy, slides sideways into a wall, or
bounces higher every time.

## Things he says

Out of nowhere, as if he were in the back seat of a car: "Are we there
yet?", "Shotgun!", "Is this still Ohio?", "Toll booth! Everyone hold your
breath." Plus lines for farts, throws, food, the toilet, the shower, his furniture and
how he's feeling. All in `src/defs.ts`.

War can record his own: drop clips named after the kind of line into
`assets/voice/` (`fart.m4a`, `toilet-2.mp3`; the README there lists every
kind) and they play when he says one, unless the sound is off. Anything
without a recording stays silent text.

## Dying

When health hits zero he flops over with X eyes. Over the next 42 seconds he
turns green, flies show up, mushrooms sprout out of him (honey fungus,
toadstools and glowcaps, a nod to Humongous Fungus), he fades away to a
skeleton, and YOU LOSE comes up. Then you can get a new Hammy, who wants to
know what happened to the last guy. The Life tab keeps a graveyard with how
long each one lasted, how many times he farted, and what got him.

## Layout

The unit gets the screen. A slim header with his coins and four meters on top,
the unit taking whatever height is left, an icon toy bar under it, and four
tabs at the bottom. On phones a tab slides its section up as a sheet over the
lower part of the unit (tap the tab again, the ✕ or Escape to put it away);
from 900px wide the sections are docked beside the unit.

## On phones

`src/native.ts` follows the other two games: durable saves, haptics (a heavy
one for big farts), and reminders. When the app goes to the background it
plays a copy of Hammy forward a day and schedules his next text as a
notification, plus one for the moment he gets into trouble (starving,
lonely, biohazard, or dying).

The iPhone and Android projects are in `ios/` and `android/`, set up like the
other games (portrait only, signed from GitHub secrets, notification icon,
privacy manifest). Builds run on GitHub Actions (`ios-hammygotchi.yml`,
`android-hammygotchi.yml`); the store steps are Part 4 of
`docs/app-store-checklist.md`, and store text and screenshots are in `store/`.

## Ideas for later

- A treadmill that earns coins while he runs (he won't).
- Visitors: the DoorDosh driver sticks around and judges him.
- Sleep at night, with snoring that also counts as farts.
- More of War's voice lines: calls on the phone could use them too.
