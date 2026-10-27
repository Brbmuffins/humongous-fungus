# Sugar Crash — design notes

Our take on the crash game. Every round our muffin kid eats a whole bag of
candy and the sugar rush starts: a multiplier climbs from 1.00×, faster and
faster, until the sugar crash hits at a point nobody can know in advance. Bet
before the rush, cash out during it, and you win your bet times the multiplier
at that moment. Still in when it crashes and the bet is gone.

Play money only. You start with 1,000 coins, Grandma slips you 500 more when
you're broke, and that's the only way coins come in: they can't be bought, won
for real or cashed out. Everyone else at the table is made up. It's a game
about the feeling of hanging on one second too long, not a casino.

## A round (`src/game.ts`)

- **Countdown, 6 seconds.** Bets come in: yours, and 15 to 30 made-up players
  sitting down at random moments. You can take yours back until the rush
  starts.
- **The rush.** The multiplier is e^(0.06·t): 1.5× at 6.8 s, 2× at 11.6 s, 5×
  at 27 s, 10× at 38 s, 100× at 77 s. Auto cash-outs pay the moment it passes
  their target (a target right at the crash point still pays). Cash out by
  hand with the big button or the space bar.
- **The crash.** At the round's crash point the line plunges, the kid flops
  over asleep, and everyone still in loses. Three seconds later the next
  countdown starts.
- **Missed the countdown?** The button bets on the next round instead
  (Queued, tap to cancel). If you can't cover it when the round opens, it's
  dropped.
- **Leaving.** A bet stays in its round. Close the game mid-rush and, when you
  come back, it's settled the way that round went: paid if your auto cash-out
  was at or under the crash point, lost if not.

The table is pure and stepped by the caller, so a seeded table always plays
the same; it survives a long frame (a tab coming back) without skipping the
crash.

## Crash points and the edge (`src/fair.ts`)

    crash = max(1.00, floor(99 / (1 − u)) / 100)        u uniform in [0, 1)

so P(crash ≥ x) = 0.99 / x for every x from 1.01 up. Whatever target you pick,
you get back 99% of what you bet on average: the house keeps 1%, and no
strategy changes that. About 2 rounds in 100 crash right at 1.00×.

`npm run sim:sugarcrash` over a million rounds:

| | |
|---|---|
| Crash at 1.00× | 1.97% |
| Median crash | 1.97× |
| 1 round in 10 reaches | 9.9× |
| 1 round in 100 reaches | 99.6× |
| Average round | 25.5 s (16.5 s of rush) |

| Auto cash-out | Wins | Pays back |
|---|---|---|
| 1.10× | 90.0% | 99.0% |
| 1.50× | 66.0% | 99.0% |
| 2.00× | 49.5% | 98.9% |
| 5.00× | 19.7% | 98.7% |
| 10.00× | 9.9% | 98.7% |
| 100.00× | 1.0% | 99.6% |

Payouts are whole coins, rounded down (the minimum bet is 10, so that costs
at most a coin). Bets go from 10 to 100,000; auto cash-outs from 1.01× to
1,000×.

## Provably fair

Every round gets a secret 32-byte seed before it starts, and you see the
seed's SHA-256 hash (the 🔒 card shows the current one). From then on the
round can't change. After the crash the seed is revealed:

    commitment = SHA-256(seed)                      shown before the round
    outcome    = SHA-256(seed + ":sugar-crash")
    u          = first 13 hex digits of outcome / 2^52
    crash      = max(1.00, floor(99 / (1 − u)) / 100)

The crash point comes from a second hash, so the hash you see first gives
nothing away. The 🔒 card lists the last rounds with their hashes and seeds,
and "Check it" recomputes both in the browser. (Tap a chip in the history
strip to jump to that round.)

It's honest about what it is: the seeds are made on your own device, so this
proves the game can't change a round after it starts, the way the real crash
games do, not that the device couldn't cheat itself.

## The crowd

Forty made-up players with food names (WaffleKing, SconeCold, PhoReal,
Kale_Me_Maybe…); 15 to 30 play each round. Their bets are mostly small (10
to 100, sometimes 1,000 to 5,000). Where they cash out: 45% play it safe
(1.1–2×), a third reach (2–5×), 16% go for 5–20× and 6% for the moon
(20–200×). Their cash-outs pop up on the line and turn their row green; when
it crashes, everyone still in goes red.

## On screen (`src/scene.ts`)

- A candy-colored monitor: dashed pink grid lines, × on the left, seconds
  along the bottom, both stretching smoothly to keep the tip about three
  quarters of the way across and up. In the corner, a monitor-style readout
  climbs with the rush (`SUGAR 157 mg/dL ▲`). It's flavor, nothing more.
- The sugar line glows mint, then lemon, orange, bubblegum and grape as it
  climbs, with a pulse at the tip.
- Our muffin kid rides the tip: striped liner, frosting with sprinkles and a
  cherry. The higher it goes the harder it vibrates, the wider its eyes get
  (spinning spirals from 5×), the bigger the grin (tongue out from 10×), and
  it sweats sprinkles. Before the rush it bounces on a donut.
- Donuts, wrapped candy, soda cans, lollipops and gummy bears stream past,
  more and faster as the rush builds, with sparkles behind them.
- Milestones get a shout and a sprinkle burst: 2× SUGAR HIGH, 5× ZOOMIES,
  10× I CAN SEE SOUNDS, then RAINBOW MODE, TIME IS FAKE, PURE SUGAR, SWEET
  SINGULARITY, BEYOND SWEET and, at 1,000×, GALAXY BRAIN.
- The big multiplier in the middle jitters more the higher it goes.
- Cash out: coins and candy wrappers burst out, and a pin on the line says
  where you got out.
- Sugar crash: the line drops straight down, the kid falls with it, flops
  over and snores (z z z), the color drains out of the whole page for a beat,
  and SUGAR CRASH @ 3.42× drops in.

Phone first (390 px wide, no sideways scroll); from 900 px the players move to
a column on the right. Reduced motion turns off the shake, jitter and most of
the particles.

## Sound (`src/sound.ts`)

All synthesized, no files. A whine that climbs with the multiplier over a
heartbeat that speeds up (78 bpm at the start, about 190 by 10×); a soda can
cracking open at the start; a sparkly arpeggio at each milestone; a candy
wrapper crinkle and a ka-ching when you cash out; and for the crash, a
deflating wah-wah-wah-waaah and then a snore. A sound toggle in the toolbar.

## Your account (`src/meta.ts`)

Coins, the bet you have riding, the bet queued for the next round, your
settings (bet, auto cash-out on or off and its target, sound), stats (rounds,
wins, wagered, paid back, biggest win, best cash-out, the highest crash
you've seen, coins from Grandma) and the last 30 rounds. One JSON save in
local storage, on the phone in Preferences, and, as a claude.ai page, a
private copy per player in the artifact's database. A damaged save is
repaired field by field. Stats has a Start over button.

## Tone

Sugar rush and sugar crash, the playground kind. No medical jokes. And
because it's a gambling game in everything but money: no real money anywhere,
no way to buy coins, no ads, the house edge stated in the help card, and a
reminder under the player list that it's play money.

## In the stores

Simulated gambling, even with play money, means the App Store rating is 17+
("Frequent/Intense Simulated Gambling") and Google Play needs an adult target
audience and the "simulated gambling" declaration. The Capacitor config is
ready (`com.muffindevelopment.sugarcrash`); add the native projects with
`npx cap add ios` / `npx cap add android` when it's time.
