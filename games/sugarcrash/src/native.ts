// Phone-only features, through Capacitor. In a browser every call here is a
// no-op, so the web build behaves exactly the same: durable saves, haptics,
// and going quiet when the app goes to the background.
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';

export const isNative = Capacitor.isNativePlatform();

const SAVE_KEY = 'sugarcrash.save.v1';

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

let lastTick = 0;

export const buzz = {
  tap(): void {
    if (!isNative) return;
    const now = performance.now();
    if (now - lastTick < 80) return;
    lastTick = now;
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  },
  heavy(): void {
    if (isNative) void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
  },
  success(): void {
    if (isNative) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  },
  bad(): void {
    if (isNative) void Haptics.notification({ type: NotificationType.Error }).catch(() => {});
  },
};

export function onAppState(handlers: { background(): void; foreground(): void; back(): boolean }): void {
  if (!isNative) return;
  void App.addListener('appStateChange', ({ isActive }) => (isActive ? handlers.foreground() : handlers.background()));
  void App.addListener('backButton', () => {
    if (!handlers.back()) void App.exitApp();
  });
}
