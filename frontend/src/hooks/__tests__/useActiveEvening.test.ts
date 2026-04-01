/**
 * Tests for useActiveEvening and useEveningList hook behaviour.
 *
 * We mock all external dependencies and use renderHook from testing-library/react
 * to exercise the hook internals without a real server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── EventSource polyfill (jsdom doesn't include it) ──────────────────────────

class MockEventSource {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 2
    onopen: (() => void) | null = null
    onmessage: ((e: MessageEvent) => void) | null = null
    onerror: (() => void) | null = null
    close = vi.fn()
    constructor(_url: string) {}
}
vi.stubGlobal('EventSource', MockEventSource)

// ── mocks (must be hoisted before any module import) ──────────────────────────

const mockGetToken = vi.fn(() => 'test-token')
const mockGetEvening = vi.fn()
const mockListEvenings = vi.fn()
const mockFlushOfflineQueue = vi.fn().mockResolvedValue(undefined)
const mockPendingStoreGet = vi.fn()

vi.mock('@/api/client.ts', () => ({
    api: { getEvening: mockGetEvening, listEvenings: mockListEvenings },
    authState: { getToken: mockGetToken },
    NetworkError: class NetworkError extends Error { constructor(m = 'net') { super(m) } },
    flushOfflineQueue: mockFlushOfflineQueue,
}))

let mockActiveEveningId: number | null = null
const mockSetActiveEveningId = vi.fn((v: number | null) => { mockActiveEveningId = v })

vi.mock('@/store/app.ts', () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useAppStore: vi.fn((sel: (s: any) => any) => sel({
        activeEveningId: mockActiveEveningId,
        setActiveEveningId: mockSetActiveEveningId,
    })),
}))

vi.mock('@/pendingStore.ts', () => ({
    pendingStore: { get: mockPendingStoreGet },
}))

const mockInvalidateQueries = vi.fn()

vi.mock('@tanstack/react-query', () => ({
    useQuery: vi.fn(({ queryFn, enabled, queryKey }: {
        queryFn: () => unknown
        enabled?: boolean
        queryKey: unknown[]
    }) => {
        if (enabled === false) return { data: undefined, isLoading: false, isError: false, error: null }
        // Expose queryKey so tests can verify what was passed
        try {
            const data = queryFn()
            return { data, isLoading: false, isError: false, error: null, _queryKey: queryKey }
        } catch (err) {
            return { data: undefined, isLoading: false, isError: true, error: err, _queryKey: queryKey }
        }
    }),
    useQueryClient: vi.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
}))

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useActiveEvening — no active evening', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockActiveEveningId = null
    })

    it('returns undefined/null evening when activeEveningId is null', async () => {
        const { useActiveEvening } = await import('../useEvening')
        const { result } = renderHook(() => useActiveEvening())
        // Query is disabled when no ID — data is undefined
        expect(result.current.evening == null).toBe(true)
    })

    it('returns activeEveningId as null', async () => {
        const { useActiveEvening } = await import('../useEvening')
        const { result } = renderHook(() => useActiveEvening())
        expect(result.current.activeEveningId).toBeNull()
    })

    it('returns isPending as false when no ID', async () => {
        const { useActiveEvening } = await import('../useEvening')
        const { result } = renderHook(() => useActiveEvening())
        expect(result.current.isPending).toBe(false)
    })
})

describe('useActiveEvening — with real evening ID', () => {
    const fakeEvening = {
        id: 5,
        date: '2025-03-01',
        venue: 'Halle',
        is_closed: false,
        players: [],
        teams: [],
        games: [],
        highlights: [],
        penalty_log: [],
        drink_rounds: [],
    }

    beforeEach(() => {
        vi.clearAllMocks()
        mockActiveEveningId = 5
        mockGetEvening.mockResolvedValue(fakeEvening)
    })

    it('returns isPending as false for positive ID', async () => {
        const { useActiveEvening } = await import('../useEvening')
        const { result } = renderHook(() => useActiveEvening())
        expect(result.current.isPending).toBe(false)
    })

    it('exposes an invalidate function', async () => {
        const { useActiveEvening } = await import('../useEvening')
        const { result } = renderHook(() => useActiveEvening())
        expect(typeof result.current.invalidate).toBe('function')
    })

    it('invalidate calls queryClient.invalidateQueries', async () => {
        const { useActiveEvening } = await import('../useEvening')
        const { result } = renderHook(() => useActiveEvening())
        act(() => { result.current.invalidate() })
        expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['evening', 5] })
    })
})

describe('useActiveEvening — pending (temp) evening', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockActiveEveningId = -1
        mockPendingStoreGet.mockResolvedValue({ date: '2025-03-01', venue: 'Offline' })
    })

    it('returns isPending true for negative ID', async () => {
        const { useActiveEvening } = await import('../useEvening')
        const { result } = renderHook(() => useActiveEvening())
        expect(result.current.isPending).toBe(true)
    })

    it('activeEveningId is negative', async () => {
        const { useActiveEvening } = await import('../useEvening')
        const { result } = renderHook(() => useActiveEvening())
        expect(result.current.activeEveningId).toBe(-1)
    })
})

describe('useEveningList', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockListEvenings.mockResolvedValue([{ id: 1 }, { id: 2 }])
    })

    it('calls api.listEvenings as queryFn', async () => {
        const { useEveningList } = await import('../useEvening')
        renderHook(() => useEveningList())
        expect(mockListEvenings).toHaveBeenCalled()
    })
})

describe('useActiveEvening — temp-id-resolved event', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockActiveEveningId = -1
    })

    it('listens for kegelkasse:temp-id-resolved event', async () => {
        const { useActiveEvening } = await import('../useEvening')
        const addEventSpy = vi.spyOn(window, 'addEventListener')
        renderHook(() => useActiveEvening())
        expect(addEventSpy).toHaveBeenCalledWith('kegelkasse:temp-id-resolved', expect.any(Function))
        addEventSpy.mockRestore()
    })

    it('removes event listener on unmount', async () => {
        const { useActiveEvening } = await import('../useEvening')
        const removeEventSpy = vi.spyOn(window, 'removeEventListener')
        const { unmount } = renderHook(() => useActiveEvening())
        unmount()
        expect(removeEventSpy).toHaveBeenCalledWith('kegelkasse:temp-id-resolved', expect.any(Function))
        removeEventSpy.mockRestore()
    })

    it('updates activeEveningId when temp ID matches resolved event', async () => {
        mockActiveEveningId = -1
        const { useAppStore } = await import('@/store/app.ts')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(useAppStore).mockImplementation((sel: (s: any) => any) => sel({
            activeEveningId: -1,
            setActiveEveningId: mockSetActiveEveningId,
        }))

        const { useActiveEvening } = await import('../useEvening')
        renderHook(() => useActiveEvening())

        act(() => {
            const event = new CustomEvent('kegelkasse:temp-id-resolved', {
                detail: { tempId: -1, realId: 42 },
            })
            window.dispatchEvent(event)
        })

        expect(mockSetActiveEveningId).toHaveBeenCalledWith(42)
    })
})
