/**
 * Notes she makes with no signal. They wait on her phone and are sent, in order, when it comes back.
 * Voice notes keep their recording, and are turned into words later.
 */
export type OutboxItem =
  | { id: string; kind: "note"; at: string; text?: string; blob?: Blob; context?: string; tries?: number }
  | { id: string; kind: "parse"; at: string; captureId: string; text: string; context?: string; tries?: number };

/** What to keep for later; the id and time are added when it is stored. */
export type NewItem =
  | { kind: "note"; text?: string; blob?: Blob; context?: string }
  | { kind: "parse"; captureId: string; text: string; context?: string };

export interface Store {
  all(): Promise<OutboxItem[]>;
  put(item: OutboxItem): Promise<void>;
  del(id: string): Promise<void>;
}

const DB = "spal-outbox";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("items", { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  return new Promise((res, rej) => {
    const r = f(db.transaction("items", mode).objectStore("items"));
    r.onsuccess = () => { res(r.result); db.close(); };
    r.onerror = () => { rej(r.error); db.close(); };
  });
};

/** The real store, in the phone's own database. */
export const phoneStore: Store = {
  all: async () => ((await tx("readonly", (s) => s.getAll())) as OutboxItem[]).sort((a, b) => a.at.localeCompare(b.at)),
  put: async (i) => { await tx("readwrite", (s) => s.put(i)); },
  del: async (id) => { await tx("readwrite", (s) => s.delete(id)); },
};

/** For tests. */
export function memoryStore(): Store {
  const m = new Map<string, OutboxItem>();
  return { all: async () => [...m.values()].sort((a, b) => a.at.localeCompare(b.at)), put: async (i) => { m.set(i.id, i); }, del: async (id) => { m.delete(id); } };
}

export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random());

/** A failure that just means "no signal", as opposed to a real problem with the note. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|offline/i.test(m);
}

/**
 * Send what is waiting, oldest first. `send` returns "done" when an item is finished (even if it could not be
 * understood, because her words are kept safely), or "retry" when there is still no signal. Stops at the first retry
 * so notes always go in the order she said them.
 */
export async function flush(store: Store, send: (i: OutboxItem) => Promise<"done" | "retry">): Promise<{ sent: number; left: number }> {
  let sent = 0;
  for (const item of await store.all()) {
    let r: "done" | "retry" = "retry";
    try { r = await send(item); } catch { r = "retry"; }
    if (r === "retry") break;
    await store.del(item.id);
    sent++;
  }
  return { sent, left: (await store.all()).length };
}
