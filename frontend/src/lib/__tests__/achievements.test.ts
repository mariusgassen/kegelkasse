import {describe, expect, it} from 'vitest'
import {earnedCount, progressFraction, sortAchievements} from '../achievements'
import type {Achievement} from '../../types'

function badge(over: Partial<Achievement>): Achievement {
    return {key: 'x', icon: '⭐', earned: false, tier: null, progress: 0, target: null, ...over}
}

describe('earnedCount', () => {
    it('counts only earned badges', () => {
        expect(earnedCount([
            badge({earned: true}), badge({earned: false}), badge({earned: true}),
        ])).toBe(2)
    })
    it('is 0 for empty list', () => {
        expect(earnedCount([])).toBe(0)
    })
})

describe('sortAchievements', () => {
    it('puts earned before locked', () => {
        const out = sortAchievements([
            badge({key: 'a', earned: false}),
            badge({key: 'b', earned: true, tier: 'bronze'}),
        ])
        expect(out.map(a => a.key)).toEqual(['b', 'a'])
    })

    it('orders earned by tier (gold > silver > bronze)', () => {
        const out = sortAchievements([
            badge({key: 'bronze', earned: true, tier: 'bronze'}),
            badge({key: 'gold', earned: true, tier: 'gold'}),
            badge({key: 'silver', earned: true, tier: 'silver'}),
        ])
        expect(out.map(a => a.key)).toEqual(['gold', 'silver', 'bronze'])
    })

    it('is stable within a group (preserves input order for ties)', () => {
        const out = sortAchievements([
            badge({key: 'x1', earned: false}),
            badge({key: 'x2', earned: false}),
            badge({key: 'x3', earned: false}),
        ])
        expect(out.map(a => a.key)).toEqual(['x1', 'x2', 'x3'])
    })

    it('does not mutate the input array', () => {
        const input = [badge({key: 'a', earned: false}), badge({key: 'b', earned: true})]
        const copy = [...input]
        sortAchievements(input)
        expect(input).toEqual(copy)
    })
})

describe('progressFraction', () => {
    it('is 1 for fully-earned (no target)', () => {
        expect(progressFraction(badge({earned: true, target: null}))).toBe(1)
    })
    it('is 0 for locked with no target', () => {
        expect(progressFraction(badge({earned: false, target: null}))).toBe(0)
    })
    it('is progress / target, clamped to [0,1]', () => {
        expect(progressFraction(badge({progress: 5, target: 10}))).toBe(0.5)
        expect(progressFraction(badge({progress: 20, target: 10}))).toBe(1)
        expect(progressFraction(badge({progress: -3, target: 10}))).toBe(0)
    })
})
