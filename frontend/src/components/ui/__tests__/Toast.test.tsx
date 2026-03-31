/**
 * Tests for Toast.tsx — showToast and ToastContainer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import React from 'react'
import { showToast, ToastContainer } from '../Toast'

// ── tests ─────────────────────────────────────────────────────────────────────

describe('showToast + ToastContainer', () => {
    beforeEach(() => vi.clearAllMocks())

    it('renders the container div', () => {
        const { container } = render(<ToastContainer />)
        expect(container.querySelector('div')).toBeInTheDocument()
    })

    it('shows toast message when showToast is called', () => {
        render(<ToastContainer />)
        act(() => { showToast('Hello world') })
        expect(screen.getByText('Hello world')).toBeInTheDocument()
    })

    it('shows error-styled toast for type=error', () => {
        render(<ToastContainer />)
        act(() => { showToast('Something went wrong', 'error') })
        const toast = screen.getByText('Something went wrong')
        expect(toast.className).toContain('bg-red-800')
    })

    it('shows success-styled toast by default', () => {
        render(<ToastContainer />)
        act(() => { showToast('Saved!') })
        const toast = screen.getByText('Saved!')
        expect(toast.className).toContain('bg-kce-olive')
    })

    it('removes toast after timeout', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        render(<ToastContainer />)
        act(() => { showToast('Temporary') })
        expect(screen.getByText('Temporary')).toBeInTheDocument()
        await act(async () => { vi.advanceTimersByTime(3000) })
        expect(screen.queryByText('Temporary')).not.toBeInTheDocument()
        vi.useRealTimers()
    })

    it('shows multiple toasts simultaneously', () => {
        render(<ToastContainer />)
        act(() => {
            showToast('First')
            showToast('Second')
        })
        expect(screen.getByText('First')).toBeInTheDocument()
        expect(screen.getByText('Second')).toBeInTheDocument()
    })

    it('cleans up listener on unmount', () => {
        const { unmount } = render(<ToastContainer />)
        unmount()
        // After unmount, showToast should not throw
        expect(() => { showToast('After unmount') }).not.toThrow()
    })
})
