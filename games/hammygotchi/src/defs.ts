// Hammygotchi content: food, fits, the things Hammy says and the numbers that
// decide how fast he falls apart. Plain data, so it can be tuned without
// touching the rules.

export type Need = 'belly' | 'fresh' | 'mood';
export type Cause = Need | 'sushi';

// ---------------------------------------------------------------------------
// Needs, per hour of real time (also while the game is closed)

/** Enough for the first bit of furniture, or most of the way to a PC. */
export const START_COINS = 150;
/** Needs, 0..100, where full is good. */
export const BELLY_PER_HOUR = 7;
export const FRESH_PER_HOUR = 2;
/** Every poop left on the floor makes the unit stink faster. */
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
/** With a gaming PC he streams while you're away too (he never sleeps), on top of that. */
export const STREAM_PER_HOUR = 30;

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
/** Dragging a poop off the floor into the toilet. The coins come when you flush. */
export const SCOOP_FRESH = 2;
/**
 * When a meal is ready to come out he needs to go, and holds it this long.
 * Most of the time he walks to the toilet himself; if he doesn't (or it's
 * full), carry him there in time or it ends up on the floor.
 */
export const URGE_SECONDS = 75;
/** How often he bothers to walk to the toilet by himself. */
export const SELF_TOILET_CHANCE = 0.7;
export const TOILET_FRESH = 1;
/**
 * He never flushes. What's in the bowl stinks until you do, and past
 * BOWL_MAX it's clogged: nothing more goes in and he goes on the floor.
 * Each flush pays for every load in the bowl.
 */
export const BOWL_MAX = 4;
export const BOWL_STINK_PER_HOUR = 1.5;
export const FLUSH_COINS = 3;
export const FLUSH_FRESH = 3;
/** The shower. He's lazy, so he won't go in by himself; soap makes it better. */
export const SHOWER_FRESH = 40;
export const SHOWER_MOOD = -2;
export const SHOWER_COOLDOWN = 90;

// ---------------------------------------------------------------------------
// Trash: he leaves it wherever he finishes with it

export type TrashKind = 'chips' | 'pizza' | 'foil' | 'bones' | 'can' | 'tray' | 'sock' | 'tissue';

export const MAX_TRASH = 14;
/** Every piece lying around makes the unit a little less fresh. */
export const TRASH_STINK_PER_HOUR = 0.25;
/** Tap a piece to throw it down the chute. */
export const TIDY_COINS = 1;
export const TIDY_FRESH = 1;
/** While you’re away he leaves something lying around every 30 to 60 minutes. */
export const LITTER_MIN = 30 * 60;
export const LITTER_RANGE = 30 * 60;
/** What he leaves lying around for no reason. */
export const LITTER: readonly TrashKind[] = ['sock', 'tissue', 'chips', 'can'];

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

export type FoodId = 'dorkitos' | 'pizza' | 'burrito' | 'wings' | 'sushi' | 'glowjuice' | 'salad' | 'rawsteak' | 'steak' | 'burnt';

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
  /** Bag color in the unit. */
  color: string;
  /** What he leaves on the floor when he's done with it. */
  trash: TrashKind;
  /** Made at home (fridge and oven), not on the DoorDosh menu. */
  home?: true;
}

export const FOODS: readonly FoodDef[] = [
  { id: 'dorkitos', name: 'Dorkitos', blurb: 'Free. He has a whole case. The cheese dust gets everywhere.', price: 0, belly: 18, mood: 4, gas: 30, poops: 1, selfOrder: false, trash: 'chips', color: '#ff8a1f' },
  { id: 'pizza', name: 'Large pepperoni', blurb: 'Extra greasy, the way he likes it.', price: 14, belly: 40, mood: 8, gas: 20, poops: 1, selfOrder: true, trash: 'pizza', color: '#e8443a' },
  { id: 'burrito', name: 'Burrito Grande', blurb: 'Double beans. You have been warned.', price: 20, belly: 55, mood: 6, gas: 60, poops: 2, selfOrder: true, trash: 'foil', color: '#d9b46a' },
  { id: 'wings', name: 'Hot wings', blurb: 'He cries, he sweats, he orders more.', price: 18, belly: 30, mood: 12, gas: 35, poops: 1, selfOrder: true, trash: 'bones', color: '#c2410c' },
  { id: 'glowjuice', name: 'Glow Juice', blurb: 'Energy drink. Three cans and he can hear colors.', price: 8, belly: 5, mood: 15, gas: 15, poops: 0, selfOrder: true, trash: 'can', color: '#a6e22e' },
  { id: 'sushi', name: 'Gas station sushi', blurb: 'Cheap. Fills him up. Costs him some health. Why is it warm?', price: 9, belly: 25, mood: -4, gas: 50, poops: 2, health: -15, selfOrder: false, trash: 'tray', color: '#f472b6' },
  { id: 'salad', name: 'Side salad', blurb: 'He will eat it. He will complain the whole time. Freshens him up a little.', price: 6, belly: 15, mood: -10, gas: 0, poops: 1, fresh: 8, selfOrder: false, trash: 'tray', color: '#4ade80' },
  // From the fridge. He won't cook, so you have to.
  { id: 'rawsteak', name: 'Raw steak', blurb: 'He will eat it raw if you let him.', price: 0, belly: 15, mood: -4, gas: 40, poops: 1, health: -8, selfOrder: false, trash: 'bones', color: '#e8566a', home: true },
  { id: 'steak', name: 'Steak', blurb: 'You cooked. He ate.', price: 0, belly: 40, mood: 8, gas: 10, poops: 1, selfOrder: false, trash: 'bones', color: '#8a4a2a', home: true },
  { id: 'burnt', name: 'Burnt steak', blurb: 'Charcoal, mostly.', price: 0, belly: 20, mood: -6, gas: 5, poops: 1, selfOrder: false, trash: 'bones', color: '#2a211c', home: true },
];

/** DoorDosh only delivers what's on the menu. */
export const MENU = FOODS.filter((f) => !f.home);
/** A raw steak from the fridge. Cheaper than delivery, if you cook it. */
export const MEAT_PRICE = 5;
/** Seconds on the stove until a steak is done, and until it's charcoal. */
export const COOK_SECONDS = 6;
export const BURN_SECONDS = 16;

// ---------------------------------------------------------------------------
// The containment unit: furniture he can be dragged onto.

export type SpotId = 'shower' | 'toilet' | 'chair' | 'bed' | 'pc';

/**
 * The unit comes with plumbing: a toilet and a shower. Everything else is
 * bought, and stays when he dies.
 */
export type FurnitureId = 'plant' | 'chair' | 'bed' | 'fridge' | 'oven' | 'pc';

export interface FurnitureDef {
  id: FurnitureId;
  name: string;
  blurb: string;
  price: number;
  icon: string;
}

export const FURNITURE: readonly FurnitureDef[] = [
  { id: 'plant', name: 'Plant', blurb: 'Dr. Moss’s idea. It leans away from him and wilts when he stinks.', price: 25, icon: '🪴' },
  { id: 'chair', name: 'Armchair', blurb: 'Somewhere to sit that isn’t the floor. Never clean again. Lifts his mood.', price: 40, icon: '🛋️' },
  { id: 'bed', name: 'Bed', blurb: 'On the loft. He naps, he drools, he cheers up.', price: 80, icon: '🛏️' },
  { id: 'fridge', name: 'Fridge', blurb: 'Raw steak, 5 coins each. When he’s hungry he raids it himself and eats it raw.', price: 90, icon: '🧊' },
  { id: 'oven', name: 'Oven', blurb: 'Drag a raw steak onto it and it cooks. Leave it too long and it burns.', price: 120, icon: '🍳' },
  { id: 'pc', name: 'Gaming PC', blurb: 'He streams: 3 coins every 10 seconds while he plays, and 30 an hour while you’re away. Leaves cans everywhere.', price: 250, icon: '🖥️' },
];

export const FURNITURE_BY_ID = Object.fromEntries(FURNITURE.map((f) => [f.id, f])) as Record<FurnitureId, FurnitureDef>;

export interface RestDef {
  /** Mood every `every` seconds while he's on it, up to `cap`. */
  mood: number;
  cap: number;
  every: number;
  /** Coins every `coinEvery` seconds (the PC: he streams). */
  coins?: number;
  coinEvery?: number;
}

export const REST: Partial<Record<SpotId, RestDef>> = {
  bed: { mood: 2, cap: 60, every: 6 },
  chair: { mood: 1, cap: 55, every: 4 },
  pc: { mood: 1, cap: 70, every: 6, coins: 3, coinEvery: 10 },
};

// ---------------------------------------------------------------------------
// Home upgrades

export type UpgradeId = 'vacuum' | 'soap';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** What each level is called, and costs. */
  levels: readonly { name: string; blurb: string; price: number }[];
}

export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'vacuum',
    name: 'Robot vacuum',
    levels: [
      { name: 'Robot vacuum', blurb: 'Drives around the ground floor picking up his trash, also while you are away. Won’t touch poop. Nobody would.', price: 150 },
      { name: 'Second robot vacuum', blurb: 'One for the loft too. They do not get along.', price: 400 },
    ],
  },
  {
    id: 'soap',
    name: 'Soap',
    levels: [
      { name: 'Bar soap', blurb: 'Showers clean more.', price: 30 },
      { name: 'Body wash', blurb: 'Showers clean more, and he hates them less.', price: 90 },
      { name: 'Fancy soap', blurb: 'Smells like a candle store. He comes out happy.', price: 220 },
    ],
  },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<UpgradeId, UpgradeDef>;
/** Extra fresh and mood from a shower, by soap level. */
export const SOAP_FRESH = [0, 12, 24, 40] as const;
export const SOAP_MOOD = [0, 2, 5, 8] as const;
/** Away, each robot vacuum picks up one piece of trash this often (they charge in between). */
export const VACUUM_SECONDS = 20 * 60;

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
// Forms: Hammy is an avatar. Most days he's Cube Hammy; some days a hamster,
// a meatball sub or a train. Hats and glasses go on whatever he is.

export type FormId = 'cube' | 'hamster' | 'sub' | 'train';

export interface FormDef {
  id: FormId;
  name: string;
  /** "Today Hammy is …" */
  today: string;
  /** Things only this form says. */
  lines: readonly string[];
  /** What a fart sounds like, small to big. */
  fart: readonly [string, string, string];
  /** How often he's this, compared with the others. */
  weight: number;
}

export const FORMS: readonly FormDef[] = [
  {
    id: 'cube',
    name: 'Cube Hammy',
    today: 'Cube Hammy. As usual.',
    lines: ['I am a cube. Respect it.', 'Corners. All of them.', 'Back to normal. Cube.', "Don't roll me."],
    fart: ['pft', 'pfffrt', 'PFFFRRRT'],
    weight: 3,
  },
  {
    id: 'hamster',
    name: 'Hamster',
    today: 'a hamster. Probably.',
    lines: ['Why am I a hamster?', 'I have whiskers now.', 'Do not put me in a wheel.'],
    fart: ['pft', 'pfffrt', 'PFFFRRRT'],
    weight: 1,
  },
  {
    id: 'sub',
    name: 'Meatball sub',
    today: 'a meatball sub.',
    lines: ["I'm a sandwich today. Don't ask.", 'Extra sauce.', "Don't eat me.", 'Is it hot in here or is that the marinara?', 'Footlong. Thank you.', 'I am leaking sauce.'],
    fart: ['plip', 'splorp', 'SPLORRRT'],
    weight: 1,
  },
  {
    id: 'train',
    name: 'Train',
    today: 'a train.',
    lines: ['Choo choo.', 'All aboard!', 'Next stop: the snack bar.', 'I am a locomotive now.', 'Tickets, please.', "I'm off the rails!"],
    fart: ['toot', 'TOOT TOOT', 'TOOOOOOOT'],
    weight: 1,
  },
];

export const FORM_BY_ID = Object.fromEntries(FORMS.map((f) => [f.id, f])) as Record<FormId, FormDef>;

// ---------------------------------------------------------------------------
// Toys, like the item bar in an old Flash pet game: pick one under the unit
// and use it on him. Nice ones lift his mood. Mean ones pay more coins.

export type ToyId = 'hand' | 'feather' | 'ball' | 'glove' | 'balloon' | 'pie' | 'cushion' | 'magnet' | 'firecracker';

export interface ToyDef {
  id: ToyId;
  name: string;
  /** How to use it. */
  how: string;
  blurb: string;
  price: number;
  /** What a use does to him, at most once every PLAY_COOLDOWN seconds. */
  mood: number;
  coins: number;
  fresh?: number;
  belly?: number;
}

export const TOYS: readonly ToyDef[] = [
  { id: 'hand', name: 'Hand', how: 'Drag him to throw him, tap him to pet him. Drag poop into the toilet, tap the toilet to flush, tap trash to bin it.', blurb: 'Your hand. He loves being thrown. Wash it after.', price: 0, mood: 0, coins: 0 },
  { id: 'feather', name: 'Feather', how: 'Rub it on him.', blurb: 'He is extremely ticklish.', price: 0, mood: 3, coins: 1 },
  { id: 'ball', name: 'Bouncy ball', how: 'Drag and let go to throw one. He kicks them back.', blurb: 'He loves ball. Even when it hits him.', price: 0, mood: 2, coins: 1 },
  { id: 'glove', name: 'Boxing glove', how: 'Tap him.', blurb: 'On a spring, out of the wall. He hates it. Pays well.', price: 30, mood: -5, coins: 3 },
  { id: 'balloon', name: 'Water balloon', how: 'Tap above him.', blurb: 'Cleans him a little. He does not see it that way.', price: 40, mood: -3, coins: 2, fresh: 10 },
  { id: 'pie', name: 'Cream pie', how: 'Tap to throw one at him.', blurb: 'Right in the face. He eats it anyway.', price: 60, mood: -1, coins: 3, belly: 4 },
  { id: 'cushion', name: 'Whoopee cushion', how: 'Tap the floor to put it down, then wait.', blurb: 'The funniest thing ever made, according to him.', price: 80, mood: 4, coins: 2 },
  { id: 'magnet', name: 'Magnet', how: 'Hold anywhere to pull him around.', blurb: 'He has a lot of iron in him, apparently.', price: 120, mood: 1, coins: 1 },
  { id: 'firecracker', name: 'Firecracker', how: 'Tap to light one. Stand back.', blurb: 'The cartoon kind: soot, smoke, no harm done. Mostly.', price: 200, mood: -7, coins: 6 },
];

export const TOY_BY_ID = Object.fromEntries(TOYS.map((t) => [t.id, t])) as Record<ToyId, ToyDef>;
export const START_TOYS: readonly ToyId[] = ['hand', 'feather', 'ball'];
/** Toys only count (mood and coins) every this many seconds. */
export const PLAY_COOLDOWN = 1.5;

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
  shower: ['Do I have to?', 'COLD. COLD.', 'I’m melting!', 'Fine. Five minutes.', 'Smells like soap. Gross.'],
  toilet: ['Privacy, please.', 'Ahhh.', 'Made it.', '*flush*', 'Thank you.'],
  noToilet: ["I don't have to go.", 'Nothing in the chamber.', 'Maybe later.'],
  urge: ['I gotta go!', 'Where’s the toilet? WHERE?', 'Uh oh.', 'It’s coming.', 'Bathroom. Now.'],
  floorPoop: ['Too late.', 'Oops.', 'That’s on you.', 'You were supposed to carry me.'],
  bed: ['zzz', 'Five more minutes.', 'Do not disturb.', '*snore*'],
  chair: ['Ahh. My chair.', 'Peak comfort.', 'I’m not getting up.'],
  pc: ['Chat, I’m back.', 'Gaming.', 'Don’t talk to me, I’m in a match.', 'Thanks for the sub!'],
  raw: ['It’s… cold?', 'Is this cooked?', 'Tastes like fridge.'],
  cooked: ['You cook? Marry me.', 'STEAK.', 'Chef’s kiss.'],
  burnt: ['Crunchy.', 'Is this a rock?', 'Delicious charcoal.'],
  hungry: ['I could eat the fridge.', 'Is anyone ordering food?', 'My stomach is eating itself.', 'I licked the oven.'],
  sad: ['Nobody ever calls me.', 'Do you even like me?', 'I’m fine. Totally fine.', 'Call me maybe?'],
  stinky: ['Smells like victory.', 'What smell?', 'That’s my natural musk.', 'I can’t smell anything.'],
  glitch: ['Uh oh.', 'Physics is broken.', 'Who turned off gravity?', 'This is fine.'],
  tickle: ['HEHEHE', 'STOP. HEHE.', 'Not the armpits!', "I'm not ticklish. HEHEHE"],
  ow: ['OW.', 'Hey!', "I'm telling.", 'Why.', 'Rude.', 'My face!'],
  ball: ['Ball!', 'Goal!', 'Mine!', 'Ow. Ball.', 'Again!'],
  splash: ['I’M WET.', 'Who did that?', 'Was that the scientist?', 'Cold!'],
  pie: ['…', 'Tastes good though.', 'Banana cream?', 'Worth it.'],
  cushion: ['IT WASN’T ME.', 'HAHAHA', 'Classic.', 'Do it again.'],
  magnet: ['I’m flying!', 'Whoa.', 'Put me down. Actually, don’t.'],
  bang: ['My eyebrows!', '…what?', 'I can’t hear anything.', 'Cool.'],
  // His habits. He has a lot of them.
  burp: ['Better out than in.', 'Tastes like nachos. Again.', 'Excuse you.', 'Beautiful.'],
  pick: ['Gold.', 'Found one.', 'Don’t look at me like that.', 'Saving this for later.'],
  sniff: ['Still good.', 'Oof. Still good.', 'Smells like a winner.', 'Two more days.'],
  scratch: ['Ahhh, that’s the spot.', 'Mind your business.', 'Itchy.'],
  avoided: ['Even the robot.', 'Rude.', 'I can see you backing away.', 'It’s called musk.'],
  // Living like a Sim: he does things himself, badly.
  noFlush: ['Not flushing that.', 'Flushing is your job.', 'Someone will get it.', 'I don’t do handles.', 'Leaving that for you.'],
  full: ['It’s full. FLUSH IT.', 'The toilet’s full!', 'Can’t. It’s clogged.'],
  ew: ['Ew, you touched it.', 'Gloves, man.', 'Hey, that’s mine.', 'Wash your hands after.'],
  litter: ['I’ll get that later.', 'Leave it.', 'That lives there now.', 'It’s decor.'],
  tidy: ['I was saving that.', 'Hey, I was using that.', 'Neat freak.'],
  raid: ['Fridge raid.', 'Raw is fine.', 'Who needs an oven.', 'Snack time.'],
  furnish: ['Ooh. Mine.', 'Finally, furniture.', 'Is this IKEA?', 'I deserve this.'],
  bare: ['It’s just a toilet in here.', 'Can I get a chair or something?', 'I live in a box.', 'Nice place. Very… concrete.'],
} as const;

/**
 * Dr. Moss, the scientist who studies Hammy. She watches him on the camera
 * and talks over the intercom: she takes notes, puts on a gas mask when he
 * gets bad and evacuates when it's worse. She does not want him near the
 * intercom.
 */
export const SCIENTIST_NAME = 'Dr. Moss';
export const SCIENTIST_INTRO = 'Dr. Moss, on the intercom. I study him. Keep him clean or I’m leaving.';
/** When you tap her intercom. */
export const SCIENTIST_TAP: readonly string[] = [
  'Dr. Moss, containment. Don’t press that.',
  'I take notes. He gives me a lot to write.',
  'Keep him clean and I stay. That’s the deal.',
  'Yes, I can hear him. All of him.',
  'The camera sees everything. Unfortunately.',
];
/** When he comes up to her intercom. */
export const SCIENTIST_NEAR: readonly string[] = ['Is he breathing on the mic?', 'Back away from the speaker.', 'I can smell him through the intercom.', 'Stop licking the speaker.'];
/** With her gas mask on. */
export const SCIENTIST_MASK: readonly string[] = ['*wheeze* Mask is on.', 'Even through the mask.', 'This mask is not rated for him.', '*muffled gagging*', 'My eyes are watering. Through the camera.'];
/** Evacuating. */
export const SCIENTIST_LEAVES: readonly string[] = ['That’s it. I’m evacuating.', 'I’m out. Good luck in there.', 'Lab is closed. Call me when he’s clean.'];
export const SCIENTIST_LINES: readonly string[] = [
  'Subject is… ripe.',
  'Writing that down.',
  'Day 40. He did it again.',
  'I can taste it through the vents.',
  'Who approved this?',
  'Do not open the hatch.',
  'I need a raise.',
  'He didn’t flush. Again.',
  'Noting: sock count rising.',
];

/** The scientist puts on a gas mask below this, and evacuates below the next. */
export const PINCH_BELOW = 45;
export const LEAVE_BELOW = 18;

// ---------------------------------------------------------------------------
// Texts

/** Things he texts you, by what's going on. */
export const HAMMY_TEXTS = {
  hungry: ['im starving', 'can u doordosh me something', 'theres steak in the fridge. cook it for me', 'how much is a burrito. asking for me', 'FOOD'],
  stinky: ["it smells weird in here. not me tho", 'the scientist said shes putting on a gas mask. rude', 'can u open a window. theres no window', 'the plant is dying and i think its my fault'],
  sad: ['nobody ever calls me', 'u forgot about me didnt u', 'im just gonna lay here', 'hello??', 'u up'],
  poopy: ["there's a situation on the floor", 'dont come in here for a bit', 'the floor is a minefield lol'],
  urge: ['i gotta go. carry me to the toilet', 'BATHROOM. NOW.', 'its coming. help'],
  bowl: ['can u flush. i dont do that', 'the toilet is doing something weird. not my fault', 'u should flush more'],
  messy: ['i made a little mess', 'the robot vacuum gave up', 'theres a sock in here thats not mine. its mine', 'clean ur room is what my mom says too'],
  bare: ['can i get a chair. or a bed. or anything', 'its literally just a toilet in here', 'ur gonna buy me furniture right'],
  any: [
    'u up',
    'what r u doing',
    'the scientist keeps talking to me on the intercom',
    'they slid a pamphlet under the door. it says hygiene',
    'are we there yet',
    'come cook for me',
    'i just did a sick flip off the loft',
    'rate my fit',
    'send coins',
    'who ate my dorkitos. oh wait it was me',
    "i'm thinking about starting a podcast",
    'do fish know they’re wet',
    'if u hear a noise it was the robot vacuum',
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
  { id: 'tank', text: "how's the unit?" },
  { id: 'lol', text: 'lol' },
  { id: 'pic', text: 'send pic' },
  { id: 'proud', text: 'proud of u' },
  { id: 'clean', text: 'clean ur room' },
];

export const CHILL_REPLIES = ['bro chill 💀', 'ur blowing up my phone', 'ok ok i get it', 'one text at a time pls'];

/** When he can't think of anything (no brain to ask, or the signal dropped). */
export const SHRUG_REPLIES = ['lol', 'ya', 'wait what', 'k', 'bro', 'thats crazy', 'idk man', 'hold on im eating'];

/**
 * Who Hammy is, for when he answers you himself: the Phone tab's text box
 * and talking on a call. Claude plays him from this, plus what's going on
 * in the unit right now (see `situation` in game.ts).
 */
export const HAMMY_PERSONA = `You are Hammy, texting or on a call with your friend, the player, who looks after you.

Who you are: a lazy, gross, lovable guy who lives in Unit 7, a two-floor human containment unit in a lab. Most days you're Cube Hammy, a cube with big lips and eyeshadow; some days you wake up as a hamster, a meatball sub or a train, and you just go with it. You eat DoorDosh (mostly Dorkitos, free, you have a whole case), you fart constantly, you never flush, you leave your trash everywhere (Dorkitos bags, pizza boxes, socks, tissues), you hate showers, and you game and stream on your PC when you have one. Dr. Moss, the scientist, watches you on the security camera and talks to you over the intercom; she can't stand your smell. A robot vacuum is scared of you. You talk like a kid in the back seat on a road trip ("are we there yet", "shotgun", "is this still ohio"). You love your friend but you'd never say it straight. You're based on a real guy named War, who's in on the joke.

How you talk: short. One or two lines, under 30 words. Casual, a bit dumb, funny. Gross bathroom humor is fine (farts, poop, stink, not flushing). React to what's actually going on in the unit. Ask for food, attention or coins now and then. Use *asterisks* only for short sounds like *burp* or *pfft*. Never say you're an AI, a character or in a game; you're just Hammy. No slurs, nothing sexual, nothing hateful or cruel. If your friend seems genuinely upset or unsafe, drop the bit for a moment, be kind and tell them to talk to someone they trust.`;

/** How he writes, by where you're talking to him. */
export const TALK_STYLE = {
  text: 'This is a text message: all lowercase, little punctuation, maybe one emoji. Reply with only your text, nothing else.',
  call: 'This is a phone call: spoken words only, no emoji, no lists, like you’re talking. Reply with only what you say out loud.',
} as const;

export const CALL_LINES: readonly string[] = [
  'Yo! What’s up!',
  'So anyway.',
  'Wait, hold on, the scientist is on the intercom again.',
  'Can you hear me? I’m going through a tunnel.',
  '*crunching sounds*',
  'Sorry, I’m eating.',
  'You’re breaking up.',
  'Okay but hear me out.',
  '*fart* …that was the connection.',
  'Hello? Hello? Oh, you’re still there.',
  'I had a dream I was a burrito.',
  'Are you driving? Can I pick the music?',
  'They wrote me up for the toilet thing again.',
  'Anyway, how are YOU?',
  'Hold on, gravity’s doing the thing again.',
];

export const VOICEMAIL = "Hey, it's Hammy. I'm probably eating. Leave a message. Or don't. *beep*";
