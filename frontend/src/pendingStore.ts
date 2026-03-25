/**
 * IndexedDB store for evenings created offline (temporary IDs).
 * When `startEveningFromSchedule` is called without a network connection, a
 * pending record is stored here so the EveningPage can render a skeleton
 * version until the request is replayed and a real server ID is assigned.
 */

const DB_NAME = 'kegelkasse_pending'
const STORE = 'evenings'
const DB_VERSION = 1

export interface PendingEvening {
    tempId: number   // negative timestamp-based ID
    date: string
    venue: string | null
    memberIds: number[]
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE, {keyPath: 'tempId'})
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

export const pendingStore = {
    async save(data: PendingEvening): Promise<void> {
        // Request persistent storage so iOS/Safari doesn't evict pending evenings
        navigator.storage?.persist?.().catch(() => {})
        const db = await openDb()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite')
            tx.objectStore(STORE).put(data)
            tx.oncomplete = () => { db.close(); resolve() }
            tx.onerror = () => { db.close(); reject(tx.error) }
        })
    },

    async get(tempId: number): Promise<PendingEvening | null> {
        const db = await openDb()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly')
            const req = tx.objectStore(STORE).get(tempId)
            req.onsuccess = () => { db.close(); resolve(req.result ?? null) }
            req.onerror = () => { db.close(); reject(req.error) }
        })
    },

    async remove(tempId: number): Promise<void> {
        const db = await openDb()
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite')
            tx.objectStore(STORE).delete(tempId)
            tx.oncomplete = () => { db.close(); resolve() }
            tx.onerror = () => { db.close(); reject(tx.error) }
        })
    },
}
