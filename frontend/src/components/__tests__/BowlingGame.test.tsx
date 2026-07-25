import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import React from 'react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {BowlingGame} from '../BowlingGame'
import {useBowlingStore} from '../../store/bowling'

const getLeaderboard = vi.fn()
const submitScore = vi.fn()
vi.mock('../../api/client', () => ({
    api: {
        getBowlingLeaderboard: () => getLeaderboard(),
        submitBowlingScore: (s: number) => submitScore(s),
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

beforeEach(() => {
    useBowlingStore.setState({discovered: false, personalBest: 42})
    getLeaderboard.mockResolvedValue([
        {rank: 1, player_name: 'Willi', score: 21, date: null, is_me: false},
    ])
    submitScore.mockResolvedValue({leaderboard: [], rank: 1, is_record: true})
})

describe('BowlingGame', () => {
    it('renders the lane canvas and a scoreboard', () => {
        renderGame()
        expect(screen.getByTestId('bowling-canvas')).toBeInTheDocument()
        // Falls back to the local personal best until the club leaderboard resolves.
        expect(screen.getByText('42')).toBeInTheDocument()
    })

    it('marks the Easter egg as discovered on open', () => {
        expect(useBowlingStore.getState().discovered).toBe(false)
        renderGame()
        expect(useBowlingStore.getState().discovered).toBe(true)
    })

    it('advances aim → power on the first tap (power meter appears)', () => {
        renderGame()
        expect(screen.queryByTestId('bowling-power')).not.toBeInTheDocument()
        fireEvent.click(screen.getByTestId('bowling-canvas'))
        expect(screen.getByTestId('bowling-power')).toBeInTheDocument()
    })

    it('launches on the second tap (power meter disappears once rolling)', () => {
        renderGame()
        const canvas = screen.getByTestId('bowling-canvas')
        fireEvent.click(canvas) // → power
        fireEvent.click(canvas) // → rolling
        expect(screen.queryByTestId('bowling-power')).not.toBeInTheDocument()
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
