import {describe, it, expect, vi} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import React from 'react'
import {StatTile} from '../StatTile'
import {ExpandableCard} from '../ExpandableCard'

describe('StatTile', () => {
    it('renders the value and its caption', () => {
        render(<StatTile value="12,50 €" label="Strafen"/>)
        expect(screen.getByText('12,50 €')).toBeInTheDocument()
        expect(screen.getByText('Strafen')).toBeInTheDocument()
    })

    it('is a plain card without an action', () => {
        render(<StatTile value={3} label="Abende"/>)
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('becomes a button when given onClick', () => {
        const onClick = vi.fn()
        render(<StatTile value={3} label="Abende" onClick={onClick}/>)
        fireEvent.click(screen.getByRole('button'))
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('does not fire while disabled', () => {
        const onClick = vi.fn()
        render(<StatTile value={0} label="Strafen" onClick={onClick} disabled/>)
        fireEvent.click(screen.getByRole('button'))
        expect(onClick).not.toHaveBeenCalled()
    })

    it('colours the value by tone', () => {
        render(<StatTile value="9" label="Offen" tone="negative"/>)
        expect(screen.getByText('9').className).toContain('text-danger-fg')
    })

    it('drops the card chrome in bare mode', () => {
        const {container} = render(<StatTile value="1" label="X" bare/>)
        expect((container.firstElementChild as HTMLElement).className).not.toContain('kce-card')
    })
})

describe('ExpandableCard', () => {
    it('starts collapsed and hides its body', () => {
        render(<ExpandableCard title="Details"><p>versteckt</p></ExpandableCard>)
        expect(screen.getByRole('button', {name: /Details/})).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText('versteckt')).not.toBeInTheDocument()
    })

    it('reveals the body on click and updates aria-expanded', () => {
        render(<ExpandableCard title="Details"><p>sichtbar</p></ExpandableCard>)
        fireEvent.click(screen.getByRole('button', {name: /Details/}))
        expect(screen.getByText('sichtbar')).toBeInTheDocument()
        expect(screen.getByRole('button', {name: /Details/})).toHaveAttribute('aria-expanded', 'true')
    })

    it('honours defaultOpen', () => {
        render(<ExpandableCard title="Details" defaultOpen><p>offen</p></ExpandableCard>)
        expect(screen.getByText('offen')).toBeInTheDocument()
    })

    it('supports controlled mode', () => {
        const onToggle = vi.fn()
        render(<ExpandableCard title="Details" open={false} onToggle={onToggle}><p>zu</p></ExpandableCard>)
        fireEvent.click(screen.getByRole('button', {name: /Details/}))
        expect(onToggle).toHaveBeenCalledWith(true)
        // stays closed — the parent owns the state
        expect(screen.queryByText('zu')).not.toBeInTheDocument()
    })

    it('flips the chevron direction', () => {
        render(<ExpandableCard title="Details"><p>x</p></ExpandableCard>)
        const btn = screen.getByRole('button', {name: /Details/})
        expect(btn).toHaveTextContent('▼')
        fireEvent.click(btn)
        expect(btn).toHaveTextContent('▲')
    })
})
