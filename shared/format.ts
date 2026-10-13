const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Short number for display: 950, 1.23K, 45.6M, 789B ... then 1.23e36. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) return String(Math.floor(n));
  let tier = Math.floor(Math.log10(n) / 3);
  let scaled = n / 10 ** (tier * 3);
  // Guard against log10 rounding at exact powers of 1000.
  if (scaled >= 1000) {
    tier += 1;
    scaled /= 1000;
  } else if (scaled < 1) {
    tier -= 1;
    scaled *= 1000;
  }
  if (tier >= SUFFIXES.length) return n.toExponential(2).replace('e+', 'e');
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  // Truncate rather than round so 999.99K never displays as 1000K.
  const f = 10 ** digits;
  const text = (Math.floor(scaled * f) / f).toFixed(digits);
  return (digits ? text.replace(/\.?0+$/, '') : text) + SUFFIXES[tier];
}

/** Like fmt, but keeps one decimal for small rates (0.1, 12.5). */
export function fmtRate(n: number): string {
  if (n > 0 && n < 100) return (Math.floor(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
  return fmt(n);
}

/** 45s, 12m, 3h 12m, 2d 4h. */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** Countdown with seconds once under an hour: 1h 05m, 4m 09s, 12s. */
export function fmtCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}
