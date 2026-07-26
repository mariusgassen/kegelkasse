import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen} from '@testing-library/react'
import {Skeleton, SkeletonRows, SkeletonCard, SkeletonChart} from '@/components/ui/Skeleton'
import {CountUp} from '@/components/ui/CountUp'
import {useEffectsStore} from '@/store/effects'

vi.mock('@/i18n', () => ({useT: () => (k: string) => k}))

describe('Skeleton', () => {
    it('renders a shimmering block at the requested size', () => {
        const {container} = render(<Skeleton width="40px" height="12px"/>)
        const block = container.querySelector('.kce-skeleton') as HTMLElement
        expect(block).toBeTruthy()
        expect(block.style.width).toBe('40px')
        expect(block.style.height).toBe('12px')
    })

    it('hides the decorative block from assistive tech', () => {
        const {container} = render(<Skeleton/>)
        expect(container.querySelector('.kce-skeleton')?.getAttribute('aria-hidden')).toBe('true')
    })

    it('rounds fully for avatar-shaped placeholders', () => {
        const {container} = render(<Skeleton rounded="full"/>)
        expect(container.querySelector('.kce-skeleton')?.className).toContain('rounded-full')
    })
})

/**
 * The point of the a11y contract: replacing the old "Lade…" line with a purely visual skeleton
 * would have removed the only thing a screen reader had to announce. Each shape is an announced
 * status region carrying a visually hidden label instead.
 */
describe('skeleton loading contract', () => {
    it.each([
        ['rows', <SkeletonRows key="r"/>],
        ['card', <SkeletonCard key="c"/>],
        ['chart', <SkeletonChart key="h"/>],
    ])('%s announces the loading state', (_name, node) => {
        render(node)
        expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
        expect(screen.getByText('action.loading')).toBeInTheDocument()
    })

    it('renders one placeholder per requested row', () => {
        const {container} = render(<SkeletonRows rows={5}/>)
        expect(container.querySelectorAll('.kce-card')).toHaveLength(5)
    })

    it('reserves the chart height so nothing reflows when data lands', () => {
        const {container} = render(<SkeletonChart height="180px"/>)
        expect((container.querySelector('.kce-skeleton') as HTMLElement).style.height).toBe('180px')
    })
})

describe('CountUp', () => {
    beforeEach(() => {
        useEffectsStore.setState({effectsEnabled: true})
        vi.stubGlobal('matchMedia', (q: string) => ({matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn()}))
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        useEffectsStore.setState({effectsEnabled: true})
    })

    it('renders the value through the caller\'s formatter', () => {
        render(<CountUp value={12.5} format={v => `${v.toFixed(2)} €`}/>)
        expect(screen.getByText('12.50 €')).toBeInTheDocument()
    })

    it('passes through className and testid so it can replace a styled span', () => {
        render(<CountUp value={3} format={String} className="font-bold" data-testid="amount"/>)
        const el = screen.getByTestId('amount')
        expect(el.className).toBe('font-bold')
        expect(el).toHaveTextContent('3')
    })
})
