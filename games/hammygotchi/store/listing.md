# Hammygotchi: App Store listing

Copy these into App Store Connect. Character limits are Apple's; every field here fits.

| Field | Value |
|---|---|
| Name (30) | Hammygotchi |
| Subtitle (30) | A virtual pet who is a lot |
| Bundle ID | com.muffindevelopment.hammygotchi |
| SKU | hammygotchi-ios |
| Primary category | Games → Simulation |
| Secondary category | Games → Casual |
| Price | Free |
| Age rating | Answer "Infrequent/Mild" for Cartoon or Fantasy Violence (boxing glove, firecracker, all slapstick) and for Profanity or Crude Humor (farts and poop); "None" for everything else. Expect 9+. |
| Copyright | 2026 Muffin Development |
| Privacy | Data Not Collected |
| Privacy policy URL | where you host `site/hammygotchi/privacy.html` |
| Support URL | where you host `site/hammygotchi/support.html` |

Fart Rocket, the betting game on Hammy's phone, is left out of the app
builds (`ROCKET_IN_APPS` in `games/hammygotchi/src/rocket.ts` is false), so
the answers above stay right. If you switch it on, answer "Frequent/Intense"
for Simulated Gambling (bets of in-game coins, no real money) and expect a
teen or older rating.

The optional "talk to him" feature (Life tab) sends what the player types
or says to Anthropic and ElevenLabs, but only with the player's own API keys
and straight from the device. It's off until a key is added. If review asks,
answer the privacy questions as User Content sent to third parties for App
Functionality, not linked to the user and not used for tracking. Or ship it
hidden in the store build and keep "Data Not Collected".

If Apple or anyone objects to the name (it nods to a famous toy), the fallback
is **Hammy: A Pet Who Is A Lot**. Nothing in the app needs to change except
`appName` in `capacitor.config.json`.

## Keywords (100, comma-separated, no spaces)

```
virtual pet,funny,fart,pet care,cube,toys,prank,silly,offline,messy,roommate,cooking,hamster,sim
```

## Promotional text (170, can change any time without review)

```
Hammy is a cube in a containment unit. He uses the toilet and never flushes, leaves his trash everywhere, and some days he's a meatball sub. Keep him alive anyway.
```

## Description (4000)

```
Meet Hammy. He's a cube. He lives in a containment unit now. He's a lot.

The unit came with a toilet and a shower, and that's it. The bed, the armchair, the fridge, the oven and the gaming PC are on you. He only eats delivery, mostly Dorkitos. He farts, a lot, and every fart sends him flying. The scientist watching him on the camera puts on a gas mask, and eventually evacuates.

You have to keep him alive.

HE LIVES LIKE A SIM. BADLY.
He does his own thing: naps in his bed, sits in his armchair, games at his PC (his stream pays, even while you're away), raids the fridge and eats the steak raw. He walks to the toilet himself, usually, and never flushes. He leaves his trash wherever he's done with it: Dorkitos bags, pizza boxes, cans, socks, tissues. Go to sleep and wake up to a mess. He won't shower, so carry him in when he stinks.

FEED HIM
Order DoorDosh and it drops through the hatch. Or cook: tap the fridge for a raw steak and drag it onto the oven. Leave it too long and it's charcoal, and the smoke alarm goes off. He'll eat it raw if you let him. Let him get hungry and he orders for himself, on your coins, and tips the driver.

CLEAN UP AFTER HIM
Drag his floor poop into the toilet and flush it, before the toilet clogs. Tap his trash to throw it down the chute, or buy a robot vacuum that picks it up for you, even while you're away (it won't touch poop). Better soap makes his showers count for more.

FURNISH THE UNIT
Spend Hammy coins on the furniture: an armchair, a bed, a plant, a fridge, an oven and a gaming PC. It all stays, even when he doesn't.

TEXT HIM. CALL HIM.
Hammy has a phone, and he uses it. He texts you all day about whatever is going on ("the scientist said shes putting on a gas mask. rude"). Text him back, call him, and pick up when he calls you, or he gets sad. Spam him and he tells you to chill.

THROW HIM AROUND
Grab him and throw him. He bounces off the glass, squishes on landing and climbs the ladder when he feels like it, and every few minutes gravity just stops working. Open the toy box: a feather to tickle him, bouncy balls he kicks back, a boxing glove on a spring, water balloons, cream pies, a whoopee cushion, a magnet and firecrackers. Nice toys make him happy. Mean toys pay more coins.

SOME DAYS HE'S A MEATBALL SUB
Hammy is a cube, mostly. Some days he wakes up as a hamster, a meatball sub or a train. Just go with it.

DRESS HIM UP
Spend Hammy coins on fits: a trucker cap and gas-station shades, a gamer headset, a cowboy hat, a toadstool, a hot dog suit, an astronaut helmet that traps his stink in there with him, a wizard hat and Golden Hammy.

HE KEEPS LIVING WHILE YOU'RE GONE
Close the app and Hammy carries on: he gets hungry, texts you, calls you, and stinks up the unit. Ignore him for about a day and he dies, rots, turns into mushrooms and leaves a skeleton. Then you lose. Then you get a new Hammy, who wants to know what happened to the last guy.

- Plays fully offline
- No ads, no accounts, no data collected
- No real money and no real food: coins are pretend and DoorDosh is a joke
- Made by one person at Muffin Development
```

## Screenshots

`store/screenshots/` holds five 1320×2868 PNGs for the 6.9-inch iPhone slot, which
is the only size Apple requires. Upload them in order:

1. `1-unit.png`: the containment unit, with him gaming, a steak on and a burrito on the way
2. `2-shower.png`: carrying him into the shower, because he won't go himself
3. `3-phone.png`: texting with Hammy
4. `4-toys.png`: train day, and a boxing glove to the face
5. `5-you-lose.png`: what happens if you don't

Regenerate them after visual changes with the steps in `docs/app-store-checklist.md`.

## App Review notes

```
Hammygotchi is an offline virtual pet game. No account or login is needed.
Order Hammy food in the Care tab, text and call him in the Phone tab (these
are pretend conversations generated by the game; no real calls or messages
are made and no contacts are read), drag him onto the furniture, and pick
toys in the bar under the unit.
"DoorDosh" and "Dorkitos" are parody names inside the game: no food is
ordered and nothing is paid for. Hammy coins are a pretend currency that
cannot be bought with real money. The boxing glove and firecracker are
cartoon slapstick: he gets soot on his face and dizzy stars, nothing more.
Local notifications are optional and remind the player of Hammy's next text
or when he is starving.
```
