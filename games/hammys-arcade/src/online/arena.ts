// The online arcade as one thing: the connection, who you are, your wallet
// and the four games' shared rounds. Built at start-up if the server answers.
import { Api, keepSaved, loadSaved } from './api';
import { CrossingMirror, MinesMirror, PlinkoMirror, RocketMirror } from './mirrors';
import { Sky } from './sky';
import { OnlineWallet } from './wallet';

export class Arena {
  readonly api = new Api();
  readonly sky = new Sky();
  readonly wallet = new OnlineWallet(this.api);
  readonly rocket = new RocketMirror(this.sky, this.api, this.wallet);
  readonly crossing = new CrossingMirror(this.sky, this.api, this.wallet);
  readonly mines = new MinesMirror(this.sky, this.api, this.wallet);
  readonly plinko = new PlinkoMirror(this.sky, this.api, this.wallet);

  /** Whether this device has been here before (so the name box can be skipped). */
  get known(): boolean {
    return loadSaved() !== null;
  }

  /**
   * Come in: with the secret this device kept, or as a new player under `name`.
   * Ok, or why not (including 'unknown' when the server doesn't know the saved secret).
   */
  async hello(name?: string): Promise<{ ok: true } | { ok: false; error: string; message: string }> {
    const saved = loadSaved();
    const body = name !== undefined ? { name } : saved ? { secret: saved.secret } : {};
    this.api.secret = '';
    const r = await this.api.post('hello', name === undefined ? body : { name });
    if (!r.ok || !r.me) return { ok: false, error: r.ok ? 'bad' : r.error, message: r.ok ? 'The arcade did not answer properly.' : r.message };
    const secret = typeof r.secret === 'string' ? r.secret : saved?.secret;
    if (!secret) return { ok: false, error: 'bad', message: 'The arcade did not answer properly.' };
    this.api.secret = secret;
    keepSaved({ secret, name: r.me.name });
    this.wallet.applyMe(r.me);
    return { ok: true };
  }

  /** Come back with the same wallet after the stream drops and returns. */
  watchReconnects(): void {
    let was = true;
    this.sky.on('status', (d: { up: boolean }) => {
      if (d.up && !was) this.wallet.refresh();
      was = d.up;
    });
  }
}
