/** The new design's quick entry: the page, the capture model and the booking, with a mocked server. */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act, fireEvent, render, screen, within} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {api} from '@/api/client.ts'
import {offlineQueue} from '@/offlineQueue.ts'
import {toastError} from '@/utils/error.ts'
import {useAppStore} from '@/store/app.ts'
import {HOLD_MS} from '@/lib/capture.ts'
import {QUICK_ENTRY_EVENT, type QuickEntryEventDetail} from '@/lib/quickEntryEvents.ts'
import {TabletQuickEntryPage} from '@/pages/TabletQuickEntryPage.tsx'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key, t: (key: string) => key}))
vi.mock('@/api/client.ts', () => ({
    api: {
        addPenalty: vi.fn(), deletePenalty: vi.fn(), addDrinkRound: vi.fn(), deleteDrinkRound: vi.fn(),
        getEvening: vi.fn(),
        setActivePlayer: vi.fn(() => Promise.resolve()), finishGame: vi.fn(() => Promise.resolve()),
    },
}))
vi.mock('@/offlineQueue.ts', () => ({offlineQueue: {getAll: vi.fn(), remove: vi.fn()}}))
vi.mock('@/utils/error.ts', () => ({toastError: vi.fn()}))
vi.mock('@/hooks/useClub.ts', () => ({useThrowTracking: () => false, useAudioCallouts: () => false}))

const evening = {
    id: 42, date: '2026-01-10T00:00:00', venue: 'Stammtisch', is_closed: false, teams: [], highlights: [],
    games: [] as object[],
    players: [
        {id: 11, regular_member_id: 2, name: 'Hansi', nickname: null, is_king: false, team_id: null},
        {id: 10, regular_member_id: 1, name: 'Admin', nickname: null, is_king: false, team_id: null},
    ],
    penalty_log: [] as object[], drink_rounds: [] as object[],
}
const invalidate = vi.fn(() => Promise.resolve())
const cancelPendingItem = vi.fn(() => Promise.resolve(true))
vi.mock('@/hooks/useEvening.ts', () => ({
    useActiveEvening: () => ({evening, invalidate, cancelPendingItem}),
}))

const PENALTY_TYPES = [
    {id: 1, icon: '🚫', name: 'Gosse', default_amount: 0.1, sound_key: null},
    {id: 2, icon: '💥', name: 'Bande', default_amount: 0.5, sound_key: null},
]

const events: QuickEntryEventDetail[] = []
const collect = (e: Event) => events.push((e as CustomEvent<QuickEntryEventDetail>).detail)
const last = () => events[events.length - 1]
const onClose = vi.fn()

function open() {
    const client = new QueryClient()
    const page = () => (
        <QueryClientProvider client={client}>
            <TabletQuickEntryPage eveningId={42} players={evening.players as never} onClose={onClose}/>
        </QueryClientProvider>
    )
    const view = render(page())
    return {rerender: () => act(async () => { view.rerender(page()) })}
}

const board = () => within(screen.getByTestId('capture-board'))
const person = (name: string) => within(board().getByRole('region', {name: 'penalty.who'})).getByRole('button', {name: new RegExp(`^${name}`)})
const penalty = (name: string) => within(board().getByRole('region', {name: 'capture.penalties'})).getByRole('button', {name: new RegExp(name)})
const tap = (element: HTMLElement) => act(async () => { fireEvent.click(element) })
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const sent = () => vi.mocked(api.addPenalty).mock.calls.map(([, body]) =>
    [body.player_ids, body.penalty_type_name, body.amount])

beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    events.length = 0
    evening.penalty_log = []
    evening.drink_rounds = []
    evening.games = []
    let id = 100
    vi.mocked(api.addPenalty).mockImplementation(() => Promise.resolve([{id: ++id}] as never))
    vi.mocked(api.deletePenalty).mockResolvedValue(undefined)
    vi.mocked(api.addDrinkRound).mockResolvedValue({id: 7} as never)
    vi.mocked(offlineQueue.getAll).mockResolvedValue([])
    vi.mocked(offlineQueue.remove).mockResolvedValue(undefined)
    vi.mocked(api.getEvening).mockResolvedValue({penalty_log: [], drink_rounds: []} as never)
    cancelPendingItem.mockResolvedValue(true)
    useAppStore.setState({
        user: {id: 1, ui_design: 'new', regular_member_id: 1} as never,
        penaltyTypes: PENALTY_TYPES as never, regularMembers: [], gameTemplates: [],
    })
    window.addEventListener(QUICK_ENTRY_EVENT, collect)
})

afterEach(() => {
    window.removeEventListener(QUICK_ENTRY_EVENT, collect)
    useAppStore.setState({user: null, penaltyTypes: [], regularMembers: [], gameTemplates: []})
    vi.useRealTimers()
})

describe('quick entry — new design', () => {
    it('replaces the classic columns and lists the signed-in member first', () => {
        open()
        const people = within(board().getByRole('region', {name: 'penalty.who'})).getAllByRole('button', {pressed: false})
        expect(people.map(b => b.textContent?.slice(0, 5))).toContain('Admin')
        expect(people.findIndex(b => b.textContent?.startsWith('Admin'))).toBeLessThan(people.findIndex(b => b.textContent?.startsWith('Hansi')))
        expect(screen.getByTestId('quick-entry-tab-overview').parentElement).toHaveClass('hidden')
        expect(screen.queryByText('quickEntry.overview')).not.toBeInTheDocument()
    })

    it('books every tap for the selected person at once, also while earlier ones are still saving', async () => {
        vi.mocked(api.addPenalty).mockReturnValue(new Promise(() => {}))
        open()
        await tap(person('Hansi'))
        await tap(penalty('Gosse'))
        await tap(penalty('Gosse'))
        await tap(penalty('Bande'))
        expect(sent()).toEqual([[[11], 'Gosse', 1], [[11], 'Gosse', 1], [[11], 'Bande', 1]])
        expect(vi.mocked(api.addPenalty).mock.calls[0][1]).toMatchObject({mode: 'count', unit_amount: 0.1})
        const stamps = vi.mocked(api.addPenalty).mock.calls.map(c => c[1].client_timestamp)
        expect(new Set(stamps).size).toBe(3)
        expect(person('Hansi')).toHaveAttribute('aria-pressed', 'true')
        expect(within(screen.getByTestId('capture-status')).getAllByText('capture.saving')).toHaveLength(3)
    })

    it('lets the selection go after a pause, and then collects instead of booking', async () => {
        open()
        await tap(person('Hansi'))
        await wait(HOLD_MS - 100)
        await tap(penalty('Gosse'))  // a tap starts the pause over
        await wait(HOLD_MS - 100)
        expect(person('Hansi')).toHaveAttribute('aria-pressed', 'true')
        await wait(200)
        expect(person('Hansi')).toHaveAttribute('aria-pressed', 'false')
        await tap(penalty('Bande'))
        expect(api.addPenalty).toHaveBeenCalledTimes(1)
    })

    // Live updates, camera throws and finished saves re-render the page all the time
    it('releases the selection after the pause although the page keeps re-rendering', async () => {
        const page = open()
        await tap(person('Hansi'))
        for (let i = 0; i < 4; i++) {
            await wait(HOLD_MS / 3)
            await page.rerender()
        }
        expect(person('Hansi')).toHaveAttribute('aria-pressed', 'false')
        await tap(penalty('Gosse'))
        expect(api.addPenalty).not.toHaveBeenCalled()
    })

    it('collects penalties and saves them all with the tap on a person', async () => {
        open()
        await tap(penalty('Gosse'))
        await tap(penalty('Bande'))
        await tap(penalty('Gosse'))
        expect(api.addPenalty).not.toHaveBeenCalled()
        expect(screen.getByText('capture.unsaved')).toBeInTheDocument()
        await tap(person('Hansi'))
        expect(sent()).toEqual([[[11], 'Gosse', 2], [[11], 'Bande', 1]])
        expect(person('Hansi')).toHaveAttribute('aria-pressed', 'false')
    })

    it('asks before closing with collected penalties that are not saved', async () => {
        open()
        await tap(penalty('Gosse'))
        await tap(screen.getByRole('button', {name: 'action.close'}))
        expect(onClose).not.toHaveBeenCalled()
        expect(screen.getByText('capture.discardMessage')).toBeInTheDocument()
        await tap(within(screen.getByRole('dialog')).getByRole('button', {name: 'capture.discard'}))
        expect(onClose).toHaveBeenCalled()
    })

    it('takes a booking back from the receipt', async () => {
        open()
        await tap(person('Hansi'))
        await tap(penalty('Gosse'))
        expect(last()).toMatchObject({kind: 'penalty', title: 'Gosse', subtitle: 'Hansi'})
        await act(async () => { last().undo!() })
        expect(api.deletePenalty).toHaveBeenCalledWith(42, 101)
    })

    it('takes back a booking that is still on its way once it has arrived', async () => {
        let arrive!: (value: unknown) => void
        vi.mocked(api.addPenalty).mockReturnValue(new Promise(r => { arrive = r }) as never)
        open()
        await tap(person('Hansi'))
        await tap(penalty('Gosse'))
        await act(async () => { last().undo!() })
        expect(api.deletePenalty).not.toHaveBeenCalled()
        await act(async () => { arrive([{id: 500}]) })
        expect(api.deletePenalty).toHaveBeenCalledWith(42, 500)
    })

    it('removes an offline booking from the queue instead of asking the server', async () => {
        vi.mocked(api.addPenalty).mockResolvedValue(null as never)
        open()
        await tap(person('Hansi'))
        await tap(penalty('Gosse'))
        const stamp = vi.mocked(api.addPenalty).mock.calls[0][1].client_timestamp
        vi.mocked(offlineQueue.getAll).mockResolvedValue([
            {id: 3, method: 'POST', path: '/evening/42/penalties', body: {client_timestamp: stamp - 1}, timestamp: 0},
            {id: 4, method: 'POST', path: '/evening/42/penalties', body: {client_timestamp: stamp}, timestamp: 0},
        ])
        await act(async () => { last().undo!() })
        expect(offlineQueue.remove).toHaveBeenCalledExactlyOnceWith(4)
        expect(api.deletePenalty).not.toHaveBeenCalled()
    })

    /** Books one penalty while offline and returns its client timestamp. */
    async function bookOffline() {
        vi.mocked(api.addPenalty).mockResolvedValue(null as never)
        open()
        await tap(person('Hansi'))
        await tap(penalty('Gosse'))
        return vi.mocked(api.addPenalty).mock.calls[0][1].client_timestamp
    }

    it('asks the server for a booking the sync has sent in the meantime', async () => {
        const stamp = await bookOffline()
        vi.mocked(api.getEvening).mockResolvedValue({
            penalty_log: [{id: 899, client_timestamp: stamp - 1}, {id: 900, client_timestamp: stamp}], drink_rounds: [],
        } as never)
        await act(async () => { last().undo!() })
        expect(api.getEvening).toHaveBeenCalledWith(42)
        expect(api.deletePenalty).toHaveBeenCalledExactlyOnceWith(42, 900)
        expect(last()).toMatchObject({kind: 'undo'})
    })

    it('does not claim to have taken back what it cannot find', async () => {
        await bookOffline()
        await act(async () => { last().undo!() })
        expect(api.deletePenalty).not.toHaveBeenCalled()
        expect(toastError).toHaveBeenCalledWith(new Error('capture.undoNotFound'))
        expect(events.some(e => e.kind === 'undo')).toBe(false)
    })

    it('says so when a queued entry was sent before it could be removed', async () => {
        evening.penalty_log = [{
            id: -3000000011, player_id: 11, player_name: 'Hansi', penalty_type_name: 'Gosse', icon: '🚫',
            amount: 1, unit_amount: 0.1, mode: 'count', game_id: null, client_timestamp: Date.now(),
        }]
        cancelPendingItem.mockResolvedValue(false)
        open()
        await tap(screen.getByRole('button', {name: /capture\.remove: Hansi, Gosse/}))
        expect(toastError).toHaveBeenCalledWith(new Error('capture.alreadySent'))
        expect(events.some(e => e.kind === 'undo')).toBe(false)
    })

    it('offers a tray again to the person whose hand-out was taken back', async () => {
        open()
        await tap(board().getByRole('button', {name: /capture\.several/}))
        await tap(penalty('Gosse'))
        await tap(person('Hansi'))
        await tap(person('Hansi'))  // has it already
        expect(api.addPenalty).toHaveBeenCalledTimes(1)
        await act(async () => { last().undo!() })
        await tap(person('Hansi'))
        expect(api.addPenalty).toHaveBeenCalledTimes(2)
    })

    it('closes without asking once the collected penalties have been handed out', async () => {
        open()
        await tap(board().getByRole('button', {name: /capture\.several/}))
        await tap(penalty('Gosse'))
        await tap(person('Hansi'))
        await tap(screen.getByRole('button', {name: 'action.close'}))
        expect(onClose).toHaveBeenCalled()
    })

    it('books a drink round for everyone who was not tapped away', async () => {
        open()
        await tap(board().getByRole('button', {name: /capture\.beerRound/}))
        expect(screen.getByText('2 capture.drinkOf 2')).toBeInTheDocument()
        await tap(person('Hansi'))
        await tap(screen.getByRole('button', {name: /capture\.bookRound · 1/}))
        expect(api.addDrinkRound).toHaveBeenCalledWith(42, expect.objectContaining({drink_type: 'beer', participant_ids: [10]}))
        expect(board().getByRole('region', {name: 'capture.penalties'})).toBeInTheDocument()
    })

    it('removes a fresh entry with one tap but asks for an older one', async () => {
        const entry = {player_id: 11, player_name: 'Hansi', icon: '🚫', amount: 1, unit_amount: 0.1, mode: 'count', game_id: null}
        evening.penalty_log = [
            {...entry, id: 1, penalty_type_name: 'Gosse', client_timestamp: Date.now() - 1000},
            {...entry, id: 2, penalty_type_name: 'Bande', client_timestamp: Date.now() - 600_000},
            // from a device whose clock runs ahead
            {...entry, id: 3, player_id: 10, penalty_type_name: 'Bande', client_timestamp: Date.now() + 600_000},
        ]
        open()
        await tap(screen.getByRole('button', {name: /capture\.remove: Admin, Bande/}))
        expect(api.deletePenalty).not.toHaveBeenCalled()
        await tap(screen.getByRole('button', {name: /capture\.remove: Hansi, Gosse/}))
        expect(api.deletePenalty).toHaveBeenLastCalledWith(42, 1)
        await tap(screen.getByRole('button', {name: /capture\.remove: Hansi, Bande/}))
        expect(api.deletePenalty).toHaveBeenCalledTimes(1)
        await tap(screen.getByRole('button', {name: 'capture.confirmDelete'}))
        expect(api.deletePenalty).toHaveBeenLastCalledWith(42, 2)
    })

    it('takes game results from its own number pad', async () => {
        evening.games = [{
            id: 3, name: 'Hausnummer', status: 'running', winner_type: 'individual', turn_mode: null,
            loser_penalty: 1, per_point_penalty: 0, started_at: '2026-01-10T20:00:00', throws: [], is_deleted: false,
        }]
        open()
        await tap(screen.getByRole('button', {name: /quickEntry\.finishGame/}))
        const panel = within(screen.getByTestId('finish-panel'))
        expect(panel.queryByRole('spinbutton')).not.toBeInTheDocument()
        await tap(panel.getAllByRole('button', {name: 'Hansi'})[0])
        for (const key of ['4', '2', 'score.next', '7']) await tap(panel.getByRole('button', {name: key}))
        await tap(panel.getByRole('button', {name: /game\.finish/}))
        expect(api.finishGame).toHaveBeenCalledWith(42, 3, expect.objectContaining({
            winner_ref: 'p:11', scores: {'p:11': 42, 'p:10': 7},
        }))
    })

    it('shows the evening total beside the island', () => {
        evening.penalty_log = [{
            id: 1, player_id: 11, player_name: 'Hansi', penalty_type_name: 'Gosse', icon: '🚫',
            amount: 3, unit_amount: 0.1, mode: 'count', game_id: null, client_timestamp: 1,
        }]
        open()
        expect(screen.getByTestId('capture-total').textContent).toContain('0,30')
    })
})
