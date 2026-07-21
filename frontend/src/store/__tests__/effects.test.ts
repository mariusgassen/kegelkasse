import {describe, it, expect, beforeEach} from 'vitest'
import {useEffectsStore} from '../effects'

function resetStore() {
    useEffectsStore.setState({effectsEnabled: true})
}

describe('useEffectsStore', () => {
    beforeEach(resetStore)

    it('defaults to enabled', () => {
        expect(useEffectsStore.getState().effectsEnabled).toBe(true)
    })

    it('setEffectsEnabled disables effects', () => {
        useEffectsStore.getState().setEffectsEnabled(false)
        expect(useEffectsStore.getState().effectsEnabled).toBe(false)
    })

    it('setEffectsEnabled re-enables effects', () => {
        useEffectsStore.getState().setEffectsEnabled(false)
        useEffectsStore.getState().setEffectsEnabled(true)
        expect(useEffectsStore.getState().effectsEnabled).toBe(true)
    })

    it('persists to localStorage under kegelkasse-effects', () => {
        useEffectsStore.getState().setEffectsEnabled(false)
        const raw = localStorage.getItem('kegelkasse-effects')
        expect(raw).not.toBeNull()
        expect(JSON.parse(raw!).state.effectsEnabled).toBe(false)
    })
})
