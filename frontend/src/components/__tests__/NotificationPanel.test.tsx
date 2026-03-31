/**
 * Tests for NotificationPanel component and NotificationRow subcomponent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/store/notifications', () => ({
    useNotificationStore: vi.fn(),
    unreadCount: vi.fn((ns: any[]) => ns.filter((n: any) => !n.read).length),
}))

vi.mock('@/api/client.ts', () => ({
    api: {
        markNotificationsRead: vi.fn(),
        confirmPaymentRequest: vi.fn(),
        rejectPaymentRequest: vi.fn(),
        setRsvp: vi.fn(),
    },
}))

vi.mock('@/utils/error.ts', () => ({ toastError: vi.fn() }))

// ── fixtures ──────────────────────────────────────────────────────────────────

const BASIC_NOTIFICATION = {
    id: 'n1',
    title: 'Test Title',
    body: 'Test Body',
    url: '/#treasury:accounts',
    receivedAt: new Date(Date.now() - 5 * 60000).toISOString(),
    read: false,
}

const READ_NOTIFICATION = {
    ...BASIC_NOTIFICATION,
    id: 'n2',
    title: 'Read Notification',
    read: true,
}

const PAYMENT_NOTIFICATION = {
    id: 'n3',
    title: 'Payment Request',
    body: 'Hans wants to pay 10€',
    url: '/#treasury:accounts?rid=42',
    receivedAt: new Date(Date.now() - 2 * 60000).toISOString(),
    read: false,
}

const RSVP_NOTIFICATION = {
    id: 'n4',
    title: 'Kegeln Reminder',
    body: 'Kegeln in 2 days',
    url: '/#schedule?event=99',
    receivedAt: new Date(Date.now() - 10 * 60000).toISOString(),
    read: false,
}

function makeStore(notifications: any[]) {
    return {
        notifications,
        markAllRead: vi.fn(),
        dismiss: vi.fn(),
        clearAll: vi.fn(),
    }
}

async function renderPanel(open: boolean, notifications: any[] = []) {
    const { api } = await import('@/api/client.ts')
    vi.mocked(api.markNotificationsRead).mockResolvedValue(undefined as any)
    const { useNotificationStore } = await import('@/store/notifications')
    const store = makeStore(notifications)
    vi.mocked(useNotificationStore).mockImplementation((sel?: any) =>
        sel ? sel(store) : store,
    )
    const { NotificationPanel } = await import('../NotificationPanel')
    const onClose = vi.fn()
    render(<NotificationPanel open={open} onClose={onClose} />)
    return { onClose, store }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('NotificationPanel — closed state', () => {
    beforeEach(() => vi.clearAllMocks())

    it('renders nothing when open=false', async () => {
        await renderPanel(false)
        expect(screen.queryByText('notifications.title')).not.toBeInTheDocument()
    })
})

describe('NotificationPanel — open with empty list', () => {
    beforeEach(() => vi.clearAllMocks())

    it('shows panel title when open', async () => {
        await renderPanel(true, [])
        expect(screen.getByText('notifications.title')).toBeInTheDocument()
    })

    it('shows empty state when no notifications', async () => {
        await renderPanel(true, [])
        expect(screen.getByText('notifications.empty')).toBeInTheDocument()
    })

    it('does not show clearAll button when empty', async () => {
        await renderPanel(true, [])
        expect(screen.queryByText('notifications.clearAll')).not.toBeInTheDocument()
    })

    it('calls markAllRead when panel opens', async () => {
        const { store } = await renderPanel(true, [])
        await waitFor(() => {
            expect(store.markAllRead).toHaveBeenCalled()
        })
    })

    it('calls api.markNotificationsRead when panel opens', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.markNotificationsRead).mockResolvedValue(undefined as any)
        await renderPanel(true, [])
        await waitFor(() => {
            expect(api.markNotificationsRead).toHaveBeenCalledWith()
        })
    })

    it('calls onClose when ✕ close button clicked', async () => {
        const { onClose } = await renderPanel(true, [])
        fireEvent.click(screen.getByText('✕'))
        expect(onClose).toHaveBeenCalled()
    })
})

describe('NotificationPanel — with notifications', () => {
    beforeEach(() => vi.clearAllMocks())

    it('shows notification title', async () => {
        await renderPanel(true, [BASIC_NOTIFICATION])
        expect(screen.getByText('Test Title')).toBeInTheDocument()
    })

    it('shows notification body', async () => {
        await renderPanel(true, [BASIC_NOTIFICATION])
        expect(screen.getByText('Test Body')).toBeInTheDocument()
    })

    it('shows clearAll button when notifications exist', async () => {
        await renderPanel(true, [BASIC_NOTIFICATION])
        expect(screen.getByText('notifications.clearAll')).toBeInTheDocument()
    })

    it('calls clearAll when clearAll button clicked', async () => {
        const { store } = await renderPanel(true, [BASIC_NOTIFICATION])
        fireEvent.click(screen.getByText('notifications.clearAll'))
        expect(store.clearAll).toHaveBeenCalled()
    })

    it('shows relative time for recent notification', async () => {
        await renderPanel(true, [BASIC_NOTIFICATION])
        // 5 min ago → "5 min"
        expect(screen.getByText('5 min')).toBeInTheDocument()
    })

    it('shows < 1 min for very recent notification', async () => {
        const veryRecent = { ...BASIC_NOTIFICATION, receivedAt: new Date().toISOString() }
        await renderPanel(true, [veryRecent])
        expect(screen.getByText('< 1 min')).toBeInTheDocument()
    })

    it('renders multiple notifications', async () => {
        await renderPanel(true, [BASIC_NOTIFICATION, READ_NOTIFICATION])
        expect(screen.getByText('Test Title')).toBeInTheDocument()
        expect(screen.getByText('Read Notification')).toBeInTheDocument()
    })

    it('calls dismiss when row ✕ button clicked', async () => {
        const { store } = await renderPanel(true, [BASIC_NOTIFICATION])
        // Panel renders: [0] panel-close ✕, [1] row-dismiss ✕
        const dismissBtns = screen.getAllByText('✕')
        fireEvent.click(dismissBtns[1])
        expect(store.dismiss).toHaveBeenCalledWith('n1')
    })
})

describe('NotificationPanel — payment request notification', () => {
    beforeEach(() => vi.clearAllMocks())

    it('shows confirm and reject buttons for payment notifications', async () => {
        await renderPanel(true, [PAYMENT_NOTIFICATION])
        expect(screen.getByText(/paymentRequest\.confirm/)).toBeInTheDocument()
        expect(screen.getByText(/paymentRequest\.reject/)).toBeInTheDocument()
    })

    it('calls api.confirmPaymentRequest when confirm clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.confirmPaymentRequest).mockResolvedValue({} as any)
        await renderPanel(true, [PAYMENT_NOTIFICATION])
        fireEvent.click(screen.getByText(/paymentRequest\.confirm/))
        await waitFor(() => {
            expect(api.confirmPaymentRequest).toHaveBeenCalledWith(42)
        })
    })

    it('calls api.rejectPaymentRequest when reject clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.rejectPaymentRequest).mockResolvedValue({} as any)
        await renderPanel(true, [PAYMENT_NOTIFICATION])
        fireEvent.click(screen.getByText(/paymentRequest\.reject/))
        await waitFor(() => {
            expect(api.rejectPaymentRequest).toHaveBeenCalledWith(42)
        })
    })
})

describe('NotificationPanel — RSVP notification', () => {
    beforeEach(() => vi.clearAllMocks())

    it('shows RSVP attending button for schedule notifications', async () => {
        await renderPanel(true, [RSVP_NOTIFICATION])
        expect(screen.getByText(/rsvp\.attending\.short/)).toBeInTheDocument()
    })

    it('calls api.setRsvp when RSVP button clicked', async () => {
        const { api } = await import('@/api/client.ts')
        vi.mocked(api.setRsvp).mockResolvedValue(undefined as any)
        await renderPanel(true, [RSVP_NOTIFICATION])
        fireEvent.click(screen.getByText(/rsvp\.attending\.short/))
        await waitFor(() => {
            expect(api.setRsvp).toHaveBeenCalledWith(99, 'attending')
        })
    })
})
