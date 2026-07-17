import {describe, it, expect, vi} from 'vitest'
import {render, screen, act} from '@testing-library/react'
import React from 'react'
import {usePullToRefresh} from '../usePullToRefresh'

// jsdom has no TouchEvent constructor — dispatch a plain Event with a manually attached `touches` array,
// which is all the hook's native addEventListener handlers actually read.
function touchEvent(type: string, clientY: number, clientX = 0): Event {
    const evt = new Event(type, {bubbles: true, cancelable: true})
    Object.defineProperty(evt, 'touches', {value: [{clientY, clientX}], configurable: true})
    return evt
}

function TestHarness({onRefresh}: { onRefresh: () => void | Promise<void> }) {
    const {containerRef, pullDistance, dragging, refreshing} = usePullToRefresh(onRefresh)
    return (
        <div ref={containerRef as React.RefObject<HTMLDivElement | null>}>
            <div className="page-scroll" data-testid="scroller">
                <button data-testid="target">target</button>
            </div>
            <div data-testid="state">{JSON.stringify({pullDistance, dragging, refreshing})}</div>
        </div>
    )
}

function readState() {
    return JSON.parse(screen.getByTestId('state').textContent!)
}

describe('usePullToRefresh', () => {
    it('does nothing on a short drag below the threshold', async () => {
        const onRefresh = vi.fn()
        render(<TestHarness onRefresh={onRefresh}/>)
        const target = screen.getByTestId('target')

        await act(async () => { target.dispatchEvent(touchEvent('touchstart', 100)) })
        await act(async () => { target.dispatchEvent(touchEvent('touchmove', 130)) }) // delta 30
        expect(readState().pullDistance).toBe(30)
        expect(readState().dragging).toBe(true)
        await act(async () => { target.dispatchEvent(touchEvent('touchend', 130)) })

        expect(onRefresh).not.toHaveBeenCalled()
        expect(readState().pullDistance).toBe(0)
        expect(readState().dragging).toBe(false)
    })

    it('triggers onRefresh once the drag passes the threshold, parking until it resolves', async () => {
        let resolveRefresh: () => void = () => {}
        const onRefresh = vi.fn(() => new Promise<void>(r => { resolveRefresh = r }))
        render(<TestHarness onRefresh={onRefresh}/>)
        const target = screen.getByTestId('target')

        await act(async () => { target.dispatchEvent(touchEvent('touchstart', 100)) })
        await act(async () => { target.dispatchEvent(touchEvent('touchmove', 190)) }) // delta 90 > threshold
        await act(async () => { target.dispatchEvent(touchEvent('touchend', 190)) })

        expect(onRefresh).toHaveBeenCalledTimes(1)
        expect(readState().refreshing).toBe(true)
        // Parks at a resting offset instead of snapping to 0 immediately, so the
        // indicator/content don't jump twice (once on release, once when data arrives).
        expect(readState().pullDistance).toBe(50)
        expect(readState().dragging).toBe(false)

        await act(async () => { resolveRefresh() })
        expect(readState().refreshing).toBe(false)
        expect(readState().pullDistance).toBe(0)
    })

    it('caps the visible pull distance', async () => {
        const onRefresh = vi.fn()
        render(<TestHarness onRefresh={onRefresh}/>)
        const target = screen.getByTestId('target')

        await act(async () => { target.dispatchEvent(touchEvent('touchstart', 0)) })
        await act(async () => { target.dispatchEvent(touchEvent('touchmove', 500)) }) // delta 500
        expect(readState().pullDistance).toBe(100)
    })

    it('ignores upward drags', async () => {
        const onRefresh = vi.fn()
        render(<TestHarness onRefresh={onRefresh}/>)
        const target = screen.getByTestId('target')

        await act(async () => { target.dispatchEvent(touchEvent('touchstart', 100)) })
        await act(async () => { target.dispatchEvent(touchEvent('touchmove', 50)) }) // delta -50
        expect(readState().pullDistance).toBe(0)
    })

    it('ignores drags that start while the page is already scrolled down', async () => {
        const onRefresh = vi.fn()
        render(<TestHarness onRefresh={onRefresh}/>)
        const target = screen.getByTestId('target')
        const scroller = screen.getByTestId('scroller') as HTMLDivElement
        scroller.scrollTop = 50

        await act(async () => { target.dispatchEvent(touchEvent('touchstart', 100)) })
        await act(async () => { target.dispatchEvent(touchEvent('touchmove', 200)) })
        expect(readState().pullDistance).toBe(0)
    })

    it('does not treat a horizontal swipe (e.g. scrolling a tab strip) as a pull', async () => {
        const onRefresh = vi.fn()
        render(<TestHarness onRefresh={onRefresh}/>)
        const target = screen.getByTestId('target')

        await act(async () => { target.dispatchEvent(touchEvent('touchstart', 100, 100)) })
        // Mostly horizontal movement, small vertical component
        await act(async () => { target.dispatchEvent(touchEvent('touchmove', 105, 160)) })
        expect(readState().pullDistance).toBe(0)
        expect(readState().dragging).toBe(false)

        // Further vertical movement after the horizontal lock is still ignored for this gesture
        await act(async () => { target.dispatchEvent(touchEvent('touchmove', 150, 160)) })
        expect(readState().pullDistance).toBe(0)

        await act(async () => { target.dispatchEvent(touchEvent('touchend', 150, 160)) })
        expect(onRefresh).not.toHaveBeenCalled()
    })

    it('waits for enough movement before committing to a direction (ignores tiny jitter)', async () => {
        const onRefresh = vi.fn()
        render(<TestHarness onRefresh={onRefresh}/>)
        const target = screen.getByTestId('target')

        await act(async () => { target.dispatchEvent(touchEvent('touchstart', 100, 100)) })
        await act(async () => { target.dispatchEvent(touchEvent('touchmove', 102, 101)) }) // 2px — below slop
        expect(readState().pullDistance).toBe(0)
        expect(readState().dragging).toBe(false)

        await act(async () => { target.dispatchEvent(touchEvent('touchmove', 130, 101)) }) // now clearly vertical
        expect(readState().dragging).toBe(true)
        expect(readState().pullDistance).toBe(30)
    })

    it('touchcancel resets an in-progress drag without triggering a refresh', async () => {
        const onRefresh = vi.fn()
        render(<TestHarness onRefresh={onRefresh}/>)
        const target = screen.getByTestId('target')

        await act(async () => { target.dispatchEvent(touchEvent('touchstart', 100)) })
        await act(async () => { target.dispatchEvent(touchEvent('touchmove', 190)) }) // past threshold
        await act(async () => { target.dispatchEvent(touchEvent('touchcancel', 190)) })

        expect(onRefresh).not.toHaveBeenCalled()
        expect(readState().pullDistance).toBe(0)
        expect(readState().dragging).toBe(false)
    })
})
