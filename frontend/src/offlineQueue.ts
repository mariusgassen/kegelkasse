/**
 * IndexedDB-based queue for offline mutations.
 * All evening-session write operations (penalties, drinks, games, players, highlights, …)
 * plus a handful of lightweight user-preference updates are queued when the device is offline.
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
    /**
     * If this request creates a new resource, `tempId` is the negative
     * placeholder ID that was returned to the UI while offline.  The flush
     * logic replaces every occurrence of this value (in subsequent paths and
     * bodies) with the real server-assigned ID once the request is replayed.
     */
    tempId?: number
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
    async enqueue(method: string, path: string, body: unknown, tempId?: number): Promise<void> {
        // Request persistent storage on first enqueue so iOS/Safari doesn't evict the queue
        navigator.storage?.persist?.().catch(() => {})
        const db = await openDb()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite')
            const record: Omit<QueuedRequest, 'id'> = {method, path, body, timestamp: Date.now()}
            if (tempId !== undefined) record.tempId = tempId
            tx.objectStore(STORE).add(record)
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

/**
 * Returns true if this mutation can be safely queued offline and replayed later.
 *
 * Covered:
 *  - Starting an evening from a schedule (temp ID assigned, replayed first on flush)
 *  - Creating a guest RegularMember (temp ID, body-replaced on flush)
 *  - Adding a guest to a scheduled evening
 *  - All sub-resources of an active evening (penalties, drinks, games, players,
 *    highlights, teams, throws, active-player)
 *  - Schedule RSVP (add / remove)
 *  - Light user-preference updates
 *
 * Auth, financial, reporting, and superadmin endpoints are excluded because
 * they need real response values or must not be replayed blindly.
 */
export function isQueuableMutation(method: string, path: string): boolean {
    if (method === 'GET') return false
    return (
        // Create an ad-hoc evening (creates temp evening ID)
        (method === 'POST' && /^\/evening$/.test(path)) ||
        // Start a scheduled evening (creates temp evening ID)
        /^\/schedule\/\d+\/start$/.test(path) ||
        // Create a guest member (creates temp member ID)
        /^\/club\/regular-members$/.test(path) ||
        // Add / remove guests from a scheduled evening
        /^\/schedule\/\d+\/guests/.test(path) ||
        // All sub-resources of an active evening (positive or negative/temp ID)
        /^\/evening\/-?\d+\//.test(path) ||
        // PATCH on the evening itself (venue, note, …)
        /^\/evening\/-?\d+$/.test(path) ||
        // Schedule RSVP (add / remove)
        /^\/schedule\/\d+\/rsvp/.test(path) ||
        // Mark push notifications read
        /^\/push\/notifications\/read$/.test(path) ||
        // Light user preferences
        /^\/auth\/locale$/.test(path) ||
        /^\/push\/preferences$/.test(path)
    )
}

/** Custom event dispatched after the queue is flushed so pages can refresh. */
export const SYNC_FLUSHED_EVENT = 'kegelkasse:sync-flushed'
