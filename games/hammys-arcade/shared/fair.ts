// Provably fair randomness for Hammy's Arcade, shared by the server and the
// page (so the page can check what the server says).
//
// Every round (or, for Poop Plinko, every "epoch" of drops) has a secret seed:
// 32 random bytes as 64 hex characters. Before anything is bet the server
// publishes its commitment, commit(seed) = SHA-256 of the seed's bytes. After
// the round it publishes the seed, and anyone can check commit(seed) matches
// and re-derive every roll the round used. Each roll is
//
//   rollAt(seed, label, i) = first 48 bits of SHA-256("label:i:seed") / 2^48
//
// a uniform number in [0, 1). The labels name what the roll is for ("crash",
// "lane", "mines:8:10", "plinko:17"), so one seed gives independent rolls for
// everything in the round. The commitment is a hash of the seed alone and the
// rolls are hashes of label + seed, so the commitment can't be used to work out
// a roll in advance.
//
// The SHA-256 here is written out (not node:crypto or crypto.subtle) so the
// very same code runs, synchronously, in Node and in every browser, including
// on a page that isn't served over https.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** SHA-256 of some bytes. */
export function sha256(data: Uint8Array): Uint8Array {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const padded = new Uint8Array((((data.length + 9 + 63) >> 6) << 6));
  padded.set(data);
  padded[data.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(data.length / 0x20000000), false);
  dv.setUint32(padded.length - 4, (data.length << 3) >>> 0, false);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, h[i], false);
  return out;
}

export const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/** A seed, 64 hex characters, as the server makes them. */
export const isSeed = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

/** What the server publishes before the round: the hash of the seed's bytes. */
export const commit = (seed: string): string => toHex(sha256(fromHex(seed)));

/** Does this seed match what was published before the round? */
export const verifySeed = (seed: string, hash: string): boolean => isSeed(seed) && commit(seed) === hash;

/** A uniform roll in [0, 1) for one purpose in one round. */
export function rollAt(seed: string, label: string, i = 0): number {
  const d = sha256(utf8(`${label}:${i}:${seed}`));
  return ((d[0] << 8) | d[1]) * 2 ** 32 / 2 ** 48 + (((d[2] << 24) | (d[3] << 16) | (d[4] << 8) | d[5]) >>> 0) / 2 ** 48;
}

/** A run of rolls for one purpose, one after the other (a shuffle, the made-up riders). */
export function stream(seed: string, label: string): () => number {
  let i = 0;
  return () => rollAt(seed, label, i++);
}

/** Three-word hex preview for showing a hash or seed on a small screen. */
export const shortHash = (s: string): string => (s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s);
