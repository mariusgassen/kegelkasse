import React from 'react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {BookPage} from '../BookPage'
import {DUPLICATES, PRIMITIVES} from '@/lib/book/inventory'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))

let tabState = 'inventory'
vi.mock('@/hooks/usePage.ts', () => ({
    useHashTab: () => {
        const [, force] = React.useReducer(x => x + 1, 0)
        return [tabState, (t: string) => { tabState = t; force() }]
    },
}))

afterEach(() => {
    cleanup()
    tabState = 'inventory'
})

describe('BookPage', () => {
    it('opens on the inventory with every duplicated pattern listed', () => {
        render(<BookPage/>)
        for (const d of DUPLICATES) expect(screen.getByText(d.title)).toBeInTheDocument()
        expect(screen.getByText('What already exists')).toBeInTheDocument()
    })

    it('expands a pattern to show its proposal', () => {
        render(<BookPage/>)
        fireEvent.click(screen.getByText('Confirm-before-destructive sheets'))
        expect(screen.getByText(/<ConfirmSheet open title message/)).toBeInTheDocument()
    })

    it('switches to the design guide and the live specimens', () => {
        render(<BookPage/>)
        fireEvent.click(screen.getByText('🎨 Design guide'))
        expect(screen.getByText('Colour roles')).toBeInTheDocument()
        fireEvent.click(screen.getByText('🧩 Components'))
        expect(screen.getByText('Buttons')).toBeInTheDocument()
        expect(screen.getByRole('switch', {name: 'Setting label'})).toHaveAttribute('aria-checked', 'true')
    })

    it('opens the specimen sheet', () => {
        tabState = 'components'
        render(<BookPage/>)
        fireEvent.click(screen.getByText('Open sheet'))
        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
})

describe('book inventory data', () => {
    it('has unique ids and priorities in range', () => {
        const ids = DUPLICATES.map(d => d.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const d of DUPLICATES) expect([1, 2, 3]).toContain(d.priority)
    })

    it('names each shared block once', () => {
        const names = PRIMITIVES.map(p => p.name)
        expect(new Set(names).size).toBe(names.length)
    })
})
