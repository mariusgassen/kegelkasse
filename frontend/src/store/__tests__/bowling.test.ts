import {describe, it, expect, beforeEach} from 'vitest'
import {useBowlingStore} from '../bowling'

function reset() {
    useBowlingStore.setState({discovered: false, personalBest: 0})
    localStorage.clear()
}

describe('useBowlingStore', () => {
    beforeEach(reset)

    it('defaults: not discovered, personal best 0', () => {
        expect(useBowlingStore.getState().discovered).toBe(false)
        expect(useBowlingStore.getState().personalBest).toBe(0)
    })

    it('markDiscovered flips the flag', () => {
        useBowlingStore.getState().markDiscovered()
        expect(useBowlingStore.getState().discovered).toBe(true)
    })

    it('submitLocal keeps a new best', () => {
        useBowlingStore.getState().submitLocal(12)
        expect(useBowlingStore.getState().personalBest).toBe(12)
    })

    it('submitLocal ignores a lower score', () => {
        useBowlingStore.getState().submitLocal(20)
        useBowlingStore.getState().submitLocal(5)
        expect(useBowlingStore.getState().personalBest).toBe(20)
    })

    it('persists to localStorage under kegelkasse-bowling', () => {
        useBowlingStore.getState().markDiscovered()
        useBowlingStore.getState().submitLocal(27)
        const raw = localStorage.getItem('kegelkasse-bowling')
        expect(raw).not.toBeNull()
        const state = JSON.parse(raw!).state
        expect(state.discovered).toBe(true)
        expect(state.personalBest).toBe(27)
    })
})
