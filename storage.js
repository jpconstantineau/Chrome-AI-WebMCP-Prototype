import { validateItem, descendants, fail } from './workspace.js';
export const DB_NAME = 'chrome-ai-webmcp-prototype';
export function openDatabase(onClose) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    let rejected = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['preferences', 'history', 'items', 'reviews']) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id', ...(name === 'history' ? { autoIncrement: true } : {}) });
    };
    request.onblocked = () => { rejected = true; reject(new Error('Close other tabs of this app, then retry the database upgrade.')); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (rejected) { request.result.close(); return; }
      const db = request.result;
      db.onversionchange = () => { db.close(); onClose(); };
      resolve(db);
    };
  });
}
export function read(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = key === undefined ? tx.objectStore(storeName).getAll() : tx.objectStore(storeName).get(key);
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Storage read failed.'));
  });
}
export function put(db, name, value, clear = false) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readwrite');
    if (clear) tx.objectStore(name).clear(); else tx.objectStore(name).put(value);
    tx.oncomplete = () => resolve(value);
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Storage write failed.'));
  });
}
export function snapshot(items) { return items.map(item => [item.id, item.updatedAt]).sort(([a], [b]) => a.localeCompare(b)); }
export function mutate(db, action, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(Object.assign(new Error('Action cancelled.'), { code: 'cancelled' })); return; }
    const tx = db.transaction('items', 'readwrite');
    const store = tx.objectStore('items');
    let result, error;
    const abort = () => { try { tx.abort(); } catch { /* Already committed. */ } };
    signal?.addEventListener('abort', abort, { once: true });
    const request = store.getAll();
    request.onsuccess = () => {
      try {
        if (signal?.aborted) fail('Action cancelled.', 'cancelled');
        const items = request.result;
        const previous = action.id ? items.find(item => item.id === action.id) : null;
        if (action.id && !previous) fail('Item no longer exists.', 'stale');
        if (action.expected && previous.updatedAt !== action.expected) fail('Item changed. Reload and review before saving.', 'stale');
        if (action.kind === 'delete') {
          const subtree = descendants(items, action.id);
          if (JSON.stringify(snapshot(subtree)) !== JSON.stringify(action.snapshot)) fail('The deletion targets changed. Review and confirm again.', 'stale');
          for (const item of subtree) store.delete(item.id);
          result = { deletedIds: subtree.map(item => item.id), count: subtree.length };
        } else {
          const value = validateItem(action.patch, items, previous);
          if (action.parentExpected && items.find(item => item.id === value.parentId)?.updatedAt !== action.parentExpected) fail('The destination parent changed. Review the request again.', 'stale');
          const now = new Date(Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) + 1 : 0)).toISOString();
          result = { ...value, id: previous?.id || crypto.randomUUID(), createdAt: previous?.createdAt || now, updatedAt: now };
          store.put(result);
        }
      } catch (caught) { error = caught; tx.abort(); }
    };
    tx.oncomplete = () => { signal?.removeEventListener('abort', abort); resolve(result); };
    tx.onabort = tx.onerror = () => { signal?.removeEventListener('abort', abort); reject(error || Object.assign(new Error(signal?.aborted ? 'Action cancelled.' : 'Storage transaction failed.'), { code: signal?.aborted ? 'cancelled' : 'storage' })); };
  });
}
