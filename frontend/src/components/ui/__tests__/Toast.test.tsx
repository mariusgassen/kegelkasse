/**
 * Tests for Toast.tsx — showToast and subscribeToast (rendered by the Island's ToastActivity).
 */
import {afterEach, describe, expect, it, vi} from 'vitest'
import {showToast, subscribeToast, type ToastMessage} from '../Toast'

describe('showToast + subscribeToast', () => {
    const unsubs: (() => void)[] = []
    afterEach(() => {
        unsubs.splice(0).forEach(u => u())
    })

    function listen() {
        const fn = vi.fn<(m: ToastMessage) => void>()
        unsubs.push(subscribeToast(fn))
        return fn
    }

    it('delivers text with success as the default type', () => {
        const fn = listen()
        showToast('Saved!')
        expect(fn).toHaveBeenCalledWith(expect.objectContaining({text: 'Saved!', type: 'success'}))
    })

    it('delivers the error type', () => {
        const fn = listen()
        showToast('Something went wrong', 'error')
        expect(fn).toHaveBeenCalledWith(expect.objectContaining({text: 'Something went wrong', type: 'error'}))
    })

    it('gives every toast a unique id', () => {
        const fn = listen()
        showToast('First')
        showToast('Second')
        const [a, b] = fn.mock.calls.map(c => c[0].id)
        expect(a).not.toBe(b)
    })

    it('stops delivering after unsubscribe and does not throw', () => {
        const fn = vi.fn()
        const off = subscribeToast(fn)
        off()
        expect(() => showToast('After unsubscribe')).not.toThrow()
        expect(fn).not.toHaveBeenCalled()
    })
})
