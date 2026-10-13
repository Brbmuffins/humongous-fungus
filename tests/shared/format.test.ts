import { describe, expect, it } from 'vitest';
import { fmt, fmtCountdown, fmtDuration, fmtRate } from '@shared/format';

describe('fmt', () => {
  it('shows small numbers as whole numbers', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(15.9)).toBe('15');
    expect(fmt(999.99)).toBe('999');
  });
  it('uses suffixes with up to three significant digits', () => {
    expect(fmt(1000)).toBe('1K');
    expect(fmt(1100)).toBe('1.1K');
    expect(fmt(12_345)).toBe('12.3K');
    expect(fmt(4.2e7)).toBe('42M');
    expect(fmt(3.31e9)).toBe('3.31B');
    expect(fmt(1e15)).toBe('1Qa');
  });
  it('never rounds up into the next suffix', () => {
    expect(fmt(999_999)).toBe('999K');
  });
  it('falls back to exponent notation past decillions', () => {
    expect(fmt(1.5e40)).toBe('1.50e40');
  });
});

describe('fmtRate', () => {
  it('keeps one decimal for small rates', () => {
    expect(fmtRate(0.1)).toBe('0.1');
    expect(fmtRate(12.55)).toBe('12.5');
    expect(fmtRate(3)).toBe('3');
    expect(fmtRate(2500)).toBe('2.5K');
  });
});

describe('durations', () => {
  it('formats elapsed time', () => {
    expect(fmtDuration(45)).toBe('45s');
    expect(fmtDuration(12 * 60)).toBe('12m');
    expect(fmtDuration(3 * 3600 + 12 * 60)).toBe('3h 12m');
    expect(fmtDuration(52 * 3600)).toBe('2d 4h');
  });
  it('formats countdowns', () => {
    expect(fmtCountdown(3725)).toBe('1h 02m');
    expect(fmtCountdown(249)).toBe('4m 09s');
    expect(fmtCountdown(0.2)).toBe('1s');
  });
});
