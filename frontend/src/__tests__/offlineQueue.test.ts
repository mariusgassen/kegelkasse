import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Use fake-indexeddb so the queue runs in jsdom without a real browser
import 'fake-indexeddb/auto'
import { offlineQueue, isQueuableMutation, SYNC_FLUSHED_EVENT } from '../offlineQueue'

// Reset the in-memory IDB between tests
beforeEach(async () => {
    await offlineQueue.clear()
})

describe('offlineQueue.enqueue / getAll', () => {
    it('enqueues a request and retrieves it', async () => {
        await offlineQueue.enqueue('POST', '/evening/1/penalties', { amount: 1 })
        const items = await offlineQueue.getAll()
        expect(items).toHaveLength(1)
        expect(items[0].method).toBe('POST')
        expect(items[0].path).toBe('/evening/1/penalties')
        expect(items[0].body).toEqual({ amount: 1 })
        expect(typeof items[0].timestamp).toBe('number')
    })

    it('enqueues with optional tempId', async () => {
        await offlineQueue.enqueue('POST', '/schedule/5/start', {}, -12345)
        const items = await offlineQueue.getAll()
        expect(items[0].tempId).toBe(-12345)
    })

    it('preserves insertion order', async () => {
        await offlineQueue.enqueue('POST', '/evening/1/penalties', { a: 1 })
        await offlineQueue.enqueue('POST', '/evening/1/drinks', { b: 2 })
        const items = await offlineQueue.getAll()
        expect(items[0].path).toBe('/evening/1/penalties')
        expect(items[1].path).toBe('/evening/1/drinks')
    })
})

describe('offlineQueue.count', () => {
    it('returns 0 for empty queue', async () => {
        expect(await offlineQueue.count()).toBe(0)
    })

    it('increments on enqueue', async () => {
        await offlineQueue.enqueue('POST', '/evening/1/games', {})
        await offlineQueue.enqueue('POST', '/evening/1/drinks', {})
        expect(await offlineQueue.count()).toBe(2)
    })
})

describe('offlineQueue.remove', () => {
    it('removes a specific item by id', async () => {
        await offlineQueue.enqueue('POST', '/evening/1/penalties', {})
        await offlineQueue.enqueue('POST', '/evening/1/drinks', {})
        const items = await offlineQueue.getAll()
        await offlineQueue.remove(items[0].id!)
        const remaining = await offlineQueue.getAll()
        expect(remaining).toHaveLength(1)
        expect(remaining[0].path).toBe('/evening/1/drinks')
    })
})

describe('offlineQueue.clear', () => {
    it('removes all items', async () => {
        await offlineQueue.enqueue('POST', '/evening/1/penalties', {})
        await offlineQueue.enqueue('POST', '/evening/1/drinks', {})
        await offlineQueue.clear()
        expect(await offlineQueue.count()).toBe(0)
    })
})

describe('isQueuableMutation', () => {
    it('returns false for GET requests', () => {
        expect(isQueuableMutation('GET', '/evening/1/penalties')).toBe(false)
    })

    it('allows evening sub-resources', () => {
        expect(isQueuableMutation('POST', '/evening/1/penalties')).toBe(true)
        expect(isQueuableMutation('POST', '/evening/42/drinks')).toBe(true)
        expect(isQueuableMutation('POST', '/evening/1/games')).toBe(true)
        expect(isQueuableMutation('POST', '/evening/1/players')).toBe(true)
        expect(isQueuableMutation('DELETE', '/evening/1/penalties/99')).toBe(true)
    })

    it('allows PATCH on the evening itself', () => {
        expect(isQueuableMutation('PATCH', '/evening/1')).toBe(true)
    })

    it('allows starting a scheduled evening', () => {
        expect(isQueuableMutation('POST', '/schedule/5/start')).toBe(true)
    })

    it('allows schedule RSVP', () => {
        expect(isQueuableMutation('POST', '/schedule/5/rsvp')).toBe(true)
        expect(isQueuableMutation('DELETE', '/schedule/5/rsvp')).toBe(true)
    })

    it('allows creating a regular member (guest)', () => {
        expect(isQueuableMutation('POST', '/club/regular-members')).toBe(true)
    })

    it('allows locale and push preference updates', () => {
        expect(isQueuableMutation('PATCH', '/auth/locale')).toBe(true)
        expect(isQueuableMutation('PATCH', '/push/preferences')).toBe(true)
    })

    it('blocks auth endpoints (not queuable)', () => {
        expect(isQueuableMutation('POST', '/auth/login')).toBe(false)
        expect(isQueuableMutation('POST', '/auth/register')).toBe(false)
    })

    it('blocks financial endpoints (not queuable)', () => {
        expect(isQueuableMutation('POST', '/club/member-payments')).toBe(false)
        expect(isQueuableMutation('POST', '/club/expenses')).toBe(false)
    })
})

describe('SYNC_FLUSHED_EVENT', () => {
    it('is the correct event name string', () => {
        expect(SYNC_FLUSHED_EVENT).toBe('kegelkasse:sync-flushed')
    })
})
