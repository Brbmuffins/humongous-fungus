# Hammy's Arcade (standalone)

Hammy's Arcade as a game of its own: a front page with Fart Rocket, Hammy
Mines, Hammy Crossing, Poop Plinko and Hammy Slots as five big cards, your coins, and how
each game has gone (rounds, net, best multiplier). Tap a card to play; the
`‹ Arcade` button on the card (or Escape, or the browser's Back) goes back to the
front page. It's meant to be hosted as a plain static page at
https://hammyxchange.com/arcade/ and works the same on phones and desktops.

There are two ways it runs:

- **Online** (the arcade's server is there): everyone on the page plays the
  same rounds. One shared sky, no rooms. All the dice, the coins and the clock
  live on the server. You type a name once and you're in.
- **Offline** (opened as a file, or the server isn't reachable): exactly the
  solo arcade it was before, all in the browser, with a small "offline" label
  on the front page. It never dead-ends.

```sh
npm run dev:hammys-arcade                  # local dev server (offline mode: no arcade server behind it)
GAME=hammys-arcade npx vite build          # dist/hammys-arcade/index.html, one self-contained file
npm run build:arcade-server                # dist/hammys-arcade-server/server.mjs, the server in one file
```

`npm run build` and `npm run build:artifact` build the page with the other
games, and `npm run build` builds the server too.

## The server

`games/hammys-arcade/server/`, TypeScript, Node 22, **zero runtime
dependencies** (`node:http`, `node:crypto`, `node:fs`). It imports the games'
own rules from `games/hammygotchi/src` (crash point, multipliers, mine
layout, plinko tables, the cast) and is bundled by
`vite.arcade-server.config.ts` into the one file
`dist/hammys-arcade-server/server.mjs`, which runs with plain `node` and
needs nothing installed beside it.

### Run it

```sh
npm run build:arcade-server
PORT=8731 DATA_DIR=/var/lib/hammys-arcade node dist/hammys-arcade-server/server.mjs
```

| Variable | |
|---|---|
| `PORT` | required (`0` picks a free one; the `listening` line it prints says which) |
| `HOST` | default `127.0.0.1` |
| `DATA_DIR` | where `hammys-arcade-wallets.json` goes (default `./data`) |
| `STATIC_DIR` | optional: also serve that folder's `index.html` at `/`, `/arcade` and `/arcade/`. For local testing only; in production nginx serves the page |

`SIGTERM`/`SIGINT` stop it cleanly: open stakes are given back, the wallet
file is written, connections are closed. It logs one JSON line per event.

Local try-out with the page and the server together:

```sh
GAME=hammys-arcade npx vite build && npm run build:arcade-server
PORT=8731 DATA_DIR=/tmp/arcade STATIC_DIR=$PWD/dist/hammys-arcade node dist/hammys-arcade-server/server.mjs
# open http://127.0.0.1:8731/ in two browsers
```

(`?offline` on the page's address forces offline mode.)

### Behind nginx

In production nginx proxies `/arcade/api/` to the server **with the prefix
kept** (every route lives under `/arcade/api/`), and serves the page itself:

```nginx
location /arcade/api/ {
    proxy_pass http://127.0.0.1:8731;       # no trailing path: the prefix is kept
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;                    # the sky is a stream (the server also sends X-Accel-Buffering: no)
    proxy_read_timeout 1h;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

The server trusts `X-Real-IP` / `X-Forwarded-For` only when the connection
comes from the same machine (loopback), so per-address limits see the real
visitor and a stranger can't forge it.

### Protocol

One **SSE stream** for what everybody sees, and **JSON POSTs** for what you
do. Every JSON answer has `ok` and `serverNow` (ms, the server's clock); a
failure has `error` and `message`; replies to player calls also carry `me`
(your id, name, emoji, coins, top-ups, `riding`, stats).

Status codes: `200` ok, `409` the game said no (`closed`, `already`,
`coins`, `late`, ...), `400` bad request, `401` unknown player, `404`, `413`
body over 2 KB, `429` slow down.

| Route | |
|---|---|
| `GET /arcade/api/health` | `{ok, round, rounds, players}` |
| `GET /arcade/api/sky` | the event stream (below). Max 8 per address, 5000 in all |
| `POST /arcade/api/hello` | `{name}` makes a player and returns `{secret, me}` once; `{secret}` returns `me`. A taken name gets `#digits` on the end |
| `POST /arcade/api/me`, `rename`, `topup` | `{secret}` (+ `{name}`); the top-up is 500 coins, only when you're broke and nothing of yours is riding |
| `POST /arcade/api/rocket/{bet,unbet,bail}` | `{secret, amount, auto?}` |
| `POST /arcade/api/crossing/{bet,unbet,go,cash}` | `{secret, amount, difficulty}`, `{secret, lane}` |
| `POST /arcade/api/mines/{start,open,cash}` | `{secret, amount, grid, mines}`, `{secret, index}` |
| `POST /arcade/api/plinko/drop` | `{secret, amount, rows, risk}` |
| `POST /arcade/api/slots/spin` | `{secret, amount}`; answers `{n, spin, won}` |
| `POST /arcade/api/board` | `{secret}`; answers `{mine}`: your own best row (with its rank) on each of the four lists, or null |

**The sky.** The first event is `snapshot` (the whole state: `cid`,
`players`, each game's round, the last rocket flights, plinko's hash and last
drops, slots' hash and last big wins, the leaderboard's top tens). After it: `players`, `renamed`, and per game `rocket.betting / bet /
left / start / bail / crash / reveal`, `crossing.betting / bet / left / start /
lane / cash / end`, `mines.round / run / left / progress / end`, and
`plinko.drop / epoch / reveal`, `slots.big / epoch / reveal`, and `board` (a leaderboard list's new top ten). Every event carries `serverNow`. A comment
(`: keep-alive`) goes out every 15 s. `retry: 2000` is sent, so the browser
reconnects by itself and gets a fresh `snapshot` (the page replaces its state
with it). A client with more than 256 KB unsent is hung up on, closed
connections are dropped at once, nothing leaks.

**Time.** The round loop is one timer set to the earliest deadline of any game
and runs only while someone is connected (or something is riding). A bail is
decided by the server's clock when the request *arrives*, never the page's:
the multiplier is `multiplierAt((now - flightAt) / 1000)`, floored to two
decimals, and a bail after the crash moment is `late`. The page derives its
copy of the server clock from the `serverNow` stamps (the quickest trips win)
and draws the flight from that.

**Limits.** Per address 60 requests burst, 20 a second; per player 30 burst,
10 a second; `hello` 10 burst, one per 6 s; plinko drops and slots spins 5 burst then 2.5 a
second per player; bodies over 2048 bytes are refused; bets are whole coins
from 1 up to what you have.

**Names.** 2 to 16 characters: letters, digits, space, `_` and `-`. No
slurs (a blocklist in `shared/names.ts`, kept rot13 so the source doesn't
spell them out; add to it as needed). A name someone has gets `#` and digits.
There is no login: the `secret` the server hands back at the first `hello` is
kept in the browser (`hammys-arcade.player.v1`) and is the only way back to
that wallet. The server stores only its SHA-256 and never sends it again.

### The five games online

All five: stakes are held on the server until the round settles, one wallet
per player for the whole arcade, every outcome decided on the server from a
committed seed.

- **Fart Rocket.** A 7 s betting window, the flight (the usual `e^(0.075 t)`),
  a 5 s pause. Bet, take it back, bail (or pre-set an automatic bail-out, which
  the *server* executes at that multiplier, so closing the tab doesn't lose
  it). The cast of Hammy's friends fill in only when it's quiet, to make 4 to 7
  riders in all; real players replace them one for one. The server picks them,
  so everyone sees the same ones, and where they bail is never sent.
- **Hammy Crossing.** One road, one shared roll per lane. Betting is 10 s, then
  each lane is decided 4 s after the last: the road draws one roll `u` for the
  lane for everybody, and you are flattened if `u` is below your own road's
  risk (Easy 4%, Medium 12%, Hard 20%, Daredevil 40%), so a very bad roll flattens
  everyone, a medium one only the Daredevils. Payouts are the game's own.
  Each lane you have 4 s to press Go. **If you don't, the server cashes you out
  at what you have** (the safe default; walking away never walks Hammy into
  traffic). The round ends once nobody real is left.
- **Hammy Mines.** A race on the same floor. A floor lasts about 60 s (it can end
  early, but never before 20 s, once nobody has a run on), then 6 s, then the next
  one. One run per player per floor, started any time except the last 3 s. Your
  floor is derived from the seed plus the board and poop count you pick, so
  everyone with the same settings plays the identical hidden floor. Others'
  progress (boxes opened, multiplier, hit or cashed) is shown, never which
  boxes. The layout is only shown when the floor ends, along with the seed.
  A run still going when it ends is cashed out at what it has (a run with nothing
  opened is given back).
- **Poop Plinko.** One shared board. Each drop is rolled on the server and
  broadcast with the player's name; your balls are bright, others' are faint and
  scaled onto your board's rows. The page holds your win back from your
  coins until the ball lands (the server has paid it already). Drops are
  rate-limited. The cast drops one now and then, only when fewer than three real
  drops happened in the last 10 s.
- **Hammy Slots.** Like Plinko, a solo action with no rounds: `slots/spin` takes the
  bet, the server rolls the spin from the epoch's seed (`slotsSpinOf(seed, n)`, which
  runs the same pure `spin()` as the offline game), pays it at once from the same
  wallet and answers with the stops, the pay units and the coins won. The page
  holds the win back from your coins until the reels stop. Nothing is broadcast
  about an ordinary spin. A win of 10x the bet or more (BIG WIN and up) is told to
  everyone by name (`slots.big`, kept as the last 8 in the snapshot) and shows
  as "Name hit 52x on Hammy Slots" in a ticker on the front page and a list in the
  machine's card; your own big wins are not announced to you (they would spoil the
  reels), and the big-win list never shows grids or stops. The cast brags about a
  big win now and then, only when nobody has for 20 s; those are marked
  `real: false`, come from their own random spins, take no spin number and are
  not under the committed seed (nothing rides on them). Offline, the machine runs
  locally exactly as before.

**On a server restart** (or a crash) the page reconnects through the stream's
own retry and resyncs from the `snapshot`. Open bets are **refunded**, never
settled either way: a round can't survive a restart, so what was riding goes
back to the wallet, on boot if the file still has it as riding, and on a clean
stop. The page shows "Lost the sky. Reconnecting…" meanwhile.

### The leaderboard

Two boards, **Biggest win** (the most coins one payout paid) and **Best multiplier**
(the highest multiplier a game paid, at any bet), each **this week** and **all-time**.
A top-10 panel on the front page, under the game cards, with a tab for the board and
one for the period; your own row is highlighted, and if you are below the top ten your
row (with its rank) is shown under it. Offline, it isn't there.

- **One place feeds it.** `Store.win` (a round paying out) and `Store.instant` (Plinko,
  Slots) both end in `Store.settled`, which calls `Board.record`. A new game that settles
  its payouts through the store is on the boards with no wiring of its own. A refund
  (`giveBack`) never gets there, and neither does a loss.
- **What counts.** Only a win: more than the stake came back, at a multiplier above 1 (the
  multiplier the game paid, floored to two decimals, as the page shows it). A cash-out at
  1.00x, a payout under the bet, or nothing is not an entry.
- **Who.** Only real players: only they have a wallet here, so the made-up cast can't be on
  it. One line per player per board: their best. The two boards can hold different
  spins (a big payout isn't always the best multiplier).
- **Order.** Higher value first; a tie goes to whoever got there first (an arrival counter,
  which is kept in the file), and a later equal value does not take a place.
- **The week** starts Monday 00:00 in US Eastern (`America/New_York`, daylight saving
  included: a week can be 167 or 169 hours). The weekly lists empty when it turns over, on
  the server's own timer if anyone is connected, otherwise on the next payout or read, and
  a file saved in an earlier week loses its weekly lists on load. All-time is kept.
- **Names** are looked up when a row is sent, so a renamed player shows as the new name.
- **Kept with the wallets**, in the same file (`board` next to `players`), written the same
  atomic way, bounded: each list remembers only its best 500 (`BOARD_KEEP`); someone below
  that has no rank until they climb above it. A damaged `board` in the file is ignored.
- **Live.** When a list's top ten changes the server sends `board` (`{board, period, rows,
  weekStart, weekEnd}`); a win that lands below the top ten says nothing to everyone. The
  page asks `POST /arcade/api/board` for its own standing when it connects, when a `board`
  event arrives, and a couple of seconds after its own coins change (so a rank
  below the top ten can be a little behind until you next play).

### Fairness

Every round has a random 256-bit **seed**. Before betting opens the server
publishes `hash = SHA-256(seed bytes)`; after the round it publishes the seed.
Anyone can check `SHA-256(seed) == hash`, and the page does, with the same
pure-JS SHA-256 (`shared/fair.ts`, tested against `node:crypto`). It then
works the round out again from the seed and shows a check mark on the card:

```
rollAt(seed, label, i)  = first 48 bits of SHA-256("label:i:seed") / 2^48      (0 <= r < 1)
stream(seed, label)     = rollAt(seed, label, 0), rollAt(seed, label, 1), ...

Rocket:   crash  = crashPoint(rollAt(seed, "crash", 0)); cause = crashCause(crash, stream(seed, "cause"))
Crossing: lane k: u = rollAt(seed, "lane", k); truck = rollAt(seed, "truck", k) -> vehicle;
          flattened if u < risk(road)
Mines:    floor = layMines(grid, mines, stream(seed, "mines:<grid>:<mines>"))
Plinko:   seeds rotate after 100 drops or 15 minutes; drop n of a seed:
          path = stream(seed, "plinko:<n>") -> left/right per row
Slots:    seeds rotate after 100 spins or 15 minutes; spin n of a seed:
          spin = slotsSpin(stream(seed, "slots:<n>"))   (the pure rules in slots.ts)
```

Plinko and Slots have no rounds, so their seeds is committed for an *epoch*: the hash is
shown, the drops use it with a counter (`n`), and when the epoch ends the
seed is revealed, along with the first and last `n`, so every drop in it can
be recomputed. The seed itself is never sent before the round (or epoch) it
belongs to is over, and the bots' plans are never sent at all.

Known gaps, written down rather than fixed:

- **Mines collusion.** Everyone who picks the same board and poop count on a
  floor plays the same hidden floor, so two accounts could share what they
  learn (one opens boxes and tells the other). The floor is only worth what
  the first to find out loses, but it is a real edge for a team. A later fix
  is a floor per player (derived from the seed and the player's id), which
  costs the "same settings, same floor" race.
- **Crossing without Go.** No "go" for a lane means cash out at what you have
  (documented above), so someone who walks away from the screen is never
  flattened but also never gets further: they bank the current multiplier on the
  next lane's decision. That is the same as pressing Cash out, so it isn't an
  exploit, only a default worth knowing about (it is not a way to skip a bad roll:
  the roll for a lane is drawn when the lane is decided, after the last chance to
  press Go).
- The wallet file is one JSON file for the whole arcade (up to 50,000
  players); a database would be next if it ever grows past that.

## Coins

Play money only: no real money, no purchases, no cash-out. A new player starts
with 1,000 coins. Online, the coins and stats live on the server (one wallet
for all five games, in `DATA_DIR/hammys-arcade-wallets.json`, written to a
temp file and renamed over the old one, debounced, and again on SIGTERM), and
the free top-up of 500 is the server's (broke and nothing riding). Offline, the wallet and the stats are saved in local storage under
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
the bets over many rounds (`RTP`) online and off. Offline, every round's luck is
`crypto.getRandomValues` in the browser; online it is the server's seed (see
*Fairness*). Either way a round still on when you leave is settled the way it
was going.
Closing a game, or the page's `pagehide`, settles every game the way Hammygotchi
does (bailed out at the current multiplier, a box cashed out, a ball paid where
it was going to land, a bet that never started refunded); Fart Rocket also
bails out when the tab is hidden. Online, leaving a game takes the bet back if
the round hasn't started and otherwise cashes out on the server's clock.

## The page, online and offline

`main.ts` starts by asking `GET /arcade/api/health` (2.5 s). If the arcade's
server answers, it comes in; if not (or the page is a `file:` URL, or `?offline`),
it is the old solo arcade. Coming in is one step: the first time on a device
there is a single box with a silly name already in it (so Enter alone works)
and a "Hop in" button, nothing else: no email, password, login, terms or
tutorial. A taken name is suffixed, not refused. Returning visitors on the same
device go straight to the front page. A small "Change name" link there keeps
your coins. The front page shows how many players are in the sky, and a ticker
line when someone hits a big win on Hammy Slots.

The rocket, mines, crossing, plinko and slots screens are Hammygotchi's, taking an
optional **round source** (`games/hammygotchi/src/roundsource.ts`, types only).
Without one they roll and settle everything on the phone, exactly as before, which
is what Hammygotchi's in-pet arcade still does. With one they draw what the source
says and send your choices to it. The sources are in
`games/hammys-arcade/src/online/` (`mirrors.ts`: a copy of each game's shared
round, kept up to date from the sky, and the calls; `sky.ts`: the stream and the
clock; `wallet.ts`: the server's coins as the front page sees them; `join.ts`:
the name box).

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
- **The multiplier orb**: two or more orb symbols on the grid, or a 1-in-50
  sneeze (which adds one ball, unless the orbs went off anyway), launch a ball
  for each orb that landed. Each ball pinballs across the grid for 3 bounces,
  and each bounce has a value drawn up front from a table in `slots.ts`
  (`ORB_EFFECTS`): add ¼, ½ or 1 bet, or multiply the running win by 2,
  3, 5, 10 or 25. A spin with no line win still pays what the orb adds. Everything
  the orb does is decided by the rules before the view starts drawing; the
  view only plays it back.
- **Voice**: Hammy has lines for starting, wins, big wins, the orb, a sneeze,
  near misses, dry spells and broke (`SLOTS_*` in `slots.ts`).
- **Controls**: bet picker, spin, auto-spin 10/25/50 (it stops on a win of
  20x or more, or when you can't cover the bet), a turbo toggle (kept in the
  page's prefs) and a tap to skip the animation. Leaving mid-spin pays the
  spin that was already decided, so a round never gets lost.
- **Pay table** (`SYMBOLS` in `slots.ts`, in line bets, for 3, 4 and 5 in a
  row; 20 line bets is the whole bet): Dorkito 8/16/50, pizza 8/16/50,
  sneaker 20/36/120, toilet paper 20/40/140, clipboard 22/50/220, Grandma
  24/64/320, vacuum 28/84/1,200, toilet 34/100/2,500, Cube Hammy 80/400/25,600
  (five Cubes is 1,280x the bet). The reels (`STRIPS`) are 20 symbols each,
  and the symbols are spread over them so that the lines hit seldom but pay
  when they do: three of a kind is at least the bet back for every symbol
  except Dorkito and pizza, which return 0.4x.
- **How loud a win is** (`tierOf` in `slots.ts`): a spin that pays less than
  the bet is not a win. The readout stays small and neutral ("4 back", with
  0.40x under it), the line is drawn in grey, and there's no jingle, shake,
  confetti or cheer. From the bet up it is a WIN, then BIG WIN (10x), HUGE WIN
  (50x) and HAMMY WIN (250x), each a notch louder: bigger readout and colour,
  more shake and confetti, a longer cheer from Hammy.
- **Payback**: RTP 99.003%, proven exactly, not by sampling.
  `slotsmath.ts` walks all 3,200,000 combinations of reel stops and works out
  the orb's odds with a small sum over its bounces (every orb effect is
  `a × win + b`), then combines the two with the cap. The lines pay back
  57.91% on spins without the orb and the orb spins add 41.09%.
  Chance of a line win 29.04% (any payout, with the orb, 35.60%), a spin that
  pays at least the bet 26.13%, at least 10x 0.99%, 50x 0.098%, 100x
  0.043%, 250x 0.011%, 1000x 0.0054%; the orb flies on 7.95% of spins. The
  standard deviation of a spin is about 11.4 bets.
- **Max win**: 5,000x the bet (`MAX_WIN`), applied to the whole spin. Without
  the cap the top spin could pay about 129 million times the bet (five Cube
  Hammies, then all the orb's biggest multipliers); the cap is reached about
  once in 2.3 million spins (4.4e-7), and the RTP figure above already
  includes it. Tiny bets lose a little to rounding down to whole
  coins (`payMultiplier` makes sure floating point never costs a coin).

Run the maths yourself with `nice -n 10 npx tsx scripts/slots-analysis.ts`
(about 7 seconds, prints the JSON and a summary).

For the browser smoke test, a build made with `VITE_SLOTS_TEST=1` accepts
`?slots-seeds=3,17,2` in the address, so spin 1, 2, 3 come from those seeds
and a winning line or the orb can be put on screen on purpose. In every other
build `TEST` is a compile-time `false` and the code is removed.

## Tests

`tests/hammys-arcade/`:

- `wallet.test.ts`: the offline wallet (betting, paying a win, refunds, the
  top-up, saving and loading, damaged saves, blocked storage).
- `fair.test.ts`: SHA-256 against `node:crypto`, the hash check, the roll
  derivation, the name rules.
- `rocket.test.ts`, `crossing.test.ts`, `mines.test.ts`, `plinko.test.ts`, `slots.test.ts`: each game
  on the server with a fake clock: round timing, the committed hash and revealed
  seed, the crash derivation, bail before and after the crash, automatic bails, the
  cast stepping aside, the shared lane roll (one roll for everybody, each with their
  own risk), the same floor for the same settings, plinko's bin distribution under
  a fixed seed and its rate limit, slots' spin from the committed seed, paid at once,
  quiet unless a big win, the epoch's reveal checking every spin, the cast bragging only
  when it's quiet, refunds when a round can't finish.
- `board.test.ts`: the leaderboard: the Eastern week boundary (both ways through daylight
  saving), only wins counting (not a loss, a refund, 1.00x or a payout under the bet),
  real players only (the cast plays 40 minutes and appears nowhere), one entry per player per
  board, ties to whoever was first (also after a restart), the weekly rollover at midnight
  (and lazily on a payout), a rename, saved with the wallets and surviving a restart, a
  damaged board, the bound, and when the sky is told.
- `store.test.ts`: wallet bounds, the top-up rule, names, the save file round trip
  (secrets not in it, stakes given back on load, a damaged file kept aside), the
  rate-limit buckets.
- `integration.test.ts`: builds the bundle, starts `server.mjs` on a free port with a
  temp `DATA_DIR`, and drives two players over real HTTP and SSE through all five
  games, then checks the seeds, a slots spin, and the leaderboard (a win lands on it, is pushed
  live, survives the restart), stops it with SIGTERM and restarts it. Takes about
  45 s because rounds run on the real clock.

The games' rules are tested in `tests/hammygotchi/` (Hammy Slots in `slots.test.ts`:
the paylines, wilds, left-to-right matching, the orb's values, the exact RTP, the
cap and settling a spin into the wallet).
