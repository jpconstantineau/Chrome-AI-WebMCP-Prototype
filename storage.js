import { validateItem, descendants, fail, planWorkflow, planReview } from './workspace.js';
export const DB_NAME = 'chrome-ai-webmcp-prototype';
export function openDatabase(onClose, onUpgrade = () => {}) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    let rejected = false;
    request.onupgradeneeded = event => {
      onUpgrade({ oldVersion: event.oldVersion, newVersion: event.newVersion });
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
function reviewTransaction(db, expectedSnapshot, signal, update) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(Object.assign(new Error('Review action cancelled.'), { code: 'cancelled' })); return; }
    const tx = db.transaction('reviews', 'readwrite'), store = tx.objectStore('reviews');
    let result, error;
    const abort = () => { try { tx.abort(); } catch { /* Already committed. */ } };
    signal?.addEventListener('abort', abort, { once: true });
    const request = store.get('weekly');
    request.onsuccess = () => {
      try {
        if (signal?.aborted) fail('Review action cancelled.', 'cancelled');
        const existing = request.result || null;
        if (JSON.stringify(existing) !== expectedSnapshot) fail('Review progress changed. Review and approve the action again.', 'stale');
        const plan = update(existing), next = plan.review;
        if (next && next.index === 11 && !next.completedAt) next.completedAt = new Date().toISOString();
        if (next && JSON.stringify(next) !== JSON.stringify(existing)) store.put(next);
        result = { ...plan.result, review: next };
      } catch (caught) { error = caught; try { tx.abort(); } catch { /* A caller may have already aborted. */ } }
    };
    tx.oncomplete = () => { signal?.removeEventListener('abort', abort); resolve(result); };
    tx.onabort = tx.onerror = () => { signal?.removeEventListener('abort', abort); reject(error || Object.assign(new Error(signal?.aborted ? 'Review action cancelled.' : 'Review storage transaction failed.'), { code: signal?.aborted ? 'cancelled' : 'storage' })); };
  });
}
export function transitionReview(db, action, expectedSnapshot, signal) {
  return reviewTransaction(db, expectedSnapshot, signal, existing => planReview(existing, action));
}
export function writeReview(db, value, expectedSnapshot, signal) {
  return reviewTransaction(db, expectedSnapshot, signal, () => {
    planReview(value, value?.active ? 'resume' : 'pause');
    return { review: value, result: {} };
  }).then(result => result.review);
}
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
        if (action.kind === 'workflow') {
          const plan = planWorkflow(action.name, action.args, items);
          if (plan.snapshot !== action.snapshot) fail('The workflow targets changed. Review the resolved action and approve again.', 'stale');
          const changedItems = [], refs = new Map(), working = [...items];
          for (const change of plan.mutations) {
            if (signal?.aborted) fail('Action cancelled.', 'cancelled');
            const previous = change.kind === 'update' ? working.find(item => item.id === change.id) : null;
            const patch = { ...change.patch, ...(change.parentRef ? { parentId: refs.get(change.parentRef)?.id } : {}) };
            const value = validateItem(patch, working, previous);
            const now = new Date(Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) + 1 : 0)).toISOString();
            const item = { ...value, id: previous?.id || crypto.randomUUID(), createdAt: previous?.createdAt || now, updatedAt: now };
            store.put(item); changedItems.push(item);
            if (change.ref) refs.set(change.ref, item);
            const index = working.findIndex(record => record.id === item.id); if (index < 0) working.push(item); else working[index] = item;
          }
          result = { ...plan.result, changedItems };
          const itemId = refs.get('item')?.id || plan.result.item?.id, listId = refs.get('list')?.id || plan.result.list?.id;
          if (itemId) result.item = working.find(item => item.id === itemId);
          if (listId) result.list = working.find(item => item.id === listId);
          if (plan.itemRefs.length && plan.result.outcome !== 'clarification') result.items = plan.itemRefs.map(reference => working.find(item => item.id === (reference.id || refs.get(reference.ref)?.id)));
        } else if (action.kind === 'delete') {
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
      } catch (caught) { error = caught; try { tx.abort(); } catch { /* A caller may have already aborted this transaction. */ } }
    };
    tx.oncomplete = () => { signal?.removeEventListener('abort', abort); resolve(result); };
    tx.onabort = tx.onerror = () => { signal?.removeEventListener('abort', abort); reject(error || Object.assign(new Error(signal?.aborted ? 'Action cancelled.' : 'Storage transaction failed.'), { code: signal?.aborted ? 'cancelled' : 'storage' })); };
  });
}
