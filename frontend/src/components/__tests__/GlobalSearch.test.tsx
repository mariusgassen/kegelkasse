import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react'
import React from 'react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'

let mockLocale: 'de' | 'en' = 'de'

vi.mock('@/i18n', () => ({
    useT: () => (key: string) => key,
    useI18n: () => ({locale: mockLocale, setLocale: vi.fn()}),
}))

vi.mock('@/components/ui/Sheet.tsx', () => ({
    Sheet: ({open, children, title}: any) =>
        open ? (
            <div data-testid="sheet">
                <div data-testid="sheet-title">{title}</div>
                {children}
            </div>
        ) : null,
}))

const regularMembers = [
    {id: 1, name: 'Hans Müller', nickname: 'Hasi'},
    {id: 2, name: 'Peter Schmidt', nickname: null},
]

vi.mock('@/store/app.ts', () => ({
    useAppStore: (sel?: any) => {
        const state = {regularMembers}
        return sel ? sel(state) : state
    },
}))

const mockApi = {
    listEvenings: vi.fn().mockResolvedValue([{id: 10, date: '2026-03-15', venue: 'Kegelbahn Nord'}]),
    listAnnouncements: vi.fn().mockResolvedValue([{id: 20, title: 'Sommerfest', text: null}]),
    listTrips: vi.fn().mockResolvedValue([{id: 30, destination: 'Rhein-Fahrt', date: '2026-06-01', note: null}]),
    getAllPayments: vi.fn().mockResolvedValue([
        {id: 100, member_name: 'Hans Müller', amount: 20, note: 'Eintrittsbeitrag', date: '2026-03-01', created_at: null},
    ]),
    getExpenses: vi.fn().mockResolvedValue([
        {id: 200, description: 'Kegelbahn Miete', amount: 80, date: '2026-03-05', created_at: null},
    ]),
}

vi.mock('@/api/client.ts', () => ({
    api: mockApi,
}))

async function renderSearch(open = true) {
    const {GlobalSearch} = await import('../GlobalSearch')
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
    const onClose = vi.fn()
    let result!: ReturnType<typeof render>
    await act(async () => {
        result = render(
            <QueryClientProvider client={qc}>
                <GlobalSearch open={open} onClose={onClose}/>
            </QueryClientProvider>
        )
    })
    return {...result, onClose}
}

describe('GlobalSearch', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockLocale = 'de'
    })

    it('renders nothing when closed', async () => {
        await renderSearch(false)
        expect(screen.queryByTestId('sheet')).not.toBeInTheDocument()
    })

    it('shows no results/groups before typing a query', async () => {
        await renderSearch(true)
        expect(screen.queryByText('search.noResults')).not.toBeInTheDocument()
        expect(screen.queryByText('search.members')).not.toBeInTheDocument()
    })

    it('filters members as the user types and groups them under search.members', async () => {
        await renderSearch(true)
        fireEvent.change(screen.getByPlaceholderText('search.placeholder'), {target: {value: 'hasi'}})
        expect(screen.getByText(/search\.members/)).toBeInTheDocument()
        expect(screen.getAllByText('Hasi').length).toBeGreaterThan(0)
    })

    it('shows a Konten (accounts) group for the same matching member', async () => {
        await renderSearch(true)
        fireEvent.change(screen.getByPlaceholderText('search.placeholder'), {target: {value: 'hasi'}})
        expect(screen.getByText(/search\.accounts/)).toBeInTheDocument()
    })

    it('finds evenings once the query resolves', async () => {
        await renderSearch(true)
        fireEvent.change(screen.getByPlaceholderText('search.placeholder'), {target: {value: 'nord'}})
        await waitFor(() => expect(screen.getByText(/search\.evenings/)).toBeInTheDocument())
        expect(screen.getByText('Kegelbahn Nord')).toBeInTheDocument()
    })

    it('finds announcements and trips once resolved', async () => {
        await renderSearch(true)
        fireEvent.change(screen.getByPlaceholderText('search.placeholder'), {target: {value: 'fahrt'}})
        await waitFor(() => expect(screen.getByText(/search\.trips/)).toBeInTheDocument())
        expect(screen.getByText('Rhein-Fahrt')).toBeInTheDocument()
    })

    it('finds bookings (payments and expenses) once resolved, grouped under search.bookings', async () => {
        await renderSearch(true)
        fireEvent.change(screen.getByPlaceholderText('search.placeholder'), {target: {value: 'miete'}})
        await waitFor(() => expect(screen.getByText(/search\.bookings/)).toBeInTheDocument())
        expect(screen.getByText('Kegelbahn Miete')).toBeInTheDocument()
    })

    it('prefixes each result group with an icon', async () => {
        await renderSearch(true)
        fireEvent.change(screen.getByPlaceholderText('search.placeholder'), {target: {value: 'hasi'}})
        expect(screen.getByText((_, el) => el?.textContent === '🧑 search.members')).toBeInTheDocument()
        expect(screen.getByText((_, el) => el?.textContent === '👤 search.accounts')).toBeInTheDocument()
    })

    it('matches the written-out month name in the currently active locale', async () => {
        mockLocale = 'en'
        await renderSearch(true)
        fireEvent.change(screen.getByPlaceholderText('search.placeholder'), {target: {value: 'march'}})
        await waitFor(() => expect(screen.getByText(/search\.evenings/)).toBeInTheDocument())
        expect(screen.getByText('Kegelbahn Nord')).toBeInTheDocument()
    })

    it('selecting a booking result sets the treasury bookings deep-link hash', async () => {
        await renderSearch(true)
        fireEvent.change(screen.getByPlaceholderText('search.placeholder'), {target: {value: 'miete'}})
        await waitFor(() => screen.getByText('Kegelbahn Miete'))
        fireEvent.click(screen.getByText('Kegelbahn Miete'))
        expect(window.location.hash).toBe(`#treasury:bookings?q=${encodeURIComponent('Kegelbahn Miete')}`)
    })

    it('shows search.noResults for a query with no matches anywhere', async () => {
        await renderSearch(true)
        fireEvent.change(screen.getByPlaceholderText('search.placeholder'), {target: {value: 'zzzznomatch'}})
        await waitFor(() => expect(screen.getByText('search.noResults')).toBeInTheDocument())
    })

    it('selecting a member result sets the members deep-link hash and closes', async () => {
        const {onClose} = await renderSearch(true)
        fireEvent.change(screen.getByPlaceholderText('search.placeholder'), {target: {value: 'hasi'}})
        // Same name appears once under "Mitglieder" and once under "Konten" — pick the first (member).
        fireEvent.click(screen.getAllByText('Hasi')[0])
        expect(window.location.hash).toBe('#members?memberName=Hasi')
        expect(onClose).toHaveBeenCalled()
    })

    it('selecting an account result sets the treasury accounts deep-link hash', async () => {
        await renderSearch(true)
        fireEvent.change(screen.getByPlaceholderText('search.placeholder'), {target: {value: 'hasi'}})
        fireEvent.click(screen.getAllByText('Hasi')[1])
        expect(window.location.hash).toBe('#treasury:accounts?member=1')
    })

    it('selecting an evening result sets the schedule deep-link hash', async () => {
        await renderSearch(true)
        fireEvent.change(screen.getByPlaceholderText('search.placeholder'), {target: {value: 'nord'}})
        await waitFor(() => screen.getByText('Kegelbahn Nord'))
        fireEvent.click(screen.getByText('Kegelbahn Nord'))
        expect(window.location.hash).toBe('#schedule?evening=10')
    })

    it('resets the query when reopened', async () => {
        const {rerender} = await renderSearch(true)
        fireEvent.change(screen.getByPlaceholderText('search.placeholder'), {target: {value: 'hasi'}})
        expect(screen.getAllByText('Hasi').length).toBeGreaterThan(0)

        const {GlobalSearch} = await import('../GlobalSearch')
        const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
        await act(async () => {
            rerender(
                <QueryClientProvider client={qc}>
                    <GlobalSearch open={false} onClose={vi.fn()}/>
                </QueryClientProvider>
            )
        })
        await act(async () => {
            rerender(
                <QueryClientProvider client={qc}>
                    <GlobalSearch open={true} onClose={vi.fn()}/>
                </QueryClientProvider>
            )
        })
        expect((screen.getByPlaceholderText('search.placeholder') as HTMLInputElement).value).toBe('')
    })
})
