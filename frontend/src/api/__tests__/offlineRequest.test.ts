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
const mockIsQueuableMutation = vi.fn()

vi.mock('@/offlineQueue', () => ({
    offlineQueue: {
        enqueue: mockEnqueue,
        getAll: mockGetAll,
        remove: mockOfflineQueueRemove,
        count: vi.fn().mockResolvedValue(0),
    },
    isQueuableMutation: mockIsQueuableMutation,
    SYNC_FLUSHED_EVENT: 'kegelkasse:sync-flushed',
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

// ── flushOfflineQueue — NetworkError stops flushing ───────────────────────────

describe('flushOfflineQueue — NetworkError stops loop', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetAll.mockResolvedValue([
            { id: 1, method: 'POST', path: '/evening/5/drinks', body: {}, timestamp: 1000 },
            { id: 2, method: 'POST', path: '/evening/5/drinks', body: {}, timestamp: 2000 },
        ])
    })

    afterEach(() => {
        vi.stubGlobal('navigator', { onLine: true })
    })

    it('stops processing items when fetch throws NetworkError', async () => {
        // Make fetch reject (network failure) — causes NetworkError which stops the loop
        mockFetch.mockRejectedValue(new Error('network failure'))
        const { authState, flushOfflineQueue } = await import('../client')
        authState.setToken('tok')
        const result = await flushOfflineQueue()
        // Should have applied 0 (stopped after first item's NetworkError)
        expect(result.applied).toBe(0)
        // Only first item processed before break (fetch called once)
        expect(mockFetch).toHaveBeenCalledTimes(1)
    })
})

// ── flushOfflineQueue — mutex (concurrent calls) ──────────────────────────────

describe('flushOfflineQueue — mutex prevents concurrent execution', () => {
    afterEach(() => {
        vi.clearAllMocks()
        mockGetAll.mockResolvedValue([])
    })

    it('second concurrent call returns {applied:0,errors:0} immediately', async () => {
        // Make getAll hang indefinitely so the first flush stays in progress
        let resolveGetAll!: (v: unknown[]) => void
        mockGetAll
            .mockReturnValueOnce(new Promise(resolve => { resolveGetAll = resolve }))
            .mockResolvedValue([])

        const { flushOfflineQueue } = await import('../client')

        // Start first flush (hangs at getAll)
        const p1 = flushOfflineQueue()
        // Second call while first is still in progress — should return early
        const result2 = await flushOfflineQueue()

        expect(result2).toEqual({ applied: 0, errors: 0 })

        // Unblock the first flush
        resolveGetAll([])
        await p1
    })
})

// ── addGame offline — tempId assignment ───────────────────────────────────────

describe('request — addGame offline returns fake game with tempId', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubGlobal('navigator', { onLine: false })
        mockIsQueuableMutation.mockReturnValue(true)
    })

    afterEach(() => {
        vi.stubGlobal('navigator', { onLine: true })
    })

    it('returns an object with a negative id equal to the enqueued tempId', async () => {
        const { api } = await import('../client')
        const result = await api.addGame(5, {name: 'Testspiel', client_timestamp: 1000})
        expect(result).not.toBeNull()
        expect(result.id).toBeLessThan(0)
        expect(result.name).toBe('Testspiel')
    })

    it('enqueues the request with a tempId', async () => {
        const { api } = await import('../client')
        await api.addGame(5, {name: 'X', client_timestamp: 1000})
        expect(mockEnqueue).toHaveBeenCalledWith(
            'POST',
            '/evening/5/games',
            expect.any(Object),
            expect.any(Number),
        )
        const calls = mockEnqueue.mock.calls
        const enqueuedTempId = calls[calls.length - 1][3] as number
        expect(enqueuedTempId).toBeLessThan(0)
    })
})

// ── request — negative game ID routes to queue even when online ───────────────

describe('request — negative game ID is queued without hitting server', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubGlobal('navigator', { onLine: true })
        mockIsQueuableMutation.mockReturnValue(true)
    })

    it('queues start-game on a pending game without fetching', async () => {
        const { api } = await import('../client')
        // id < 0 means the game is pending / not yet synced
        await api.startGame(5, -999999)
        expect(mockFetch).not.toHaveBeenCalled()
        expect(mockEnqueue).toHaveBeenCalledWith(
            'POST',
            '/evening/5/games/-999999/start',
            expect.objectContaining({client_timestamp: expect.any(Number)}),
        )
    })
})
