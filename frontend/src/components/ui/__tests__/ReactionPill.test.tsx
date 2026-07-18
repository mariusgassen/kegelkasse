/**
 * Tests for ReactionPill: tap toggles the reaction, long-press shows the full
 * reactor breakdown across every emoji on the item (not just this pill's own).
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

    function renderPill(allReactions: {emoji: string; users: string[]}[], onClick = vi.fn()) {
        render(
            <ReactionPill className="pill" onClick={onClick} allReactions={allReactions}>
                <span>❤️ 2</span>
            </ReactionPill>,
        )
        return { onClick }
    }

    const heartOnly = [{emoji: '❤️', users: ['Alice', 'Bob']}]
    const mixed = [
        {emoji: '😂', users: ['Marius', 'Tina']},
        {emoji: '😌', users: ['Domi']},
    ]

    it('calls onClick on a normal tap', () => {
        const { onClick } = renderPill(heartOnly)
        fireEvent.click(screen.getByRole('button'))
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('shows the reactor list on long-press instead of toggling', () => {
        const { onClick } = renderPill(heartOnly)
        const btn = screen.getByRole('button')

        fireEvent.pointerDown(btn)
        act(() => { vi.advanceTimersByTime(500) })
        fireEvent.click(btn)

        expect(onClick).not.toHaveBeenCalled()
        expect(screen.getByText('Alice, Bob')).toBeInTheDocument()
    })

    it('shows every reaction group on the item, not just the emoji of the pill that was held', () => {
        // Holding the 😂 pill (or the 😌 pill) shows the same full breakdown either way.
        renderPill(mixed)
        const btn = screen.getByRole('button')

        fireEvent.pointerDown(btn)
        act(() => { vi.advanceTimersByTime(500) })

        expect(screen.getByText('Marius, Tina')).toBeInTheDocument()
        expect(screen.getByText('Domi')).toBeInTheDocument()
        expect(screen.getAllByText('😂', {exact: false})).toBeTruthy()
        expect(screen.getAllByText('😌', {exact: false})).toBeTruthy()
    })

    it('does not show a popover when there are no reactions at all', () => {
        renderPill([])
        const btn = screen.getByRole('button')

        fireEvent.pointerDown(btn)
        act(() => { vi.advanceTimersByTime(500) })

        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })

    it('disables native text selection and the iOS touch callout, so the long-press timer wins the gesture', () => {
        renderPill(heartOnly)
        const btn = screen.getByRole('button')

        expect(btn.className).toContain('select-none')
        expect(btn.className).toContain('[-webkit-touch-callout:none]')
    })

    it('closes the popover when clicking outside', () => {
        renderPill(heartOnly)
        const btn = screen.getByRole('button')

        fireEvent.pointerDown(btn)
        act(() => { vi.advanceTimersByTime(500) })
        expect(screen.getByText('Alice, Bob')).toBeInTheDocument()

        fireEvent.mouseDown(document.body)
        expect(screen.queryByText('Alice, Bob')).not.toBeInTheDocument()
    })
})
