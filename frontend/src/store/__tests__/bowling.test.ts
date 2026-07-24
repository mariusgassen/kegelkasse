import {describe, it, expect, beforeEach} from 'vitest'
import {useBowlingStore} from '../bowling'

function reset() {
    useBowlingStore.setState({highScore: 0})
    localStorage.clear()
}

describe('useBowlingStore', () => {
    beforeEach(reset)

    it('defaults the high score to 0', () => {
        expect(useBowlingStore.getState().highScore).toBe(0)
    })

    it('submitScore keeps a new best', () => {
        useBowlingStore.getState().submitScore(12)
        expect(useBowlingStore.getState().highScore).toBe(12)
    })

    it('submitScore ignores a lower score', () => {
        useBowlingStore.getState().submitScore(20)
        useBowlingStore.getState().submitScore(5)
        expect(useBowlingStore.getState().highScore).toBe(20)
    })

    it('submitScore updates on a tie-break only when strictly higher', () => {
        useBowlingStore.getState().submitScore(10)
        useBowlingStore.getState().submitScore(10)
        expect(useBowlingStore.getState().highScore).toBe(10)
    })

    it('persists to localStorage under kegelkasse-bowling', () => {
        useBowlingStore.getState().submitScore(27)
        const raw = localStorage.getItem('kegelkasse-bowling')
        expect(raw).not.toBeNull()
        expect(JSON.parse(raw!).state.highScore).toBe(27)
    })
})
