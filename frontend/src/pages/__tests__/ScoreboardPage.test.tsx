import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen, waitFor, act} from '@testing-library/react'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))

const celebrateMock = vi.fn()
vi.mock('@/lib/celebrate', () => ({celebrate: (...a: unknown[]) => celebrateMock(...a)}))

vi.mock('@/api/client', () => ({api: {getScoreboard: vi.fn()}}))

import {api} from '@/api/client'
import {ScoreboardPage} from '../ScoreboardPage'
import type {ScoreboardData, ScoreboardEvening, ScoreboardGame} from '@/lib/scoreboard'

// jsdom has no EventSource; the page only uses it as an extra nudge on top of its poll.
class FakeEventSource {
    onmessage: ((e: MessageEvent) => void) | null = null
    close = vi.fn()
    constructor(public url: string) { instances.push(this) }
}
let instances: FakeEventSource[] = []

function game(over: Partial<ScoreboardGame> = {}): ScoreboardGame {
    return {
        id: 1, name: 'Eröffnung', is_opener: true, turn_mode: 'alternating',
        active_player: {id: 1, name: 'Rudi'}, next_player: {id: 2, name: 'Grete'},
        throws: [], standings: [], ...over,
    }
}

function evening(over: Partial<ScoreboardEvening> = {}): ScoreboardEvening {
    return {
        id: 1, date: '2026-07-23', venue: 'Kegelstube', player_count: 4, game: null, last_result: null,
        penalty_ranking: [], drinks: {beer: 0, shots: 0, per_player: []}, king: null, highlight: null,
        totals: {penalty_euro: 0, games_finished: 0, games_total: 0}, ...over,
    }
}

function payload(ev: ScoreboardEvening | null, over: Partial<ScoreboardData> = {}): ScoreboardData {
    return {
        club: {name: 'KC Testhausen', logo_url: null, primary_color: '#e8a020', secondary_color: '#6b7c5a'},
        throw_tracking: true,
        evening: ev,
        ...over,
    }
}

beforeEach(() => {
    instances = []
    celebrateMock.mockClear()
    vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
})

async function renderPage(data: ScoreboardData) {
    vi.mocked(api.getScoreboard).mockResolvedValue(data)
    render(<ScoreboardPage token="tok"/>)
    await screen.findByTestId('scoreboard')
}

describe('ScoreboardPage', () => {
    it('shows a loading state before the first payload arrives', () => {
        vi.mocked(api.getScoreboard).mockReturnValue(new Promise(() => {}))
        render(<ScoreboardPage token="tok"/>)
        expect(screen.getByText('error.connecting')).toBeInTheDocument()
    })

    it('explains a rotated or mistyped link instead of showing an empty board', async () => {
        vi.mocked(api.getScoreboard).mockRejectedValue(new Error('invalid-token'))
        render(<ScoreboardPage token="stale"/>)
        expect(await screen.findByText('scoreboard.invalidToken')).toBeInTheDocument()
    })

    it('shows the club name and evening header', async () => {
        await renderPage(payload(evening()))
        expect(screen.getByText('KC Testhausen')).toBeInTheDocument()
        expect(screen.getByText(/Kegelstube/)).toBeInTheDocument()
    })

    it('shows the idle screen when no evening is running', async () => {
        await renderPage(payload(null))
        expect(screen.getByText('scoreboard.idle')).toBeInTheDocument()
    })

    it('shows whose turn it is and who is next', async () => {
        await renderPage(payload(evening({game: game()})))
        expect(screen.getByTestId('scoreboard-active')).toHaveTextContent('Rudi')
        expect(screen.getByText(/Grete/)).toBeInTheDocument()
    })

    it('shows the running game throw history', async () => {
        const throws = [
            {id: 1, throw_num: 1, pins: 7, player_id: 1, player_name: 'Rudi'},
            {id: 2, throw_num: 2, pins: 9, player_id: 2, player_name: 'Grete'},
        ]
        await renderPage(payload(evening({game: game({throws})})))
        expect(screen.getByText('scoreboard.throws')).toBeInTheDocument()
        expect(screen.getByText('7')).toBeInTheDocument()
        expect(screen.getByText('9')).toBeInTheDocument()
    })

    it('hides the throw history when the club turned throw tracking off', async () => {
        const throws = [{id: 1, throw_num: 1, pins: 7, player_id: 1, player_name: 'Rudi'}]
        await renderPage(payload(evening({game: game({throws})}), {throw_tracking: false}))
        expect(screen.queryByText('scoreboard.throws')).not.toBeInTheDocument()
    })

    it('shows the last result when no game is running', async () => {
        await renderPage(payload(evening({last_result: {name: 'Schere', winner_name: 'Grete'}})))
        expect(screen.getByText('scoreboard.noGame')).toBeInTheDocument()
        expect(screen.getByText(/Grete/)).toBeInTheDocument()
    })

    it('shows the king in the header', async () => {
        await renderPage(payload(evening({king: {name: 'Rudi'}})))
        expect(screen.getByText('Rudi')).toBeInTheDocument()
    })

    it('opens on the penalty ranking panel', async () => {
        await renderPage(payload(evening({penalty_ranking: [{name: 'Rudi', amount: 4.5}]})))
        expect(await screen.findByTestId('scoreboard-panel-ranking')).toBeInTheDocument()
        expect(screen.getByText('Rudi')).toBeInTheDocument()
    })

    it('says so when there is nothing to rotate through yet', async () => {
        await renderPage(payload(evening()))
        expect(screen.getByText('scoreboard.nothingYet')).toBeInTheDocument()
    })

    it('rotates to the next standings panel', async () => {
        vi.useFakeTimers({shouldAdvanceTime: true})
        const data = payload(evening({
            penalty_ranking: [{name: 'Rudi', amount: 4.5}],
            drinks: {beer: 2, shots: 0, per_player: [{name: 'Grete', count: 2}]},
        }))
        vi.mocked(api.getScoreboard).mockResolvedValue(data)
        render(<ScoreboardPage token="tok"/>)
        await waitFor(() => expect(screen.getByTestId('scoreboard-panel-ranking')).toBeInTheDocument())
        await act(async () => { await vi.advanceTimersByTimeAsync(12_500) })
        expect(screen.getByTestId('scoreboard-panel-drinks')).toBeInTheDocument()
    })

    it('does not celebrate history present in the very first payload', async () => {
        const throws = [{id: 1, throw_num: 1, pins: 9, player_id: 1, player_name: 'Rudi'}]
        await renderPage(payload(evening({game: game({throws}), king: {name: 'Rudi'}})))
        expect(celebrateMock).not.toHaveBeenCalled()
        expect(screen.queryByTestId('scoreboard-celebration')).not.toBeInTheDocument()
    })

    it('takes over the screen when a nine lands after the board is live', async () => {
        vi.useFakeTimers({shouldAdvanceTime: true})
        vi.mocked(api.getScoreboard).mockResolvedValue(payload(evening({game: game()})))
        render(<ScoreboardPage token="tok"/>)
        await waitFor(() => expect(screen.getByTestId('scoreboard')).toBeInTheDocument())

        const throws = [{id: 5, throw_num: 5, pins: 9, player_id: 2, player_name: 'Grete'}]
        vi.mocked(api.getScoreboard).mockResolvedValue(payload(evening({game: game({throws})})))
        await act(async () => { await vi.advanceTimersByTimeAsync(6_500) })

        expect(screen.getByTestId('scoreboard-celebration')).toBeInTheDocument()
        expect(screen.getByText('scoreboard.allNine')).toBeInTheDocument()
        expect(celebrateMock).toHaveBeenCalledWith('allnine', 'celebration.allnine')
    })

    it('clears the celebration takeover again', async () => {
        vi.useFakeTimers({shouldAdvanceTime: true})
        vi.mocked(api.getScoreboard).mockResolvedValue(payload(evening()))
        render(<ScoreboardPage token="tok"/>)
        await waitFor(() => expect(screen.getByTestId('scoreboard')).toBeInTheDocument())

        vi.mocked(api.getScoreboard).mockResolvedValue(payload(evening({king: {name: 'Rudi'}})))
        await act(async () => { await vi.advanceTimersByTimeAsync(6_500) })
        expect(screen.getByTestId('scoreboard-celebration')).toBeInTheDocument()
        expect(celebrateMock).toHaveBeenCalledWith('king', 'celebration.king')

        await act(async () => { await vi.advanceTimersByTimeAsync(6_500) })
        expect(screen.queryByTestId('scoreboard-celebration')).not.toBeInTheDocument()
    })

    it('subscribes to the public SSE stream and refetches on a nudge', async () => {
        await renderPage(payload(evening()))
        expect(instances).toHaveLength(1)
        expect(instances[0].url).toBe('/api/v1/scoreboard/tok/events')

        vi.mocked(api.getScoreboard).mockClear()
        vi.mocked(api.getScoreboard).mockResolvedValue(payload(evening({king: {name: 'Rudi'}})))
        await act(async () => { instances[0].onmessage?.(new MessageEvent('message', {data: 'updated'})) })
        await waitFor(() => expect(api.getScoreboard).toHaveBeenCalled())
    })
})
