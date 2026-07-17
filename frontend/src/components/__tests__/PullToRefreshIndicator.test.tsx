import {describe, it, expect} from 'vitest'
import {render} from '@testing-library/react'
import React from 'react'
import {PullToRefreshIndicator} from '../PullToRefreshIndicator'

describe('PullToRefreshIndicator', () => {
    it('renders nothing when idle', () => {
        const {container} = render(<PullToRefreshIndicator pullDistance={0} dragging={false} refreshing={false}/>)
        expect(container.firstChild).toBeNull()
    })

    it('renders a chevron while dragging below the threshold', () => {
        const {container} = render(<PullToRefreshIndicator pullDistance={20} dragging={true} refreshing={false}/>)
        expect(container.querySelector('svg')).toBeInTheDocument()
        // AppLogoAnimated (the refreshing-state logo) is not shown while still dragging
        expect(container.querySelector('svg[aria-label="Kegelkasse Logo"]')).not.toBeInTheDocument()
    })

    it('flips the chevron past the threshold', () => {
        const {container} = render(<PullToRefreshIndicator pullDistance={80} dragging={true} refreshing={false}/>)
        const rotated = container.querySelector('div[style*="rotate(180deg"]')
        expect(rotated).toBeTruthy()
    })

    it('shows the animated app logo while refreshing', () => {
        const {container} = render(<PullToRefreshIndicator pullDistance={50} dragging={false} refreshing={true}/>)
        expect(container.querySelector('svg[aria-label="Kegelkasse Logo"]')).toBeInTheDocument()
    })

    it('stays visible (not null) while refreshing even if pullDistance is 0', () => {
        const {container} = render(<PullToRefreshIndicator pullDistance={0} dragging={false} refreshing={true}/>)
        expect(container.firstChild).not.toBeNull()
    })

    it('is not interactive (pointer-events none) so it never blocks touches', () => {
        const {container} = render(<PullToRefreshIndicator pullDistance={40} dragging={true} refreshing={false}/>)
        const root = container.firstElementChild as HTMLElement
        expect(root.style.pointerEvents).toBe('none')
    })
})
