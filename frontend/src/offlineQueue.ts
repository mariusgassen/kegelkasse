/**
 * IndexedDB-based queue for offline mutations.
 * Only append-safe operations (add/delete penalty, add/delete drink) are queued.
 * On reconnect, the queue is flushed by replaying each request in timestamp order.
 */

const DB_NAME = 'kegelkasse_offline'
const STORE = 'queue'
const DB_VERSION = 1

export interface QueuedRequest {
    id?: number
    method: string
    path: string
    body: unknown
    timestamp: number
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE, {keyPath: 'id', autoIncrement: true})
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

export const offlineQueue = {
    async enqueue(method: string, path: string, body: unknown): Promise<void> {
        const db = await openDb()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite')
            tx.objectStore(STORE).add({method, path, body, timestamp: Date.now()})
            tx.oncomplete = () => { db.close(); resolve() }
            tx.onerror = () => { db.close(); reject(tx.error) }
        })
    },

    async getAll(): Promise<QueuedRequest[]> {
        const db = await openDb()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly')
            const req = tx.objectStore(STORE).getAll()
            req.onsuccess = () => { db.close(); resolve(req.result as QueuedRequest[]) }
            req.onerror = () => { db.close(); reject(req.error) }
        })
    },

    async remove(id: number): Promise<void> {
        const db = await openDb()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite')
            tx.objectStore(STORE).delete(id)
            tx.oncomplete = () => { db.close(); resolve() }
            tx.onerror = () => { db.close(); reject(tx.error) }
        })
    },

    async count(): Promise<number> {
        const db = await openDb()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly')
            const req = tx.objectStore(STORE).count()
            req.onsuccess = () => { db.close(); resolve(req.result) }
            req.onerror = () => { db.close(); reject(req.error) }
        })
    },

    async clear(): Promise<void> {
        const db = await openDb()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite')
            tx.objectStore(STORE).clear()
            tx.oncomplete = () => { db.close(); resolve() }
            tx.onerror = () => { db.close(); reject(tx.error) }
        })
    },
}

/** Paths that are safe to queue offline (append-only, no return value needed by callers). */
export function isQueuableMutation(method: string, path: string): boolean {
    if (method === 'GET') return false
    return (
        /^\/evening\/\d+\/penalties$/.test(path) ||           // POST add_penalty
        /^\/evening\/\d+\/penalties\/\d+$/.test(path) ||      // DELETE delete_penalty
        /^\/evening\/\d+\/drinks$/.test(path) ||              // POST add_drink_round
        /^\/evening\/\d+\/drinks\/\d+$/.test(path)            // DELETE delete_drink_round
    )
}

/** Custom event dispatched after the queue is flushed so pages can refresh. */
export const SYNC_FLUSHED_EVENT = 'kegelkasse:sync-flushed'
