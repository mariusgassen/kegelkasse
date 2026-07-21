export function pearson(xs: number[], ys: number[]): number | null {
    const n = xs.length
    if (n < 3 || n !== ys.length) return null
    const meanX = xs.reduce((a, b) => a + b, 0) / n
    const meanY = ys.reduce((a, b) => a + b, 0) / n
    let varX = 0, varY = 0, cov = 0
    for (let i = 0; i < n; i++) {
        const dx = xs[i] - meanX
        const dy = ys[i] - meanY
        varX += dx * dx
        varY += dy * dy
        cov += dx * dy
    }
    if (varX === 0 || varY === 0) return null
    const denom = Math.sqrt(varX * varY)
    if (denom === 0) return null
    return Math.round((cov / denom) * 1000) / 1000
}

export interface LinReg {
    slope: number
    intercept: number
}

export function linearRegression(points: { x: number; y: number }[]): LinReg | null {
    const n = points.length
    if (n < 2) return null
    const meanX = points.reduce((a, p) => a + p.x, 0) / n
    const meanY = points.reduce((a, p) => a + p.y, 0) / n
    let num = 0, den = 0
    for (const p of points) {
        const dx = p.x - meanX
        num += dx * (p.y - meanY)
        den += dx * dx
    }
    if (den === 0) return null
    const slope = num / den
    return { slope, intercept: meanY - slope * meanX }
}

export function interpretR(r: number | null): 'strong' | 'moderate' | 'weak' | 'none' {
    if (r === null) return 'none'
    const a = Math.abs(r)
    if (a >= 0.5) return 'strong'
    if (a >= 0.2) return 'moderate'
    return 'weak'
}

export interface ShamePlayer {
    name: string; nickname: string | null; regular_member_id: number | null
    evenings: number; penalty_total: number; game_wins: number
    beer_rounds: number; shot_rounds: number; avg_pins: number | null; throw_count: number
}

export interface ShameEntry<P = ShamePlayer> {
    key: 'rate' | 'thirst' | 'worstThrow' | 'bridesmaid'
    icon: string
    player: P
    rawValue: number
}

const MIN_EVENINGS_FOR_RATE = 3
const MIN_THROWS_FOR_AVG = 10

/** Season-long "worst of" awards, one winner per category. Categories with no qualifying
 * player (not enough sample size) are omitted rather than picking a misleading winner. */
export function computeHallOfShame<P extends ShamePlayer>(players: P[]): ShameEntry<P>[] {
    const entries: (ShameEntry<P> | null)[] = []

    const rateEligible = players.filter(p => p.evenings >= MIN_EVENINGS_FOR_RATE)
    const rateTop = [...rateEligible].sort((a, b) => (b.penalty_total / b.evenings) - (a.penalty_total / a.evenings))[0]
    entries.push(rateTop ? {key: 'rate', icon: '💸', player: rateTop, rawValue: rateTop.penalty_total / rateTop.evenings} : null)

    const thirstEligible = players.filter(p => p.beer_rounds + p.shot_rounds > 0)
    const thirstTop = [...thirstEligible].sort((a, b) => (b.beer_rounds + b.shot_rounds) - (a.beer_rounds + a.shot_rounds))[0]
    entries.push(thirstTop ? {key: 'thirst', icon: '🍻', player: thirstTop, rawValue: thirstTop.beer_rounds + thirstTop.shot_rounds} : null)

    const throwEligible = players.filter(p => p.throw_count >= MIN_THROWS_FOR_AVG && p.avg_pins !== null)
    const worstThrowTop = [...throwEligible].sort((a, b) => (a.avg_pins ?? 0) - (b.avg_pins ?? 0))[0]
    entries.push(worstThrowTop ? {key: 'worstThrow', icon: '🎯', player: worstThrowTop, rawValue: worstThrowTop.avg_pins ?? 0} : null)

    const bridesmaidEligible = players.filter(p => p.game_wins === 0 && p.evenings >= MIN_EVENINGS_FOR_RATE)
    const bridesmaidTop = [...bridesmaidEligible].sort((a, b) => b.evenings - a.evenings)[0]
    entries.push(bridesmaidTop ? {key: 'bridesmaid', icon: '🃏', player: bridesmaidTop, rawValue: bridesmaidTop.evenings} : null)

    return entries.filter((e): e is ShameEntry<P> => e !== null)
}
