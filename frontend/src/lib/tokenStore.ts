/** Persists the JWT in a separate IndexedDB so the service worker can read it. */

const DB_NAME = 'kegelkasse_auth'
const STORE = 'tokens'
const KEY = 'jwt'

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

export async function persistTokenForSW(token: string | null): Promise<void> {
    try {
        const db = await openDB()
        const tx = db.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        if (token) store.put(token, KEY)
        else store.delete(KEY)
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
        })
        db.close()
    } catch {
        // Non-critical — SW will fall back to navigating to the URL
    }
}
