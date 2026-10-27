# Hammy's Arcade (standalone)

Hammy's Arcade as a game of its own: a front page with Fart Rocket, Hammy
Mines, Hammy Crossing and Poop Plinko as four big cards, your coins, and how
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
rules (`arcade.ts`, `rocket.ts`, `mines.ts`, `crossing.ts`, `plinko.ts`), the
screens (`rocketview.ts`, `minesview.ts`, `crossingview.ts`, `plinkoview.ts`,
`arcadeview.ts`), Hammy himself (`hammy.ts`), the sounds and the games' styles
(`arcade.css`) from `games/hammygotchi/src` through the `@hammygotchi` alias
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

## Tests

`tests/hammys-arcade/wallet.test.ts`: betting, paying a win, refunds, the
top-up, saving and loading (including damaged saves and blocked storage). The
games' rules are tested in `tests/hammygotchi/`.
