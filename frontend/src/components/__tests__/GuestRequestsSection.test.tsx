import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

vi.mock('@/api/client.ts', () => ({
    api: {
        listGuestRequests: vi.fn(),
        approveGuestRequest: vi.fn(),
        rejectGuestRequest: vi.fn(),
    },
}))

vi.mock('@/hooks/useOnline.ts', () => ({ useOnline: () => true }))
vi.mock('@/components/ui/Toast.tsx', () => ({ showToast: vi.fn() }))
vi.mock('@/utils/error.ts', () => ({ toastError: vi.fn() }))

const hashParams = { value: new URLSearchParams() }
vi.mock('@/utils/hashParams.ts', () => ({
    getHashParams: () => hashParams.value,
    clearHashParams: vi.fn(),
}))
vi.mock('@/hooks/useDeepLink.ts', () => ({
    useDeepLinkVersion: () => '',
    flashDeepLinkTarget: vi.fn(() => () => {}),
}))

vi.mock('@/components/ui/Sheet.tsx', () => ({
    Sheet: ({ open, title, children }: any) => open ? <div role="dialog" aria-label={title}>{children}</div> : null,
}))

import { api } from '@/api/client.ts'
import { showToast } from '@/components/ui/Toast.tsx'
import { flashDeepLinkTarget } from '@/hooks/useDeepLink.ts'
import { GuestRequestsSection } from '../schedule/GuestRequestsSection'
import type { GuestRequest } from '@/types.ts'

// ── fixtures ──────────────────────────────────────────────────────────────────

function request(over: Partial<GuestRequest> = {}): GuestRequest {
    return {
        id: 1, name: 'Anna Gast', email: 'anna@example.com', message: 'Komme gern!',
        status: 'pending', created_at: '2026-10-01T10:00:00Z', decided_at: null,
        scheduled_evening_id: 7, scheduled_at: '2026-11-14T20:00', venue: 'Altes Schalthaus',
        evening_cancelled: false, ...over,
    }
}

function renderSection() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    render(<QueryClientProvider client={qc}><GuestRequestsSection/></QueryClientProvider>)
    return { invalidate }
}

beforeEach(() => {
    vi.clearAllMocks()
    hashParams.value = new URLSearchParams()
})

// ── tests ─────────────────────────────────────────────────────────────────────

describe('GuestRequestsSection', () => {
    it('renders nothing while the club has no requests', async () => {
        vi.mocked(api.listGuestRequests).mockResolvedValue([])
        const { container } = render(
            <QueryClientProvider client={new QueryClient()}><GuestRequestsSection/></QueryClientProvider>)
        await waitFor(() => expect(api.listGuestRequests).toHaveBeenCalled())
        expect(container).toBeEmptyDOMElement()
    })

    it('shows pending requests with name, evening, email and message', async () => {
        vi.mocked(api.listGuestRequests).mockResolvedValue([request()])
        renderSection()
        expect(await screen.findByText('Anna Gast')).toBeInTheDocument()
        expect(screen.getByText(/14\.11\.2026 · 20:00 · Altes Schalthaus/)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /anna@example\.com/ })).toHaveAttribute('href', 'mailto:anna@example.com')
        expect(screen.getByText('Komme gern!')).toBeInTheDocument()
        expect(screen.getByLabelText('guestRequests.pendingCount')).toHaveTextContent('1')
    })

    it('approves after confirmation, refreshes requests and schedule', async () => {
        vi.mocked(api.listGuestRequests).mockResolvedValue([request()])
        vi.mocked(api.approveGuestRequest).mockResolvedValue({ ...request({ status: 'approved' }), guest_notified: true })
        const { invalidate } = renderSection()
        fireEvent.click(await screen.findByText(/guestRequests\.approve/))
        expect(api.approveGuestRequest).not.toHaveBeenCalled()  // confirmation first
        const dialog = screen.getByRole('dialog', { name: 'guestRequests.approveTitle' })
        fireEvent.click(dialog.querySelector('.btn-primary')!)
        await waitFor(() => expect(api.approveGuestRequest).toHaveBeenCalledWith(1))
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('guestRequests.approved'))
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['guest-requests'] })
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['schedule'] })
    })

    it('rejects after confirmation', async () => {
        vi.mocked(api.listGuestRequests).mockResolvedValue([request()])
        vi.mocked(api.rejectGuestRequest).mockResolvedValue({ ...request({ status: 'rejected' }), guest_notified: true })
        renderSection()
        fireEvent.click(await screen.findByText('guestRequests.reject'))
        const dialog = screen.getByRole('dialog', { name: 'guestRequests.rejectTitle' })
        fireEvent.click(dialog.querySelector('.btn-danger')!)
        await waitFor(() => expect(api.rejectGuestRequest).toHaveBeenCalledWith(1))
        expect(api.approveGuestRequest).not.toHaveBeenCalled()
    })

    it('tells the member to write to the guest when the mail could not be sent', async () => {
        vi.mocked(api.listGuestRequests).mockResolvedValue([request()])
        vi.mocked(api.rejectGuestRequest).mockResolvedValue({ ...request({ status: 'rejected' }), guest_notified: false })
        renderSection()
        fireEvent.click(await screen.findByText('guestRequests.reject'))
        fireEvent.click(screen.getByRole('dialog').querySelector('.btn-danger')!)
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('guestRequests.notNotified', 'info'))
    })

    it('offers only rejection for a cancelled evening', async () => {
        vi.mocked(api.listGuestRequests).mockResolvedValue([request({ evening_cancelled: true })])
        renderSection()
        expect(await screen.findByText('guestRequests.cancelled')).toBeInTheDocument()
        expect(screen.getByText('guestRequests.reject')).toBeInTheDocument()
        expect(screen.queryByText(/guestRequests\.approve/)).not.toBeInTheDocument()
    })

    it('collapses decided requests below the pending ones', async () => {
        vi.mocked(api.listGuestRequests).mockResolvedValue([
            request({ id: 2, name: 'Bernd', status: 'approved', decided_at: '2026-10-02T10:00:00Z' }),
        ])
        renderSection()
        expect(await screen.findByText('guestRequests.nonePending')).toBeInTheDocument()
        expect(screen.queryByTestId('guest-request-decided')).not.toBeInTheDocument()
        fireEvent.click(screen.getByText(/guestRequests\.decided/))
        expect(screen.getByTestId('guest-request-decided')).toHaveTextContent('Bernd')
        expect(screen.getByText('guestRequests.status.approved')).toBeInTheDocument()
    })

    it('scrolls to the section for the ?requests deep link from the notification', async () => {
        hashParams.value = new URLSearchParams('requests=1')
        vi.mocked(api.listGuestRequests).mockResolvedValue([request()])
        renderSection()
        await waitFor(() => expect(flashDeepLinkTarget).toHaveBeenCalledWith('guest-requests'))
    })
})
