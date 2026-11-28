/** Taking bookings back in the phone sheet, which offers no undo on the island. */
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act, fireEvent, render, screen, within} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {api} from '@/api/client.ts'
import {useAppStore} from '@/store/app.ts'
import {HOLD_MS} from '@/lib/capture.ts'
import {CaptureSheet} from '../CaptureSheet.tsx'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key, t: (key: string) => key}))
vi.mock('@/api/client.ts', () => ({
    api: {addPenalty: vi.fn(), deletePenalty: vi.fn(), getEvening: vi.fn()},
}))
vi.mock('@/offlineQueue.ts', () => ({offlineQueue: {getAll: vi.fn(), remove: vi.fn()}}))
vi.mock('@/utils/error.ts', () => ({toastError: vi.fn()}))
vi.mock('@/hooks/useClub.ts', () => ({useAudioCallouts: () => false}))

const evening = {
    id: 42, date: '2026-01-10T00:00:00', is_closed: false, teams: [], games: [], highlights: [],
    players: [
        {id: 11, regular_member_id: 2, name: 'Hansi', nickname: null, is_king: false, team_id: null},
        {id: 12, regular_member_id: 3, name: 'Uschi', nickname: null, is_king: false, team_id: null},
    ],
    penalty_log: [] as object[], drink_rounds: [] as object[],
}

const tap = (element: HTMLElement) => act(async () => { fireEvent.click(element) })
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const person = (name: string) =>
    within(screen.getByRole('group', {name: 'penalty.who'})).getByRole('button', {name: new RegExp(`^${name}`)})
const penalty = (name: string) => screen.getByRole('button', {name: new RegExp(`${name}.*€`)})
const footer = () => within(screen.getByTestId('capture-footer'))
const undo = () => footer().getByRole('button', {name: 'capture.undoLast'})
const removed = () => vi.mocked(api.deletePenalty).mock.calls.map(([, id]) => id).sort()

function open() {
    render(
        <QueryClientProvider client={new QueryClient()}>
            <CaptureSheet evening={evening as never} invalidate={vi.fn()} cancelPendingItem={vi.fn()}
                          onClose={vi.fn()} onCustom={vi.fn()}/>
        </QueryClientProvider>,
    )
}

beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    let id = 100
    vi.mocked(api.addPenalty).mockImplementation((_, body) =>
        Promise.resolve((body.player_ids ?? []).map(() => ({id: ++id}))) as never)
    vi.mocked(api.deletePenalty).mockResolvedValue(undefined)
    useAppStore.setState({
        user: {id: 1, ui_design: 'new', regular_member_id: 1} as never,
        penaltyTypes: [
            {id: 1, icon: '🚫', name: 'Gosse', default_amount: 0.1, sound_key: null},
            {id: 2, icon: '💥', name: 'Bande', default_amount: 0.5, sound_key: null},
        ] as never,
        regularMembers: [],
    })
})

afterEach(() => {
    useAppStore.setState({user: null, penaltyTypes: [], regularMembers: []})
    vi.useRealTimers()
})

describe('CaptureSheet — undo last', () => {
    it('is not offered before anything was booked', () => {
        open()
        expect(footer().queryByRole('button')).not.toBeInTheDocument()
    })

    it('takes back a whole collected tray after a tap on a person', async () => {
        open()
        await tap(penalty('Gosse'))
        await tap(penalty('Bande'))
        await tap(person('Hansi'))
        expect(footer().getByText(/capture\.last: Hansi · Gosse, Bande/)).toBeInTheDocument()
        await tap(undo())
        expect(removed()).toEqual([101, 102])
        expect(footer().queryByRole('button', {name: 'capture.undoLast'})).not.toBeInTheDocument()
    })

    it('takes back a penalty for everybody it was booked to', async () => {
        open()
        await tap(screen.getByRole('button', {name: 'capture.several'}))
        await tap(person('Hansi'))
        await tap(person('Uschi'))
        await tap(penalty('Gosse'))
        await tap(undo())
        expect(removed()).toEqual([101, 102])
    })

    it('stays after the selection was released, and goes back one booking at a time', async () => {
        open()
        await tap(person('Hansi'))
        await tap(penalty('Gosse'))
        await tap(penalty('Bande'))
        await wait(HOLD_MS + 100)
        expect(person('Hansi')).toHaveAttribute('aria-pressed', 'false')
        await tap(undo())
        expect(removed()).toEqual([102])
        await tap(undo())
        expect(removed()).toEqual([101, 102])
    })

    it('ignores a second tap while it is still taking the booking back', async () => {
        let done!: () => void
        vi.mocked(api.deletePenalty).mockReturnValue(new Promise<void>(r => { done = r }) as never)
        open()
        await tap(person('Hansi'))
        await tap(penalty('Gosse'))
        await tap(penalty('Bande'))
        await tap(undo())
        await tap(undo())
        expect(removed()).toEqual([102])
        await act(async () => { done() })
        expect(undo()).toBeEnabled()
    })

    it('can take back a handed-out tray while it is still collected', async () => {
        open()
        await tap(screen.getByRole('button', {name: 'capture.several'}))
        await tap(penalty('Gosse'))
        await tap(person('Hansi'))
        await tap(undo())
        expect(removed()).toEqual([101])
        await tap(person('Hansi'))
        expect(api.addPenalty).toHaveBeenCalledTimes(2)
    })
})
