import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UnauthorizedError, OfflineQueuedError } from '@/api/client'

// Mock dependencies before importing the module under test
vi.mock('@/components/ui/Toast', () => ({
    showToast: vi.fn(),
}))

vi.mock('@/api/client', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/api/client')>()
    return {
        ...actual,
        api: {
            listEvenings: vi.fn(),
        },
    }
})

vi.mock('@/store/app', () => ({
    useAppStore: {
        getState: vi.fn(() => ({
            setActiveEveningId: vi.fn(),
        })),
    },
}))

vi.mock('@/i18n', () => ({
    t: (key: string) => key,
    useT: () => (key: string) => key,
}))

describe('toastError', () => {
    let showToast: ReturnType<typeof vi.fn>

    beforeEach(async () => {
        const toastModule = await import('@/components/ui/Toast')
        showToast = vi.mocked(toastModule.showToast)
        showToast.mockReset()
    })

    it('does nothing for UnauthorizedError', async () => {
        const { toastError } = await import('../error')
        toastError(new UnauthorizedError())
        expect(showToast).not.toHaveBeenCalled()
    })

    it('shows success toast for OfflineQueuedError', async () => {
        const { toastError } = await import('../error')
        toastError(new OfflineQueuedError())
        expect(showToast).toHaveBeenCalledWith(expect.any(String), 'success')
    })

    it('shows error toast with message for generic Error', async () => {
        const { toastError } = await import('../error')
        toastError(new Error('Something broke'))
        expect(showToast).toHaveBeenCalledWith('Something broke', 'error')
    })

    it('shows generic error message for unknown non-Error value', async () => {
        const { toastError } = await import('../error')
        toastError('just a string')
        expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error')
    })

    it('shows generic error message for null', async () => {
        const { toastError } = await import('../error')
        toastError(null)
        expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error')
    })
})

describe('handleAlreadyActive', () => {
    it('returns false when error is not "Another evening is already active"', async () => {
        const { handleAlreadyActive } = await import('../error')
        const result = await handleAlreadyActive(new Error('Some other error'))
        expect(result).toBe(false)
    })

    it('returns false for non-Error values', async () => {
        const { handleAlreadyActive } = await import('../error')
        expect(await handleAlreadyActive('string error')).toBe(false)
        expect(await handleAlreadyActive(null)).toBe(false)
        expect(await handleAlreadyActive(42)).toBe(false)
    })

    it('handles the active evening error and returns true', async () => {
        const { api } = await import('@/api/client')
        vi.mocked(api.listEvenings).mockResolvedValueOnce([
            { id: 99, date: '2026-01-01', venue: null, note: null, is_closed: false, player_count: 0, game_count: 0, penalty_total: 0, drink_total: 0 },
        ] as any)

        const { handleAlreadyActive } = await import('../error')
        const result = await handleAlreadyActive(new Error('Another evening is already active'))
        expect(result).toBe(true)
    })

    it('returns true even when listEvenings rejects', async () => {
        const { api } = await import('@/api/client')
        vi.mocked(api.listEvenings).mockRejectedValueOnce(new Error('network'))

        const { handleAlreadyActive } = await import('../error')
        const result = await handleAlreadyActive(new Error('Another evening is already active'))
        expect(result).toBe(true)
    })
})
