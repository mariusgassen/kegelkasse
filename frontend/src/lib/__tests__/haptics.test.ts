import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {haptic, hapticPattern} from '@/lib/haptics'
import {useEffectsStore} from '@/store/effects'

describe('haptics', () => {
    beforeEach(() => {
        useEffectsStore.setState({effectsEnabled: true})
        Object.defineProperty(navigator, 'vibrate', {value: vi.fn(), configurable: true, writable: true})
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        useEffectsStore.setState({effectsEnabled: true})
    })

    it('sends a single short pulse for a selection', () => {
        haptic('selection')
        expect(navigator.vibrate).toHaveBeenCalledWith(10)
    })

    it('sends a distinct multi-pulse pattern for success and error', () => {
        haptic('success')
        expect(navigator.vibrate).toHaveBeenCalledWith([12, 40, 18])
        haptic('error')
        expect(navigator.vibrate).toHaveBeenCalledWith([28, 60, 28])
    })

    it('gives every named pattern its own rhythm', () => {
        const patterns = (['selection', 'impact', 'success', 'warning', 'error'] as const)
            .map(p => JSON.stringify(hapticPattern(p)))
        expect(new Set(patterns).size).toBe(patterns.length)
    })

    it('stays silent when the member switched effects off', () => {
        useEffectsStore.setState({effectsEnabled: false})
        haptic('success')
        expect(navigator.vibrate).not.toHaveBeenCalled()
    })

    /** iOS Safari has no Vibration API — a call there must be a no-op, not a crash. */
    it('does nothing where the Vibration API is missing', () => {
        Object.defineProperty(navigator, 'vibrate', {value: undefined, configurable: true, writable: true})
        expect(() => haptic('impact')).not.toThrow()
    })
})
