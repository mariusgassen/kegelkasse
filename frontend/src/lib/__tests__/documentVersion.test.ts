import {describe, expect, it} from 'vitest'
import {nextVersion} from '../documentVersion'

describe('nextVersion', () => {
    it('bumps the last number', () => {
        expect(nextVersion('1.0')).toBe('1.1')
        expect(nextVersion('1.9')).toBe('1.10')
        expect(nextVersion('2')).toBe('3')
        expect(nextVersion('v2')).toBe('v3')
        expect(nextVersion('2026-3')).toBe('2026-4')
        expect(nextVersion('Fassung 4 (neu)')).toBe('Fassung 5 (neu)')
    })

    it('returns an empty suggestion without a number', () => {
        expect(nextVersion(null)).toBe('')
        expect(nextVersion(undefined)).toBe('')
        expect(nextVersion('  ')).toBe('')
        expect(nextVersion('Entwurf')).toBe('')
    })
})
