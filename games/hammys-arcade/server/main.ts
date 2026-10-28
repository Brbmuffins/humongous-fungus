// Hammy's Arcade server: `PORT=8731 DATA_DIR=/var/lib/hammys-arcade node server.mjs`.
// Config comes from the environment:
//   PORT       required (0 picks a free one)
//   HOST       default 127.0.0.1
//   DATA_DIR   where the wallet file goes (default ./data)
//   TRIVIA_TIME_SCALE optional, tests only: run The Damp Seat this many times faster
//   STATIC_DIR optional: serve its index.html at / (local testing only)
import { App } from './app';

const port = process.env.PORT;
if (port === undefined || !/^\d+$/.test(port) || Number(port) > 65535) {
  console.error('hammys-arcade: set PORT (0-65535), for example PORT=8731');
  process.exit(2);
}

const app = new App({
  port: Number(port),
  host: process.env.HOST || '127.0.0.1',
  dataDir: process.env.DATA_DIR || './data',
  staticDir: process.env.STATIC_DIR || null,
  // Test-only: run The Damp Seat faster than real time.
  triviaTimeScale: Number(process.env.TRIVIA_TIME_SCALE) || undefined,
});

const at = await app.listen();
console.log(JSON.stringify({ msg: 'listening', host: at.host, port: at.port, url: `http://${at.host}:${at.port}/arcade/api/health` }));

let stopping = false;
const stop = (signal: string): void => {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ msg: 'stopping', signal }));
  // Hang up, give back what's riding, save; but never hang around.
  setTimeout(() => process.exit(1), 5000).unref();
  app.close().then(
    () => process.exit(0),
    (e: unknown) => {
      console.error(e);
      process.exit(1);
    },
  );
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
