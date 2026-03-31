import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { AppLogo, AppLogoAnimated } from '../Logo'

describe('AppLogo', () => {
    it('renders an SVG element', () => {
        const { container } = render(<AppLogo />)
        expect(container.querySelector('svg')).toBeInTheDocument()
    })

    it('renders with default size 40', () => {
        const { container } = render(<AppLogo />)
        const svg = container.querySelector('svg')
        expect(svg).toHaveAttribute('width', '40')
        expect(svg).toHaveAttribute('height', '40')
    })

    it('renders with custom size', () => {
        const { container } = render(<AppLogo size={80} />)
        const svg = container.querySelector('svg')
        expect(svg).toHaveAttribute('width', '80')
        expect(svg).toHaveAttribute('height', '80')
    })

    it('has accessible aria-label', () => {
        const { container } = render(<AppLogo />)
        const svg = container.querySelector('svg')
        expect(svg).toHaveAttribute('aria-label', 'Kegelkasse Logo')
    })
})

describe('AppLogoAnimated', () => {
    it('renders a wrapping div with the logo inside', () => {
        const { container } = render(<AppLogoAnimated />)
        expect(container.querySelector('div')).toBeInTheDocument()
        expect(container.querySelector('svg')).toBeInTheDocument()
    })

    it('renders with default size', () => {
        const { container } = render(<AppLogoAnimated />)
        const svg = container.querySelector('svg')
        expect(svg).toHaveAttribute('width', '32')
    })

    it('renders with custom size', () => {
        const { container } = render(<AppLogoAnimated size={64} />)
        const svg = container.querySelector('svg')
        expect(svg).toHaveAttribute('width', '64')
    })
})
