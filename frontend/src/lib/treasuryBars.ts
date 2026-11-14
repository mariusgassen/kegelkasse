// Pure segment maths for the small proportion bars that sit next to the Kasse figures.
import type {BalanceLike, TreasurySummary} from '@/lib/treasurySummary.ts'

export interface Segment<K extends string = string> {
    key: K
    value: number
}

/**
 * Where the money that came in went: spent, still in the till, and — appended — what is still owed.
 * Inflow = paid in + other income; the till holds inflow − expenses. Values are clamped at zero so a
 * till that is in the red simply shows everything as spent.
 */
export function cashFlowSegments(s: Pick<TreasurySummary, 'paidIn' | 'otherIncome' | 'expensesGross' | 'outstanding'>): Segment<'expenses' | 'cash' | 'outstanding'>[] {
    const inflow = Math.max(0, s.paidIn + s.otherIncome)
    const spent = Math.min(Math.max(0, s.expensesGross), inflow)
    return [
        {key: 'expenses', value: spent},
        {key: 'cash', value: inflow - spent},
        {key: 'outstanding', value: Math.max(0, s.outstanding)},
    ]
}

/** One account's penalties split into the paid part and the still-open part. */
export function penaltySegments(b: Pick<BalanceLike, 'balance' | 'penalty_total'>): Segment<'paid' | 'open'>[] {
    const open = Math.max(0, -b.balance)
    const paid = Math.max(0, b.penalty_total - open)
    return [{key: 'paid', value: paid}, {key: 'open', value: open}]
}

/** The longest `penaltySegments` bar in a list, so rows can share one scale. */
export function penaltyScale(list: Pick<BalanceLike, 'balance' | 'penalty_total'>[]): number {
    return list.reduce((m, b) => Math.max(m, penaltySegments(b).reduce((s, x) => s + x.value, 0)), 0)
}

/** Largest absolute value in a list — the shared scale for a column of mini bars. */
export function maxAbs(values: number[]): number {
    return values.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
}

/** Replace `{name}` placeholders in a translated string (the i18n layer has no interpolation). */
export function fill(text: string, vars: Record<string, string | number>): string {
    return Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), text)
}

/**
 * Running balance after each event, oldest first — the points of an account sparkline.
 * Starts at 0 before the first event so the line shows where the account came from.
 */
export function runningBalance(events: { ts: number; delta: number }[]): { ts: number; balance: number }[] {
    const sorted = [...events].sort((a, b) => a.ts - b.ts)
    if (sorted.length === 0) return []
    let balance = 0
    const points = [{ts: sorted[0].ts, balance: 0}]
    for (const e of sorted) {
        balance = Math.round((balance + e.delta) * 100) / 100
        points.push({ts: e.ts, balance})
    }
    return points
}
