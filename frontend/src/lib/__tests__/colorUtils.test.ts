import { describe, it, expect } from 'vitest'
import { hexToHsl, hslToHex } from '../../App'

describe('hexToHsl', () => {
    it('converts pure red', () => {
        const [h, s, l] = hexToHsl('#ff0000')
        expect(h).toBeCloseTo(0, 0)
        expect(s).toBeCloseTo(100, 0)
        expect(l).toBeCloseTo(50, 0)
    })

    it('converts pure green', () => {
        const [h, s, l] = hexToHsl('#00ff00')
        expect(h).toBeCloseTo(120, 0)
        expect(s).toBeCloseTo(100, 0)
        expect(l).toBeCloseTo(50, 0)
    })

    it('converts pure blue', () => {
        const [h, s, l] = hexToHsl('#0000ff')
        expect(h).toBeCloseTo(240, 0)
        expect(s).toBeCloseTo(100, 0)
        expect(l).toBeCloseTo(50, 0)
    })

    it('converts white', () => {
        const [h, s, l] = hexToHsl('#ffffff')
        expect(l).toBeCloseTo(100, 0)
    })

    it('converts black', () => {
        const [h, s, l] = hexToHsl('#000000')
        expect(l).toBeCloseTo(0, 0)
    })

    it('returns array of three numbers', () => {
        const result = hexToHsl('#3d7fbf')
        expect(result).toHaveLength(3)
        result.forEach(v => expect(typeof v).toBe('number'))
    })
})

describe('hslToHex', () => {
    it('converts hsl(0, 100%, 50%) to red', () => {
        expect(hslToHex(0, 100, 50)).toBe('#ff0000')
    })

    it('converts hsl(120, 100%, 50%) to green', () => {
        expect(hslToHex(120, 100, 50)).toBe('#00ff00')
    })

    it('converts hsl(240, 100%, 50%) to blue', () => {
        expect(hslToHex(240, 100, 50)).toBe('#0000ff')
    })

    it('converts hsl(0, 0%, 100%) to white', () => {
        expect(hslToHex(0, 0, 100)).toBe('#ffffff')
    })

    it('converts hsl(0, 0%, 0%) to black', () => {
        expect(hslToHex(0, 0, 0)).toBe('#000000')
    })

    it('returns string starting with #', () => {
        expect(hslToHex(200, 50, 50)).toMatch(/^#[0-9a-f]{6}$/)
    })
})

describe('hexToHsl → hslToHex round-trip', () => {
    const colors = [
        '#ff0000',
        '#00ff00',
        '#0000ff',
        '#ffffff',
        '#000000',
        '#3d7fbf',
        '#ff6b35',
        '#7c3aed',
        '#10b981',
        '#f59e0b',
    ]

    colors.forEach(hex => {
        it(`round-trips ${hex}`, () => {
            const [h, s, l] = hexToHsl(hex)
            const result = hslToHex(h, s, l)
            expect(result).toBe(hex)
        })
    })
})
