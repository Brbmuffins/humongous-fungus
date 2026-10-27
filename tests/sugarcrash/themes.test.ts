import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../shared/rng';
import { BOT_NAMES, DEFAULT_THEME, MILESTONES } from '../../games/sugarcrash/src/defs';
import { Table, type Bet, type RoundSpec } from '../../games/sugarcrash/src/game';
import { loadSave, newSave, placeBet, YOU } from '../../games/sugarcrash/src/meta';
import { THEMES, themeById } from '../../games/sugarcrash/src/themes';
import { CRASH_SOUNDS, LAUNCH_SOUNDS } from '../../games/sugarcrash/src/themes/kit';

const spec = (crash: number, id = 1): RoundSpec => ({ id, crash, hash: 'a'.repeat(64), seed: 'b'.repeat(64) });
const T0 = 1_700_000_000_000;

/** Play a seeded table to its end, and write down everything that happened except the crowd's names. */
function play(names: readonly string[], seed: number, crash: number): unknown {
  const t = new Table(spec(crash, seed), mulberry32(seed), names);
  t.join({ who: YOU, you: true, amount: 100, target: 2 });
  const strip = (b: Bet) => ({ ...b, who: b.you ? YOU : '' });
  const log: unknown[] = [];
  for (let s = 0; s < 400; s += 1 / 30) {
    for (const e of t.step(1 / 30)) log.push('bet' in e ? { ...e, bet: strip(e.bet) } : e);
    if (t.phase === 'crashed' && s > 30) break;
  }
  return { log, bets: t.bets.map(strip), phase: t.phase, m: t.multiplier };
}

describe('every theme', () => {
  it('has at least one theme, with unique ids, and the default exists', () => {
    expect(THEMES.length).toBeGreaterThan(0);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    expect(THEMES.some((t) => t.id === DEFAULT_THEME)).toBe(true);
  });

  for (const th of THEMES) {
    describe(th.id, () => {
      it('has a valid id and its labels', () => {
        expect(th.id).toMatch(/^[a-z][a-z0-9-]{0,23}$/);
        for (const s of [th.name, th.chip, th.icon, th.blurb, th.launchLabel, th.crashName, th.crashedVerb, th.themeColor]) {
          expect(typeof s).toBe('string');
          expect(s.trim().length).toBeGreaterThan(0);
        }
        expect(th.logo[0].length).toBeGreaterThan(0);
        expect(th.logo[1].length).toBeGreaterThan(0);
        expect(th.help.eyebrow.length).toBeGreaterThan(0);
        expect(th.help.story.length).toBeGreaterThan(0);
        expect(th.help.back.length).toBeGreaterThan(0);
      });

      it('names every milestone', () => {
        for (const m of MILESTONES) {
          const name = th.milestones[m];
          expect(typeof name, `${th.id} milestone ${m}`).toBe('string');
          expect(name.trim().length).toBeGreaterThan(0);
        }
      });

      it('has a crowd as big as the default one: unique, without You', () => {
        expect(th.crowd.length).toBe(BOT_NAMES.length);
        expect(new Set(th.crowd.map((n) => n.toLowerCase())).size).toBe(th.crowd.length);
        for (const n of th.crowd) {
          expect(n.trim().length).toBeGreaterThan(0);
          expect(n).not.toBe(YOU);
        }
      });

      it('has a readout that only goes up', () => {
        expect(th.readout.label.length).toBeGreaterThan(0);
        let prev = -Infinity;
        for (const m of [1, ...MILESTONES]) {
          const level = th.readout.level(m);
          expect(Number.isFinite(level)).toBe(true);
          expect(level).toBeGreaterThan(prev);
          prev = level;
          const text = th.readout.text(level);
          expect(typeof text).toBe('string');
          expect(text.length).toBeGreaterThan(0);
        }
      });

      it('has crash variants with known sounds', () => {
        expect(th.crashes.length).toBeGreaterThan(0);
        for (const v of th.crashes) {
          expect(v.title.length).toBeGreaterThan(0);
          expect(typeof v.caption).toBe('string');
          expect(CRASH_SOUNDS).toContain(v.sound);
        }
      });

      it('has a refill, a sound profile and a line color for every multiplier', () => {
        expect(th.refill.who.length).toBeGreaterThan(0);
        expect(th.refill.quip.length).toBeGreaterThan(0);
        expect(th.refill.stat.length).toBeGreaterThan(0);
        const s = th.sound;
        expect(LAUNCH_SOUNDS).toContain(s.launch);
        expect(s.whine.base).toBeGreaterThan(0);
        expect(s.beat.bpm).toBeGreaterThan(0);
        expect(s.milestone.base).toBeGreaterThan(0);
        expect(s.milestone.ratios.length).toBeGreaterThan(0);
        for (const m of [1, 2, 10, 100, 1000]) expect(th.heat(m)).toMatch(/^(#|rgb|hsl)/);
        expect(th.fx.confetti.length).toBeGreaterThan(0);
      });

      it('sets the same page colors as every other theme', () => {
        const keys = Object.keys(THEMES[0].css).sort();
        expect(Object.keys(th.css).sort()).toEqual(keys);
        for (const v of Object.values(th.css)) expect(v.length).toBeGreaterThan(0);
        expect(Object.keys(th.ink).sort()).toEqual(Object.keys(THEMES[0].ink).sort());
      });

      it('makes a scene with a backdrop and a rider', () => {
        const scene = th.scene();
        expect(typeof scene.backdrop).toBe('function');
        expect(typeof scene.rider).toBe('function');
      });
    });
  }
});

describe('switching theme', () => {
  const crowds = THEMES.map((t) => t.crowd);

  it('leaves a seeded round exactly the same, but for the names', () => {
    for (const seed of [1, 7, 42]) {
      for (const crash of [1.5, 3.7, 12]) {
        const ref = play(crowds[0], seed, crash);
        for (const names of crowds) expect(play(names, seed, crash)).toEqual(ref);
      }
    }
  });

  it('renames the crowd mid-round without touching a bet or a cash-out', () => {
    for (const to of crowds) {
      const t = new Table(spec(8), mulberry32(5), crowds[0]);
      t.join({ who: YOU, you: true, amount: 50, target: 1.5 });
      for (let s = 0; s < 14; s += 1 / 30) t.step(1 / 30);
      const before = t.bets.map((b) => ({ ...b, who: b.you ? YOU : '' }));
      t.setNames(to);
      expect(t.bets.map((b) => ({ ...b, who: b.you ? YOU : '' }))).toEqual(before);
      for (const b of t.bets) if (!b.you) expect(to).toContain(b.who);
      expect(t.yours?.who).toBe(YOU);
    }
  });

  it('seats the crowd with the theme’s names', () => {
    for (const th of THEMES) {
      const t = new Table(spec(3), mulberry32(9), th.crowd);
      for (let s = 0; s < 7; s += 1 / 30) t.step(1 / 30);
      expect(t.bets.length).toBeGreaterThan(0);
      for (const b of t.bets) expect(th.crowd).toContain(b.who);
    }
  });
});

describe('the saved choice', () => {
  it('starts on the default theme', () => {
    expect(newSave(T0).settings.theme).toBe(DEFAULT_THEME);
  });

  it('round-trips for every theme', () => {
    for (const th of THEMES) {
      const s = newSave(T0);
      s.settings.theme = th.id;
      const back = loadSave(JSON.stringify(s));
      expect(back?.settings.theme).toBe(th.id);
      expect(themeById(back?.settings.theme).id).toBe(th.id);
    }
  });

  it('survives playing, and a save with no theme (an older one) gets the default', () => {
    const s = newSave(T0);
    s.settings.theme = THEMES[THEMES.length - 1].id;
    const t = new Table(spec(2), mulberry32(2));
    expect(placeBet(s, t, 20, null)).toBe('ok');
    expect(loadSave(JSON.stringify(s))?.settings.theme).toBe(s.settings.theme);
    const old = JSON.parse(JSON.stringify(newSave(T0)));
    delete old.settings.theme;
    expect(loadSave(JSON.stringify(old))?.settings.theme).toBe(DEFAULT_THEME);
  });

  it('turns a damaged theme into the default, and an unknown one into the default look', () => {
    for (const bad of [42, null, '', 'Not A Theme!', '<script>', 'x'.repeat(80), '../etc']) {
      const s = JSON.parse(JSON.stringify(newSave(T0)));
      s.settings.theme = bad;
      expect(loadSave(JSON.stringify(s))?.settings.theme).toBe(DEFAULT_THEME);
    }
    expect(themeById('no-such-theme').id).toBe(DEFAULT_THEME);
    expect(themeById(undefined).id).toBe(DEFAULT_THEME);
    expect(themeById(null).id).toBe(DEFAULT_THEME);
  });
});
