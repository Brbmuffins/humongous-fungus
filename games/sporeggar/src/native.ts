// Phone-only features, through Capacitor. In a browser every call here is a
// no-op, so the web build behaves exactly as before.
//
// Because prices come from a seeded random walk stored in the save, the game
// can look ahead: when the app goes to the background it simulates the next
// day on a copy of the market and schedules a reminder for the moment a
// holding is up enough to sell, or when perishable stock is half gone.
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { GOODS, GOOD_BY_ID } from './defs';
import { change, step } from './game';
import type { SporeState } from './state';

export const isNative = Capacitor.isNativePlatform();

const SAVE_KEY = 'market.save.v1';

export const nativeSave = {
  async load(): Promise<string | null> {
    if (!isNative) return null;
    try {
      return (await Preferences.get({ key: SAVE_KEY })).value;
    } catch {
      return null;
    }
  },
  save(raw: string): void {
    if (isNative) void Preferences.set({ key: SAVE_KEY, value: raw }).catch(() => {});
  },
  clear(): void {
    if (isNative) void Preferences.remove({ key: SAVE_KEY }).catch(() => {});
  },
};

// ---------------------------------------------------------------------------
// Haptics

let lastTick = 0;

export const buzz = {
  tap(): void {
    if (!isNative) return;
    const now = performance.now();
    if (now - lastTick < 50) return;
    lastTick = now;
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  },
  trade(): void {
    if (isNative) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  },
  success(): void {
    if (isNative) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  },
};

// ---------------------------------------------------------------------------
// Looking ahead

/** A holding this far up (after the market's cut) is worth a nudge. */
const SELL_SIGNAL = 0.15;
const LOOKAHEAD_MS = 24 * 3600 * 1000;
/** Goods named in the singular ("honey is up", not "honey are up"). */
const MASS_NOUNS = new Set(['honey', 'amber']);
const STEP_MS = 60 * 1000;

export interface Forecast {
  at: number;
  title: string;
  body: string;
}

/** Simulate a copy of the stall forward and find the next moment worth a reminder. */
export function forecast(s: SporeState, now: number): Forecast | null {
  const held = GOODS.filter((g) => s.market.goods[g.id].held >= 1);
  if (held.length === 0) return null;
  const copy = structuredClone(s) as SporeState;
  const start = Object.fromEntries(held.map((g) => [g.id, copy.market.goods[g.id].held]));
  const noRumors = () => 1; // rumors don't matter for the forecast
  for (let t = now + STEP_MS; t <= now + LOOKAHEAD_MS; t += STEP_MS) {
    step(copy, t, noRumors);
    for (const g of held) {
      const up = change(copy, g.id);
      if (up !== null && up >= SELL_SIGNAL) {
        return {
          at: t,
          title: `Your ${g.name.toLowerCase()} ${MASS_NOUNS.has(g.id) ? 'is' : 'are'} up ${Math.round(up * 100)}%`,
          body: 'Prices move fast. Open the stall to sell while it lasts.',
        };
      }
      const left = copy.market.goods[g.id].held;
      if (g.rotPerHour > 0 && left <= start[g.id] / 2) {
        return {
          at: t,
          title: `Half your ${GOOD_BY_ID[g.id].units} have rotted`,
          body: `Sell the rest of your ${g.name.toLowerCase()} before they go to the compost cart.`,
        };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reminders

const REMINDER_ID = 1;

export async function askForReminders(): Promise<void> {
  if (!isNative) return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') await LocalNotifications.requestPermissions();
  } catch {
    // Not available: the game works without reminders.
  }
}

export async function scheduleReminder(s: SporeState): Promise<void> {
  if (!isNative) return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return;
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
    const f = forecast(s, Date.now());
    if (!f || f.at < Date.now() + 2 * 60 * 1000) return;
    await LocalNotifications.schedule({
      notifications: [{ id: REMINDER_ID, title: f.title, body: f.body, schedule: { at: new Date(f.at), allowWhileIdle: true } }],
    });
  } catch {
    // Reminders are a nicety; never let them break the game.
  }
}

export async function clearReminders(): Promise<void> {
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
  } catch {
    // Nothing scheduled.
  }
}

export function onAppState(handlers: { background(): void; foreground(): void; back(): boolean }): void {
  if (!isNative) return;
  void App.addListener('appStateChange', ({ isActive }) => (isActive ? handlers.foreground() : handlers.background()));
  void App.addListener('backButton', () => {
    if (!handlers.back()) void App.exitApp();
  });
}
