import {describe, it, expect, vi} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import React from 'react'
import {SearchInput} from '../SearchInput'

describe('SearchInput', () => {
    it('renders the input with the given value and placeholder', () => {
        render(<SearchInput value="Hasi" onChange={vi.fn()} placeholder="Search…"/>)
        const input = screen.getByPlaceholderText('Search…') as HTMLInputElement
        expect(input.value).toBe('Hasi')
    })

    it('calls onChange as the user types', () => {
        const onChange = vi.fn()
        render(<SearchInput value="" onChange={onChange} placeholder="Search…"/>)
        fireEvent.change(screen.getByPlaceholderText('Search…'), {target: {value: 'ha'}})
        expect(onChange).toHaveBeenCalledWith('ha')
    })

    it('shows no clear button when the value is empty', () => {
        render(<SearchInput value="" onChange={vi.fn()} placeholder="Search…"/>)
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('shows a clear button once there is text', () => {
        render(<SearchInput value="Hasi" onChange={vi.fn()} placeholder="Search…"/>)
        expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('clicking the clear button calls onChange with an empty string', () => {
        const onChange = vi.fn()
        render(<SearchInput value="Hasi" onChange={onChange} placeholder="Search…"/>)
        fireEvent.click(screen.getByRole('button'))
        expect(onChange).toHaveBeenCalledWith('')
    })

    it('applies the given wrapper className', () => {
        const {container} = render(<SearchInput value="" onChange={vi.fn()} className="mb-4"/>)
        expect(container.firstElementChild?.className).toContain('mb-4')
    })
})
