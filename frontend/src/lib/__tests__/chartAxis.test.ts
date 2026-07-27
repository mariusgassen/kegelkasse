import {describe, it, expect} from 'vitest'
import {axisLeftPad, compactEuro, compactNumber, estimateTextWidth} from '@/lib/chartAxis.ts'

describe('estimateTextWidth', () => {
    it('scales with the font size', () => {
        expect(estimateTextWidth('123', 24)).toBeCloseTo(estimateTextWidth('123', 12) * 2)
    })

    it('grows with the number of characters', () => {
        expect(estimateTextWidth('1234', 12)).toBeGreaterThan(estimateTextWidth('123', 12))
    })

    it('counts separators as narrower than digits', () => {
        expect(estimateTextWidth('1.234', 12)).toBeLessThan(estimateTextWidth('12345', 12))
    })

    it('is zero for empty text', () => {
        expect(estimateTextWidth('', 15)).toBe(0)
    })
})

describe('axisLeftPad', () => {
    it('leaves room for the widest label plus the gap', () => {
        const pad = axisLeftPad(['€0', '€1.234,56'], 15, {gap: 5})
        expect(pad).toBeGreaterThanOrEqual(estimateTextWidth('€1.234,56', 15) + 5)
    })

    it('is driven by the widest label regardless of its position', () => {
        const labels = ['€0', '€500', '€1.234,56']
        expect(axisLeftPad(labels, 15)).toBe(axisLeftPad([...labels].reverse(), 15))
    })

    it('honours the minimum so small labels keep the usual proportions', () => {
        expect(axisLeftPad(['0'], 12, {min: 30})).toBe(30)
    })

    it('adds the reserved space for a rotated axis title', () => {
        const plain = axisLeftPad(['12,50'], 12)
        expect(axisLeftPad(['12,50'], 12, {reserve: 14})).toBe(plain + 14)
    })

    it('is at least the minimum for no labels at all', () => {
        expect(axisLeftPad([], 12, {min: 24})).toBe(24)
    })
})

describe('compactNumber', () => {
    it('keeps small values readable to two decimals', () => {
        expect(compactNumber(4.567)).toBe('4,57')
        expect(compactNumber(0)).toBe('0')
    })

    it('drops to one decimal in the tens', () => {
        expect(compactNumber(45.67)).toBe('45,7')
    })

    it('rounds to whole numbers in the hundreds', () => {
        expect(compactNumber(123.45)).toBe('123')
    })

    it('abbreviates thousands and millions', () => {
        expect(compactNumber(1234)).toBe('1,2k')
        expect(compactNumber(12345)).toBe('12k')
        expect(compactNumber(1_234_567)).toBe('1,2M')
    })

    it('handles negative values symmetrically', () => {
        expect(compactNumber(-1234)).toBe('-1,2k')
    })

    it('never grows longer than the plain number it replaces', () => {
        for (const v of [999.99, 1234.56, 98765.43, 1234567.89]) {
            expect(compactNumber(v).length).toBeLessThanOrEqual(
                v.toLocaleString('de-DE', {minimumFractionDigits: 2}).length)
        }
    })
})

describe('compactEuro', () => {
    it('prefixes the compact number with a euro sign', () => {
        expect(compactEuro(1234)).toBe('€1,2k')
        expect(compactEuro(0)).toBe('€0')
    })

    it('stays inside a 46-unit gutter at the charts\' 15-unit axis font', () => {
        // The old fixed gutter; every realistic club balance has to fit it.
        for (const v of [0, 12.5, 480, 5300, 128_000]) {
            expect(estimateTextWidth(compactEuro(v), 15)).toBeLessThan(46)
        }
    })
})
