import {describe, expect, it, vi} from 'vitest'
import {fireEvent, render, screen} from '@testing-library/react'
import {Switch} from '../Switch'

describe('Switch', () => {
    it('exposes label as accessible name and reflects checked state', () => {
        render(<Switch checked label="Audio" hint="Plays sounds" onChange={() => {}}/>)
        expect(screen.getByRole('switch', {name: 'Audio'})).toHaveAttribute('aria-checked', 'true')
        expect(screen.getByText('Plays sounds')).toBeInTheDocument()
    })

    it('calls onChange with the toggled value', () => {
        const onChange = vi.fn()
        render(<Switch checked={false} label="Audio" onChange={onChange}/>)
        fireEvent.click(screen.getByRole('switch'))
        expect(onChange).toHaveBeenCalledWith(true)
    })

    it('does not fire when disabled', () => {
        const onChange = vi.fn()
        render(<Switch checked={false} label="Audio" disabled onChange={onChange}/>)
        fireEvent.click(screen.getByRole('switch'))
        expect(onChange).not.toHaveBeenCalled()
    })
})
