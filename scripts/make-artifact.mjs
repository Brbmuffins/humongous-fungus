// Turns dist/index.html into dist/artifact.html: the same game without the
// <html>/<head>/<body> wrapper, for publishing as a claude.ai artifact (the
// host adds its own document skeleton).
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const grab = (re) => [...html.matchAll(re)].map((m) => m[0]);

const title = grab(/<title>[\s\S]*?<\/title>/g)[0] ?? '<title>Rot &amp; Bloom</title>';
const styles = grab(/<style[^>]*>[\s\S]*?<\/style>/g);
const scripts = grab(/<script[^>]*>[\s\S]*?<\/script>/g);
const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/) ?? [, ''])[1].replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').trim();

if (!styles.length || !scripts.length || !body) throw new Error('dist/index.html is missing styles, scripts or body');
writeFileSync('dist/artifact.html', [title, ...styles, body, ...scripts].join('\n'));
console.log(`dist/artifact.html: ${(readFileSync('dist/artifact.html').length / 1024).toFixed(0)} KB`);
