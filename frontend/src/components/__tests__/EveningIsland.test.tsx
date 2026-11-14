import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, act} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import type {Evening} from '@/types.ts'
import 'fake-indexeddb/auto'

vi.mock('@/i18n', () => ({
    useT: () => (key: string) => key,
    t: (key: string) => key,
}))
vi.mock('@/router', () => ({router: {navigate: vi.fn(() => Promise.resolve())}}))
vi.mock('@/api/client.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/api/client.ts')>()
    return {
        ...actual,
        api: {
            ...actual.api,
            getEvening: vi.fn(),
            confirmPaymentRequest: vi.fn(() => Promise.resolve({})),
            rejectPaymentRequest: vi.fn(() => Promise.resolve({})),
        },
        flushOfflineQueue: vi.fn(() => Promise.resolve({applied: 1, errors: 0})),
    }
})

import EveningIsland, {elapsedLabel, UPLOAD_STATUS_EVENT} from '../evening/EveningIsland'
import {CELEBRATE_EVENT, type CelebrateDetail} from '@/lib/celebrate.ts'
import {announceQuickEntryEvent} from '@/lib/quickEntryEvents.ts'
import type {UploadStatusDetail} from '@/api/client.ts'
import {useNotificationStore} from '@/store/notifications.ts'

function evening(overrides: Partial<Evening> = {}): Evening {
    return {
        id: 7, date: '2026-07-23', venue: 'Bahn 1', note: null, is_closed: false, ended_at: null,
        season_closed: false, players: [], teams: [], penalty_log: [], games: [], drink_rounds: [],
        highlights: [], ...overrides,
    }
}

function renderIsland(data?: Evening, eveningId: number | null = 7) {
    const qc = new QueryClient()
    if (data) qc.setQueryData(['evening', 7], data)
    return render(
        <QueryClientProvider client={qc}>
            <EveningIsland eveningId={eveningId} backdrop="#1a1410"/>
        </QueryClientProvider>,
    )
}

describe('EveningIsland', () => {
    beforeEach(() => {
        useNotificationStore.setState({notifications: []})
    })

    it('renders the idle capsule at rest when no activity is running', async () => {
        renderIsland(undefined, null)
        await act(async () => {})
        expect(screen.getByRole('region', {name: 'Live'})).toBeTruthy()
        expect(screen.queryByRole('button', {name: /island\.label/})).toBeNull()
    })

    it('announces the running evening as a live activity', async () => {
        renderIsland(evening())
        await act(async () => {})
        expect(screen.getByRole('button', {name: /island\.label/})).toBeTruthy()
    })

    it('shows no evening activity for a closed evening', async () => {
        renderIsland(evening({is_closed: true}))
        await act(async () => {})
        expect(screen.queryByRole('button', {name: /island\.label/})).toBeNull()
    })

    it('shows a celebration alert when CELEBRATE_EVENT fires', async () => {
        const {container} = renderIsland(undefined, null)
        await act(async () => {
            window.dispatchEvent(new CustomEvent<CelebrateDetail>(CELEBRATE_EVENT, {
                detail: {kind: 'allnine', message: 'Alle Neune!'},
            }))
        })
        expect(screen.getAllByText('Alle Neune!').length).toBeGreaterThan(0)
        expect(container.querySelector('[data-presentation="expanded"]')).toBeTruthy()
    })

    it('shows an upload activity while a media file is uploading', async () => {
        renderIsland(undefined, null)
        await act(async () => {
            window.dispatchEvent(new CustomEvent<UploadStatusDetail>(UPLOAD_STATUS_EVENT, {
                detail: {active: 1, fileName: 'team.jpg', status: 'uploading'},
            }))
        })
        expect(screen.getByRole('button', {name: /island\.upload.*team\.jpg/})).toBeTruthy()
    })

    it('shows a payment-request approval activity for unread payment request notifications', async () => {
        useNotificationStore.setState({
            notifications: [{
                id: 'n1',
                title: 'Zahlungsanfrage',
                body: 'Max: 15 €',
                url: '/#treasury:accounts?rid=42',
                receivedAt: new Date().toISOString(),
                read: false,
            }],
        })
        renderIsland(undefined, null)
        await act(async () => {})
        expect(screen.getByRole('button', {name: /Zahlungsanfrage: Max: 15 €/})).toBeTruthy()
    })

    it('shows a quick-entry booking activity when announceQuickEntryEvent fires', async () => {
        renderIsland(evening())
        await act(async () => {
            announceQuickEntryEvent({
                kind: 'penalty',
                icon: '🧱',
                title: 'Pudelkönig',
                subtitle: 'Hans',
                badge: '+0,50 €',
            })
        })
        expect(screen.getByRole('button', {name: /Pudelkönig.*Hans.*\+0,50 €/})).toBeTruthy()
    })
})

describe('elapsedLabel', () => {
    const start = '2026-07-23T20:00:00Z'
    const at = (sec: number) => Date.parse(start) + sec * 1000
    it('formats m:ss and h:mm:ss', () => {
        expect(elapsedLabel(start, at(5))).toBe('0:05')
        expect(elapsedLabel(start, at(65))).toBe('1:05')
        expect(elapsedLabel(start, at(3725))).toBe('1:02:05')
    })
    it('never goes negative and tolerates missing/invalid starts', () => {
        expect(elapsedLabel(start, at(-30))).toBe('0:00')
        expect(elapsedLabel(null, at(5))).toBeNull()
        expect(elapsedLabel('nope', at(5))).toBeNull()
    })
})
