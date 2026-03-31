import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before importing the module under test
vi.mock('@/api/client.ts', () => ({
    api: { getEvening: vi.fn(), listEvenings: vi.fn() },
    authState: { getToken: vi.fn(() => 'token') },
    NetworkError: class NetworkError extends Error {},
    flushOfflineQueue: vi.fn(),
}))

vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel: any) => sel({
        activeEveningId: null,
        setActiveEveningId: vi.fn(),
    })),
}))

vi.mock('@/pendingStore.ts', () => ({
    pendingStore: { get: vi.fn() },
}))

vi.mock('@tanstack/react-query', () => ({
    useQuery: vi.fn(() => ({ data: undefined, isLoading: false, isError: false, error: null })),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}))

// ── tests: pure helper functions ───────────────────────────────────────────────

describe('penaltyTotal', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns 0 when evening is null', async () => {
        const { penaltyTotal } = await import('../useEvening')
        expect(penaltyTotal(null, 1)).toBe(0)
    })

    it('returns 0 when evening is undefined', async () => {
        const { penaltyTotal } = await import('../useEvening')
        expect(penaltyTotal(undefined as any, 1)).toBe(0)
    })

    it('sums euro-mode penalties for the given player', async () => {
        const { penaltyTotal } = await import('../useEvening')
        const evening = {
            penalty_log: [
                { player_id: 1, mode: 'euro', amount: 2.50 },
                { player_id: 1, mode: 'euro', amount: 1.00 },
                { player_id: 2, mode: 'euro', amount: 5.00 },
            ],
        } as any
        expect(penaltyTotal(evening, 1)).toBeCloseTo(3.50)
    })

    it('ignores non-euro mode penalties', async () => {
        const { penaltyTotal } = await import('../useEvening')
        const evening = {
            penalty_log: [
                { player_id: 1, mode: 'count', amount: 3, unit_amount: 1.0 },
                { player_id: 1, mode: 'euro', amount: 2.00 },
            ],
        } as any
        expect(penaltyTotal(evening, 1)).toBeCloseTo(2.00)
    })

    it('returns 0 when player has no penalties', async () => {
        const { penaltyTotal } = await import('../useEvening')
        const evening = {
            penalty_log: [
                { player_id: 2, mode: 'euro', amount: 5.00 },
            ],
        } as any
        expect(penaltyTotal(evening, 1)).toBe(0)
    })

    it('returns 0 for empty penalty log', async () => {
        const { penaltyTotal } = await import('../useEvening')
        const evening = { penalty_log: [] } as any
        expect(penaltyTotal(evening, 1)).toBe(0)
    })
})

describe('playerBeerCount', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns 0 when evening is null', async () => {
        const { playerBeerCount } = await import('../useEvening')
        expect(playerBeerCount(null, 1)).toBe(0)
    })

    it('counts beer rounds containing the player', async () => {
        const { playerBeerCount } = await import('../useEvening')
        const evening = {
            drink_rounds: [
                { drink_type: 'beer', participant_ids: [1, 2, 3] },
                { drink_type: 'beer', participant_ids: [2, 3] },
                { drink_type: 'shots', participant_ids: [1, 2] },
            ],
        } as any
        expect(playerBeerCount(evening, 1)).toBe(1)
    })

    it('counts all beer rounds when player is in all', async () => {
        const { playerBeerCount } = await import('../useEvening')
        const evening = {
            drink_rounds: [
                { drink_type: 'beer', participant_ids: [1, 2] },
                { drink_type: 'beer', participant_ids: [1, 3] },
                { drink_type: 'beer', participant_ids: [1] },
            ],
        } as any
        expect(playerBeerCount(evening, 1)).toBe(3)
    })

    it('ignores shots rounds', async () => {
        const { playerBeerCount } = await import('../useEvening')
        const evening = {
            drink_rounds: [
                { drink_type: 'shots', participant_ids: [1, 2] },
                { drink_type: 'shots', participant_ids: [1] },
            ],
        } as any
        expect(playerBeerCount(evening, 1)).toBe(0)
    })

    it('returns 0 for empty drink_rounds', async () => {
        const { playerBeerCount } = await import('../useEvening')
        const evening = { drink_rounds: [] } as any
        expect(playerBeerCount(evening, 1)).toBe(0)
    })
})

describe('playerShotsCount', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns 0 when evening is null', async () => {
        const { playerShotsCount } = await import('../useEvening')
        expect(playerShotsCount(null, 1)).toBe(0)
    })

    it('counts shots rounds containing the player', async () => {
        const { playerShotsCount } = await import('../useEvening')
        const evening = {
            drink_rounds: [
                { drink_type: 'shots', participant_ids: [1, 2] },
                { drink_type: 'beer', participant_ids: [1, 2] },
                { drink_type: 'shots', participant_ids: [2, 3] },
            ],
        } as any
        expect(playerShotsCount(evening, 1)).toBe(1)
    })

    it('counts all shots rounds when player is in all', async () => {
        const { playerShotsCount } = await import('../useEvening')
        const evening = {
            drink_rounds: [
                { drink_type: 'shots', participant_ids: [1] },
                { drink_type: 'shots', participant_ids: [1, 2] },
            ],
        } as any
        expect(playerShotsCount(evening, 1)).toBe(2)
    })

    it('ignores beer rounds', async () => {
        const { playerShotsCount } = await import('../useEvening')
        const evening = {
            drink_rounds: [
                { drink_type: 'beer', participant_ids: [1, 2] },
            ],
        } as any
        expect(playerShotsCount(evening, 1)).toBe(0)
    })

    it('returns 0 for empty drink_rounds', async () => {
        const { playerShotsCount } = await import('../useEvening')
        const evening = { drink_rounds: [] } as any
        expect(playerShotsCount(evening, 1)).toBe(0)
    })
})
