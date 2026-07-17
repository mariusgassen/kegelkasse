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
            <ReactionPill className="pill" onClick={onClick} users={users}>
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

    it('does not show a popover when there are no reactors', () => {
        renderPill([])
        const btn = screen.getByRole('button')

        fireEvent.pointerDown(btn)
        act(() => { vi.advanceTimersByTime(500) })

        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
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
