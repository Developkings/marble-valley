// The player's own music, one song per theme, kept on this device. A song is far too big for localStorage.
const DB_NAME = 'marble-music';
const STORE = 'tracks';

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

export async function loadOwnMusic(themeId: string): Promise<OwnMusic | null> {
  try {
    return (await withStore<OwnMusic | undefined>('readonly', (s) => s.get(themeId))) ?? null;
  } catch {
    return null;
  }
}

export async function saveOwnMusic(themeId: string, music: OwnMusic): Promise<boolean> {
  try {
    await withStore('readwrite', (s) => s.put(music, themeId));
    return true;
  } catch {
    return false; // storage full or blocked; the song still plays until the app closes
  }
}

export async function clearOwnMusic(themeId: string): Promise<void> {
  try {
    await withStore('readwrite', (s) => s.delete(themeId));
  } catch {
    // Nothing saved to clear.
  }
}
