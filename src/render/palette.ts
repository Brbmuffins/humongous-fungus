// Canvas colors per biome. The page UI keeps one fixed dark look; the jar's
// contents change color with each new biome.

export interface Palette {
  room: [string, string];
  lamp: string;
  shelf: string;
  shelfEdge: string;
  air: [string, string];
  soil: [string, string];
  speck: [string, string];
  pebble: [string, string, string];
  charcoal: string;
  litter: string[];
  moss: [string, string, string];
  fern: [string, string];
  cap: string;
  capDark: string;
  capRim: string;
  stem: string;
  glow: string;
  myc: string;
  pulse: string;
  wood: string;
  woodDark: string;
  woodHi: string;
  fog: string;
}

const forest: Palette = {
  room: ['#211a14', '#120d0a'],
  lamp: 'rgba(233,179,95,0.18)',
  shelf: '#2b2018',
  shelfEdge: '#57422f',
  air: ['#2f4130', '#1a2418'],
  soil: ['#3d2c1e', '#22180f'],
  speck: ['#5c442d', '#160f09'],
  pebble: ['#3f3e3b', '#64615b', '#8f8b82'],
  charcoal: '#14110f',
  litter: ['#7a4e2a', '#9a6a35', '#5e3b20', '#b0823f'],
  moss: ['#2a5226', '#468536', '#8bbd5c'],
  fern: ['#2b6332', '#58a04b'],
  cap: '#b48452',
  capDark: '#6b4529',
  capRim: '#e2c49b',
  stem: '#e8dfcc',
  glow: 'rgba(172,255,140,0.75)',
  myc: 'rgba(240,232,216,0.8)',
  pulse: '#f4c66c',
  wood: '#5d4532',
  woodDark: '#3a2a1c',
  woodHi: '#86684b',
  fog: 'rgba(230,240,232,0.09)',
};

const cloud: Palette = {
  ...forest,
  room: ['#161c22', '#0b0f13'],
  lamp: 'rgba(170,205,235,0.15)',
  shelf: '#22272b',
  shelfEdge: '#47525a',
  air: ['#2b3f45', '#16232a'],
  soil: ['#30261f', '#1b1511'],
  moss: ['#1c5446', '#2f7f69', '#82c8a9'],
  fern: ['#22604c', '#4f9c7d'],
  // Blue bonnets, after Mycena interrupta.
  cap: '#5f8fd6',
  capDark: '#2c4c86',
  capRim: '#b3cdf3',
  glow: 'rgba(140,220,255,0.75)',
  pulse: '#a8e1ff',
  fog: 'rgba(225,238,245,0.14)',
};

const bog: Palette = {
  ...forest,
  room: ['#1f1514', '#110b0b'],
  lamp: 'rgba(225,140,90,0.16)',
  air: ['#36332a', '#201d16'],
  soil: ['#40221a', '#21120d'],
  speck: ['#5d3426', '#140a07'],
  // Sphagnum turns red and ochre.
  moss: ['#6a2b27', '#a6473a', '#dd915c'],
  fern: ['#5b6a2d', '#90a24b'],
  cap: '#df8f3c',
  capDark: '#8a4a1a',
  capRim: '#f6c58c',
  pulse: '#ffb36a',
};

const cave: Palette = {
  ...forest,
  room: ['#141617', '#0a0b0c'],
  lamp: 'rgba(150,225,212,0.13)',
  shelf: '#232524',
  shelfEdge: '#4b4f4c',
  air: ['#273030', '#151b1b'],
  soil: ['#4c4943', '#2b2925'],
  speck: ['#6b675f', '#1d1c19'],
  pebble: ['#5b5a55', '#85827a', '#b3afa4'],
  moss: ['#56653a', '#869650', '#c7d38a'],
  fern: ['#3c5c44', '#6b916f'],
  cap: '#eae4d6',
  capDark: '#a99f8b',
  capRim: '#ffffff',
  glow: 'rgba(150,255,225,0.8)',
  pulse: '#9fffe0',
};

export const PALETTES: readonly Palette[] = [forest, cloud, bog, cave];

export function paletteFor(jarIndex: number): Palette {
  return PALETTES[jarIndex % PALETTES.length];
}
