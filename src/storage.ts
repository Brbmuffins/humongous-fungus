// Saves. Always kept in local storage; when the game runs as a claude.ai
// artifact it also keeps a private copy per player in the artifact's db, so
// progress follows the player between devices and survives cleared storage.

const KEY = 'rotbloom.save.v1';

export const localSave = {
  load(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  save(raw: string): void {
    try {
      localStorage.setItem(KEY, raw);
    } catch {
      // Storage full or blocked: the cloud copy (if any) still works.
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
  },
};

interface DocSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface DocRef {
  get(): Promise<DocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
}
interface DbNamespace {
  doc(path: string): DocRef;
}
interface UserNamespace {
  id(): Promise<string | null>;
}
interface ClaudeRuntime {
  use(name: 'db'): Promise<DbNamespace | null>;
  use(name: 'user'): Promise<UserNamespace | null>;
}

export class CloudSave {
  private doc: DocRef | null = null;
  private writing = false;
  private queued: string | null = null;

  get ready(): boolean {
    return this.doc !== null;
  }

  async connect(): Promise<boolean> {
    const runtime = (window as unknown as { claude?: Partial<ClaudeRuntime> }).claude;
    if (typeof runtime?.use !== 'function') return false;
    try {
      const [db, user] = await Promise.all([runtime.use('db'), runtime.use('user')]);
      if (!db || !user) return false;
      const id = await user.id();
      if (!id) return false;
      this.doc = db.doc(`data/users/${id}/save`);
      return true;
    } catch {
      this.doc = null;
      return false;
    }
  }

  async load(): Promise<string | null> {
    if (!this.doc) return null;
    try {
      const snap = await this.doc.get();
      const raw = snap.exists ? snap.data()?.save : null;
      return typeof raw === 'string' ? raw : null;
    } catch {
      return null;
    }
  }

  /** One write at a time; a save made during a write replaces the queued one. */
  async save(raw: string): Promise<void> {
    if (!this.doc) return;
    if (this.writing) {
      this.queued = raw;
      return;
    }
    this.writing = true;
    try {
      await this.doc.set({ save: raw, savedAt: Date.now() });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      // These won't succeed on retry: stop trying for this visit.
      if (code === 'invalid_argument' || code === 'revoked' || code === 'not_granted') this.doc = null;
    } finally {
      this.writing = false;
      const next = this.queued;
      this.queued = null;
      if (next) void this.save(next);
    }
  }
}
