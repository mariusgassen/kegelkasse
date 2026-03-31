/**
 * Tests for pendingStore — IndexedDB store for offline-created evenings.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { pendingStore } from '../pendingStore'

const SAMPLE: import('../pendingStore').PendingEvening = {
    tempId: -1001,
    date: '2025-03-15',
    venue: 'TestKneipe',
    memberIds: [1, 2, 3],
}

beforeEach(async () => {
    // Clean up between tests
    indexedDB.deleteDatabase('kegelkasse_pending')
})

describe('pendingStore.save / get', () => {
    it('saves and retrieves a pending evening', async () => {
        await pendingStore.save(SAMPLE)
        const result = await pendingStore.get(-1001)
        expect(result).toEqual(SAMPLE)
    })

    it('returns null when tempId not found', async () => {
        const result = await pendingStore.get(-9999)
        expect(result).toBeNull()
    })

    it('overwrites existing record with same tempId', async () => {
        await pendingStore.save(SAMPLE)
        const updated = { ...SAMPLE, venue: 'NeuKneipe' }
        await pendingStore.save(updated)
        const result = await pendingStore.get(-1001)
        expect(result?.venue).toBe('NeuKneipe')
    })

    it('handles null venue', async () => {
        const withNullVenue = { ...SAMPLE, venue: null }
        await pendingStore.save(withNullVenue as any)
        const result = await pendingStore.get(-1001)
        expect(result?.venue).toBeNull()
    })
})

describe('pendingStore.remove', () => {
    it('removes a pending evening', async () => {
        await pendingStore.save(SAMPLE)
        await pendingStore.remove(-1001)
        const result = await pendingStore.get(-1001)
        expect(result).toBeNull()
    })

    it('does not throw when removing non-existent tempId', async () => {
        await expect(pendingStore.remove(-9999)).resolves.toBeUndefined()
    })
})
