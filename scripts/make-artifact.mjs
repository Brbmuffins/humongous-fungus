// Turns dist/<game>/index.html into dist/<game>/artifact.html: the same game
// without the <html>/<head>/<body> wrapper, for publishing as a claude.ai
// artifact (the host adds its own document skeleton).
// Usage: node scripts/make-artifact.mjs <fungus|sporemonger|hammygotchi>
import { readFileSync, writeFileSync } from 'node:fs';

const game = process.argv[2] ?? 'fungus';
const dir = `dist/${game}`;
const html = readFileSync(`${dir}/index.html`, 'utf8');
const grab = (re) => [...html.matchAll(re)].map((m) => m[0]);

const title = grab(/<title>[\s\S]*?<\/title>/g)[0];
const styles = grab(/<style[^>]*>[\s\S]*?<\/style>/g);
// A minifier can turn a '\uFFFD' escape into the character itself, which the
// artifact host takes for a damaged file: put the escape back (same string).
const scripts = grab(/<script[^>]*>[\s\S]*?<\/script>/g).map((s) => s.replaceAll('\uFFFD', '\\uFFFD'));
const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/) ?? [, ''])[1].replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').trim();

if (!title || !styles.length || !scripts.length || !body) throw new Error(`${dir}/index.html is missing styles, scripts or body`);
writeFileSync(`${dir}/artifact.html`, [title, ...styles, body, ...scripts].join('\n'));
console.log(`${dir}/artifact.html: ${(readFileSync(`${dir}/artifact.html`).length / 1024).toFixed(0)} KB`);
