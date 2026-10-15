/**
 * Small promise wrapper over IndexedDB. Everything the app keeps that can
 * grow (imported audio, play history, shows) lives here rather than in
 * localStorage, which is limited to a few MB.
 */

const DB_NAME = "sonora";
const DB_VERSION = 3;

export type StoreName =
  | "localTracks"
  | "audio"
  | "trackInfo"
  | "plays"
  | "shows"
  | "lyrics"
  | "analysis";

let opening: Promise<IDBDatabase> | null = null;

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function openDb(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(
        new Error(
          "Este navegador não permite guardar dados (IndexedDB indisponível).",
        ),
      );
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("localTracks")) {
        db.createObjectStore("localTracks", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("audio")) {
        // Keyed by track id; values are Blobs.
        db.createObjectStore("audio");
      }
      if (!db.objectStoreNames.contains("trackInfo")) {
        db.createObjectStore("trackInfo", { keyPath: "trackId" });
      }
      if (!db.objectStoreNames.contains("plays")) {
        const plays = db.createObjectStore("plays", { keyPath: "id" });
        plays.createIndex("startedAt", "startedAt");
        plays.createIndex("trackId", "trackId");
      }
      // Version 2: lyrics, keyed by track id.
      if (!db.objectStoreNames.contains("lyrics")) {
        db.createObjectStore("lyrics", { keyPath: "trackId" });
      }
      // Version 3: AI analysis (BPM, key, chords), keyed by track id.
      if (!db.objectStoreNames.contains("analysis")) {
        db.createObjectStore("analysis", { keyPath: "trackId" });
      }
      if (!db.objectStoreNames.contains("shows")) {
        const shows = db.createObjectStore("shows", { keyPath: "id" });
        shows.createIndex("startedAt", "startedAt");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgraded the schema: drop this handle so the next call reopens.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      opening = null;
      reject(
        request.error ?? new Error("Não foi possível abrir o banco de dados."),
      );
    };
    request.onblocked = () => {
      // Resolves on its own once the other tab closes its connection.
    };
  });
  return opening;
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return promisify(
    db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>,
  );
}

export async function get<T>(
  store: StoreName,
  key: IDBValidKey,
): Promise<T | undefined> {
  const db = await openDb();
  return promisify(
    db.transaction(store).objectStore(store).get(key) as IDBRequest<
      T | undefined
    >,
  );
}

export async function put<T>(
  store: StoreName,
  value: T,
  key?: IDBValidKey,
): Promise<void> {
  const db = await openDb();
  await promisify(
    db.transaction(store, "readwrite").objectStore(store).put(value, key),
  );
}

export async function remove(
  store: StoreName,
  key: IDBValidKey,
): Promise<void> {
  const db = await openDb();
  await promisify(
    db.transaction(store, "readwrite").objectStore(store).delete(key),
  );
}

export async function clear(store: StoreName): Promise<void> {
  const db = await openDb();
  await promisify(
    db.transaction(store, "readwrite").objectStore(store).clear(),
  );
}

/** Writes several stores atomically: either every write lands or none does. */
export async function writeAll(
  writes: {
    store: StoreName;
    value?: unknown;
    key?: IDBValidKey;
    delete?: boolean;
  }[],
): Promise<void> {
  const db = await openDb();
  const stores = [...new Set(writes.map((write) => write.store))];
  const tx = db.transaction(stores, "readwrite");
  for (const write of writes) {
    const store = tx.objectStore(write.store);
    if (write.delete) store.delete(write.key!);
    else store.put(write.value, write.key);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () =>
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{
  usage: number;
  quota: number;
} | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate) return null;
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
  } catch {
    return null;
  }
}

/** For tests: forget the cached connection. */
export function resetDbForTests(): void {
  opening = null;
}
