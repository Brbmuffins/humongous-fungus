# Hammygotchi — design notes

A virtual pet who is a burden. Hammy lives in a glass tank on your desk. He
only eats delivery (DoorDosh, mostly Dorkitos), he poops, he farts, he stinks,
and the other animals in the tank can't stand him. Keep him fed, clean and
happy, or he dies, rots, turns into mushrooms, and leaves a skeleton that says
YOU LOSE.

Everything runs in real time, also while the game is closed.

## Needs

Four meters, all full is good:

| Meter | Drains | Fills from |
|---|---|---|
| Belly | 7 an hour | DoorDosh orders |
| Fresh | 2 an hour, plus 2.5 an hour for each poop on the floor, plus every fart | Scooping poop, the hose, a side salad |
| Mood | 5 an hour, faster with a pile of unread texts, and 3 for each missed call | Texts, calls, petting, throwing him, most food |
| Health | Only while a need is empty: 5 an hour for each empty one | Recovers 10 an hour while every need is at least 25 |

From full, about a day of complete neglect kills him: mood runs out first, at
about 10 hours, then fresh, and he dies at about 23. A night's sleep leaves him
sad but alive.

## Being a burden

- **DoorDosh.** Seven things on the menu, Dorkitos are free. Food arrives
  7–16 seconds after you order (the bag drops through a hatch in the lid and
  he waddles over to eat it). More food than his belly holds turns into gas.
  Gas station sushi is cheap and costs him health; if he's already weak it
  kills him.
- **He orders for himself.** When his belly drops below 20, he orders on your
  coins and tips the driver 5 more. His own orders take 10–25 minutes because
  the driver gets lost. With no coins he can't, and starves.
- **Gas.** He farts every few minutes on an empty stomach and every ~12
  seconds after a burrito. Each fart costs some freshness, makes a green cloud,
  a noise (synthesized, no two the same), and pushes him across the tank.
- **Poop.** Every meal comes out 2–5 minutes later. Tap a poop to scoop it for
  3 coins. Up to 8 on the floor.
- **Neighbors.** A frog, a snail on the glass and a pill bug. They complain
  when it smells, put clothespins on below 45 fresh, and leave the tank below
  18 (they come back above 33).

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

## Hammy coins and fits

Coins come from scooping poop, texting, calls, and 12 an hour while he's in a
good mood (he won't say how). They buy fits: Road trip (40), Gamer (90),
Cowboy (150), Shroom hat (220), Hot dog (320), Astronaut (480, the stink
fogs up the helmet), Wizard (650) and Golden Hammy (1000). Fits are kept
when he dies; coins start over at 50.

## Weird physics

He's a soft body with too much bounce. Grab him and throw him (he loves it,
a little mood every couple of seconds), and he bonks off the glass and
squashes on landing. Every few minutes gravity glitches for a few seconds:
he floats to the lid, goes moon-bouncy, slides sideways into a wall, or
bounces higher every time.

## Things he says

Out of nowhere, as if he were in the back seat of a car: "Are we there
yet?", "Shotgun!", "Is this still Ohio?", "Toll booth! Everyone hold your
breath." Plus lines for farts, throws, food, the hose and how he's feeling.
All in `src/defs.ts`.

## Dying

When health hits zero he flops over with X eyes. Over the next 42 seconds he
turns green, flies show up, mushrooms sprout out of him (honey fungus,
toadstools and glowcaps, a nod to Humongous Fungus), he fades away to a
skeleton, and YOU LOSE comes up. Then you can get a new Hammy, who wants to
know what happened to the last guy. The Life tab keeps a graveyard with how
long each one lasted, how many times he farted, and what got him.

## On phones

`src/native.ts` follows the other two games: durable saves, haptics (a heavy
one for big farts), and reminders. When the app goes to the background it
plays a copy of Hammy forward a day and schedules his next text as a
notification, plus one for the moment he gets into trouble (starving,
lonely, biohazard, or dying). The native iOS and Android projects aren't
generated yet: `cd games/hammygotchi && npx cap add ios && npx cap add android`,
then the same store steps as the other games.

## Ideas for later

- A hamster wheel that earns coins while he runs (he won't).
- Visitors: the DoorDosh driver sticks around and judges him.
- Sleep at night, with snoring that also counts as farts.
