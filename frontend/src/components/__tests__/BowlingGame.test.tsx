import {describe, it, expect, vi, beforeEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import React from 'react'
import {BowlingGame} from '../BowlingGame'
import {useBowlingStore} from '../../store/bowling'

beforeEach(() => {
    useBowlingStore.setState({highScore: 42})
})

describe('BowlingGame', () => {
    it('renders the lane canvas and the scoreboard with the stored high score', () => {
        render(<BowlingGame onClose={() => {}}/>)
        expect(screen.getByTestId('bowling-canvas')).toBeInTheDocument()
        expect(screen.getByText('42')).toBeInTheDocument() // best score
    })

    it('advances aim → power on the first tap (power meter appears)', () => {
        render(<BowlingGame onClose={() => {}}/>)
        expect(screen.queryByTestId('bowling-power')).not.toBeInTheDocument()
        fireEvent.click(screen.getByTestId('bowling-canvas'))
        expect(screen.getByTestId('bowling-power')).toBeInTheDocument()
    })

    it('launches on the second tap (power meter disappears once rolling)', () => {
        render(<BowlingGame onClose={() => {}}/>)
        const canvas = screen.getByTestId('bowling-canvas')
        fireEvent.click(canvas) // → power
        fireEvent.click(canvas) // → rolling
        expect(screen.queryByTestId('bowling-power')).not.toBeInTheDocument()
    })

    it('closes via the close button', () => {
        const onClose = vi.fn()
        render(<BowlingGame onClose={onClose}/>)
        fireEvent.click(screen.getByLabelText('Schließen'))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('closes on Escape', () => {
        const onClose = vi.fn()
        render(<BowlingGame onClose={onClose}/>)
        fireEvent.keyDown(window, {key: 'Escape'})
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
