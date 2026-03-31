/**
 * Tests for offline-queue paths inside request() and flushOfflineQueue().
 *
 * We mock @/offlineQueue and @/pendingStore so no real IndexedDB is used.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── module-level mocks (hoisted by vitest) ────────────────────────────────────

const mockEnqueue = vi.fn().mockResolvedValue(undefined)
const mockGetAll = vi.fn().mockResolvedValue([])
const mockOfflineQueueRemove = vi.fn().mockResolvedValue(undefined)

vi.mock('@/offlineQueue', () => ({
    offlineQueue: {
        enqueue: mockEnqueue,
        getAll: mockGetAll,
        remove: mockOfflineQueueRemove,
        count: vi.fn().mockResolvedValue(0),
    },
    isQueuableMutation: vi.fn(),
}))

const mockPendingSave = vi.fn().mockResolvedValue(undefined)
const mockPendingRemove = vi.fn().mockResolvedValue(undefined)

vi.mock('@/pendingStore', () => ({
    pendingStore: { save: mockPendingSave, remove: mockPendingRemove, get: vi.fn() },
}))

vi.mock('@/lib/tokenStore', () => ({ persistTokenForSW: vi.fn() }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
vi.stubGlobal('navigator', { onLine: true })

function jsonOk(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200, headers: { 'Content-Type': 'application/json' },
    })
}

// ── flushOfflineQueue — empty queue ──────────────────────────────────────────

describe('flushOfflineQueue — empty queue', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetAll.mockResolvedValue([])
    })

    it('returns {applied:0, errors:0} for empty queue', async () => {
        const { authState, flushOfflineQueue } = await import('../client')
        authState.setToken('tok')
        const result = await flushOfflineQueue()
        expect(result).toEqual({ applied: 0, errors: 0 })
    })

    it('does not call fetch when queue is empty', async () => {
        const { authState, flushOfflineQueue } = await import('../client')
        authState.setToken('tok')
        await flushOfflineQueue()
        expect(mockFetch).not.toHaveBeenCalled()
    })
})

// ── flushOfflineQueue — single item success ──────────────────────────────────

describe('flushOfflineQueue — single item success', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetAll.mockResolvedValue([
            { id: 1, method: 'POST', path: '/evening/5/penalties', body: {}, timestamp: 1000 },
        ])
        mockFetch.mockResolvedValue(jsonOk({ id: 42 }))
    })

    it('applies the queued item and returns applied:1', async () => {
        const { authState, flushOfflineQueue } = await import('../client')
        authState.setToken('tok')
        const result = await flushOfflineQueue()
        expect(result.applied).toBe(1)
        expect(result.errors).toBe(0)
    })

    it('removes the item from the offline queue after success', async () => {
        const { authState, flushOfflineQueue } = await import('../client')
        authState.setToken('tok')
        await flushOfflineQueue()
        expect(mockOfflineQueueRemove).toHaveBeenCalledWith(1)
    })

    it('calls fetch with correct path', async () => {
        const { authState, flushOfflineQueue } = await import('../client')
        authState.setToken('tok')
        await flushOfflineQueue()
        expect(mockFetch.mock.calls[0][0]).toContain('/evening/5/penalties')
    })
})

// ── flushOfflineQueue — tempId remapping ─────────────────────────────────────

describe('flushOfflineQueue — tempId remapping', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // First item creates a real resource with tempId=-9999
        // Second item's path references -9999 and should be rewritten to the real ID
        mockGetAll.mockResolvedValue([
            {
                id: 1, method: 'POST', path: '/schedule/3/start', body: {},
                timestamp: 1000, tempId: -9999,
            },
            {
                id: 2, method: 'POST', path: '/evening/-9999/penalties', body: { amount: 1 },
                timestamp: 2000,
            },
        ])
    })

    it('rewrites path using real ID from server response', async () => {
        const { authState, flushOfflineQueue } = await import('../client')
        authState.setToken('tok')
        // First call returns real ID 100 for the temp evening
        mockFetch
            .mockResolvedValueOnce(jsonOk({ id: 100, date: '2025-01-01', venue: null }))
            .mockResolvedValueOnce(jsonOk([{ id: 5 }]))

        const result = await flushOfflineQueue()
        expect(result.applied).toBe(2)

        // Second fetch should use real ID 100, not -9999
        const secondUrl: string = mockFetch.mock.calls[1][0]
        expect(secondUrl).toContain('100')
        expect(secondUrl).not.toContain('-9999')
    })

    it('dispatches temp-id-resolved event when tempId item succeeds', async () => {
        const { authState, flushOfflineQueue } = await import('../client')
        authState.setToken('tok')
        mockFetch
            .mockResolvedValueOnce(jsonOk({ id: 100, date: '2025-01-01', venue: null }))
            .mockResolvedValueOnce(jsonOk([]))

        const resolved: number[] = []
        window.addEventListener('kegelkasse:temp-id-resolved', (e) => {
            resolved.push((e as CustomEvent).detail.realId)
        })
        await flushOfflineQueue()
        expect(resolved).toContain(100)
    })
})

// ── flushOfflineQueue — server error discards item ────────────────────────────

describe('flushOfflineQueue — server error discards item', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetAll.mockResolvedValue([
            { id: 1, method: 'DELETE', path: '/evening/1/penalties/99', body: null, timestamp: 1000 },
        ])
    })

    it('increments errors and removes item on 404', async () => {
        mockFetch.mockResolvedValueOnce(
            new Response(JSON.stringify({ detail: 'Not found' }), {
                status: 404, headers: { 'Content-Type': 'application/json' },
            }),
        )
        const { authState, flushOfflineQueue } = await import('../client')
        authState.setToken('tok')
        const result = await flushOfflineQueue()
        expect(result.errors).toBe(1)
        expect(result.applied).toBe(0)
        expect(mockOfflineQueueRemove).toHaveBeenCalledWith(1)
    })
})

// ── flushOfflineQueue — dispatches events ─────────────────────────────────────

describe('flushOfflineQueue — dispatches events', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetAll.mockResolvedValue([
            { id: 1, method: 'POST', path: '/evening/5/drinks', body: {}, timestamp: 1000 },
        ])
        mockFetch.mockResolvedValue(jsonOk({ id: 1 }))
    })

    it('dispatches kegelkasse:queue-changed event after flush', async () => {
        const { authState, flushOfflineQueue } = await import('../client')
        authState.setToken('tok')
        const events: string[] = []
        window.addEventListener('kegelkasse:queue-changed', () => events.push('queue-changed'))
        await flushOfflineQueue()
        expect(events).toContain('queue-changed')
    })

    it('dispatches kegelkasse:sync-flushed when items applied', async () => {
        const { authState, flushOfflineQueue } = await import('../client')
        authState.setToken('tok')
        const syncEvents: CustomEvent[] = []
        window.addEventListener('kegelkasse:sync-flushed', (e) => syncEvents.push(e as CustomEvent))
        await flushOfflineQueue()
        expect(syncEvents.length).toBeGreaterThan(0)
        expect(syncEvents[0].detail.applied).toBe(1)
    })
})
