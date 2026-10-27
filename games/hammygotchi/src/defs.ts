// Hammygotchi content: food, fits, the things Hammy says and the numbers that
// decide how fast he falls apart. Plain data, so it can be tuned without
// touching the rules.

export type Need = 'belly' | 'fresh' | 'mood';
export type Cause = Need | 'sushi';

// ---------------------------------------------------------------------------
// Needs, per hour of real time (also while the game is closed)

export const START_COINS = 50;
/** Needs, 0..100, where full is good. */
export const BELLY_PER_HOUR = 7;
export const FRESH_PER_HOUR = 2;
/** Every poop left on the floor makes the tank stink faster. */
export const POOP_STINK_PER_HOUR = 2.5;
export const MOOD_PER_HOUR = 5;
/** Unread texts past the first few make him sadder. */
export const FREE_UNREAD = 2;
export const LONELY_PER_UNREAD = 0.4;
export const MAX_LONELY = 3;
/** Health only drops while a need is empty, for each empty need. */
export const HEALTH_DRAIN_PER_HOUR = 5;
export const HEALTH_REGEN_PER_HOUR = 10;
/** Every need at least this full lets health recover. */
export const NEED_OK = 25;
/** He earns pocket change (somehow) while he's in a good mood. */
export const COINS_PER_HOUR = 12;
export const COIN_MOOD = 50;

/** Gaps at least this long get the welcome-back screen. */
export const WELCOME_SECONDS = 60;
/** Shorter gaps count as watching the game live. */
export const LIVE_SECONDS = 5;
/** Away time is simulated in steps this long. */
export const CHUNK_SECONDS = 60;
/** Simulate at most this long away; after that, nothing more changes. */
export const MAX_AWAY_SECONDS = 14 * 24 * 3600;
/** After dying he rots for this long, then only the skeleton is left. */
export const ROT_SECONDS = 42;

// ---------------------------------------------------------------------------
// Gas

/** Farts per second with an empty stomach, plus more per point of gas. */
export const FART_RATE = 1 / 180;
export const FART_RATE_PER_GAS = 1 / 800;
/** Gas one fart lets out. */
export const FART_GAS = 10;
export const FART_STINK = 0.2;
export const FART_STINK_PER_GAS = 0.15;
export const MAX_GAS = 100;

// ---------------------------------------------------------------------------
// Poop and cleaning

export const MAX_POOPS = 8;
/** Seconds from a meal to the poop it becomes. */
export const DIGEST_MIN = 120;
export const DIGEST_RANGE = 180;
export const SCOOP_COINS = 3;
export const SCOOP_FRESH = 4;
export const HOSE_FRESH = 50;
export const HOSE_MOOD = -10;
export const HOSE_COOLDOWN = 5 * 60;
/** Petting and throwing him around: a little mood, every couple of seconds. */
export const PET_MOOD = 2;
export const FLING_MOOD = 3;
export const FUSS_COOLDOWN = 2;

// ---------------------------------------------------------------------------
// Phone

export const MAX_MESSAGES = 60;
/** He texts you every 10 to 30 minutes, day and night. */
export const TEXT_GAP_MIN = 10 * 60;
export const TEXT_GAP_RANGE = 20 * 60;
/** Texts you can send before he tells you to chill; one comes back every few minutes. */
export const MAX_TEXTS = 5;
export const TEXT_REFILL_SECONDS = 3 * 60;
export const TEXT_MOOD = 7;
export const TEXT_COINS = 1;
export const REPLY_DELAY_MIN = 1.5;
export const REPLY_DELAY_RANGE = 2;
/** While you're watching he calls every 6 to 14 minutes. */
export const CALL_GAP_MIN = 6 * 60;
export const CALL_GAP_RANGE = 8 * 60;
/** While you're away he calls every hour or three, and you miss it. */
export const AWAY_CALL_GAP_MIN = 60 * 60;
export const AWAY_CALL_GAP_RANGE = 2 * 60 * 60;
export const MISSED_CALL_MOOD = -3;
export const DECLINE_MOOD = -6;
/** A call is worth this much mood per second, up to a cap. */
export const CALL_MOOD_PER_SECOND = 1.2;
export const CALL_MAX_MOOD = 30;
export const ANSWER_BONUS_MOOD = 5;
/** Calls shorter than this pay no coins. */
export const CALL_MIN_SECONDS = 8;
export const CALL_COINS = 6;
export const ANSWER_COINS = 10;
/** After a call he won't pick up again for a while. */
export const CALL_COOLDOWN = 4 * 60;
/** Ringing stops after this long and counts as a missed call. */
export const RING_SECONDS = 20;

// ---------------------------------------------------------------------------
// DoorDosh

export type FoodId = 'dorkitos' | 'pizza' | 'burrito' | 'wings' | 'sushi' | 'glowjuice' | 'salad';

export interface FoodDef {
  id: FoodId;
  name: string;
  blurb: string;
  price: number;
  belly: number;
  mood: number;
  gas: number;
  /** Poops it turns into. */
  poops: number;
  fresh?: number;
  health?: number;
  /** He orders this himself, on your coins, when he gets hungry. */
  selfOrder: boolean;
  /** Bag color in the tank. */
  color: string;
}

export const FOODS: readonly FoodDef[] = [
  { id: 'dorkitos', name: 'Dorkitos', blurb: 'Free. He has a whole case. The cheese dust gets everywhere.', price: 0, belly: 18, mood: 4, gas: 30, poops: 1, selfOrder: false, color: '#ff8a1f' },
  { id: 'pizza', name: 'Large pepperoni', blurb: 'Extra greasy, the way he likes it.', price: 14, belly: 40, mood: 8, gas: 20, poops: 1, selfOrder: true, color: '#e8443a' },
  { id: 'burrito', name: 'Burrito Grande', blurb: 'Double beans. You have been warned.', price: 20, belly: 55, mood: 6, gas: 60, poops: 2, selfOrder: true, color: '#d9b46a' },
  { id: 'wings', name: 'Hot wings', blurb: 'He cries, he sweats, he orders more.', price: 18, belly: 30, mood: 12, gas: 35, poops: 1, selfOrder: true, color: '#c2410c' },
  { id: 'glowjuice', name: 'Glow Juice', blurb: 'Energy drink. Three cans and he can hear colors.', price: 8, belly: 5, mood: 15, gas: 15, poops: 0, selfOrder: true, color: '#a6e22e' },
  { id: 'sushi', name: 'Gas station sushi', blurb: 'Cheap. Fills him up. Costs him some health. Why is it warm?', price: 9, belly: 25, mood: -4, gas: 50, poops: 2, health: -15, selfOrder: false, color: '#f472b6' },
  { id: 'salad', name: 'Side salad', blurb: 'He will eat it. He will complain the whole time. Freshens him up a little.', price: 6, belly: 15, mood: -10, gas: 0, poops: 1, fresh: 8, selfOrder: false, color: '#4ade80' },
];

export const FOOD_BY_ID = Object.fromEntries(FOODS.map((f) => [f.id, f])) as Record<FoodId, FoodDef>;
/** At most this many orders on the way at once. */
export const MAX_ORDERS = 3;
/** Seconds a delivery takes while you're watching. */
export const ETA_MIN = 7;
export const ETA_RANGE = 9;
/** He orders for himself when his belly drops below this. */
export const SELF_ORDER_BELOW = 20;
/** He tips the driver with your coins too. */
export const SELF_ORDER_TIP = 5;
/** His own orders take a while; the driver gets lost. */
export const SELF_ETA_MIN = 10 * 60;
export const SELF_ETA_RANGE = 15 * 60;

// ---------------------------------------------------------------------------
// Fits

export type FitId = 'classic' | 'roadtrip' | 'gamer' | 'cowboy' | 'shroom' | 'hotdog' | 'astronaut' | 'wizard' | 'golden';

export interface FitDef {
  id: FitId;
  name: string;
  blurb: string;
  price: number;
}

export const FITS: readonly FitDef[] = [
  { id: 'classic', name: 'Classic Hammy', blurb: 'His one shirt. It has never been washed.', price: 0 },
  { id: 'roadtrip', name: 'Road trip', blurb: 'Trucker cap and gas-station shades. Calls shotgun on everything.', price: 40 },
  { id: 'gamer', name: 'Gamer', blurb: 'Headset, hoodie, and a mic that picks up every fart.', price: 90 },
  { id: 'cowboy', name: 'Cowboy', blurb: 'Hat and bandana. The bandana is not for the smell, but it helps.', price: 150 },
  { id: 'shroom', name: 'Shroom hat', blurb: 'A toadstool cap. Gives the mushrooms ideas.', price: 220 },
  { id: 'hotdog', name: 'Hot dog', blurb: 'A full hot dog suit. Mustard included, unfortunately.', price: 320 },
  { id: 'astronaut', name: 'Astronaut', blurb: 'A sealed helmet. The stink stays in. With him.', price: 480 },
  { id: 'wizard', name: 'Wizard', blurb: 'Hat, beard, and one spell: making food disappear.', price: 650 },
  { id: 'golden', name: 'Golden Hammy', blurb: 'Solid gold fur and a crown. Still stinks.', price: 1000 },
];

export const FIT_BY_ID = Object.fromEntries(FITS.map((f) => [f.id, f])) as Record<FitId, FitDef>;

// ---------------------------------------------------------------------------
// Words

/** What each meter says, from full to empty. */
export const NEED_WORDS: Record<Need | 'health', readonly [string, string, string, string, string]> = {
  belly: ['Stuffed', 'Snacky', 'Hungry', 'Starving', 'Empty'],
  fresh: ['Fresh-ish', 'Funky', 'Rancid', 'Toxic', 'Biohazard'],
  mood: ['Vibing', 'Okay', 'Sad', 'Crying', 'Gone'],
  health: ['Fine', 'Meh', 'Sick', 'Dying', 'Dead'],
};

export const CAUSE_TEXT: Record<Cause, string> = {
  belly: 'Starvation. The DoorDosh never came.',
  fresh: 'His own stink. It finally got him.',
  mood: 'Loneliness. You never called.',
  sushi: 'Gas station sushi. Everyone warned him.',
};

/** Things he says out of nowhere, as if he were in the back seat of a car. */
export const ROAD_TRIP: readonly string[] = [
  'Are we there yet?',
  'I gotta pee.',
  'Shotgun!',
  'Can we stop at a gas station?',
  'Who has the aux?',
  'This is my song. Turn it up.',
  "I'm not touching you.",
  'Is that a cow?',
  "Don't make me turn this car around.",
  'Recalculating…',
  'How many more miles?',
  'We should have gone before we left.',
  'I call the window seat.',
  'Wake me up when we get there.',
  'Did anyone grab the snacks?',
  'Windows down. WINDOWS DOWN.',
  'My leg fell asleep.',
  "We're making great time.",
  'Why is the GPS taking us through a cornfield?',
  'Toll booth! Everyone hold your breath.',
  'I spy something… brown.',
  'Rest stop! REST STOP!',
  "Who's paying for gas?",
  "I'm not lost. I'm exploring.",
  'Is this still Ohio?',
  'Beef jerky is a food group.',
  'Five more minutes.',
  'Slug bug. No punch backs.',
  'Can we get a hotel with a pool?',
  'Pull over. Pull over. False alarm.',
];

export const SAYS = {
  fart: ['Wasn’t me.', 'That was the car.', 'Excuse me.', 'Pffft. Nailed it.', 'Smells like adventure.', 'Windows down.', 'Oops.', 'I regret nothing.'],
  fling: ['WEEEEE!', 'AGAIN!', 'Not the face!', "I'm flying!", 'Wheee!'],
  bonk: ['My spine.', 'Ow.', 'I meant to do that.', 'Glass. Right.'],
  pet: ['Hehe.', 'Yeah, right there.', 'Mmm.', 'I’m a good boy.'],
  food: ['FOOD!', 'My DoorDosh!', 'Finally.', 'Mine.'],
  salad: ['Is this… leaves?', 'Who ordered this.', 'Rabbit food. Great.'],
  sushi: ['Why is it warm?', 'Smells fine.', 'Gas station sushi. Classic.'],
  poop: ["Don't look.", 'Oops.', 'That’s for you.', 'Fresh delivery.'],
  hose: ['NOT THE HOSE!', 'I’M MELTING!', 'Cold! Cold! Cold!', 'Betrayal.'],
  hungry: ['I could eat the frog.', 'Is anyone ordering food?', 'My stomach is eating itself.', 'I ate a wood chip.'],
  sad: ['Nobody ever calls me.', 'Do you even like me?', 'I’m fine. Totally fine.', 'Call me maybe?'],
  stinky: ['Smells like victory.', 'What smell?', 'That’s my natural musk.', 'I can’t smell anything.'],
  glitch: ['Uh oh.', 'Physics is broken.', 'Who turned off gravity?', 'This is fine.'],
} as const;

export interface NeighborDef {
  id: 'frog' | 'snail' | 'bug';
  name: string;
  lines: readonly string[];
}

export const NEIGHBORS: readonly NeighborDef[] = [
  { id: 'frog', name: 'The frog', lines: ['Bro.', 'I can taste it.', 'Ribbit. (rude)', 'Every day with this guy.', 'Who let him in here?'] },
  { id: 'snail', name: 'The snail', lines: ["I'm moving out.", "I'd leave faster if I could.", 'My shell is not airtight.', 'Unbelievable.'] },
  { id: 'bug', name: 'The pill bug', lines: ['Rolling up. Bye.', "Don't talk to me.", 'I have one lung and it hates you.', 'Not again.'] },
];

/** Neighbors put clothespins on below this, and leave the tank below the next. */
export const PINCH_BELOW = 45;
export const LEAVE_BELOW = 18;

// ---------------------------------------------------------------------------
// Texts

/** Things he texts you, by what's going on. */
export const HAMMY_TEXTS = {
  hungry: ['im starving', 'can u doordosh me something', 'i ate a wood chip. it was not good', 'how much is a burrito. asking for me', 'FOOD'],
  stinky: ["it smells weird in here. not me tho", 'the frog put a clothespin on his nose. rude', 'can u open a window', 'pretty sure the snail is filing a complaint'],
  sad: ['nobody ever calls me', 'u forgot about me didnt u', 'im just gonna lay here', 'hello??', 'u up'],
  poopy: ["there's a situation on the floor", 'dont come in here for a bit', 'the floor is a minefield lol'],
  any: [
    'u up',
    'what r u doing',
    'the snail wont text me back',
    'i think the pill bug is plotting something',
    'are we there yet',
    'bro look at this rock',
    'i just did a sick flip off the hut',
    'rate my fit',
    'send coins',
    'who ate my dorkitos. oh wait it was me',
    "i'm thinking about starting a podcast",
    'do fish know they’re wet',
    'if u hear a noise it was the frog',
    'gravity was weird again today',
    'i gotta pee',
    'u ever think about how ur a mammal',
    'lol',
  ],
} as const;

export interface TextOption {
  id: string;
  text: string;
}

/** What you can text him. His reply depends on how he's doing. */
export const TEXT_OPTIONS: readonly TextOption[] = [
  { id: 'up', text: 'u up?' },
  { id: 'ate', text: 'did u eat?' },
  { id: 'stink', text: 'u stink' },
  { id: 'love', text: 'love u bro ❤️' },
  { id: 'wyd', text: 'wyd' },
  { id: 'fart', text: 'stop farting' },
  { id: 'there', text: 'are we there yet?' },
  { id: 'tank', text: "how's the tank?" },
  { id: 'lol', text: 'lol' },
  { id: 'pic', text: 'send pic' },
  { id: 'proud', text: 'proud of u' },
  { id: 'clean', text: 'clean ur room' },
];

export const CHILL_REPLIES = ['bro chill 💀', 'ur blowing up my phone', 'ok ok i get it', 'one text at a time pls'];

export const CALL_LINES: readonly string[] = [
  'Yo! What’s up!',
  'So anyway.',
  'Wait, hold on, the frog is staring at me.',
  'Can you hear me? I’m going through a tunnel.',
  '*crunching sounds*',
  'Sorry, I’m eating.',
  'You’re breaking up.',
  'Okay but hear me out.',
  '*fart* …that was the connection.',
  'Hello? Hello? Oh, you’re still there.',
  'I had a dream I was a burrito.',
  'Are you driving? Can I pick the music?',
  'The snail called me a menace.',
  'Anyway, how are YOU?',
  'Hold on, gravity’s doing the thing again.',
];

export const VOICEMAIL = "Hey, it's Hammy. I'm probably eating. Leave a message. Or don't. *beep*";
