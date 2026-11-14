import {describe, it, expect, vi} from 'vitest'
import {render, screen} from '@testing-library/react'
import {BarLegend, ProportionBar} from '@/components/ui/ProportionBar'

vi.mock('@/lib/motion', () => ({flourishEnabled: () => false}))

describe('ProportionBar', () => {
    it('sizes segments relative to their sum', () => {
        const {container} = render(<ProportionBar ariaLabel="bar" segments={[
            {key: 'a', value: 1, color: 'var(--positive)'},
            {key: 'b', value: 3, color: 'var(--danger)'},
        ]}/>)
        const segs = container.querySelectorAll<HTMLElement>('[data-segment]')
        expect(segs[0].style.width).toBe('25%')
        expect(segs[1].style.width).toBe('75%')
        expect(screen.getByRole('img', {name: 'bar'})).toBeInTheDocument()
    })

    it('scales against a shared total so rows compare', () => {
        const {container} = render(<ProportionBar ariaLabel="bar" total={10}
                                                  segments={[{key: 'a', value: 5, color: 'var(--positive)'}]}/>)
        expect(container.querySelector<HTMLElement>('[data-segment="a"]')!.style.width).toBe('50%')
    })

    it('skips empty segments and renders nothing without data', () => {
        const {container, rerender} = render(<ProportionBar ariaLabel="bar" segments={[
            {key: 'a', value: 0, color: 'var(--positive)'},
            {key: 'b', value: 2, color: 'var(--danger)'},
        ]}/>)
        expect(container.querySelectorAll('[data-segment]')).toHaveLength(1)
        rerender(<ProportionBar ariaLabel="bar" segments={[{key: 'a', value: 0, color: 'var(--positive)'}]}/>)
        expect(container.firstChild).toBeNull()
    })

    it('hides itself from assistive tech when the label lives on a parent', () => {
        const {container} = render(<ProportionBar ariaLabel="" segments={[{key: 'a', value: 1, color: 'var(--positive)'}]}/>)
        expect((container.firstChild as HTMLElement).getAttribute('aria-hidden')).toBe('true')
        expect(screen.queryByRole('img')).toBeNull()
    })
})

describe('BarLegend', () => {
    it('lists labels with optional values', () => {
        render(<BarLegend items={[{key: 'a', color: 'var(--positive)', label: 'Paid', value: '3'}]}/>)
        expect(screen.getByText('Paid')).toBeInTheDocument()
        expect(screen.getByText('3')).toBeInTheDocument()
    })
})
