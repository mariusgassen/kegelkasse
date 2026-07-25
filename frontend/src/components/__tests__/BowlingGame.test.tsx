import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import React from 'react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {BowlingGame} from '../BowlingGame'
import {useBowlingStore} from '../../store/bowling'

const getLeaderboard = vi.fn()
const submitScore = vi.fn()
const getClub = vi.fn()
vi.mock('../../api/client', () => ({
    api: {
        getBowlingLeaderboard: () => getLeaderboard(),
        submitBowlingScore: (s: number) => submitScore(s),
        getClub: () => getClub(),
    },
}))

function renderGame(onClose = () => {}) {
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
    return render(
        <QueryClientProvider client={qc}>
            <BowlingGame onClose={onClose}/>
        </QueryClientProvider>,
    )
}

// jsdom returns a zero-size rect; stub a real lane rect so swipe coords are meaningful.
function stubCanvasRect() {
    const canvas = screen.getByTestId('bowling-canvas') as HTMLCanvasElement
    canvas.getBoundingClientRect = () =>
        ({left: 0, top: 0, width: 360, height: 620, right: 360, bottom: 620, x: 0, y: 0, toJSON: () => ({})}) as DOMRect
    return canvas
}

beforeEach(() => {
    useBowlingStore.setState({discovered: false, personalBest: 42})
    getLeaderboard.mockResolvedValue([
        {rank: 1, player_name: 'Willi', score: 21, date: null, is_me: false},
    ])
    submitScore.mockResolvedValue({leaderboard: [], rank: 1, is_record: true})
    getClub.mockResolvedValue({id: 1, name: 'Test Club', settings: {}})
})

describe('BowlingGame', () => {
    it('renders the lane canvas and the best score', () => {
        renderGame()
        expect(screen.getByTestId('bowling-canvas')).toBeInTheDocument()
        expect(screen.getByText('42')).toBeInTheDocument() // local best fallback
    })

    it('marks the Easter egg as discovered on open', () => {
        expect(useBowlingStore.getState().discovered).toBe(false)
        renderGame()
        expect(useBowlingStore.getState().discovered).toBe(true)
    })

    it('shows a swipe hint while ready', () => {
        renderGame()
        expect(screen.getByTestId('bowling-hint').textContent).toBeTruthy()
    })

    it('throws on an upward swipe (hint changes to the rolling state)', () => {
        renderGame()
        const canvas = stubCanvasRect()
        const before = screen.getByTestId('bowling-hint').textContent
        fireEvent.pointerDown(canvas, {clientX: 180, clientY: 560})
        fireEvent.pointerMove(canvas, {clientX: 185, clientY: 200})
        fireEvent.pointerUp(canvas, {clientX: 185, clientY: 200})
        expect(screen.getByTestId('bowling-hint').textContent).not.toBe(before)
    })

    it('ignores a tiny / non-upward swipe (stays ready)', () => {
        renderGame()
        const canvas = stubCanvasRect()
        const before = screen.getByTestId('bowling-hint').textContent
        fireEvent.pointerDown(canvas, {clientX: 180, clientY: 300})
        fireEvent.pointerMove(canvas, {clientX: 182, clientY: 305})
        fireEvent.pointerUp(canvas, {clientX: 182, clientY: 305})
        expect(screen.getByTestId('bowling-hint').textContent).toBe(before)
    })

    it('closes via the close button', () => {
        const onClose = vi.fn()
        renderGame(onClose)
        fireEvent.click(screen.getByLabelText('Schließen'))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('closes on Escape', () => {
        const onClose = vi.fn()
        renderGame(onClose)
        fireEvent.keyDown(window, {key: 'Escape'})
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
