// ---- Persisting the whole editor across page refreshes ----
// Everything the person edits (uploaded photos, positions, text, colors,
// fonts, nudges, template/composition/background choice, visibility) gets
// saved here and restored the next time the page loads — so refreshing the
// browser (or closing the tab and coming back) picks up exactly where they
// left off.
//
// Uses IndexedDB rather than localStorage because uploaded photos are
// stored as real File objects (IndexedDB can store Blob/File data
// natively via the structured clone algorithm), which avoids both
// localStorage's ~5-10MB quota (a handful of photos blows past that
// instantly) and the CPU cost of base64-encoding every photo on every
// save. Blob/File values survive being written to and read back from
// IndexedDB across page loads; a fresh blob: object URL just needs to be
// re-created for each restored File, since blob URLs themselves don't
// survive a reload.
const DB_NAME = 'rizzFitsShowcase';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'current';

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSnapshot(snapshot) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    // Saving progress is a nice-to-have — never let it break editing.
    console.warn('Could not save showcase progress', error);
  }
}

export async function loadSnapshot() {
  try {
    const db = await openDB();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch (error) {
    console.warn('Could not load saved showcase progress', error);
    return null;
  }
}

export async function clearSnapshot() {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(SNAPSHOT_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    // Nothing to clean up if this fails — a stale snapshot just gets
    // overwritten by the next successful save anyway.
  }
}

// Debounced save — lets many rapid changes (typing, dragging a color
// slider) collapse into a single write instead of hammering IndexedDB on
// every keystroke.
let saveTimer = null;
export function scheduleSave(buildSnapshot, delay = 500) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveSnapshot(buildSnapshot());
  }, delay);
}

// Saves right away (no debounce) — used when the page is about to be
// hidden/closed, so nothing typed or dragged in the last moment is lost.
export function saveNow(buildSnapshot) {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  saveSnapshot(buildSnapshot());
}
