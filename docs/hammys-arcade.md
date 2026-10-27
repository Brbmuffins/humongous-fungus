# Hammy's Arcade (standalone)

Hammy's Arcade as a game of its own: a front page with Fart Rocket, Hammy
Mines, Hammy Crossing, Poop Plinko and Hammy Slots as five big cards, your coins, and how
each game has gone (rounds, net, best multiplier). Tap a card to play; the
`‹ Arcade` button on the card (or Escape, or the browser's Back) goes back to the
front page. It's meant to be hosted as a plain static page at
https://hammyxchange.com/arcade/ and works the same on phones and desktops.

```sh
npm run dev:hammys-arcade                  # local server
GAME=hammys-arcade npx vite build          # dist/hammys-arcade/index.html, one self-contained file
```

`npm run build` and `npm run build:artifact` build it with the other games.
There is no server and no network call: the page is one HTML file with its
fonts inlined, and a new player is up and running offline.

## Coins

Play money only: no real money, no purchases, no cash-out. A new player starts
with 1,000 coins. The wallet and the stats are saved in local storage under
`hammys-arcade.save.v1` (through `shared/storage.ts`; if storage is blocked the
page still works, it just forgets on reload). When you're out of coins
(`Wallet.broke`) the page offers a free top-up of 500 with a Hammy-flavoured
line, so it never dead-ends; in a game it waits a moment first, since a round
may still pay. "Start over" on the front page resets coins and stats.

## How it reuses Hammygotchi

Nothing from the games is copied. `games/hammys-arcade/src/main.ts` imports the
rules (`arcade.ts`, `rocket.ts`, `mines.ts`, `crossing.ts`, `plinko.ts`, `slots.ts`), the
screens (`rocketview.ts`, `minesview.ts`, `crossingview.ts`, `plinkoview.ts`,
`slotsview.ts`, `arcadeview.ts`), Hammy himself (`hammy.ts`), the sounds and the games' styles
(`arcade.css`, `slots.css`) from `games/hammygotchi/src` through the `@hammygotchi` alias
(set in `vite.config.ts`, `vitest.config.ts` and `tsconfig.json`).

What the games needed from Hammygotchi was narrowed so the arcade can supply
it without the whole pet game:

- `ArcadeSeat` (`arcade.ts`): the few fields the games read from a bettor, `coins`,
  `fit`, `fresh`, `diedAt` and the arcade stats. `HammyState` already has them;
  the arcade's `Wallet` (`wallet.ts`) has its own. `placeBet`, `payOut`,
  `refundBet` and `ArcadeHost.state` take an `ArcadeSeat`.
- `alive.ts`: `isAlive`, typed by `diedAt` alone (`game.ts` re-exports it).
- `haptics.ts`: `buzz` and `isNative`, out of `native.ts` (which re-exports them),
  so the views don't pull in reminders and saves.
- `arcade.css`: the games' styles, moved out of `styles.css`; Hammygotchi imports
  both. The arcade brings its own `base.css` (the same colours, buttons and card
  as Hammygotchi) and `page.css` (the front page and small fixes).

The fairness rules are the games' own, untouched: every game pays back 0.99 of
the bets over many rounds (`RTP`), every round's luck is `crypto.getRandomValues`,
and a round still on when you leave is settled the way it was going.
Closing a game, or the page's `pagehide`, settles every game the way Hammygotchi
does (bailed out at the current multiplier, a box cashed out, a ball paid where
it was going to land, a bet that never started refunded); Fart Rocket also
bails out when the tab is hidden.

## Hammy Slots

A 5-reel, 3-row slot machine with 20 paylines. The rules are in
`games/hammygotchi/src/slots.ts` and are pure: no DOM, and no `Math.random` or
crypto inside them. `spin(bet, roll)` takes the random source as a parameter,
so the same rules can run on a server later; the screen (`slotsview.ts`)
passes `fairRoll`. The symbols are drawn on a canvas (`slotsart.ts`), nothing
is an image file.

- **Symbols** (low to high): Dorkito, pizza box, sneaker, toilet paper, Dr.
  Moss's clipboard, Grandma, the robot vacuum, the toilet, Cube Hammy (the top
  symbol). Hammy's meatball sub is the wild (reels 2 to 4): it stands in for
  anything except the orb. The multiplier orb (reels 2 to 4) pays nothing on a
  line and breaks one, but it sets the orb off.
- **Paylines**: 20 zig-zag lines (straight, V, peak, W, M, slides, hat,
  bowl, smile, frown, saw, zig, zag, ripples, lightning). A win is 3, 4 or 5
  matching symbols counting from the left reel, wilds substituting; each
  line pays on its own, the best win per line. The "lines" button shows every
  shape. A winning line is drawn symbol by symbol as a glowing zig-zag with
  the multiplier counting up.
- **Bets**: the bet is split over the 20 lines (`bet / 20` each), so wins are
  counted in line bets and shown as multiples of the whole bet.
- **The multiplier orb**: two or more orb symbols on the grid, or a 1-in-80
  sneeze (which adds one ball, unless the orbs went off anyway), launch a ball
  for each orb that landed. Each ball pinballs across the grid for 3 bounces,
  and each bounce has a value drawn up front from a table in `slots.ts`
  (`ORB_EFFECTS`): add 0.5, 1, 2 or 3 bets, or multiply the running win by 2,
  3 or 5. A spin with no line win still pays what the orb adds. Everything
  the orb does is decided by the rules before the view starts drawing; the
  view only plays it back.
- **Voice**: Hammy has lines for starting, wins, big wins, the orb, a sneeze,
  near misses, dry spells and broke (`SLOTS_*` in `slots.ts`).
- **Controls**: bet picker, spin, auto-spin 10/25/50 (it stops on a win of
  20x or more, or when you can't cover the bet), a turbo toggle (kept in the
  page's prefs) and a tap to skip the animation. Leaving mid-spin pays the
  spin that was already decided, so a round never gets lost.
- **Payback**: RTP 99.006%, proven exactly, not by sampling.
  `slotsmath.ts` walks all 5,619,712 combinations of reel stops and works out
  the orb's odds with a small sum over its bounces (every orb effect is
  `a × win + b`), then combines the two with the cap. The lines pay back
  56.58% on spins without the orb and the orb spins add 42.42%.
  Chance of any win 49.83% (a line pays on 47.11%), a win of at least the bet
  17.52%, at least 10x 1.87%, at least 100x 0.021%, at least 1000x
  0.000054%; the orb flies on 4.41% of spins. The standard deviation of a spin
  is about 4.8 bets, a low-volatility machine.
- **Max win**: 5,000x the bet (`MAX_WIN`), applied to the whole spin. Without
  the cap the top spin could pay about 7 million times the bet; the cap is
  reached about once in 90 million spins (1.08e-8), and the RTP figure above
  already includes it. Tiny bets lose a little to rounding down to whole
  coins (`payMultiplier` makes sure floating point never costs a coin).

Run the maths yourself with `nice -n 10 npx tsx scripts/slots-analysis.ts`
(about 5 seconds, prints the JSON and a summary).

For the browser smoke test, a build made with `VITE_SLOTS_TEST=1` accepts
`?slots-seeds=3,17,2` in the address, so spin 1, 2, 3 come from those seeds
and a winning line or the orb can be put on screen on purpose. In every other
build `TEST` is a compile-time `false` and the code is removed.

## Tests

`tests/hammys-arcade/wallet.test.ts`: betting, paying a win, refunds, the
top-up, saving and loading (including damaged saves and blocked storage). The
games' rules are tested in `tests/hammygotchi/` (Hammy Slots in `slots.test.ts`:
the paylines, wilds, left-to-right matching, the orb's values, the exact RTP, the
cap and settling a spin into the wallet).
