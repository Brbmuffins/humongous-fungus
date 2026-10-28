// The question bank for the "one player vs the crowd" trivia game: plain data
// (questions.json), fact-checked, each with a source. This file only types it.

import raw from './questions.json';

export type TriviaCat = 'general' | 'gross';
export type TriviaDifficulty = 1 | 2 | 3;

export interface TriviaQuestion {
  /** Stable id: gk-#### (general knowledge) or gw-#### (gross and weird). */
  id: string;
  cat: TriviaCat;
  topic: string;
  difficulty: TriviaDifficulty;
  q: string;
  /** Exactly three answers. */
  answers: [string, string, string];
  /** Index (0-2) of the right answer. */
  correct: 0 | 1 | 2;
  /** One short line shown after answering: why it's true. */
  fact: string;
  /** A reputable page that confirms the fact. */
  source: string;
}

export const TRIVIA: readonly TriviaQuestion[] = raw as TriviaQuestion[];

/** Every question in a category (or all of them). */
export function triviaIn(cat?: TriviaCat): TriviaQuestion[] {
  return TRIVIA.filter((t) => !cat || t.cat === cat);
}
