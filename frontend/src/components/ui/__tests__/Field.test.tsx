import {describe, expect, it} from 'vitest'
import {render, screen} from '@testing-library/react'
import {Field} from '../Field.tsx'
import {Caption} from '../Caption.tsx'

describe('Field', () => {
    it('ties the label to its control', () => {
        render(<Field label="Name" htmlFor="n"><input id="n"/></Field>)
        expect(screen.getByLabelText('Name')).toBeTruthy()
    })
    it('shows the hint, but the error replaces it', () => {
        const {rerender} = render(<Field label="A" hint="help"><input/></Field>)
        expect(screen.getByText('help')).toBeTruthy()
        rerender(<Field label="A" hint="help" error="bad"><input/></Field>)
        expect(screen.queryByText('help')).toBeNull()
        expect(screen.getByRole('alert').textContent).toBe('bad')
    })
})

describe('Caption', () => {
    it('renders a div by default and merges className', () => {
        render(<Caption className="mb-2">Hi</Caption>)
        const el = screen.getByText('Hi')
        expect(el.tagName).toBe('DIV')
        expect(el.className).toContain('uppercase')
        expect(el.className).toContain('mb-2')
    })
    it('can render a span', () => {
        render(<Caption as="span">Hi</Caption>)
        expect(screen.getByText('Hi').tagName).toBe('SPAN')
    })
})
