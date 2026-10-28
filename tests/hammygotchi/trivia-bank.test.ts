import { describe, expect, it } from 'vitest';
import { TRIVIA, triviaIn, type TriviaQuestion } from '../../games/hammygotchi/src/trivia/bank';

const KEYS = ['id', 'cat', 'topic', 'difficulty', 'q', 'answers', 'correct', 'fact', 'source'].sort();

describe('trivia bank: shape', () => {
  it('has questions, each with exactly the expected fields', () => {
    expect(TRIVIA.length).toBeGreaterThan(0);
    for (const t of TRIVIA) expect(Object.keys(t).sort(), t.id).toEqual(KEYS);
  });

  it('has valid ids, categories, topics and difficulties', () => {
    for (const t of TRIVIA) {
      expect(t.id, t.id).toMatch(/^(gk|gw)-\d{4}$/);
      expect(t.id.startsWith(t.cat === 'general' ? 'gk-' : 'gw-'), t.id).toBe(true);
      expect(['general', 'gross']).toContain(t.cat);
      expect(t.topic, t.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect([1, 2, 3], t.id).toContain(t.difficulty);
    }
  });

  it('has exactly three distinct, non-empty answers and an in-range correct index', () => {
    for (const t of TRIVIA) {
      expect(t.answers, t.id).toHaveLength(3);
      for (const a of t.answers) expect(typeof a === 'string' && a.trim().length > 0, t.id).toBe(true);
      expect(new Set(t.answers.map((a) => a.trim().toLowerCase())).size, t.id).toBe(3);
      expect(Number.isInteger(t.correct), t.id).toBe(true);
      expect(t.correct, t.id).toBeGreaterThanOrEqual(0);
      expect(t.correct, t.id).toBeLessThanOrEqual(2);
    }
  });

  it('keeps questions and answers short enough for a phone', () => {
    for (const t of TRIVIA) {
      expect(t.q.length, `${t.id} q`).toBeGreaterThan(8);
      expect(t.q.length, `${t.id} q`).toBeLessThanOrEqual(115);
      for (const a of t.answers) expect(a.length, `${t.id} answer "${a}"`).toBeLessThanOrEqual(34);
      expect(t.fact.length, `${t.id} fact`).toBeGreaterThan(8);
      expect(t.fact.length, `${t.id} fact`).toBeLessThanOrEqual(190);
    }
  });

  it('has no answer that dodges the question', () => {
    for (const t of TRIVIA) {
      for (const a of t.answers) expect(a, t.id).not.toMatch(/^(all|both|none|neither) of (the|these)/i);
    }
  });

  it('gives every question a source URL', () => {
    for (const t of TRIVIA) {
      expect(t.source, t.id).toMatch(/^https?:\/\/[^\s/]+\.[^\s/]+\/\S*$/);
      expect(() => new URL(t.source), t.id).not.toThrow();
    }
  });
});

describe('trivia bank: the whole set', () => {
  it('has unique ids and unique question text', () => {
    const ids = TRIVIA.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const qs = TRIVIA.map((t) => t.q.trim().toLowerCase());
    expect(new Set(qs).size).toBe(qs.length);
  });

  it('has both categories', () => {
    expect(triviaIn('general').length).toBeGreaterThan(0);
    expect(triviaIn('gross').length).toBeGreaterThan(0);
    expect(triviaIn().length).toBe(TRIVIA.length);
  });

  it('has all three difficulties in each category', () => {
    for (const cat of ['general', 'gross'] as const) {
      const seen = new Set(triviaIn(cat).map((t) => t.difficulty));
      expect([...seen].sort(), cat).toEqual([1, 2, 3]);
    }
  });

  it('spreads the right answer roughly evenly over the three slots', () => {
    const groups: [string, readonly TriviaQuestion[]][] = [['all', TRIVIA], ['general', triviaIn('general')], ['gross', triviaIn('gross')]];
    for (const [name, qs] of groups) {
      const n = qs.length;
      for (const slot of [0, 1, 2]) {
        const share = qs.filter((t) => t.correct === slot).length / n;
        expect(share, `${name} slot ${slot}`).toBeGreaterThan(0.25);
        expect(share, `${name} slot ${slot}`).toBeLessThan(0.42);
      }
    }
  });
});
