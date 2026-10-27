# Sugar Crash 1.0.0

The first release. A crash game for play money: our muffin kid eats a bag of
candy, the sugar rush multiplier climbs, and at some point the sugar crash
hits. Cash out before you crash.

## What's in it

- Rounds back to back: a 6-second countdown to bet, then the rush, then the
  crash. The multiplier doubles in about 12 seconds and reaches 10× in about
  38; the median round crashes just under 2×, and 1 in 100 makes it to 100×.
- Cash out by hand (the big button or the space bar) or set an auto cash-out.
  Take a bet back during the countdown, or queue one for the next round while
  a rush is on.
- A 1% house edge at every target, the same way the real crash games do it.
- Provably fair: you see each round's SHA-256 hash before it starts, the seed
  is revealed after, and the 🔒 card checks both in your browser.
- A table of 15 to 30 made-up players with food names, their bets and their
  cash-outs popping up live, and the last 25 crash points as chips.
- The look: a candy-colored monitor with a glowing sugar line, donuts, candy
  and soda cans streaming past, and the muffin kid riding the tip, vibrating
  harder, eyes spinning, sweating sprinkles. Shouts at 2× (SUGAR HIGH), 5×
  (ZOOMIES) and 10× (I CAN SEE SOUNDS). On a crash the line plunges, the kid
  falls asleep and the color drains out of the page.
- Synthesized sound: a whine and a heartbeat that speed up with the rush, a
  wrapper crinkle and ka-ching on cash out, a sad trombone and a snore on the
  crash.
- Stats and a fresh start. A bet still riding when you close the game is
  settled the way its round went.

Play money only: 1,000 coins to start, and Grandma slips you 500 more if you
go broke. Coins can't be bought or cashed out.

## Play it

Download `sugar-crash-1.0.0.html` below and open it in any browser, on a phone
or a computer. It's one self-contained file and works offline. Your coins and
stats are saved in that browser.

## Phone apps

Not in the stores yet. The Capacitor config and phone features (durable
saves, haptics, going quiet in the background) are ready in
`games/sugarcrash`; add the native projects with `npx cap add ios` and
`npx cap add android` when it's time. As a simulated gambling game it needs a
17+ rating on the App Store and an adult audience on Google Play.
