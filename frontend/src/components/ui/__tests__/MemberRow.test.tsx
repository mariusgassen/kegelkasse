import {describe, it, expect, vi} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import React from 'react'
import {Avatar} from '../Avatar'
import {MemberRow} from '../MemberRow'
import {MeBadge, PinBadges, MemberBadges} from '../MemberBadges'
import type {ClubPin} from '@/types'

const pin = (over: Partial<ClubPin> = {}): ClubPin => ({
    id: 1, name: 'Wanderpokal', icon: '📌',
    holder_regular_member_id: 7, holder_name: 'Marius', assigned_at: null, ...over,
})

describe('Avatar', () => {
    it('falls back to the first letter of the display name', () => {
        render(<Avatar name="marius"/>)
        expect(screen.getByText('M')).toBeInTheDocument()
    })

    it('renders the uploaded image instead of the initial', () => {
        const {container} = render(<Avatar name="Marius" src="/uploads/a.png"/>)
        expect(container.querySelector('img')).toHaveAttribute('src', '/uploads/a.png')
        expect(screen.queryByText('M')).not.toBeInTheDocument()
    })

    it('uses a flat grey disc for the muted (guest) variant', () => {
        const {container} = render(<Avatar name="Gast" variant="muted"/>)
        const el = container.firstElementChild as HTMLElement
        expect(el.className).toContain('bg-muted')
        expect(el.getAttribute('style') ?? '').not.toContain('gradient')
    })

    it('does not crash on an empty name', () => {
        const {container} = render(<Avatar name=""/>)
        expect(container.textContent).toBe('?')
    })
})

describe('MeBadge', () => {
    it('renders the localised "Ich" marker', () => {
        render(<MeBadge/>)
        expect(screen.getByText('Ich')).toBeInTheDocument()
    })

    it('flips to the inverted colour on a selected pill', () => {
        render(<MeBadge inverted/>)
        expect(screen.getByText('Ich').className).toContain('text-on-accent')
    })
})

describe('PinBadges', () => {
    it('exposes the pin name as an aria-label, not a title tooltip', () => {
        render(<PinBadges pins={[pin()]} memberId={7}/>)
        const badge = screen.getByLabelText('Wanderpokal')
        expect(badge).toHaveTextContent('📌')
        expect(badge).not.toHaveAttribute('title')
    })

    it('only shows pins held by the given member', () => {
        render(<PinBadges pins={[pin(), pin({id: 2, name: 'Laterne', icon: '🏮', holder_regular_member_id: 8})]}
                          memberId={7}/>)
        expect(screen.getByLabelText('Wanderpokal')).toBeInTheDocument()
        expect(screen.queryByLabelText('Laterne')).not.toBeInTheDocument()
    })

    it('renders nothing without a member id', () => {
        const {container} = render(<PinBadges pins={[pin()]} memberId={null}/>)
        expect(container).toBeEmptyDOMElement()
    })
})

describe('MemberBadges', () => {
    it('renders the Ich marker, king crown and pins together', () => {
        render(<MemberBadges isMe isKing pins={[pin()]} memberId={7}/>)
        expect(screen.getByText('Ich')).toBeInTheDocument()
        expect(screen.getByLabelText('König')).toHaveTextContent('👑')
        expect(screen.getByLabelText('Wanderpokal')).toBeInTheDocument()
    })

    it('omits badges that do not apply', () => {
        const {container} = render(<MemberBadges/>)
        expect(container).toBeEmptyDOMElement()
    })
})

describe('MemberRow', () => {
    it('shows the display name, subtitle and meta line', () => {
        render(<MemberRow name="Muckel" subtitle="Marius Gassen" meta="@marius"/>)
        expect(screen.getByText('Muckel')).toBeInTheDocument()
        expect(screen.getByText('Marius Gassen')).toBeInTheDocument()
        expect(screen.getByText('@marius')).toBeInTheDocument()
    })

    it('stays inert without an onClick — no button role, no chevron', () => {
        render(<MemberRow name="Muckel"/>)
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
        expect(screen.queryByText('›')).not.toBeInTheDocument()
    })

    it('becomes a labelled button with a visible chevron when tappable', () => {
        const onClick = vi.fn()
        render(<MemberRow name="Muckel" actionLabel="Aktionen für Muckel" onClick={onClick}/>)
        const row = screen.getByRole('button', {name: 'Aktionen für Muckel'})
        expect(row).toHaveTextContent('›')
        fireEvent.click(row)
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('falls back to the display name as the accessible name', () => {
        render(<MemberRow name="Muckel" onClick={vi.fn()}/>)
        expect(screen.getByRole('button', {name: 'Muckel'})).toBeInTheDocument()
    })

    it('activates on Enter and Space', () => {
        const onClick = vi.fn()
        render(<MemberRow name="Muckel" onClick={onClick}/>)
        const row = screen.getByRole('button')
        fireEvent.keyDown(row, {key: 'Enter'})
        fireEvent.keyDown(row, {key: ' '})
        expect(onClick).toHaveBeenCalledTimes(2)
    })

    it('renders badges and the trailing slot', () => {
        render(<MemberRow name="Muckel" isMe pins={[pin()]} memberId={7}
                          trailing={<span>admin</span>}/>)
        expect(screen.getByText('Ich')).toBeInTheDocument()
        expect(screen.getByLabelText('Wanderpokal')).toBeInTheDocument()
        expect(screen.getByText('admin')).toBeInTheDocument()
    })
})
