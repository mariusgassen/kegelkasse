import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import React from 'react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))

const mockNavigate = vi.fn((..._args: unknown[]) => Promise.resolve())
vi.mock('@/router', () => ({
    router: {navigate: (...args: unknown[]) => mockNavigate(...args)},
}))

vi.mock('@/utils/error.ts', () => ({toastError: vi.fn()}))

const storeState = {
    user: {regular_member_id: 7, name: 'Rudi', preferred_locale: 'de'} as any,
    activeEveningId: null as number | null,
    regularMembers: [{id: 7, name: 'Rudi Ratlos', nickname: 'Rudi'}] as any[],
}
vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel: any) => sel(storeState)),
    isAdmin: (u: any) => u?.role === 'admin' || u?.role === 'superadmin',
}))

const throwTrackingMock = vi.fn(() => true)
vi.mock('@/hooks/useClub.ts', () => ({useThrowTracking: () => throwTrackingMock()}))

const api = {
    listScheduledEvenings: vi.fn(),
    getMyBalance: vi.fn(),
    listAnnouncements: vi.fn(),
    listTrips: vi.fn(),
    getMyThrowStats: vi.fn(),
    setRsvp: vi.fn(),
    removeRsvp: vi.fn(),
}
vi.mock('@/api/client.ts', () => ({api: {
    listScheduledEvenings: (...a: unknown[]) => api.listScheduledEvenings(...a),
    getMyBalance: (...a: unknown[]) => api.getMyBalance(...a),
    listAnnouncements: (...a: unknown[]) => api.listAnnouncements(...a),
    listTrips: (...a: unknown[]) => api.listTrips(...a),
    getMyThrowStats: (...a: unknown[]) => api.getMyThrowStats(...a),
    setRsvp: (...a: unknown[]) => api.setRsvp(...a),
    removeRsvp: (...a: unknown[]) => api.removeRsvp(...a),
}}))

function se(overrides: Record<string, unknown> = {}) {
    return {
        id: 1, scheduled_at: '2999-01-01T20:00', venue: 'Kegelbahn', note: null, created_at: null,
        attending_count: 3, absent_count: 0, my_rsvp: null, guests: [], evening_id: null, ...overrides,
    }
}

async function renderHome() {
    const {HomePage} = await import('../HomePage')
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
    return render(<QueryClientProvider client={qc}><HomePage/></QueryClientProvider>)
}

beforeEach(() => {
    vi.clearAllMocks()
    throwTrackingMock.mockReturnValue(true)
    storeState.activeEveningId = null
    storeState.user = {regular_member_id: 7, name: 'Rudi', preferred_locale: 'de'} as any
    api.listScheduledEvenings.mockResolvedValue([])
    api.getMyBalance.mockResolvedValue({regular_member_id: 7, penalty_total: 0, payments_total: 0, balance: 0})
    api.listAnnouncements.mockResolvedValue([])
    api.listTrips.mockResolvedValue([])
    api.getMyThrowStats.mockResolvedValue({
        regular_member_id: 7, year: 2026, total_pins: 0, throw_count: 0,
        avg_pins: null, best_avg: null, worst_avg: null, evenings: [],
    })
})

// ── tests ─────────────────────────────────────────────────────────────────────

describe('HomePage', () => {
    it('greets the member by nickname', async () => {
        await renderHome()
        await waitFor(() => expect(screen.getByText('home.greeting')).toBeInTheDocument())
    })

    it('shows the empty-appointment state when no upcoming evening', async () => {
        await renderHome()
        await waitFor(() => expect(screen.getByText('home.noAppointment')).toBeInTheDocument())
    })

    it('renders the next appointment when one is upcoming', async () => {
        api.listScheduledEvenings.mockResolvedValue([se()])
        await renderHome()
        await waitFor(() => expect(screen.getByText('🏠 Kegelbahn')).toBeInTheDocument())
    })

    it('marks the evening as attending via RSVP', async () => {
        api.listScheduledEvenings.mockResolvedValue([se()])
        api.setRsvp.mockResolvedValue({status: 'attending'})
        await renderHome()
        await waitFor(() => screen.getByText('rsvp.attending.short'))
        fireEvent.click(screen.getByText('rsvp.attending.short'))
        await waitFor(() => expect(api.setRsvp).toHaveBeenCalledWith(1, 'attending'))
    })

    it('shows the active-evening callout and navigates to /evening', async () => {
        storeState.activeEveningId = 42
        await renderHome()
        await waitFor(() => screen.getByText('home.eveningLive.title'))
        fireEvent.click(screen.getByText('home.eveningLive.title'))
        expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({to: '/evening', search: {tab: 'manage'}}))
    })

    it('shows the admin start-evening callout when nothing is active', async () => {
        storeState.user = {regular_member_id: 7, name: 'Rudi', preferred_locale: 'de', role: 'admin'} as any
        await renderHome()
        await waitFor(() => screen.getByText('home.startEvening.title'))
        fireEvent.click(screen.getByText('home.startEvening.title'))
        expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({to: '/evening'}))
    })

    it('does not show the start-evening callout for non-admins', async () => {
        await renderHome()
        await waitFor(() => expect(screen.getByText('home.greeting')).toBeInTheDocument())
        expect(screen.queryByText('home.startEvening.title')).not.toBeInTheDocument()
    })

    it('shows the balance and its state label', async () => {
        api.getMyBalance.mockResolvedValue({regular_member_id: 7, penalty_total: 10, payments_total: 0, balance: -10})
        await renderHome()
        await waitFor(() => expect(screen.getByText('home.balance.owed')).toBeInTheDocument())
    })

    it('lists community news and deep-links on click', async () => {
        api.listAnnouncements.mockResolvedValue([{id: 5, title: 'Sommerfest', text: null, media_url: null, created_by_name: null, created_at: '2026-07-20T10:00'}])
        await renderHome()
        await waitFor(() => screen.getByText('Sommerfest'))
        fireEvent.click(screen.getByText('Sommerfest'))
        expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({
            to: '/committee', search: {tab: 'announcements', item: 5},
        }))
    })

    it('shows the season metric when the member has throws', async () => {
        api.getMyThrowStats.mockResolvedValue({
            regular_member_id: 7, year: 2026, total_pins: 100, throw_count: 20,
            avg_pins: 5.5, best_avg: 7, worst_avg: 4,
            evenings: [
                {evening_id: 1, date: '2026-01-01', location: null, total_pins: 0, throw_count: 0, avg_pins: 5},
                {evening_id: 2, date: '2026-02-01', location: null, total_pins: 0, throw_count: 0, avg_pins: 6},
            ],
        })
        await renderHome()
        await waitFor(() => expect(screen.getByText('5.5')).toBeInTheDocument())
        expect(screen.getByText('home.avgPins')).toBeInTheDocument()
    })

    it('hides the season throw metric when throw tracking is disabled', async () => {
        throwTrackingMock.mockReturnValue(false)
        api.getMyThrowStats.mockResolvedValue({
            regular_member_id: 7, year: 2026, total_pins: 100, throw_count: 20,
            avg_pins: 5.5, best_avg: 7, worst_avg: 4, evenings: [],
        })
        await renderHome()
        await waitFor(() => expect(screen.getByText('home.greeting')).toBeInTheDocument())
        expect(screen.queryByText('home.avgPins')).not.toBeInTheDocument()
    })

    it('hides the account section for a member without a linked regular member', async () => {
        storeState.user = {regular_member_id: null, name: 'Gast', preferred_locale: 'de'} as any
        await renderHome()
        await waitFor(() => screen.getByText('home.noAppointment'))
        expect(screen.queryByText('profile.myBalance')).not.toBeInTheDocument()
    })

    it('renders quick-action tiles', async () => {
        await renderHome()
        await waitFor(() => expect(screen.getByText('nav.treasury')).toBeInTheDocument())
        expect(screen.getByText('nav.stats')).toBeInTheDocument()
        fireEvent.click(screen.getByText('nav.stats'))
        expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({to: '/stats'}))
    })
})
