// The Damp Seat: what the page and the server say to each other for the
// one-player-versus-the-crowd quiz, and the numbers the game runs on.
//
// One player sits in the hot seat (it is damp). Everyone else is the crowd,
// topped up with made-up players so a wrong answer knocks out a lot of people
// at once. Each knocked-out crowd member adds coins to the pot; after a right
// answer the hot seat can take the pot and go or keep going; a wrong answer
// loses the pot and whoever is still standing in the crowd splits a prize.
//
// Nothing here costs coins to join. Every prize is paid by the house, so the
// amounts are small and capped (see the constants), because the question bank
// is public and anyone can look the answers up.

export const TRIVIA_NAME = 'The Damp Seat';

/** Timing, in milliseconds (the server's clock). */
export const TRIVIA_LOBBY_MS = 15_000;
export const TRIVIA_QUESTION_MS = 12_000;
/** With only made-up players left to wait for, a question is this long. */
export const TRIVIA_QUIET_QUESTION_MS = 6000;
/** When every real player has answered, the question closes, but never sooner than this after it opened. */
export const TRIVIA_MIN_OPEN_MS = 4000;
/** An answer that arrives this long after the clock hit zero still counts (the trip over the network). */
export const TRIVIA_GRACE_MS = 400;
export const TRIVIA_REVEAL_MS = 5500;
export const TRIVIA_DECIDE_MS = 8000;
export const TRIVIA_PAUSE_MS = 8000;
export const TRIVIA_TALLY_MS = 1000;

/** How hard each question of a round is (1 easy, 2 medium, 3 hard). A round is this many questions at most. */
export const TRIVIA_LADDER: readonly (1 | 2 | 3)[] = [1, 1, 1, 2, 2, 2, 3, 3];

/** Made-up crowd members in every round. */
export const TRIVIA_CAST = 80;
/** Real players in one round, at most. */
export const TRIVIA_MAX_HUMANS = 150;

/** The prizes. Coins from the house, never from other players. */
/** Every crowd member knocked out adds this many coins times the question's difficulty to the pot. */
export const TRIVIA_KNOCK_COINS = 3;
/** The pot never grows past this. */
export const TRIVIA_POT_CAP = 400;
/** Clearing every question adds this on top of the pot. */
export const TRIVIA_CLEAR_BONUS = 100;
/** When the hot seat is wrong, the crowd splits at least this much (the pot, if it is bigger). */
export const TRIVIA_FLOOR_PRIZE = 50;
/** Every real player left standing when the hot seat falls gets at least this. */
export const TRIVIA_MIN_SHARE = 5;
/** ... and at most this. */
export const TRIVIA_SHARE_CAP = 60;
/** The most one player can win from this game in a day (UTC), and all players together. */
export const TRIVIA_DAILY_CAP = 600;
export const TRIVIA_HOUSE_DAILY_CAP = 20_000;

export type TriviaPhase = 'lobby' | 'ask' | 'reveal' | 'decide' | 'end';
export type TriviaOutcome = 'took' | 'busted' | 'cleared' | 'wiped';

/** A real player in the crowd. */
export interface TriviaHuman {
  id: string;
  name: string;
  emoji: string;
  alive: boolean;
}

export interface TriviaQuestionPub {
  text: string;
  /** Three answers, in the order this round shows them. */
  answers: string[];
  topic: string;
  cat: string;
  difficulty: number;
  opensAt: number;
  closesAt: number;
  /** How many of the crowd (made-up ones too) have answered so far. */
  answered: number;
  /** How many are still in. */
  standing: number;
}

export interface TriviaRevealPub {
  /** Which of the three, as shown, was right. */
  correct: number;
  /** How many of the crowd picked each. */
  counts: number[];
  /** What the hot seat picked (null: nothing in time). */
  hotPick: number | null;
  hotOk: boolean;
  /** Made-up crowd members who went out on this one (indexes into `cast`). */
  outBots: number[];
  /** Real ones who did. */
  outHumans: string[];
  potAdd: number;
  pot: number;
  /** Why it is true, and where to check. */
  fact: string;
  source: string;
  /** The question's text and answers again, for a page that came in late. */
  text: string;
  answers: string[];
}

export interface TriviaPayout {
  id: string;
  name: string;
  /** The role: the hot seat's pot or a crowd member's share. */
  role: 'hot' | 'crowd';
  /** What the player was due. */
  due: number;
  /** What the house paid after the caps. */
  paid: number;
}

export interface TriviaEndPub {
  outcome: TriviaOutcome;
  pot: number;
  payouts: TriviaPayout[];
  /** When the next round's lobby opens. */
  nextAt: number;
}

export interface TriviaRoundPub {
  id: number;
  phase: TriviaPhase;
  startedAt: number;
  /** When this phase is due to end. */
  phaseAt: number;
  hot: { id: string; name: string; emoji: string; real: boolean } | null;
  /** The made-up crowd: name and emoji, in order. */
  cast: [string, string][];
  /** Made-up crowd members who are out. */
  botsOut: number[];
  humans: TriviaHuman[];
  /** Real players who volunteered for the hot seat, first in line first. */
  queue: string[];
  /** Real players who joined after this round started (they are in the next one). */
  waiting: number;
  /** The question being asked, or the last one. -1 in the lobby. */
  i: number;
  total: number;
  pot: number;
  q: TriviaQuestionPub | null;
  reveal: TriviaRevealPub | null;
  end: TriviaEndPub | null;
  /** What Hammy says. */
  line: string;
}

export interface TriviaSnapshot {
  round: TriviaRoundPub | null;
}

/** A player's own state in the game. */
export interface TriviaYou {
  role: 'none' | 'next' | 'crowd' | 'hot';
  volunteer: boolean;
  alive: boolean;
  /** Which answer (as shown) you picked on the question in front of you. */
  picked: number | null;
  /** What you have won today, and what you can win in a day. */
  earned: number;
  cap: number;
  /** Today's pool for the whole arcade is spent. */
  houseDry: boolean;
}

/** Hammy's lines. {hot} is the hot seat's name, {n} a count, {pot} the pot. */
export const TRIVIA_LINES = {
  lobby: [
    'Welcome. The seat is damp. We have decided not to investigate.',
    'The audience has been seated and fed. Mostly fed.',
    'Please take your places. Hammy has already taken yours.',
    'Tonight’s seat was warmed by someone. Hammy won’t say who.',
    'Somebody has to sit in the hot seat. It is a seat. It is hot-ish.',
  ],
  nobody: [
    'Nobody volunteered, so a contestant was found in the vents. Meet {hot}.',
    'The seat stays empty for exactly as long as it takes Hammy to point at {hot}.',
    'No volunteers. {hot} was passing by and now owns this problem.',
  ],
  sits: [
    '{hot} sits down. The seat makes a noise nobody mentions.',
    '{hot} is in the hot seat. Hammy wipes his hands on nothing.',
    'And in the damp seat tonight, {hot}. Applause is optional.',
  ],
  right: [
    '{hot} got it. The seat gurgles approvingly.',
    'Correct. Dr. Moss has stopped writing things down.',
    'Right answer. Hammy looks personally betrayed.',
    'Yes. {hot} knows things. Nobody asked how.',
  ],
  wrong: [
    'Wrong. The seat opens a trapdoor that was not in the budget.',
    '{hot} is out. The pot lands in the crowd’s lap, wet.',
    'Incorrect. Hammy does a little dance. It is not a good dance.',
    'Nope. {hot} will be escorted out by a seagull.',
  ],
  carnage: [
    '{n} people just went down like wet laundry.',
    '{n} gone. The floor is making that noise again.',
    '{n} eliminated. Hammy says the seagull will see them out.',
  ],
  quiet: [
    'Only {n} fell. The crowd is showing off.',
    'The crowd did its homework this time. Suspicious.',
    'Hardly anyone fell. Hammy finds this rude.',
  ],
  decide: [
    'Take the pot of {pot}, or keep sitting in whatever this is?',
    '{pot} coins now, or more dread later. Your call.',
    'The pot is {pot}. The seat is still damp. Choose.',
  ],
  took: [
    '{hot} takes {pot} and runs. The seat dries slightly.',
    '{hot} leaves with {pot}. Wise. Or scared. Same thing.',
  ],
  cleared: [
    '{hot} cleared the whole ladder. Hammy refuses to believe it.',
    'Every question. {hot} is either a genius or has an uncle at the bank.',
  ],
  wiped: [
    'The crowd is gone. All of it. {hot} is alone with the pot and the seat.',
    'Nobody left to beat. {hot} wins by default and a lot of wet footprints.',
  ],
  you_out: [
    'You’re out. Hammy suggests the snack table.',
    'You’re out. The seat is not sorry.',
    'You’re out. It was a hard one. It was not that hard.',
  ],
} as const;

/** The made-up contestants who sit in the hot seat when nobody volunteers. */
export const TRIVIA_CONTESTANTS: readonly (readonly [string, string])[] = [
  ['Gary from the vents', '🧑‍🔧'],
  ['A mannequin named Doug', '🧍'],
  ['Sir Reginald Mold', '🎩'],
  ['Moss Intern #4', '🌿'],
  ['Susan, allegedly', '🕵️'],
  ['Dorkito Dave', '🧀'],
  ['The scientist’s nephew', '🧪'],
  ['Pete, passing by', '🚶'],
  ['Nana Beans', '👵'],
  ['A very damp seagull', '🦅'],
];

const WORDS_A = ['Soggy', 'Gassy', 'Moldy', 'Crusty', 'Sneaky', 'Lumpy', 'Wobbly', 'Greasy', 'Dusty', 'Grumpy', 'Squishy', 'Funky', 'Salty', 'Fuzzy', 'Sticky', 'Mighty', 'Cheesy', 'Damp', 'Rusty', 'Sleepy', 'Cranky', 'Spicy', 'Bouncy', 'Dizzy'];
const WORDS_B = ['Waffle', 'Pickle', 'Noodle', 'Biscuit', 'Walrus', 'Turnip', 'Gnome', 'Mop', 'Pigeon', 'Sock', 'Muffin', 'Badger', 'Ferret', 'Pudding', 'Goblin', 'Sprout', 'Kettle', 'Bagel', 'Toad', 'Crumpet', 'Llama', 'Potato', 'Pancake', 'Nugget'];
const FACES = ['🐸', '🐙', '🦊', '🐼', '🤠', '🥷', '🧙', '🐧', '🦄', '👾', '🐲', '🦖', '🐝', '🦉', '🐷', '🐮', '🐵', '🦆', '🐢', '🦀', '🐨', '🐯', '🦁', '🐰', '🐻', '🥔', '🍕', '🌮', '🍩', '🥦'];

/** A made-up crowd member's name and face, by number: 24 x 24 names, so any 80 of them are all different. */
export function castMember(n: number): [string, string] {
  const a = n % WORDS_A.length;
  const b = Math.floor(n / WORDS_A.length) % WORDS_B.length;
  return [`${WORDS_A[a]} ${WORDS_B[(b + a) % WORDS_B.length]}`, FACES[(n * 7) % FACES.length]];
}
export const TRIVIA_CAST_POOL = WORDS_A.length * WORDS_B.length;
