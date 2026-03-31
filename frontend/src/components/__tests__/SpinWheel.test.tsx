/**
 * Tests for SpinWheel component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'

vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))

const PENALTY_TYPES = [
    { id: 1, name: 'Bier', icon: '🍺', default_amount: 1.0, mode: 'euro' },
    { id: 2, name: 'Schnapps', icon: '🥃', default_amount: 2.0, mode: 'euro' },
    { id: 3, name: 'Wasser', icon: '💧', default_amount: 0.5, mode: 'euro' },
]

describe('SpinWheel — rendering', () => {
    beforeEach(() => vi.clearAllMocks())

    it('renders nothing when penaltyTypes is empty', async () => {
        const { SpinWheel } = await import('../SpinWheel')
        const { container } = render(
            <SpinWheel penaltyTypes={[]} onResult={vi.fn()} />,
        )
        expect(container.firstChild).toBeNull()
    })

    it('renders spin button when penaltyTypes provided', async () => {
        const { SpinWheel } = await import('../SpinWheel')
        render(<SpinWheel penaltyTypes={PENALTY_TYPES as any} onResult={vi.fn()} />)
        expect(screen.getByText('wheel.spin')).toBeInTheDocument()
    })

    it('renders penalty type icons in svg segments', async () => {
        const { SpinWheel } = await import('../SpinWheel')
        render(<SpinWheel penaltyTypes={PENALTY_TYPES as any} onResult={vi.fn()} />)
        expect(screen.getByText('🍺')).toBeInTheDocument()
        expect(screen.getByText('🥃')).toBeInTheDocument()
        expect(screen.getByText('💧')).toBeInTheDocument()
    })

    it('spin button is enabled initially', async () => {
        const { SpinWheel } = await import('../SpinWheel')
        render(<SpinWheel penaltyTypes={PENALTY_TYPES as any} onResult={vi.fn()} />)
        const btn = screen.getByRole('button')
        expect(btn).not.toBeDisabled()
    })
})

describe('SpinWheel — spin behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('disables spin button while spinning', async () => {
        const { SpinWheel } = await import('../SpinWheel')
        render(<SpinWheel penaltyTypes={PENALTY_TYPES as any} onResult={vi.fn()} />)
        await act(async () => { fireEvent.click(screen.getByRole('button')) })
        expect(screen.getByRole('button')).toBeDisabled()
    })

    it('shows 🌀 while spinning', async () => {
        const { SpinWheel } = await import('../SpinWheel')
        render(<SpinWheel penaltyTypes={PENALTY_TYPES as any} onResult={vi.fn()} />)
        await act(async () => { fireEvent.click(screen.getByRole('button')) })
        expect(screen.getByText('🌀')).toBeInTheDocument()
    })

    it('calls onResult after spin completes', async () => {
        const onResult = vi.fn()
        const { SpinWheel } = await import('../SpinWheel')
        render(<SpinWheel penaltyTypes={PENALTY_TYPES as any} onResult={onResult} />)
        await act(async () => { fireEvent.click(screen.getByRole('button')) })
        await act(async () => { vi.advanceTimersByTime(3200) })
        expect(onResult).toHaveBeenCalledTimes(1)
        expect(PENALTY_TYPES).toContainEqual(onResult.mock.calls[0][0])
    })

    it('re-enables spin button after spin completes', async () => {
        const { SpinWheel } = await import('../SpinWheel')
        render(<SpinWheel penaltyTypes={PENALTY_TYPES as any} onResult={vi.fn()} />)
        await act(async () => { fireEvent.click(screen.getByRole('button')) })
        await act(async () => { vi.advanceTimersByTime(3200) })
        expect(screen.getByRole('button')).not.toBeDisabled()
    })

    it('shows result after spin completes', async () => {
        const { SpinWheel } = await import('../SpinWheel')
        render(<SpinWheel penaltyTypes={PENALTY_TYPES as any} onResult={vi.fn()} />)
        await act(async () => { fireEvent.click(screen.getByRole('button')) })
        await act(async () => { vi.advanceTimersByTime(3200) })
        // Result block shows the amount in euros
        expect(screen.queryByText(/€/)).toBeInTheDocument()
    })
})
