import {describe, expect, it} from 'vitest'
import {AA_LARGE, AA_TEXT, contrastRatio, ensureContrast, mixOver, readableOn, relativeLuminance} from '../contrast'
import {hexToHsl} from '../color'

describe('relativeLuminance', () => {
    it('is 0 for black and 1 for white', () => {
        expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
        expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
    })

    it('accepts shorthand hex', () => {
        expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#ffffff'), 5)
    })
})

describe('contrastRatio', () => {
    it('is 21:1 for black on white', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    })

    it('is 1:1 for identical colors', () => {
        expect(contrastRatio('#e8a020', '#e8a020')).toBeCloseTo(1, 5)
    })

    it('is order-independent', () => {
        expect(contrastRatio('#e8a020', '#1a1410')).toBeCloseTo(contrastRatio('#1a1410', '#e8a020'), 5)
    })

    it('reproduces the measured light-mode failures that motivated #70', () => {
        // The amber brand color on the light background the default theme derives.
        expect(contrastRatio('#e8a020', '#efe9e5')).toBeLessThan(2)
        // ...while being perfectly fine on the dark one.
        expect(contrastRatio('#e8a020', '#1a1410')).toBeGreaterThan(8)
    })
})

describe('readableOn', () => {
    it('picks dark text on a light fill', () => {
        expect(relativeLuminance(readableOn('#e8a020'))).toBeLessThan(0.2)
    })

    it('picks light text on a dark fill', () => {
        expect(relativeLuminance(readableOn('#26324a'))).toBeGreaterThan(0.8)
    })

    it('always returns something that itself passes AA on the fill', () => {
        for (const fill of ['#e8a020', '#5cb87a', '#5090d8', '#d95050', '#a06bcc', '#ff9632', '#6b7c5a']) {
            expect(contrastRatio(readableOn(fill), fill)).toBeGreaterThanOrEqual(AA_TEXT)
        }
    })
})

describe('ensureContrast', () => {
    it('leaves an already-conforming color untouched', () => {
        expect(ensureContrast('#e8a020', '#1a1410', AA_TEXT)).toBe('#e8a020')
    })

    it('darkens a foreground that fails on a light background', () => {
        const fixed = ensureContrast('#e8a020', '#efe9e5', AA_TEXT)
        expect(contrastRatio(fixed, '#efe9e5')).toBeGreaterThanOrEqual(AA_TEXT)
        expect(relativeLuminance(fixed)).toBeLessThan(relativeLuminance('#e8a020'))
    })

    it('brightens a foreground that fails on a dark background', () => {
        const fixed = ensureContrast('#3a2c14', '#1a1410', AA_TEXT)
        expect(contrastRatio(fixed, '#1a1410')).toBeGreaterThanOrEqual(AA_TEXT)
        expect(relativeLuminance(fixed)).toBeGreaterThan(relativeLuminance('#3a2c14'))
    })

    it('keeps hue and saturation so club branding survives the fix', () => {
        const [h, s] = hexToHsl('#e8a020')
        const [fh, fs] = hexToHsl(ensureContrast('#e8a020', '#efe9e5', AA_TEXT))
        expect(fh).toBeCloseTo(h, 0)
        expect(fs).toBeCloseTo(s, 0)
    })

    it('reaches AA for every team hue against both a dark and a light background', () => {
        for (const hue of ['#e8a020', '#5cb87a', '#5090d8', '#d95050', '#a06bcc', '#ff9632']) {
            for (const bg of ['#1a1410', '#efe9e5', '#ffffff', '#000000']) {
                expect(contrastRatio(ensureContrast(hue, bg, AA_TEXT), bg)).toBeGreaterThanOrEqual(AA_TEXT)
            }
        }
    })

    it('returns the most readable variant available when the target is unreachable', () => {
        // Nothing reaches 21:1 against mid grey; the result must still be the best end of the ramp.
        const best = ensureContrast('#808080', '#808080', 21)
        expect(contrastRatio(best, '#808080')).toBeGreaterThan(contrastRatio('#808080', '#808080'))
    })

    it('handles an achromatic foreground without dividing by zero', () => {
        const fixed = ensureContrast('#ffffff', '#ffffff', AA_LARGE)
        expect(contrastRatio(fixed, '#ffffff')).toBeGreaterThanOrEqual(AA_LARGE)
    })
})

describe('mixOver', () => {
    it('returns the background at 0% and the foreground at 100%', () => {
        expect(mixOver('#e8a020', '#1a1410', 0)).toBe('#1a1410')
        expect(mixOver('#e8a020', '#1a1410', 100)).toBe('#e8a020')
    })

    it('lands between the two at 15%, matching color-mix in srgb', () => {
        // 0xe8 * .15 + 0x1a * .85 = 232*.15 + 26*.85 = 56.9 -> 0x39
        expect(mixOver('#e8a020', '#1a1410', 15)).toBe('#392912')
    })

    it('clamps out-of-range percentages', () => {
        expect(mixOver('#ffffff', '#000000', -20)).toBe('#000000')
        expect(mixOver('#ffffff', '#000000', 500)).toBe('#ffffff')
    })
})
