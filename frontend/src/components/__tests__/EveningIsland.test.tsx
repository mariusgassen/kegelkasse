import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen, act, fireEvent} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import type {Evening, ScheduledEvening, User} from '@/types.ts'
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
            getPaymentRequests: vi.fn(() => Promise.resolve([])),
            confirmPaymentRequest: vi.fn(() => Promise.resolve({})),
            rejectPaymentRequest: vi.fn(() => Promise.resolve({})),
            listScheduledEvenings: vi.fn(() => Promise.resolve([])),
            getMyBalance: vi.fn(() => Promise.resolve({
                regular_member_id: null, penalty_total: null, payments_total: null, balance: null,
            })),
            getReminderSettings: vi.fn(() => Promise.resolve({
                debt_weekly: {enabled: false},
                upcoming_evening: {enabled: false, days_before: 5},
                rsvp_reminder: {enabled: false, days_before: 3},
                debt_day_of: {enabled: false},
                payment_request_nudge: {enabled: false},
                auto_report: {enabled: false},
            })),
            setRsvp: vi.fn(() => Promise.resolve({status: 'attending'})),
            startGame: vi.fn(() => Promise.resolve()),
        },
        flushOfflineQueue: vi.fn(() => Promise.resolve({applied: 1, errors: 0})),
    }
})

const throwTrackingMock = vi.fn(() => true)
vi.mock('@/hooks/useClub.ts', () => ({
    useThrowTracking: () => throwTrackingMock(),
}))

import EveningIsland, {elapsedLabel, UPLOAD_STATUS_EVENT} from '../evening/EveningIsland'
import {CELEBRATE_EVENT, type CelebrateDetail} from '@/lib/celebrate.ts'
import {announceQuickEntryEvent} from '@/lib/quickEntryEvents.ts'
import {api, type UploadStatusDetail} from '@/api/client.ts'
import {router} from '@/router'
import {useAppStore} from '@/store/app.ts'
import {useIdleIslandStore} from '@/store/idleIsland.ts'

function localDatePlusDays(days: number, time = '19:30'): string {
    const d = new Date()
    d.setDate(d.getDate() + days)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}T${time}`
}

const mockUser: User = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    username: 'test',
    role: 'member',
    club_id: 1,
    preferred_locale: 'de',
    avatar: null,
    regular_member_id: 10,
}

function evening(overrides: Partial<Evening> = {}): Evening {
    return {
        id: 7, date: '2026-07-23', venue: 'Bahn 1', note: null, is_closed: false, ended_at: null,
        season_closed: false, players: [], teams: [], penalty_log: [], games: [], drink_rounds: [],
        highlights: [], ...overrides,
    }
}

function scheduled(overrides: Partial<ScheduledEvening> = {}): ScheduledEvening {
    return {
        id: 5,
        scheduled_at: localDatePlusDays(2),
        venue: 'Gasthaus Krone',
        note: null,
        created_at: null,
        attending_count: 6,
        absent_count: 1,
        my_rsvp: null,
        guests: [],
        evening_id: null,
        guest_requests_enabled: true,
        ...overrides,
    }
}

function renderIsland(
    data?: Evening,
    eveningId: number | null = 7,
    seed?: (qc: QueryClient) => void,
) {
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
    if (data) qc.setQueryData(['evening', 7], data)
    qc.setQueryData(['reminder-settings'], {
        debt_weekly: {enabled: false},
        upcoming_evening: {enabled: false, days_before: 5},
        rsvp_reminder: {enabled: false, days_before: 3},
        debt_day_of: {enabled: false},
        payment_request_nudge: {enabled: false},
        auto_report: {enabled: false},
    })
    seed?.(qc)
    return render(
        <QueryClientProvider client={qc}>
            <EveningIsland eveningId={eveningId} backdrop="#1a1410"/>
        </QueryClientProvider>,
    )
}

describe('EveningIsland', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        throwTrackingMock.mockReturnValue(true)
        useAppStore.setState({user: null})
        useIdleIslandStore.getState().awaken()
    })

    afterEach(() => {
        useAppStore.setState({user: null})
        useIdleIslandStore.getState().awaken()
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

    it('shows the active player when throw tracking is enabled and omits them when disabled', async () => {
        const {fireEvent} = await import('@testing-library/react')
        const data = evening({
            players: [{
                id: 1, name: 'Hans', nickname: 'Hansi', regular_member_id: null,
                team_id: null, is_king: false,
            }],
            games: [{
                id: 10, name: 'Tannenbaum', template_id: null, is_opener: false,
                winner_type: 'individual', turn_mode: 'alternating', winner_ref: null,
                winner_name: null, scores: {}, loser_penalty: 0, per_point_penalty: 0,
                note: null, sort_order: 0, status: 'running', started_at: null,
                finished_at: null, client_timestamp: 0, active_player_id: 1, throws: [],
            }],
        })
        const {unmount} = renderIsland(data)
        await act(async () => {})
        fireEvent.keyDown(screen.getByRole('button', {name: /island\.label/}), {key: 'Enter'})
        expect(screen.getAllByText(/Tannenbaum · Hansi/).length).toBeGreaterThan(0)
        unmount()

        throwTrackingMock.mockReturnValue(false)
        renderIsland(data)
        await act(async () => {})
        fireEvent.keyDown(screen.getByRole('button', {name: /island\.label/}), {key: 'Enter'})
        expect(screen.getAllByText('Tannenbaum').length).toBeGreaterThan(0)
        expect(screen.queryByText(/Hansi/)).toBeNull()
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

    it('does not repeat the crown emoji in a king celebration', async () => {
        renderIsland(undefined, null)
        await act(async () => {
            window.dispatchEvent(new CustomEvent<CelebrateDetail>(CELEBRATE_EVENT, {
                detail: {kind: 'king', message: '👑 König!'},
            }))
        })
        expect(screen.getAllByText('König!').length).toBeGreaterThan(0)
        expect(screen.queryByText('👑')).toBeNull()
        expect(screen.queryByText('👑 König!')).toBeNull()
    })

    it('hides the idle island while a payment-request activity is on show', async () => {
        useAppStore.setState({user: {...mockUser, role: 'admin'}})
        renderIsland(undefined, null, (qc) => qc.setQueryData(['payment-requests'], [{id: 42, regular_member_id: 3, member_name: 'Max', amount: 15, note: null, status: 'pending', created_at: null, resolved_at: null}]))
        await act(async () => {})
        expect(screen.getByRole('button', {name: /paymentRequest\.pendingTitle: Max/})).toBeTruthy()
        expect(screen.queryByRole('button', {name: /island\.idle/})).toBeNull()
    })

    it('drops an already visible idle island when a payment request arrives later', async () => {
        useAppStore.setState({user: {...mockUser, role: 'admin'}})
        let client!: QueryClient
        renderIsland(undefined, null, (qc) => { client = qc })
        await act(async () => {})
        expect(screen.queryByRole('button', {name: /paymentRequest\.pendingTitle/})).toBeNull()
        await act(async () => {
            vi.mocked(api.getPaymentRequests).mockResolvedValue([{id: 42, regular_member_id: 3, member_name: 'Max', amount: 15, note: null, status: 'pending', created_at: null, resolved_at: null}])
            await client.invalidateQueries({queryKey: ['payment-requests']})
        })
        expect(await screen.findByRole('button', {name: /paymentRequest\.pendingTitle: Max/})).toBeTruthy()
        expect(screen.queryByRole('button', {name: /island\.idle|island\.nextEvening|profile\.myBalance/})).toBeNull()
    })

    it('shows no payment-request activity for non-admins or when nothing is pending', async () => {
        useAppStore.setState({user: mockUser})
        renderIsland(undefined, null, (qc) => qc.setQueryData(['payment-requests'], [
            {id: 1, regular_member_id: 3, member_name: 'Max', amount: 15, note: null, status: 'confirmed', created_at: null, resolved_at: null},
        ]))
        await act(async () => {})
        expect(screen.queryByRole('button', {name: /paymentRequest\.pendingTitle/})).toBeNull()
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

    it('shows a payment-request approval activity for open payment requests (admin)', async () => {
        useAppStore.setState({user: {...mockUser, role: 'admin'}})
        renderIsland(undefined, null, (qc) => qc.setQueryData(['payment-requests'], [{id: 42, regular_member_id: 3, member_name: 'Max', amount: 15, note: null, status: 'pending', created_at: null, resolved_at: null}]))
        await act(async () => {})
        expect(screen.getByRole('button', {name: /paymentRequest\.pendingTitle: Max/})).toBeTruthy()
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

    it('shows the next scheduled evening in idle mode and supports 1-tap RSVP', async () => {
        useAppStore.setState({user: mockUser})
        renderIsland(undefined, null, (qc) => {
            qc.setQueryData(['schedule'], [scheduled()])
            qc.setQueryData(['my-balance'], {
                regular_member_id: 10, penalty_total: 20, payments_total: 10, balance: -10,
            })
        })
        await act(async () => {})

        const pill = screen.getByRole('button', {name: /island\.nextEvening.*Gasthaus Krone/})
        expect(pill).toBeTruthy()

        await act(async () => {
            fireEvent.keyDown(pill, {key: 'Enter'})
        })
        const acceptBtn = await screen.findByRole('button', {name: 'home.rsvp.accept'})
        await act(async () => {
            fireEvent.click(acceptBtn)
        })
        expect(api.setRsvp).toHaveBeenCalledWith(5, 'attending')
    })

    it('falls back to personal balance & account details when logged in with no upcoming evening', async () => {
        useAppStore.setState({user: mockUser})
        const openEvents: CustomEvent[] = []
        const onOpen = (e: Event) => openEvents.push(e as CustomEvent)
        window.addEventListener('kegelkasse:open-profile', onOpen)
        try {
            renderIsland(undefined, null, (qc) => {
                qc.setQueryData(['schedule'], [])
                qc.setQueryData(['my-balance'], {
                    regular_member_id: 10, penalty_total: 5, payments_total: 15, balance: 10,
                })
            })
            await act(async () => {})

            const pill = screen.getByRole('button', {name: /profile\.myBalance.*\+10,00 €/})
            expect(pill).toBeTruthy()

            await act(async () => {
                fireEvent.keyDown(pill, {key: 'Enter'})
            })
            expect(await screen.findByText(/treasury\.penaltiesLabel.*treasury\.paidLabel/)).toBeTruthy()

            const profileBtn = await screen.findByRole('button', {name: 'profile.myBalance'})
            await act(async () => {
                fireEvent.click(profileBtn)
            })
            expect(openEvents.length).toBe(1)

            await act(async () => {
                fireEvent.keyDown(pill, {key: 'Enter'})
            })
            const treasuryBtn = await screen.findByRole('button', {name: 'nav.treasury'})
            await act(async () => {
                fireEvent.click(treasuryBtn)
            })
            expect(router.navigate).toHaveBeenCalledWith({
                to: '/treasury',
                search: {tab: 'accounts', member: 10},
            })
        } finally {
            window.removeEventListener('kegelkasse:open-profile', onOpen)
        }
    })

    it('shows the account shortcut fallback when neither upcoming evening nor member balance exists', async () => {
        useAppStore.setState({user: {...mockUser, name: 'Admin', regular_member_id: null}})
        renderIsland(undefined, null, (qc) => {
            qc.setQueryData(['schedule'], [])
        })
        await act(async () => {})

        const pill = screen.getByRole('button', {name: /island\.idleShort.*island\.idleHint/})
        expect(pill).toBeTruthy()
        await act(async () => {
            fireEvent.keyDown(pill, {key: 'Enter'})
        })
        expect(await screen.findByText('Admin')).toBeTruthy()
    })

    it('starts a queued open game directly from expanded evening when no game is running', async () => {
        renderIsland(evening({
            teams: [{id: 1, name: 'Rot'}],
            players: [{id: 1, name: 'Max', nickname: null, regular_member_id: null, team_id: 1, is_king: false}],
            games: [{
                id: 9, name: 'Sarg', template_id: null, is_opener: false, winner_type: 'team',
                turn_mode: null, winner_ref: null, winner_name: null, scores: {}, loser_penalty: 0,
                per_point_penalty: 0, note: null, sort_order: 0, status: 'open', started_at: null,
                finished_at: null, client_timestamp: 0, active_player_id: null, throws: [],
            }],
        }))
        await act(async () => {})

        const pill = screen.getByRole('button', {name: /island\.label/})
        await act(async () => {
            fireEvent.keyDown(pill, {key: 'Enter'})
        })

        const startBtn = await screen.findByRole('button', {name: '▶ Sarg'})
        await act(async () => {
            fireEvent.click(startBtn)
        })
        expect(api.startGame).toHaveBeenCalledWith(7, 9)
    })

    it('navigates to games tab from expanded evening when no queued game can be started', async () => {
        renderIsland(evening())
        await act(async () => {})

        const pill = screen.getByRole('button', {name: /island\.label/})
        await act(async () => {
            fireEvent.keyDown(pill, {key: 'Enter'})
        })

        const startBtn = await screen.findByRole('button', {name: 'island.startGame'})
        await act(async () => {
            fireEvent.click(startBtn)
        })
        expect(router.navigate).toHaveBeenCalledWith({to: '/evening', search: {tab: 'games'}})
    })

    it('prevents default on pointerdown and contextmenu to avoid text selection on long press', async () => {
        renderIsland(evening())
        await act(async () => {})

        const pill = screen.getByRole('button', {name: /island\.label/})
        const pointerDown = new MouseEvent('pointerdown', {bubbles: true, cancelable: true, button: 0})
        await act(async () => {
            pill.dispatchEvent(pointerDown)
        })
        expect(pointerDown.defaultPrevented).toBe(true)

        const contextMenu = new MouseEvent('contextmenu', {bubbles: true, cancelable: true})
        await act(async () => {
            pill.dispatchEvent(contextMenu)
        })
        expect(contextMenu.defaultPrevented).toBe(true)
    })

    it('clearly indicates in compact pill when an evening is running without an active game', async () => {
        const {unmount} = renderIsland(evening())
        await act(async () => {})
        expect(screen.getByRole('button', {name: /island\.label.*island\.noGame/})).toBeTruthy()
        unmount()

        renderIsland(evening({
            games: [{
                id: 10, name: 'Sarg', template_id: null, is_opener: false,
                winner_type: 'team', turn_mode: null, winner_ref: null, winner_name: null,
                scores: {}, loser_penalty: 0, per_point_penalty: 0, note: null, sort_order: 0,
                status: 'running', started_at: null, finished_at: null, client_timestamp: 0,
                active_player_id: null, throws: [],
            }],
        }))
        await act(async () => {})
    })

    it('falls back to balance when the next scheduled evening is further ahead than club reminder days', async () => {
        useAppStore.setState({user: mockUser})
        renderIsland(undefined, null, (qc) => {
            qc.setQueryData(['schedule'], [scheduled({scheduled_at: localDatePlusDays(25)})])
            qc.setQueryData(['my-balance'], {
                regular_member_id: 10, penalty_total: 10, payments_total: 20, balance: 10,
            })
        })
        await act(async () => {})

        expect(screen.queryByRole('button', {name: /island\.nextEvening/})).toBeNull()
        expect(screen.getByRole('button', {name: /profile\.myBalance.*\+10,00 €/})).toBeTruthy()
    })

    it('dismisses idle island from expanded view and awakens when another island event occurs', async () => {
        useAppStore.setState({user: mockUser})
        renderIsland(undefined, null, (qc) => {
            qc.setQueryData(['schedule'], [])
            qc.setQueryData(['my-balance'], {
                regular_member_id: 10, penalty_total: 5, payments_total: 15, balance: 10,
            })
        })
        await act(async () => {})

        const pill = screen.getByRole('button', {name: /profile\.myBalance.*\+10,00 €/})
        await act(async () => {
            fireEvent.keyDown(pill, {key: 'Enter'})
        })
        const dismissBtn = await screen.findByRole('button', {name: 'island.dismiss'})
        await act(async () => {
            fireEvent.click(dismissBtn)
        })

        expect(useIdleIslandStore.getState().dismissed).toBe(true)
        expect(screen.queryByRole('button', {name: /profile\.myBalance/})).toBeNull()

        // Another island event (e.g. celebration or quick entry) awakens the idle status again
        await act(async () => {
            announceQuickEntryEvent({
                kind: 'penalty',
                icon: '🧱',
                title: 'Pudelkönig',
                subtitle: 'Hans',
                badge: '+0,50 €',
            })
        })
        expect(useIdleIslandStore.getState().dismissed).toBe(false)
    })

    it('dismisses idle island on horizontal swipe across compact pill', async () => {
        useAppStore.setState({user: mockUser})
        renderIsland(undefined, null, (qc) => {
            qc.setQueryData(['schedule'], [scheduled()])
            qc.setQueryData(['my-balance'], {
                regular_member_id: 10, penalty_total: 5, payments_total: 15, balance: 10,
            })
        })
        await act(async () => {})

        const pill = screen.getByRole('button', {name: /island\.nextEvening.*Gasthaus Krone/})
        await act(async () => {
            pill.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true, cancelable: true, button: 0, clientX: 120, clientY: 20}))
            window.dispatchEvent(new MouseEvent('pointermove', {bubbles: true, clientX: 170, clientY: 22}))
            window.dispatchEvent(new MouseEvent('pointerup', {bubbles: true, clientX: 170, clientY: 22}))
        })

        expect(useIdleIslandStore.getState().dismissed).toBe(true)
        expect(useIdleIslandStore.getState().dismissedScheduleId).toBe(5)
        expect(screen.queryByRole('button', {name: /island\.nextEvening/})).toBeNull()
    })

    it('brings the idle island back when the empty island is swiped sideways', async () => {
        useAppStore.setState({user: mockUser})
        useIdleIslandStore.getState().dismiss(5)
        renderIsland(undefined, null, (qc) => {
            qc.setQueryData(['schedule'], [scheduled()])
            qc.setQueryData(['my-balance'], {
                regular_member_id: 10, penalty_total: 5, payments_total: 15, balance: 10,
            })
        })
        await act(async () => {})
        expect(screen.queryByRole('button', {name: /island\.nextEvening/})).toBeNull()

        const pill = document.querySelector('[data-islandcn-hit="pill"]') as HTMLElement
        await act(async () => {
            pill.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true, cancelable: true, button: 0, clientX: 120, clientY: 20}))
            window.dispatchEvent(new MouseEvent('pointermove', {bubbles: true, clientX: 170, clientY: 22}))
            window.dispatchEvent(new MouseEvent('pointerup', {bubbles: true, clientX: 170, clientY: 22}))
        })

        expect(useIdleIslandStore.getState().dismissed).toBe(false)
        expect(screen.getByRole('button', {name: /island\.nextEvening/})).toBeTruthy()
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
