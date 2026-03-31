/**
 * Tests for OfflineBanner component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({
    useT: () => (key: string) => key,
    t: (key: string) => key,
}))

vi.mock('@/offlineQueue', () => ({
    offlineQueue: { count: vi.fn() },
    groupQueuedRequests: vi.fn(),
    SYNC_FLUSHED_EVENT: 'kegelkasse:sync-flushed',
}))

vi.mock('@/api/client', () => ({
    flushOfflineQueue: vi.fn(),
}))

vi.mock('@/components/ui/Toast', () => ({ showToast: vi.fn() }))

// ── helpers ───────────────────────────────────────────────────────────────────

async function setupMocks({ count = 0, online = true }: { count?: number; online?: boolean } = {}) {
    const { offlineQueue, groupQueuedRequests } = await import('@/offlineQueue')
    vi.mocked(offlineQueue.count).mockResolvedValue(count)
    vi.mocked(groupQueuedRequests).mockResolvedValue(
        count > 0 ? { penalty: count } : {},
    )

    // Mock navigator.onLine
    Object.defineProperty(navigator, 'onLine', { value: online, configurable: true })
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('OfflineBanner — hidden state', () => {
    beforeEach(() => vi.clearAllMocks())

    afterEach(() => {
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    })

    it('renders nothing when online and no pending items', async () => {
        await setupMocks({ count: 0, online: true })
        const { OfflineBanner } = await import('../OfflineBanner')
        const { container } = render(<OfflineBanner />)
        // Wait for async queue load
        await waitFor(() => {
            expect(container.firstChild).toBeNull()
        })
    })
})

describe('OfflineBanner — offline state', () => {
    beforeEach(() => vi.clearAllMocks())

    afterEach(() => {
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    })

    it('shows offline message when navigator.onLine is false', async () => {
        await setupMocks({ count: 0, online: false })
        const { OfflineBanner } = await import('../OfflineBanner')
        render(<OfflineBanner />)
        await waitFor(() => {
            expect(screen.getByText(/sync\.offline/)).toBeInTheDocument()
        })
    })

    it('shows 📵 icon when offline', async () => {
        await setupMocks({ count: 0, online: false })
        const { OfflineBanner } = await import('../OfflineBanner')
        render(<OfflineBanner />)
        await waitFor(() => {
            expect(screen.getByText(/📵/)).toBeInTheDocument()
        })
    })
})

describe('OfflineBanner — pending state', () => {
    beforeEach(() => vi.clearAllMocks())

    afterEach(() => {
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    })

    it('shows pending count when online but has pending items', async () => {
        await setupMocks({ count: 3, online: true })
        const { OfflineBanner } = await import('../OfflineBanner')
        render(<OfflineBanner />)
        await waitFor(() => {
            expect(screen.getByText(/sync\.pending/)).toBeInTheDocument()
        })
    })

    it('shows force sync button when pending items exist', async () => {
        await setupMocks({ count: 2, online: true })
        const { OfflineBanner } = await import('../OfflineBanner')
        render(<OfflineBanner />)
        await waitFor(() => {
            expect(screen.getByText('sync.forceSync')).toBeInTheDocument()
        })
    })

    it('calls flushOfflineQueue when force sync clicked', async () => {
        await setupMocks({ count: 2, online: true })
        const { flushOfflineQueue } = await import('@/api/client')
        vi.mocked(flushOfflineQueue).mockResolvedValue({ applied: 1, errors: 0 })
        const { OfflineBanner } = await import('../OfflineBanner')
        render(<OfflineBanner />)
        await waitFor(() => screen.getByText('sync.forceSync'))
        fireEvent.click(screen.getByText('sync.forceSync'))
        await waitFor(() => {
            expect(flushOfflineQueue).toHaveBeenCalled()
        })
    })
})
