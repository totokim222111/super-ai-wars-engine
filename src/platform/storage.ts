/** Storage knows bytes and atomic replacement only; save formats belong to campaign/saves. */
export interface LocalStore { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem?(key: string): void }
export interface ByteStore { read(key: string): Promise<string | null>; replace(key: string, value: string): Promise<void> }
export const storageKey=(packId:string,kind:string)=>`srpg:${encodeURIComponent(packId)}:${kind}`;

export class LocalBytes implements ByteStore {
  constructor(readonly storage: LocalStore,readonly packId='default') {}
  async read(key: string): Promise<string | null> { return this.storage.getItem(storageKey(this.packId,'slot:') + key); }
  async replace(key: string, value: string): Promise<void> {
    const final = storageKey(this.packId,'slot:') + key, temp = final + ':pending';
    try {
      this.storage.setItem(temp, value);
      // setItem replaces a single value atomically. Never remove the committed key first.
      this.storage.setItem(final, value);
    } finally { try { this.storage.removeItem?.(temp); } catch { /* A pending value is never read. */ } }
  }
}

export class IndexedBytes implements ByteStore {
  private database?: Promise<IDBDatabase>;
  constructor(private readonly factory: IDBFactory,private readonly packId='default') {}
  private open(): Promise<IDBDatabase> {
    return this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(storageKey(this.packId,'saves'), 1);
      let expired = false;
      const timer = setTimeout(() => { expired = true; reject(new Error('IndexedDB open timeout')); }, 2500);
      request.onupgradeneeded = () => { request.result.createObjectStore('slots'); };
      request.onerror = () => { clearTimeout(timer); reject(request.error); };
      request.onsuccess = () => {
        clearTimeout(timer);
        if (expired) { request.result.close(); return; }
        request.result.onversionchange = () => { request.result.close(); this.database = undefined; };
        resolve(request.result);
      };
    }).catch(error => { this.database = undefined; throw error; });
  }
  async read(key: string): Promise<string | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('slots', 'readonly'), request = tx.objectStore('slots').get(key);
      tx.oncomplete = () => resolve(request.result ?? null);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read failed'));
    });
  }
  async replace(key: string, value: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('slots', 'readwrite'), store = tx.objectStore('slots');
      store.put(value, key + ':pending'); store.put(value, key); store.delete(key + ':pending');
      // Request success is insufficient: quota errors may still abort the transaction.
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    });
  }
}

interface RecordBytes { revision: number; value: string }
function record(raw: string | null): RecordBytes | null {
  if (raw === null) return null;
  try { const v = JSON.parse(raw); if (Number.isSafeInteger(v.revision) && typeof v.value === 'string') return v; } catch { /* Preserve malformed slots for the format layer. */ }
  return { revision: 0, value: raw };
}
export class AtomicStorage implements ByteStore {
  backend = 'localStorage';
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly primary: ByteStore | null, private readonly fallback: ByteStore) {}
  private async latest(key: string): Promise<RecordBytes | null> {
    const values = await Promise.allSettled([this.primary?.read(key) ?? Promise.resolve(null), this.fallback.read(key)]);
    const candidates = values.flatMap(v => v.status === 'fulfilled' ? [record(v.value)].filter((r): r is RecordBytes => !!r) : []);
    if (!candidates.length && values.every(v => v.status === 'rejected')) throw new Error('저장소를 사용할 수 없습니다');
    return candidates.sort((a, b) => b.revision - a.revision)[0] ?? null;
  }
  async read(key: string): Promise<string | null> { await this.queue; return (await this.latest(key))?.value ?? null; }
  replace(key: string, value: string): Promise<void> {
    const operation = this.queue.then(async () => {
      const previous = await this.latest(key);
      const bytes = JSON.stringify({ revision: Math.max(Date.now() * 1000, (previous?.revision ?? 0) + 1), value });
      if (this.primary) {
        try { await this.primary.replace(key, bytes); this.backend = 'IndexedDB'; return; } catch { /* Fall back without removing the previous record. */ }
      }
      await this.fallback.replace(key, bytes); this.backend = 'localStorage';
    });
    this.queue = operation.catch(() => {}); return operation;
  }
}
export function browserStorage(packId='default'): AtomicStorage {
  let primary: ByteStore | null = null;
  try { if (typeof indexedDB !== 'undefined') primary = new IndexedBytes(indexedDB,packId); } catch { /* Private mode. */ }
  const local: LocalStore = { getItem: k => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v), removeItem: k => localStorage.removeItem(k) };
  return new AtomicStorage(primary, new LocalBytes(local,packId));
}
