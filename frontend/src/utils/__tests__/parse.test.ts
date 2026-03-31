import { describe, it, expect } from 'vitest'
import { parseAmount } from '../parse'

describe('parseAmount', () => {
    it('parses integer string', () => {
        expect(parseAmount('5')).toBe(5)
    })

    it('parses decimal with dot separator', () => {
        expect(parseAmount('3.50')).toBe(3.5)
    })

    it('parses decimal with comma separator', () => {
        expect(parseAmount('3,50')).toBe(3.5)
    })

    it('parses zero', () => {
        expect(parseAmount('0')).toBe(0)
    })

    it('returns 0 for empty string', () => {
        expect(parseAmount('')).toBe(0)
    })

    it('returns 0 for non-numeric string', () => {
        expect(parseAmount('abc')).toBe(0)
    })

    it('parses negative amount', () => {
        expect(parseAmount('-1,50')).toBe(-1.5)
    })

    it('parses large amount', () => {
        expect(parseAmount('1000')).toBe(1000)
    })
})
