import {describe, it, expect, vi} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import React from 'react'
import {ActionItem, MoreButton, CardActionMenu} from '../ActionSheet'

describe('ActionItem', () => {
    it('renders the icon and label and fires onClick', () => {
        const onClick = vi.fn()
        render(<ActionItem icon="🗑️" label="Löschen" onClick={onClick} danger/>)
        const btn = screen.getByRole('button', {name: /Löschen/})
        expect(btn).toHaveTextContent('🗑️')
        expect(btn.className).toContain('text-danger-fg') // danger styling
        fireEvent.click(btn)
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('does not fire onClick when disabled', () => {
        const onClick = vi.fn()
        render(<ActionItem icon="✏️" label="Bearbeiten" onClick={onClick} disabled/>)
        fireEvent.click(screen.getByRole('button', {name: /Bearbeiten/}))
        expect(onClick).not.toHaveBeenCalled()
    })
})

describe('MoreButton', () => {
    it('renders a labelled trigger and fires onClick', () => {
        const onClick = vi.fn()
        render(<MoreButton onClick={onClick} label="Aktionen"/>)
        const btn = screen.getByRole('button', {name: 'Aktionen'})
        fireEvent.click(btn)
        expect(onClick).toHaveBeenCalledTimes(1)
    })
})

describe('CardActionMenu', () => {
    it('renders nothing when there are no actions', () => {
        const {container} = render(<CardActionMenu title="Card" actions={[]}/>)
        expect(container).toBeEmptyDOMElement()
    })

    it('keeps the actions hidden until the ⋮ trigger is tapped', () => {
        render(<CardActionMenu title="Card" label="Aktionen"
                               actions={[{icon: '🗑️', label: 'Löschen', onClick: vi.fn(), danger: true}]}/>)
        // Menu closed → the action is not yet in the DOM.
        expect(screen.queryByText('Löschen')).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', {name: 'Aktionen'}))
        expect(screen.getByText('Löschen')).toBeInTheDocument()
    })

    it('runs the picked action and closes the menu', () => {
        const onEdit = vi.fn()
        const onDelete = vi.fn()
        render(<CardActionMenu title="Card" label="Aktionen" actions={[
            {icon: '✏️', label: 'Bearbeiten', onClick: onEdit},
            {icon: '🗑️', label: 'Löschen', onClick: onDelete, danger: true},
        ]}/>)
        fireEvent.click(screen.getByRole('button', {name: 'Aktionen'}))
        fireEvent.click(screen.getByText('Löschen'))
        expect(onDelete).toHaveBeenCalledTimes(1)
        expect(onEdit).not.toHaveBeenCalled()
        // Menu closed after picking → the action list is gone.
        expect(screen.queryByText('Bearbeiten')).not.toBeInTheDocument()
    })
})
