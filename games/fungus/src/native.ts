// Phone-only features, through Capacitor. In a browser every call here is a
// no-op, so the web build behaves exactly as before.
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';

export const isNative = Capacitor.isNativePlatform();

const SAVE_KEY = 'humongous.save.v1';

/** Saves in the platform's own key-value store, which iOS never clears. */
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

let lastTapBuzz = 0;

export const buzz = {
  /** A light tick for each tap, at most every 50 ms. */
  tap(): void {
    if (!isNative) return;
    const now = performance.now();
    if (now - lastTapBuzz < 50) return;
    lastTapBuzz = now;
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  },
  buy(): void {
    if (isNative) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  },
  success(): void {
    if (isNative) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  },
};

// ---------------------------------------------------------------------------
// Reminders while the app is closed

const SPECIMEN_ID = 1;
const JAR_FULL_ID = 2;

export interface Reminder {
  /** Specimen growing in the bed, if any. */
  specimen: { name: string; at: number } | null;
  /** When the away limit runs out, if the jar produces anything. */
  jarFullAt: number | null;
  awayHours: number;
}

/** Ask once, at a moment the player can see why (planting a specimen). */
export async function askForReminders(): Promise<void> {
  if (!isNative) return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') await LocalNotifications.requestPermissions();
  } catch {
    // Not available: the game works without reminders.
  }
}

export async function scheduleReminders(r: Reminder): Promise<void> {
  if (!isNative) return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return;
    await LocalNotifications.cancel({ notifications: [{ id: SPECIMEN_ID }, { id: JAR_FULL_ID }] });
    const now = Date.now();
    const notifications = [];
    if (r.specimen && r.specimen.at > now + 5_000) {
      notifications.push({
        id: SPECIMEN_ID,
        title: `Your ${r.specimen.name} is ready`,
        body: 'Harvest it in Cultivate. You keep it forever.',
        schedule: { at: new Date(r.specimen.at), allowWhileIdle: true },
      });
    }
    if (r.jarFullAt && r.jarFullAt > now + 60_000) {
      notifications.push({
        id: JAR_FULL_ID,
        title: 'Your jar has stopped growing',
        body: `It digested for ${r.awayHours} hours while you were gone. Come back to collect it.`,
        schedule: { at: new Date(r.jarFullAt), allowWhileIdle: true },
      });
    }
    if (notifications.length) await LocalNotifications.schedule({ notifications });
  } catch {
    // Reminders are a nicety; never let them break the game.
  }
}

export async function clearReminders(): Promise<void> {
  if (!isNative) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: SPECIMEN_ID }, { id: JAR_FULL_ID }] });
  } catch {
    // Nothing scheduled.
  }
}

// ---------------------------------------------------------------------------
// App lifecycle

export function onAppState(handlers: { background(): void; foreground(): void; back(): boolean }): void {
  if (!isNative) return;
  void App.addListener('appStateChange', ({ isActive }) => (isActive ? handlers.foreground() : handlers.background()));
  // Android back button: close a dialog if one is open, otherwise leave the app.
  void App.addListener('backButton', () => {
    if (!handlers.back()) void App.exitApp();
  });
}
