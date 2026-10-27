// Haptics, through Capacitor: a tap, a fart, a win, a loss. In a browser every
// call is a no-op. Its own file so the arcade can buzz without the rest of the
// phone features (reminders, saves) coming along; native.ts re-exports it.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export const isNative = Capacitor.isNativePlatform();

let lastTick = 0;

export const buzz = {
  tap(): void {
    if (!isNative) return;
    const now = performance.now();
    if (now - lastTick < 50) return;
    lastTick = now;
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  },
  fart(size: number): void {
    if (isNative) void Haptics.impact({ style: size > 0.9 ? ImpactStyle.Heavy : ImpactStyle.Medium }).catch(() => {});
  },
  success(): void {
    if (isNative) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  },
  bad(): void {
    if (isNative) void Haptics.notification({ type: NotificationType.Error }).catch(() => {});
  },
};
