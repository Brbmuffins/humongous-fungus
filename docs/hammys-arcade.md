# Hammy's Arcade (standalone)

Hammy's Arcade as a game of its own: a front page with Fart Rocket, Hammy
Mines, Hammy Crossing, Poop Plinko and Pizza Boxes as big cards, your coins, and how
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
| `POST /arcade/api/deal/{bet,pick,open,answer,swap,leave,mine,react}` | `{secret, amount}`, `{secret, box}`, `{secret, deal}`, `{secret, swap}`, `{secret}`, `{secret, table, r}` (see Pizza Boxes) |

**The sky.** The first event is `snapshot` (the whole state: `cid`,
`players`, each game's round, the last rocket flights, plinko's hash and last
drops). After it: `players`, `renamed`, and per game `rocket.betting / bet /
left / start / bail / crash / reveal`, `crossing.betting / bet / left / start /
lane / cash / end`, `mines.round / run / left / progress / end`, and
`plinko.drop / epoch / reveal`, and `deal.step / react`. Every event carries `serverNow`. A comment
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
10 a second; `hello` 10 burst, one per 6 s; plinko drops 5 burst then 2.5 a
second per player; bodies over 2048 bytes are refused; bets are whole coins
from 1 up to what you have.

**Names.** 2 to 16 characters: letters, digits, space, `_` and `-`. No
slurs (a blocklist in `shared/names.ts`, kept rot13 so the source doesn't
spell them out; add to it as needed). A name someone has gets `#` and digits.
There is no login: the `secret` the server hands back at the first `hello` is
kept in the browser (`hammys-arcade.player.v1`) and is the only way back to
that wallet. The server stores only its SHA-256 and never sends it again.

### The four games online (Pizza Boxes is a fifth, below)

All four: stakes are held on the server until the round settles, one wallet
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

**On a server restart** (or a crash) the page reconnects through the stream's
own retry and resyncs from the `snapshot`. Open bets are **refunded**, never
settled either way: a round can't survive a restart, so what was riding goes
back to the wallet, on boot if the file still has it as riding, and on a clean
stop. The page shows "Lost the sky. Reconnecting…" meanwhile.

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
Pizza Boxes: boxes = layBoxes(stream(seed, "deal"))  (shuffle of the 20 prizes, then the offers' wobble)
```

Plinko has no rounds, so its seed is committed for an *epoch*: the hash is
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
- **Pizza Boxes seeds are in the wallet file.** A round that survives a restart
  has to keep its seed, so the seed of every live real round is saved (server
  side, in `hammys-arcade-wallets.json`, which is never served). Anyone who could
  read that file could read ahead in a live round; it has the same protection as
  the wallets (and the players' secret hashes) themselves.
- The wallet file is one JSON file for the whole arcade (up to 50,000
  players); a database would be next if it ever grows past that.

## Coins

Play money only: no real money, no purchases, no cash-out. A new player starts
with 1,000 coins. Online, the coins and stats live on the server (one wallet
for all four games, in `DATA_DIR/hammys-arcade-wallets.json`, written to a
temp file and renamed over the old one, debounced, and again on SIGTERM), and
the free top-up of 500 is the server's (broke and nothing riding). Offline, the wallet and the stats are saved in local storage under
`hammys-arcade.save.v1` (through `shared/storage.ts`; if storage is blocked the
page still works, it just forgets on reload). When you're out of coins
(`Wallet.broke`) the page offers a free top-up of 500 with a Hammy-flavoured
line, so it never dead-ends; in a game it waits a moment first, since a round
may still pay. "Start over" on the front page resets coins and stats.

## How it reuses Hammygotchi

Nothing from the games is copied. `games/hammys-arcade/src/main.ts` imports the
rules (`arcade.ts`, `rocket.ts`, `mines.ts`, `crossing.ts`, `plinko.ts`,
`deal.ts`), the screens (`rocketview.ts`, `minesview.ts`, `crossingview.ts`,
`plinkoview.ts`, `dealview.ts`, `arcadeview.ts`), Hammy himself (`hammy.ts`), the sounds and the games' styles
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
your coins. The front page shows how many players are in the sky.

The rocket, mines, crossing and plinko screens are Hammygotchi's, taking an
optional **round source** (`games/hammygotchi/src/roundsource.ts`, types only).
Without one they roll and settle everything on the phone, exactly as before, which
is what Hammygotchi's in-pet arcade still does. With one they draw what the source
says and send your choices to it. The sources are in
`games/hammys-arcade/src/online/` (`mirrors.ts`: a copy of each game's shared
round, kept up to date from the sky, and the calls; `sky.ts`: the stream and the
clock; `wallet.ts`: the server's coins as the front page sees them; `join.ts`:
the name box).

## Pizza Boxes

An original keep-your-box game (no show, no briefcases, no banker): Hammy hides
prizes under twenty of his pizza boxes, drawn on canvas, greasy and numbered,
with a prize board down each side that crosses off as boxes open. Rules and
content in `games/hammygotchi/src/deal.ts`, the screen in `dealview.ts`, the
box drawing in `dealart.ts`, its styles in `deal.css`.

**A round.** Bet, pick the one box you're keeping, then open the others in
rounds of 5, 4, 3, 2, 1, 1, 1, 1 (`ROUNDS`). After each round Dr. Moss rings
with an offer for your box: Deal (take it, the round is over, then your box is
opened for the "ooh" or the "ouch") or Keep going. After the last round two
boxes are left: swap for the other one or keep yours, and you win what's in it.
Hammy comments on big boxes, on offers and on the reveal.

**The prizes** (`PRIZES`, multiples of the bet): 0.01, 0.05, 0.1, 0.15, 0.2,
0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.75, 0.9, 0.99, 1.1, 1.2, 1.25, 2.25 and
8. They sum to exactly 19.8, so their mean is exactly 0.99 (`RTP`). That mean
is also what caps the top prize: with twenty boxes averaging 0.99 there are
19.8 bets in the whole board, so a 50× or 100× prize can't exist (a bigger
top prize needs a bigger board, or a rare jackpot board whose mean is
balanced by poorer ordinary ones).

**The offer.** After round *r* the offer is `floor2(average × share)`, where
`average` is the mean of the prizes under the boxes still shut (yours
included) and `share` starts low and rises toward fair: `OFFER_SHARE` =
0.34, 0.44, 0.54, 0.64, 0.74, 0.84, 0.92, 0.96, plus the layout's seeded wobble
(a number in [-1, 1) per round, times `OFFER_WOBBLE`: ±0.07 in round 1 down to
±0.02 in round 8) so it feels like a person. The share is clamped to
`OFFER_MAX` = 0.98 and the offer to the average itself, so **no offer is ever
above the expected value of what's left**. Your box's value to you is exactly
that average (it is equally likely to be any shut box), so the offers can only
lose against standing pat, and by the usual stopping argument no strategy,
deal early or late, swap or keep, can average above 0.99. Seeded simulation
(400,000 rounds each, `tests/hammygotchi/deal.test.ts` runs 25,000):
always deal at the first call 0.33; deal at 80% of average or better 0.85; deal
at 90% or better 0.93; deal at 95% or better 0.96; deal in the last round 0.94;
never deal 0.99 (keep 0.988, swap 0.991, standard error 0.003).

**Fairness plumbing.** `layBoxes(roll)` is the only randomness: it shuffles the
prizes under the boxes and draws the wobble, from the browser's crypto numbers
(`fairRoll`) in the screen. `DealRound` is the whole game with no DOM and no
clock (`pick`, `open`, `answer`, `swap`, `leave`), so a server can run it later.
Every move returns events (`picked`, `opened` with the prize, `offer`, `dealt`,
`declined`, `final`, `reveal`, `left`) and keeps them in `round.events`, for a
spectator feed. Nothing you do changes what's where.

**Leaving mid-round**, offline (closing the card, Back, or the page's `pagehide`),
settles the way the round was going: with an offer on the table you take it; with
no offer out you keep your box and get what's in it (it was decided at bet time,
so leaving tells you nothing); before you've picked a box the bet is refunded.
None of these can pay more than the average of what was in play.

Stats are the arcade's own: rounds, net and best multiplier under `deal`.

### Pizza Boxes online (and watching)

Offline the round is rolled on the phone, as above. With the server up
(`server/deal.ts`, the page side `online/mirrors.ts` `DealMirror` feeding
`dealview.ts`'s `DealSource`, typed in `roundsource.ts`) it works like Poop
Plinko, a solo round decided on the server, but every round is on a table other
players can watch.

- **The server decides.** A bet (`deal/bet`) takes the stake from the wallet,
  draws a 256-bit seed, publishes `hash = SHA-256(seed)` and lays the boxes from
  the seed with `dealLayoutOf(seed) = layBoxes(stream(seed, "deal"))`
  (`shared/derive.ts`, the same function the page uses). The server runs
  `DealRound` unchanged; the page only sends choices (`pick`, `open`, `answer`,
  `swap`, `leave`) and draws what it is told. Winnings are paid from the server
  wallet when the round ends; a refund (left before picking a box) gives the
  stake back as if it was never placed.
- **No leaks.** Everything that goes out (replies, the sky, the snapshot) is a
  `DealTable`: who, the bet, the hash, the phase, your box number, the offer, the
  boxes opened so far **with** their prizes, and the one box left at the swap.
  Prizes under shut boxes, the layout and the seed never leave until the round
  is over, when the seed comes out (`seed` in the final table). The page checks
  `SHA-256(seed) == hash`, lays the floor out again and checks it against every
  opened box and the outcome, and shows a check mark (or `DOES NOT MATCH`).
  The average of what is in play, which the page needs to judge the offer, is
  worked out from the fixed prize set less what has been opened.
- **Watching.** Every step is a `deal.step` event `{table, events}` where
  `events` are `DealRound`'s own (`picked`, `opened`, `offer`, `dealt`, `declined`,
  `final`, `reveal`, `left`); `table.v` counts steps, so a page that hears a step
  twice (the reply and the sky) ignores the second. A snapshot carries every
  live table (up to 40, newest first), and a "Watching now" list on the game's
  screen lists the other players' rounds: tap one to follow it. A spectator's
  screen is read-only (no bet, no boxes, no Deal button); it plays each opening, the
  phone ringing, Dr. Moss's offer and the answer as they come. The page replays
  them with the same sounds and lines as the player's.
- **Reactions.** A watcher can send one of six fixed phrases (`DEAL_REACTS`: No
  deal!, Take it!, Open that one!, Bold., Ouch., Nice box!) by number
  (`deal/react {table, r}`); the player and the other watchers see "Name: phrase".
  No free text, no emoji. One per player per 3 seconds, and at most 6 in a burst
  per table (then one every 2 seconds). Reactions are not saved.
- **Stalled rounds.** A round nobody has touched for `DEAL_IDLE_MS` (2 minutes)
  settles itself by the leave rule above (`DealRound.leave`): the offer on the
  table if the phone is ringing, otherwise the box's value, and before a box is
  picked the stake is refunded. The server's clock sees to it, so it happens
  whether or not anyone is connected. Closing the screen or the tab does **not**
  settle it: it carries on, and opening the game again picks it up (`deal/mine`,
  and the snapshot) until the timeout.
- **Restarts.** The seed and the list of moves of every live real round are
  saved in the same file write as the wallets (`Store.keep`), and on start each
  round is played again from its moves (the rules are deterministic), the stake
  stays held (`KEPT_STAKES` in `store.ts`; other games' stakes are still given
  back), and every round gets a full two minutes again (the time the server was
  down isn't the player's fault). A stake with no round to go with it, or a
  round whose stake isn't there, is squared up on start (the stake goes back /
  the round is dropped). A crash loses at most the last second and a half of
  moves (the save delay).
- **Quiet times.** If a page is connected and nobody real has a round, one of the
  cast (`ROCKET_CROWD`) sits down with a made-up bet, picks, opens and answers on
  a timer, takes the deal sooner or later depending on their nerve, and then goes
  home; another sits down some seconds later while it stays quiet. They use real
  seeds, publish and reveal like anyone, never touch a wallet and are not saved.
- **Limits.** Rounds start at most 4 in a burst and then one per 15 s per player
  (every start is broadcast); one live round per player; the usual 30 burst /
  10 a second per player and 60 / 20 per address on top.

## Tests

`tests/hammys-arcade/`:

- `wallet.test.ts`: the offline wallet (betting, paying a win, refunds, the
  top-up, saving and loading, damaged saves, blocked storage).
- `fair.test.ts`: SHA-256 against `node:crypto`, the hash check, the roll
  derivation, the name rules.
- `rocket.test.ts`, `crossing.test.ts`, `mines.test.ts`, `plinko.test.ts`: each game
  on the server with a fake clock: round timing, the committed hash and revealed
  seed, the crash derivation, bail before and after the crash, automatic bails, the
  cast stepping aside, the shared lane roll (one roll for everybody, each with their
  own risk), the same floor for the same settings, plinko's bin distribution under
  a fixed seed and its rate limit, refunds when a round can't finish.
- `store.test.ts`: wallet bounds, the top-up rule, names, the save file round trip
  (secrets not in it, stakes given back on load, a damaged file kept aside), the
  rate-limit buckets.
- `integration.test.ts`: builds the bundle, starts `server.mjs` on a free port with a
  temp `DATA_DIR`, and drives two players over real HTTP and SSE through all four
  games, then checks the seeds, stops it with SIGTERM and restarts it. Takes about
  45 s because rounds run on the real clock.

- `deal.test.ts`: Pizza Boxes on the server (stake, hash first, seed explains the
  boxes, payout, validation, refunds, no leaks, the timeout in every phase, restart
  from a saved file, orphan stakes, step events, reactions and their limits, the
  made-up player).
- `deal-mirror.test.ts`: the page's `DealMirror` against the real server game
  (every step once and in order for a player and a spectator, the seed check and its
  failure, holding a kept box's winnings back, coming back to a round, reactions).
- `deal-live.test.ts`: the server in this process on a free port: two players and a
  spectator over real HTTP and SSE, a restart in the middle of a round, a round
  settling itself after the timeout across a restart, the cast playing for a page
  that is watching. Takes about 10 s.

The games' rules are tested in `tests/hammygotchi/`; Pizza Boxes is in
`tests/hammygotchi/deal.test.ts` (prize mean, offers never above the average in
any state, the rounds and the swap, settle-on-leave, a seeded simulation of
several strategies, and the payout through the wallet).
