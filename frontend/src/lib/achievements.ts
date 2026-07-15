import type {Achievement, AchievementTier} from '../types'

/** Rank order used to sort earned badges by prestige (gold first). */
export const TIER_RANK: Record<AchievementTier, number> = {gold: 3, silver: 2, bronze: 1}

/** Number of earned badges in a list. */
export function earnedCount(list: Achievement[]): number {
    return list.filter(a => a.earned).length
}

/**
 * Sort a badge list for display: earned badges first (highest tier first),
 * then locked badges. Stable within each group to preserve the backend order,
 * which keeps the shelf layout predictable across refreshes.
 */
export function sortAchievements(list: Achievement[]): Achievement[] {
    return list
        .map((a, i) => ({a, i}))
        .sort((x, y) => {
            if (x.a.earned !== y.a.earned) return x.a.earned ? -1 : 1
            if (x.a.earned && y.a.earned) {
                const tr = (t: AchievementTier | null) => (t ? TIER_RANK[t] : 0)
                const d = tr(y.a.tier) - tr(x.a.tier)
                if (d !== 0) return d
            }
            return x.i - y.i // stable
        })
        .map(({a}) => a)
}

/**
 * Fraction (0..1) of the way to the next target for a locked/tiered badge.
 * Returns 1 for fully-earned (no further target) badges.
 */
export function progressFraction(a: Achievement): number {
    if (a.target === null || a.target <= 0) return a.earned ? 1 : 0
    return Math.max(0, Math.min(1, a.progress / a.target))
}
