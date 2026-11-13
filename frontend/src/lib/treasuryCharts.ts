// Pure data derivations for the Kasse "Diagramme" tab (Recharts). No React, no i18n — labels
// are keys/strings handed in by the component so every shape stays unit-testable.
import type {BalanceLike, IdentifiedBalanceLike, TreasurySummary} from '@/lib/treasurySummary.ts'

export type WaterfallKind = 'in' | 'out' | 'total'

export interface WaterfallStep {
    key: 'paidIn' | 'expenses' | 'otherIncome' | 'cash' | 'outstanding' | 'projected'
    kind: WaterfallKind
    /** Signed change (in/out) or absolute level (total). */
    amount: number
    /** Floating bar [from, to] — works for negative running totals too. */
    range: [number, number]
}

/** Waterfall from the money-flow summary: paid in − expenses + other income = cash, + open debt = projected. */
export function waterfallSteps(s: TreasurySummary): WaterfallStep[] {
    const steps: WaterfallStep[] = []
    let level = 0
    const push = (key: WaterfallStep['key'], kind: WaterfallKind, amount: number) => {
        if (kind === 'total') {
            steps.push({key, kind, amount, range: [Math.min(0, amount), Math.max(0, amount)]})
            level = amount
        } else {
            const next = level + amount
            steps.push({key, kind, amount, range: [Math.min(level, next), Math.max(level, next)]})
            level = next
        }
    }
    push('paidIn', 'in', s.paidIn)
    push('expenses', 'out', -s.expensesGross)
    if (s.otherIncome > 0) push('otherIncome', 'in', s.otherIncome)
    push('cash', 'total', s.cashOnHand)
    if (s.outstanding > 0) {
        push('outstanding', 'in', s.outstanding)
        push('projected', 'total', s.projectedCash)
    }
    return steps
}

export type DebtTile = {
    id: number
    name: string
    size: number
    isMe: boolean
}

/** Treemap tiles: one per member/guest with open debt, area = amount owed, largest first. */
export function debtTiles<T extends BalanceLike & {name: string; nickname?: string | null; regular_member_id: number}>(
    balances: T[],
    myMemberId?: number | null,
): DebtTile[] {
    return balances
        .filter(b => b.balance < -0.005)
        .map(b => ({
            id: b.regular_member_id,
            name: b.nickname || b.name,
            size: Math.round(Math.abs(b.balance) * 100) / 100,
            isMe: myMemberId != null && b.regular_member_id === myMemberId,
        }))
        .sort((a, b) => b.size - a.size)
}

export interface EveningBar {
    id: number
    label: string
    penalty_total: number
}

/** Penalties per evening, chronological, with a short DD.MM. axis label. */
export function eveningBars(evenings: {id: number; date: string; penalty_total: number}[]): EveningBar[] {
    return [...evenings]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(e => {
            const d = new Date(e.date)
            const label = Number.isNaN(d.getTime())
                ? e.date.slice(0, 10)
                : d.toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'})
            return {id: e.id, label, penalty_total: Math.round(e.penalty_total * 100) / 100}
        })
}

export interface SankeyGraph {
    nodes: {key: string}[]
    links: {source: number; target: number; value: number}[]
}

/** Where the money comes from (paid in, other income) and where it goes (expenses, till). Open debt is shown as its own flow. */
export function sankeyGraph(s: TreasurySummary): SankeyGraph {
    const keys = ['paidIn', 'otherIncome', 'outstanding', 'expenses', 'cash', 'unpaid'] as const
    const idx = Object.fromEntries(keys.map((k, i) => [k, i])) as Record<(typeof keys)[number], number>
    const paidToExpenses = Math.min(s.paidIn, s.expensesGross)
    const otherToExpenses = Math.min(s.otherIncome, Math.max(0, s.expensesGross - paidToExpenses))
    const raw: [(typeof keys)[number], (typeof keys)[number], number][] = [
        ['paidIn', 'expenses', paidToExpenses],
        ['paidIn', 'cash', s.paidIn - paidToExpenses],
        ['otherIncome', 'expenses', otherToExpenses],
        ['otherIncome', 'cash', s.otherIncome - otherToExpenses],
        ['outstanding', 'unpaid', s.outstanding],
    ]
    const links = raw
        .filter(([, , v]) => v > 0.005)
        .map(([a, b, v]) => ({source: idx[a], target: idx[b], value: Math.round(v * 100) / 100}))
    // Recharts' Sankey wants only nodes that appear in a link (orphans collapse to zero height).
    const used = [...new Set(links.flatMap(l => [l.source, l.target]))].sort((a, b) => a - b)
    const remap = new Map(used.map((old, i) => [old, i]))
    return {
        nodes: used.map(i => ({key: keys[i]})),
        links: links.map(l => ({source: remap.get(l.source)!, target: remap.get(l.target)!, value: l.value})),
    }
}

/** Share of all accrued penalties already covered (paid) vs. still open — clubwide donut. */
export function paidOpenSplit(balances: Pick<IdentifiedBalanceLike, 'payments_total' | 'penalty_total'>[]): {paid: number; open: number} {
    let paid = 0
    let open = 0
    for (const b of balances) {
        if (b.penalty_total <= 0) continue
        const p = Math.min(b.penalty_total, Math.max(0, b.payments_total))
        paid += p
        open += b.penalty_total - p
    }
    return {paid: Math.round(paid * 100) / 100, open: Math.round(open * 100) / 100}
}

export interface TrendPoint {
    ts: number
    value: number
}

/** Cumulative till level over time (sparkline), downsampled to at most `max` points keeping first and last. */
export function cashTrend(events: {ts: number; delta: number}[], max = 40): TrendPoint[] {
    const sorted = [...events].sort((a, b) => a.ts - b.ts)
    let level = 0
    const pts = sorted.map(e => {
        level += e.delta
        return {ts: e.ts, value: Math.round(level * 100) / 100}
    })
    if (pts.length <= max) return pts
    const step = (pts.length - 1) / (max - 1)
    return Array.from({length: max}, (_, i) => pts[Math.round(i * step)])
}

/** Where a tap on a flow/step leads: the bookings or accounts tab of the Kasse (null = nothing to drill into). */
export type ChartTarget = {tab: 'bookings' | 'accounts'}
export function flowTarget(key: string): ChartTarget | null {
    switch (key) {
        case 'paidIn':
        case 'expenses':
        case 'otherIncome':
            return {tab: 'bookings'}
        case 'outstanding':
        case 'unpaid':
            return {tab: 'accounts'}
        default:
            return null
    }
}

/** Cash-flow events of one calendar year (null = all time). */
export function eventsInYear<T extends {ts: number}>(events: T[], year: number | null): T[] {
    if (year == null) return events
    return events.filter(e => new Date(e.ts).getFullYear() === year)
}
