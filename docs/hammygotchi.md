# Hammygotchi — design notes

A virtual pet who is a burden. Cube Hammy lives in a human containment unit:
two floors behind glass that come with a toilet and a shower, and you buy
the rest (a bed, an armchair, a gaming PC, a fridge, an oven, a plant). He
lives like a Sim, badly: he goes about his day on his own, walks to the
toilet himself and never flushes, and leaves his trash wherever he's done
with it, so you go to sleep and wake up to a mess. He only eats delivery
(DoorDosh, mostly Dorkitos) or what you cook him, he farts, he stinks, and
he won't shower. The scientist watching him on the camera can't stand
him. Keep him fed, clean and happy, and clean up after him, or he dies,
rots, turns into mushrooms, and leaves a skeleton that says YOU LOSE.

He's based on a real person, War, who asked for all of this.

Everything runs in real time, also while the game is closed.

## Needs

Four meters, all full is good:

| Meter | Drains | Fills from |
|---|---|---|
| Belly | 7 an hour | DoorDosh orders, steak from the oven |
| Fresh | 2 an hour, plus 2.5 an hour for each poop on the floor, 1.5 for each load in the toilet nobody flushed, 0.25 for each piece of trash, plus every fart | Flushing, binning poop and trash, the shower, the toilet, a side salad |
| Mood | 5 an hour, faster with a pile of unread texts, and 3 for each missed call | Texts, calls, petting, throwing him, his bed, chair and PC, most food |
| Health | Only while a need is empty: 5 an hour for each empty one | Recovers 10 an hour while every need is at least 25 |

From full, about a day of complete neglect kills him: mood runs out first, at
about 10 hours, then fresh, and he dies at about 23. A night's sleep leaves him
sad but alive, in a mess: about ten pieces of trash, an unflushed toilet and
whatever didn't make it there.

## The containment unit

Two floors. Downstairs: the shower, the toilet, his armchair, the fridge, the
oven and a ladder. Upstairs, on a loft: his bed, a plant and his gaming PC.
The scientist's intercom is on the back wall downstairs (she watches on the
security camera), DoorDosh comes through a hatch in the ceiling, and a trash
chute is on the stairwell wall.
Everything is drawn in `src/room.ts`; `src/scene.ts` runs it.

A new unit comes with the plumbing only: the toilet and the shower. Where
the rest goes there's floor tape and a stencil (+ BED, + GAMING PC); tap one
and the Shop opens. Furniture arrives in a puff of smoke, stays when he
dies, and only what's bought is there to use: no chair to sit in, no fridge
to raid, no PC to stream from. Saves from before furniture was sold keep the
fully furnished unit they had.

| Furniture | Price | What it's for |
|---|---|---|
| Plant | 25 | Leans away from him and wilts when he stinks |
| Armchair | 40 | Mood while he sits in it |
| Bed | 80 | Mood while he naps |
| Fridge | 90 | Raw steak, 5 coins each; he raids it himself when he's hungry |
| Oven | 120 | Cooks the steak, or burns it |
| Gaming PC | 250 | Mood, and his stream pays 3 coins every 10 seconds while he plays, and 30 an hour while you're away |

Each piece of furniture is drawn to read at a glance on a phone: the toilet
faces you with its lid up, water in the bowl, a plunger and a mat; the
gaming chair faces you on its wheels; the intercom has a grille, a red talk
button and a LAB label.

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

## Living like a Sim, badly

Hammy walks around on whichever floor he's on, sits in his chair, goes to bed
and games at his PC on his own, and now and then climbs the ladder or walks
off the edge of the loft. He takes care of himself, in his own way:

- **The toilet.** Every meal comes out 2–5 minutes later. When one's due he
  does a pee dance, and 7 times in 10 he walks to the toilet himself (down
  off the loft if he has to). He never flushes: "Not flushing that." The
  other times he just stands there, and you have 75 seconds to pick him up
  and drop him on it (or tap Toilet in the Care tab). Too slow and it lands
  on the floor behind him, on whichever floor he's on. Up to 8 on the floors.
- **Flushing is your job.** What's in the bowl stinks, with flies, until you
  tap the toilet to flush it: +3 coins and a little freshness for each load.
  At 4 loads it's clogged, a FLUSH ME sign comes up, nothing more goes in,
  and he goes on the floor instead.
- **Floor poop goes in the toilet.** Pick it up (he says "Ew, you touched
  it") and drag it to the toilet: a dashed ring shows where it'll land, and
  it plops in. Let go anywhere else and it drops to the floor under your
  finger. Tapping one just reminds you to drag it.
- **His trash.** He leaves it wherever he's done with it: the wrapper of
  every meal where he ate it (a Dorkitos bag, a pizza box, burrito foil,
  wing bones, a Glow Juice can, a sushi tray), a can when he gets up from
  the PC, chips from the armchair, socks and tissues from the bed. While
  you're away, something every 30 to 60 minutes, anywhere. Up to 14 pieces.
  Tap one and it sails into the trash chute: +1 coin and a little freshness.
- **The fridge.** When he's hungry and there's a fridge, he helps himself
  (on your coins) and eats the steak raw where it lands.

While you're away he goes to the toilet himself the same 7 times in 10
(until it's clogged), and the welcome-back screen says what he got up to:
"used the toilet 3 times and didn't flush once, pooped on the floor once,
left 9 pieces of trash around." The Care tab has buttons for all of it too:
carry him to the toilet or the shower, flush, put the floor poop in the
toilet, tidy up. Its badge counts the mess, and the first time each chore
comes up a hint over the unit says what to do.

**Walking in on him.** Come back after a while and the welcome-back screen
ends with what you just walked in on, and when you close it there he is,
in the middle of it, for a few seconds: digging through his own trash
(flinging it out of the pile), staring into the toilet (more likely when
it's unflushed), eating out of the fridge with his face (if there's a
fridge), sniffing his own sock, asleep standing up in the shower, or face
squashed on the glass, licking it (it leaves a smear). He has a line for
each, Dr. Moss sometimes has one too, and grabbing him interrupts him
("Knock first!"). `pickCaught` in `src/game.ts` chooses; the scene does
the rest.

What he won't do by himself:

- **The shower.** Drop him in it (or tap Shower): +40 fresh, a little mood
  lost, and the hot water needs 90 seconds to come back. Soap from the shop
  adds more fresh, and the better soaps stop him minding.
- **Food on the other floor.** He eats what lands on his floor and whines
  about the rest. "Bring it here."

Furniture is a drop target. Let go of him over it (or throw him onto it) and
he uses it: the bed and the chair lift his mood a little every few seconds,
up to a point, and the PC does too and earns 3 coins every 10 seconds from
his stream. He gets up after a while, or when food lands near him.

## Gross by nature

Hammy is gross even when he's clean, and the unit knows it:

- There's always a whiff coming off him and at least one fly; both get worse
  as he gets less fresh.
- Every 9–21 seconds he does one of his habits: a long green burp (BUUURP),
  picking his nose (and flicking it), sniffing his armpit (and regretting it)
  or scratching his butt. He has a line for each.
- Everything avoids him. The robot vacuums beep and back away when they get
  close, and won't go near his poop either. The plant on the loft leans away
  when he stands next to it.
- **Dr. Moss**, the scientist, watches him all day on the security camera
  and talks over the intercom: its light blinks and sound comes out when she
  does. When he comes up to the intercom she asks if he's breathing on the
  mic. She introduces herself the first time you play, and tapping the
  intercom gets a word from her. Below 45% fresh she puts on a gas mask and
  says so ("This mask is not rated for him."); below 18% she announces she's
  evacuating and the light goes off.
- The room shows it: a grease stain where he sits in the armchair, drool on
  his pillow, crumbs in the bed, and whatever trash he left lying around.

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
- **The scientist.** Watches him on the camera, says things over the
  intercom when it smells, puts on a gas mask below 45 fresh and evacuates
  below 18 (back above 33). The plant on the loft wilts as it gets worse.

## Stuff for the unit

Upgrades, bought with coins in the Shop next to the furniture, and kept when
he dies:

| Item | Price | What it does |
|---|---|---|
| Robot vacuum | 150 | Drives around the ground floor picking up his trash. Won't touch poop. While you're away, picks up a piece every 20 minutes (it charges in between). |
| Second robot vacuum | 400 | One on the loft too; away, they pick up twice as fast |
| Bar soap | 30 | Showers: +12 fresh |
| Body wash | 90 | Showers: +24 fresh, and he minds less |
| Fancy soap | 220 | Showers: +40 fresh, and he comes out happy |

## The phone

- **Texts.** He texts you every 10–30 minutes about whatever is going on
  (hungry, stinky, lonely, or random road-trip nonsense). Type him anything,
  or pick one of three quick replies; each text is worth 7 mood and a coin.
  Five texts in a row and they stop counting (one comes back every 3
  minutes); he still answers, a bit over it.
- **Calls.** Call him from the Phone tab: mood builds 1.2 a second, up to 30.
  Calls over 8 seconds pay coins. Afterwards he's "in a game" for 4 minutes.
  He calls you too, every 6–14 minutes while you're watching: answering is
  worth extra, declining hurts more than missing it. While you're away he
  calls every 1–3 hours, and you miss every one. On a call he rambles until
  you say something (type it, or tap the mic where the browser can listen),
  then answers you, out loud.

### Talking to him for real

What you type to him, and what you say on a call, gets an answer in
character from Claude, who plays him from `HAMMY_PERSONA` in `src/defs.ts`
plus a few lines about what's going on in the unit right now (`situation`
in `src/game.ts`: his meters, whether he has to go, what's unflushed, his
trash, his furniture, today's form). He remembers the last 16 messages of a
thread or call. `src/talk.ts` does the asking and the speaking:

- **His brain.** Inside claude.ai the page asks Claude itself (the `sample`
  capability, quick tier), on the viewer's own account; Claude asks them to
  allow it the first time. Anywhere else (the phone apps, a plain browser)
  it uses an Anthropic API key added in the Life tab (Claude Opus 5.5 at low
  effort, with server-side refusal fallback on). With neither, or when a
  call fails, he answers from his canned replies, picked by keywords.
- **His voice.** ElevenLabs (`eleven_flash_v2_5`) with a key and a voice ID
  from the Life tab: clone War's voice on ElevenLabs and paste its ID. On the
  phone apps that request goes through Capacitor's native HTTP. Without it,
  or inside claude.ai (whose pages can't reach the network), he uses the
  device's own speech, pitched down. Either way it plays through the game's
  own audio, so the sound switch mutes him too. He talks out loud on calls
  by default; reading his texts out loud is a switch in the Life tab.
- **Your voice.** The call screen's mic uses the browser's speech
  recognition where there is one (Chrome, Safari). It's hidden where there
  isn't, which includes the phone apps' web views for now.
- **The keys** are kept on the device under their own storage key, never in
  the save, which syncs to the cloud. The privacy page says what's sent where
  when they're added.

### Hammy's Arcade

A row of apps on his phone (top of the Phone tab): four betting games on his
coins, modelled on the casino originals. They share their coins, stats and
switches through `src/arcade.ts` and the bet picker, option buttons and card
in `src/arcadeview.ts`; each game's rules are in its own file, its screen in
the matching `…view.ts`. Every game pays back about 99 of every 100 coins bet
over many rounds (`RTP`), and every round's luck comes from the browser's
crypto random numbers.

- **Fart Rocket** (`rocket.ts`): a crash game. You bet, he blasts off the
  roof of the containment building on his own fart, and the multiplier
  climbs (`e^(0.075·t)`: 2× after about 9 seconds, 10× after about 31) until
  something ridiculous ends the flight; bail out before it does. On the way
  up: seagulls, a plane towing an ARE WE THERE YET? banner, clouds, a
  satellite, the moon (which wakes up), a UFO, a fleet of them with a HI
  HAMMY sign, floating Dorkitos and road signs saying it's still Ohio; past
  50× it all goes rainbow. The crash point is `floor(99 / (1 − u)) / 100`, so
  the chance of getting past x is 0.99 / x and about 2 rounds in 100 end on
  the roof. How it ends depends on how high he got: out of gas, a sneeze, a
  Dorkito, a shart, his phone, a seagull, Dr. Moss pulling the plug, a plane,
  burrito cramps, the moon, aliens, Ohio. Four to seven others bet each round
  (Dr. Moss, the robot vacuum, Grandma, the toilet, War…) and parachute off
  him when they bail; the plant never bails. There's an auto bail-out.
- **Hammy Mines** (`mines.ts`): a floor of pizza boxes, 4×4, 8×8 or 16×16,
  with as much poop under them as you choose (from 1 to all but one box).
  Every Dorkito you find multiplies what you'd get back by the odds of that
  box being safe, `(boxes left) / (safe boxes left)`, times 0.99 once; the
  first poop loses the bet. Cash out after any box, or open a random one.
  Runs are capped at 1,000,000×.
- **Hammy Crossing** (`crossing.ts`): walk him across the road a lane at a
  time. Each lane has a set chance of flattening him (Easy 4%, Medium 12%,
  Hard 20%, Daredevil 40%) and the multiplier is `0.99 / (1 − risk)^lanes`,
  shown on each lane's manhole. A lane he makes it across gets a barrier,
  with whatever was coming screeching to a stop behind it. The traffic is
  drawn from straight above in `src/cars.ts`: a cop car with a flashing light
  bar, an ambulance, the Dorkitos truck, a garbage truck, the school bus, a
  pickup with a couch in the back, a tractor, a race car, a DoorDosh
  scooter, a runaway shopping cart, Grandma on her mobility scooter, and
  Train Hammy, smoking. Cash out on any lane, or reach the other side (24,
  22, 20 or 15 lanes).
- **Poop Plinko** (`plinko.ts`): he squats over a board of pegs (8, 12 or 16
  rows) and drops one. It bounces left or right off every row and lands in a
  toilet; low, medium or high risk sets how much the edges pay (up to 1000×
  on 16 rows, high) and how little the clogged middle does. The tables are
  in `plinko.ts`, each paying back just under 99% on a fair bounce. Drop as
  many as you like at once.
- **Your coins.** Bets come out up front; wins pay `floor(bet × multiplier)`.
  A bet on a round that hasn't started comes back, and closing a game or
  leaving the page squares you up the way the round was going: bailed out
  at the current multiplier, or paid where the poop was going to land. Back
  in the unit he says something about how it went. The Life tab keeps each
  game's rounds, coins up or down and best multiplier.
- **Not in the store apps.** Simulated gambling raises an app's age rating,
  so `ARCADE_IN_APPS` in `src/arcade.ts` is false and the iOS and Android
  builds leave the whole arcade out; the browser version has it. Switch it
  on and the age-rating answers in `store/listing.md` and
  `store/play/listing.md` need to change (both say so).

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
| Hand | free | Drag to throw him or drop him on furniture, tap to pet, drag poop into the toilet, tap the toilet to flush, tap trash to bin it, tap the fridge, drag steaks | mood from throws and pets |
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

Coins come from flushing, binning trash, texting, calls, toys, his stream,
and 12 an hour while he's in a good mood (he won't say how), plus 30 an hour
from his stream while you're away once he has a gaming PC. They buy fits: Road trip (40), Gamer (90),
Cowboy (150), Shroom hat (220), Hot dog (320), Astronaut (480, the stink
fogs up the helmet), Wizard (650) and Golden Hammy (1000). Fits are kept
when he dies; coins start over at 150, which is also what you start with.

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
