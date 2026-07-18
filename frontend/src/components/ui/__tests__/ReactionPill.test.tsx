/**
 * Tests for ReactionPill: tap toggles the reaction, long-press shows the reactor list.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

import { ReactionPill } from '../ReactionPill'

describe('ReactionPill', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    function renderPill(users: string[], onClick = vi.fn()) {
        render(
            <ReactionPill className="pill" onClick={onClick} users={users} emoji="❤️">
                <span>❤️ 2</span>
            </ReactionPill>,
        )
        return { onClick }
    }

    it('calls onClick on a normal tap', () => {
        const { onClick } = renderPill(['Alice', 'Bob'])
        fireEvent.click(screen.getByRole('button'))
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('shows the reactor list on long-press instead of toggling', () => {
        const { onClick } = renderPill(['Alice', 'Bob'])
        const btn = screen.getByRole('button')

        fireEvent.pointerDown(btn)
        act(() => { vi.advanceTimersByTime(500) })
        fireEvent.click(btn)

        expect(onClick).not.toHaveBeenCalled()
        expect(screen.getByText('Alice')).toBeInTheDocument()
        expect(screen.getByText('Bob')).toBeInTheDocument()
    })

    it('shows the reaction emoji beside each name in the popover', () => {
        renderPill(['Alice', 'Bob'])
        const btn = screen.getByRole('button')

        fireEvent.pointerDown(btn)
        act(() => { vi.advanceTimersByTime(500) })

        expect(screen.getAllByText('❤️')).toHaveLength(2)
    })

    it('does not show a popover when there are no reactors', () => {
        renderPill([])
        const btn = screen.getByRole('button')

        fireEvent.pointerDown(btn)
        act(() => { vi.advanceTimersByTime(500) })

        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })

    it('disables native text selection and the iOS touch callout, so the long-press timer wins the gesture', () => {
        renderPill(['Alice'])
        const btn = screen.getByRole('button')

        expect(btn.className).toContain('select-none')
        expect(btn.className).toContain('[-webkit-touch-callout:none]')
    })

    it('closes the popover when clicking outside', () => {
        renderPill(['Alice'])
        const btn = screen.getByRole('button')

        fireEvent.pointerDown(btn)
        act(() => { vi.advanceTimersByTime(500) })
        expect(screen.getByText('Alice')).toBeInTheDocument()

        fireEvent.mouseDown(document.body)
        expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    })
})
