import {describe, it, expect, beforeEach} from 'vitest'
import {useThemeStore} from '../theme'

function resetStore() {
    useThemeStore.setState({theme: 'dark'})
}

describe('useThemeStore', () => {
    beforeEach(resetStore)

    it('defaults to dark', () => {
        expect(useThemeStore.getState().theme).toBe('dark')
    })

    it('setTheme updates the theme', () => {
        useThemeStore.getState().setTheme('light')
        expect(useThemeStore.getState().theme).toBe('light')
    })

    it('setTheme accepts system', () => {
        useThemeStore.getState().setTheme('system')
        expect(useThemeStore.getState().theme).toBe('system')
    })

    it('persists to localStorage under kegelkasse-theme', () => {
        useThemeStore.getState().setTheme('light')
        const raw = localStorage.getItem('kegelkasse-theme')
        expect(raw).not.toBeNull()
        expect(JSON.parse(raw!).state.theme).toBe('light')
    })
})
