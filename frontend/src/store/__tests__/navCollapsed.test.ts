import {describe, it, expect, beforeEach} from 'vitest'
import {useNavCollapsedStore} from '../navCollapsed'

function resetStore() {
    useNavCollapsedStore.setState({collapsed: false})
}

describe('useNavCollapsedStore', () => {
    beforeEach(resetStore)

    it('defaults to expanded', () => {
        expect(useNavCollapsedStore.getState().collapsed).toBe(false)
    })

    it('toggle flips the collapsed state', () => {
        useNavCollapsedStore.getState().toggle()
        expect(useNavCollapsedStore.getState().collapsed).toBe(true)
        useNavCollapsedStore.getState().toggle()
        expect(useNavCollapsedStore.getState().collapsed).toBe(false)
    })

    it('setCollapsed sets the state directly', () => {
        useNavCollapsedStore.getState().setCollapsed(true)
        expect(useNavCollapsedStore.getState().collapsed).toBe(true)
    })

    it('persists to localStorage under kegelkasse-nav-collapsed', () => {
        useNavCollapsedStore.getState().setCollapsed(true)
        const raw = localStorage.getItem('kegelkasse-nav-collapsed')
        expect(raw).not.toBeNull()
        expect(JSON.parse(raw!).state.collapsed).toBe(true)
    })
})
