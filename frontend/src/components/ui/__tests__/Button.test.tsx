import {describe, expect, it} from 'vitest'
import {render, screen} from '@testing-library/react'
import {Button} from '../Button.tsx'

describe('Button', () => {
    it('maps variant, size and block to the btn-* classes', () => {
        render(<Button variant="danger" size="xs" block className="mt-1">x</Button>)
        const b = screen.getByRole('button')
        expect(b.className).toBe('btn-danger btn-xs w-full mt-1')
    })

    it('defaults to secondary at medium size and does not force a type', () => {
        render(<Button>x</Button>)
        const b = screen.getByRole('button')
        expect(b.className).toBe('btn-secondary')
        expect(b.hasAttribute('type')).toBe(false)
    })

    it('passes native props through', () => {
        render(<Button disabled aria-label="go">x</Button>)
        expect(screen.getByLabelText('go')).toBeDisabled()
    })
})
