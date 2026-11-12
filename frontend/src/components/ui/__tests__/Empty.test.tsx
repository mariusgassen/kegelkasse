import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import {Empty} from '../Empty.tsx'

describe('Empty', () => {
    it('renders icon block when an icon is given', () => {
        render(<Empty icon="🎳" text="Nichts da"/>)
        expect(screen.getByText('🎳')).toBeTruthy()
        expect(screen.getByText('Nichts da')).toBeTruthy()
    })
    it('renders a one-line inline note without an icon', () => {
        const {container} = render(<Empty text="Nichts da"/>)
        expect(container.querySelector('p')?.textContent).toBe('Nichts da')
        expect(container.querySelector('.text-4xl')).toBeNull()
    })
})
