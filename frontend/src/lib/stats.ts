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
