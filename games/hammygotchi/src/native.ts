// Phone-only features, through Capacitor. In a browser every call here is a
// no-op, so the web build behaves exactly as before.
//
// Hammy keeps living while the app is closed, so when it goes to the
// background the game plays the next day forward on a copy of him and
// schedules two notifications: his next text, and the moment he starts
// falling apart.
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { buzz, isNative } from './haptics';
import { isAlive, step } from './game';
import type { HammyState } from './state';

export { buzz, isNative };

const SAVE_KEY = 'hammygotchi.save.v1';

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
// Looking ahead

const LOOKAHEAD_MS = 24 * 3600 * 1000;
const STEP_MS = 60 * 1000;
/** A need this low is worth a notification. */
const ALERT_BELOW = 15;

export interface Forecast {
  at: number;
  title: string;
  body: string;
}

/** Play a copy of Hammy forward: his next text, and when he next needs you. */
export function forecast(s: HammyState, now: number): { text: Forecast | null; alert: Forecast | null } {
  if (!isAlive(s)) return { text: null, alert: null };
  const copy = structuredClone(s) as HammyState;
  copy.updatedAt = now;
  const roll = () => 0.5;
  let text: Forecast | null = null;
  let alert: Forecast | null = null;
  for (let t = now + STEP_MS; t <= now + LOOKAHEAD_MS && (!text || !alert); t += STEP_MS) {
    const { events } = step(copy, t, roll);
    for (const e of events) {
      if (!text && e.type === 'text') text = { at: t, title: 'Hammy', body: e.text };
    }
    if (alert) continue;
    if (copy.health < 35) alert = { at: t, title: 'Hammy is dying', body: 'Like, actually. Open the unit before he turns into mushrooms.' };
    else if (copy.belly < ALERT_BELOW) alert = { at: t, title: 'Hammy is starving', body: 'He has started eyeing the plant. Order him something.' };
    else if (copy.mood < ALERT_BELOW) alert = { at: t, title: 'Hammy misses you', body: 'He says nobody ever calls him. Call him.' };
    else if (copy.fresh < ALERT_BELOW) alert = { at: t, title: 'The unit is a biohazard', body: 'The scientist is evacuating. Flush the toilet, bin the poop and the trash, and put him in the shower.' };
  }
  return { text, alert };
}

// ---------------------------------------------------------------------------
// Reminders

const TEXT_ID = 1;
const ALERT_ID = 2;

export async function askForReminders(): Promise<void> {
  if (!isNative) return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') await LocalNotifications.requestPermissions();
  } catch {
    // Not available: the game works without reminders.
  }
}

export async function scheduleReminders(s: HammyState): Promise<void> {
  if (!isNative) return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return;
    await clearReminders();
    const soon = Date.now() + 2 * 60 * 1000;
    const { text, alert } = forecast(s, Date.now());
    const notifications = [
      ...(text && text.at > soon ? [{ id: TEXT_ID, ...text }] : []),
      ...(alert && alert.at > soon ? [{ id: ALERT_ID, ...alert }] : []),
    ].map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: new Date(n.at), allowWhileIdle: true } }));
    if (notifications.length) await LocalNotifications.schedule({ notifications });
  } catch {
    // Reminders are a nicety; never let them break the game.
  }
}

export async function clearReminders(): Promise<void> {
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: TEXT_ID }, { id: ALERT_ID }] });
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
