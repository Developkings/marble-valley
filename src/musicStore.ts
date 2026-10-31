// The player's own music, kept on this device. A song is far too big for localStorage.
const DB_NAME = 'marble-music';
const STORE = 'tracks';
const OWN_TRACK = 'own';

export interface OwnMusic {
  name: string;
  file: Blob;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, use: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = use(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadOwnMusic(): Promise<OwnMusic | null> {
  try {
    return (await withStore<OwnMusic | undefined>('readonly', (s) => s.get(OWN_TRACK))) ?? null;
  } catch {
    return null;
  }
}

export async function saveOwnMusic(music: OwnMusic): Promise<boolean> {
  try {
    await withStore('readwrite', (s) => s.put(music, OWN_TRACK));
    return true;
  } catch {
    return false; // storage full or blocked; the song still plays until the app closes
  }
}

export async function clearOwnMusic(): Promise<void> {
  try {
    await withStore('readwrite', (s) => s.delete(OWN_TRACK));
  } catch {
    // Nothing saved to clear.
  }
}
