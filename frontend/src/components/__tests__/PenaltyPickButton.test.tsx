import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen, fireEvent, act} from '@testing-library/react'
import type {PenaltyType} from '@/types'

const playSoundMock = vi.fn()
const audioCalloutsMock = vi.fn(() => true)

vi.mock('@/lib/soundboard', () => ({playSound: (key: string | null) => playSoundMock(key)}))
vi.mock('@/hooks/useClub.ts', () => ({useAudioCallouts: () => audioCalloutsMock()}))

const {PenaltyPickButton} = await import('../evening/PenaltyPickButton')

const withSound: PenaltyType = {id: 1, icon: '🚫', name: 'Gosse', default_amount: 0.1, sound_key: 'buzzer'}
const silent: PenaltyType = {id: 2, icon: '💦', name: 'Lustwurf', default_amount: 0.1, sound_key: null}

/** A hold: pointerdown, wait past the 500 ms threshold, pointerup, then the click the browser fires. */
function hold(el: HTMLElement) {
    fireEvent.pointerDown(el, {clientX: 0, clientY: 0, pointerId: 1})
    act(() => {
        vi.advanceTimersByTime(600)
    })
    fireEvent.pointerUp(el, {pointerId: 1})
    fireEvent.click(el)
}

describe('PenaltyPickButton', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        playSoundMock.mockClear()
        audioCalloutsMock.mockReturnValue(true)
    })
    afterEach(() => vi.useRealTimers())

    it('selects the penalty on a tap', () => {
        const onSelect = vi.fn()
        render(<PenaltyPickButton type={withSound} onSelect={onSelect}>Gosse</PenaltyPickButton>)

        fireEvent.pointerDown(screen.getByRole('button'), {clientX: 0, clientY: 0, pointerId: 1})
        fireEvent.pointerUp(screen.getByRole('button'), {pointerId: 1})
        fireEvent.click(screen.getByRole('button'))

        expect(onSelect).toHaveBeenCalledTimes(1)
        expect(playSoundMock).not.toHaveBeenCalled()
    })

    it('plays the call-out on a long press without selecting it', () => {
        const onSelect = vi.fn()
        render(<PenaltyPickButton type={withSound} onSelect={onSelect}>Gosse</PenaltyPickButton>)

        hold(screen.getByRole('button'))

        expect(playSoundMock).toHaveBeenCalledWith('buzzer')
        // Booking a penalty by accident while trying to hear it would be the worst outcome here.
        expect(onSelect).not.toHaveBeenCalled()
    })

    it('still selects on tap when the penalty has no sound', () => {
        const onSelect = vi.fn()
        render(<PenaltyPickButton type={silent} onSelect={onSelect}>Lustwurf</PenaltyPickButton>)

        hold(screen.getByRole('button'))

        // No gesture is attached, so the hold is just a (slow) tap.
        expect(playSoundMock).not.toHaveBeenCalled()
        expect(onSelect).toHaveBeenCalledTimes(1)
    })

    it('does not attach the gesture when the club has call-outs switched off', () => {
        audioCalloutsMock.mockReturnValue(false)
        const onSelect = vi.fn()
        render(<PenaltyPickButton type={withSound} onSelect={onSelect}>Gosse</PenaltyPickButton>)

        hold(screen.getByRole('button'))

        expect(playSoundMock).not.toHaveBeenCalled()
        expect(onSelect).toHaveBeenCalledTimes(1)
    })

    it('passes through disabled, class and style', () => {
        render(
            <PenaltyPickButton type={withSound} onSelect={vi.fn()} disabled className="chip active"
                               style={{opacity: 0.5}}>
                Gosse
            </PenaltyPickButton>,
        )
        const btn = screen.getByRole('button')
        expect(btn).toBeDisabled()
        expect(btn.className).toBe('chip active')
        expect(btn.style.opacity).toBe('0.5')
    })
})
