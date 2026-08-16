import {describe, it, expect, beforeEach} from 'vitest'
import {useBowlingStore} from '../bowling'

function reset() {
    useBowlingStore.setState({discovered: false, personalBest: 0, ownerUserId: null})
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

    it('syncOwner adopts the first user without resetting anything', () => {
        useBowlingStore.getState().markDiscovered()
        useBowlingStore.getState().submitLocal(15)
        useBowlingStore.getState().syncOwner(1)
        expect(useBowlingStore.getState().discovered).toBe(true)
        expect(useBowlingStore.getState().personalBest).toBe(15)
        expect(useBowlingStore.getState().ownerUserId).toBe(1)
    })

    it('syncOwner is a no-op for the same user (does not wipe progress on every login)', () => {
        useBowlingStore.getState().syncOwner(1)
        useBowlingStore.getState().markDiscovered()
        useBowlingStore.getState().submitLocal(9)
        useBowlingStore.getState().syncOwner(1)
        expect(useBowlingStore.getState().discovered).toBe(true)
        expect(useBowlingStore.getState().personalBest).toBe(9)
    })

    it('syncOwner resets discovered/personalBest when a different user takes over a shared device', () => {
        useBowlingStore.getState().syncOwner(1)
        useBowlingStore.getState().markDiscovered()
        useBowlingStore.getState().submitLocal(20)
        useBowlingStore.getState().syncOwner(2)
        expect(useBowlingStore.getState().discovered).toBe(false)
        expect(useBowlingStore.getState().personalBest).toBe(0)
        expect(useBowlingStore.getState().ownerUserId).toBe(2)
    })

    it('syncOwner ignores a null/unknown user id', () => {
        useBowlingStore.getState().syncOwner(1)
        useBowlingStore.getState().markDiscovered()
        useBowlingStore.getState().syncOwner(null)
        expect(useBowlingStore.getState().discovered).toBe(true)
        expect(useBowlingStore.getState().ownerUserId).toBe(1)
    })
})
