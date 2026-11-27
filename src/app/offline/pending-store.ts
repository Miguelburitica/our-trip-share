"use client";

import type { PendingExpense, PendingStore } from "./sync";

/** The phone's queue of expenses saved offline (IndexedDB: survives closing the app). */
const DB = "our-share";
const STORE = "pending-expenses";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Tells every pending list on screen to re-read the queue. */
export const PENDING_CHANGED = "our-share:pending-changed";
const changed = () => window.dispatchEvent(new Event(PENDING_CHANGED));

export const pendingStore: PendingStore & { clear(): Promise<void> } = {
  list: () => run("readonly", (s) => s.getAll() as IDBRequest<PendingExpense[]>),
  put: async (item) => {
    await run("readwrite", (s) => s.put(item));
    changed();
  },
  remove: async (id) => {
    await run("readwrite", (s) => s.delete(id));
    changed();
  },
  clear: async () => {
    await run("readwrite", (s) => s.clear());
    changed();
  },
};
