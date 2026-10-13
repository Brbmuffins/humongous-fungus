# Sporemonger — design notes

A trading game set in the night market of a mushroom-folk town. You start with
250 caps and an empty stall. Prices change every 3 seconds, day and night,
even while the game is closed. Buy low, sell high, and sell before your stock
rots.

## Loop

1. **Watch** six goods with live charts (Trade tab). Each has its own
   personality.
2. **Buy and sell** in 1s, 10s or as much as you can. The market keeps 3% of
   every sale, so tiny wiggles don't pay.
3. **Mind the rot.** Most goods spoil while held, also while you're away.
   Rotten stock goes to the compost cart for a tenth of its value.
4. **Listen to gossip.** When a price is about to turn, the town sometimes
   talks about it. Rumors can be wrong.
5. **Climb the ranks** by net worth to unlock new goods, and spend caps on the
   stall: a bigger cellar, cool stones, a gossip network, haggling.
6. **Forage** by tapping the banner when you're short. It is always worth a few
   caps, so a bad run never ends the game.

## Goods

| Good | Unlocks at | Personality | Rots per hour |
|---|---|---|---|
| Windfall apples | start | Cheap, jumpy, sell fast | 40% |
| Wildflower honey | start | Slow cycles over hours | never |
| Morels | Stall keeper (1K) | Booms and crashes | 12% |
| Black truffles | Cart trader (10K) | Expensive, long trends | 3% |
| Glowcaps | Shopkeeper (100K) | The wildest price in town | 25% |
| Forest amber | Trading house (1M) | Very costly, very slow | never |

Ranks after that: Guild master (10M) and Spore baron (100M).

## How prices move

- Each good's price is an index around its mean, driven by a seeded random
  walk with mean reversion and moods (calm, rising, falling, boom, crash,
  wild) that last 1–8 minutes. The random state lives in the save, so
  reloading never rerolls a price, and time away is simulated tick by tick
  (up to a week).
- The engine is `shared/market.ts`, so both games could use it.

## Gossip

- When a good's mood turns to rising, falling, boom or crash, the town talks
  about it with some chance (35% at first), and the rumor is right with some
  probability (70% at first). A false rumor claims the opposite direction.
- Gossip network upgrades raise both, up to 90% heard and 94% right.

## Stall upgrades

| Upgrade | Levels | Effect |
|---|---|---|
| Bigger cellar | 12 | Double storage for every good |
| Cool stones | 3 | Stock rots 30% slower per level |
| Gossip network | 3 | Hear more rumors, and more of them true |
| Haggling | 2 | The market cut drops from 3% to 2% to 1% |
| Foraging basket | 6 | More caps per forage |

## On phones

`src/native.ts` adds the phone-only features through Capacitor. Because the
market is a seeded random walk stored in the save, the game can look ahead:
when the app goes to the background it plays the next day forward on a copy
of the stall and schedules one local notification, for the moment a holding
is up 15% (after the market's cut) or perishable stock is half rotten. It asks
for notification permission the first time the player buys something.

## Ideas for later

- A net-worth chart over days.
- Orders: a customer wants 20 morels by tonight for a bonus.
- Seasons that shift each good's mean.
