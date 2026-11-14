// Pure data derivations for the Kasse "Diagramme" tab (Recharts). No React, no i18n — labels
// are keys/strings handed in by the component so every shape stays unit-testable.
import type {BalanceLike, IdentifiedBalanceLike, TreasurySummary} from '@/lib/treasurySummary.ts'

export type WaterfallKind = 'in' | 'out' | 'total'

export interface WaterfallStep {
    key: 'paidIn' | 'expenses' | 'otherIncome' | 'cash' | 'outstanding' | 'projected'
    kind: WaterfallKind
    /** Signed change (in/out) or absolute level (total). */
    amount: number
    /** Bar [from, to], always anchored at 0. */
    range: [number, number]
}

/** Waterfall from the money-flow summary: paid in − expenses + other income = cash, + open debt = projected. */
export function waterfallSteps(s: TreasurySummary): WaterfallStep[] {
    const steps: WaterfallStep[] = []
    // Every bar starts at the 0 baseline (magnitude only); colour carries in/out/total. Negative totals extend left.
    const push = (key: WaterfallStep['key'], kind: WaterfallKind, amount: number) => {
        const range: [number, number] = kind === 'total' ? [Math.min(0, amount), Math.max(0, amount)] : [0, Math.abs(amount)]
        steps.push({key, kind, amount, range})
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

export interface ZeroSplit {
    /** True only when values strictly cross zero (both < 0 and > 0). */
    mixed: boolean
    /** Vertical SVG linearGradient offset (0 = top/max, 1 = bottom/min) where value === 0. */
    offset: number
    /** Semantic token color to use directly when values stay on one side of zero. */
    solidColor: 'var(--positive-fg)' | 'var(--danger-fg)'
}

/**
 * Split point for an area chart whose Y domain includes 0 and values may be positive and negative.
 * Avoids gradient bounding-box artifacts on flat series by returning a solid semantic token whenever
 * all points sit on the same side of zero.
 */
export function zeroSplitOffset(values: number[]): ZeroSplit {
    if (values.length === 0) return {mixed: false, offset: 0, solidColor: 'var(--positive-fg)'}
    const min = Math.min(...values)
    const max = Math.max(...values)
    if (min < 0 && max > 0) {
        return {mixed: true, offset: max / (max - min), solidColor: 'var(--positive-fg)'}
    }
    return {
        mixed: false,
        offset: 0,
        solidColor: min < 0 ? 'var(--danger-fg)' : 'var(--positive-fg)',
    }
}

/** Compact date label for time X-axes: dd.MM. inside one year, dd.MM.yy across years. */
export function formatTimeAxisTick(ts: number, minTs: number, maxTs: number, locale = 'de-DE'): string {
    const multiYear = new Date(minTs).getFullYear() !== new Date(maxTs).getFullYear()
    return new Date(ts).toLocaleDateString(
        locale,
        multiYear ? {day: '2-digit', month: '2-digit', year: '2-digit'} : {day: '2-digit', month: '2-digit'},
    )
}

/**
 * Select a small set (<= max) of evenly spaced reference timestamps for a time X-axis,
 * deduplicated by formatted date label so ticks never repeat the same day.
 */
export function timeAxisTicks(timestamps: number[], max = 3, locale = 'de-DE'): number[] {
    if (timestamps.length === 0 || max <= 0) return []
    const min = Math.min(...timestamps)
    const maxTs = Math.max(...timestamps)
    if (min === maxTs || max === 1) return [min]
    const uniqueCount = new Set(timestamps).size
    const targetCount = Math.min(max, uniqueCount)
    if (targetCount <= 1) return [min]
    const candidates = Array.from({length: targetCount}, (_, i) =>
        Math.round(min + ((maxTs - min) * i) / (targetCount - 1)),
    )
    const seen = new Set<string>()
    const out: number[] = []
    for (const ts of candidates) {
        const lbl = formatTimeAxisTick(ts, min, maxTs, locale)
        if (!seen.has(lbl)) {
            seen.add(lbl)
            out.push(ts)
        }
    }
    return out
}

/**
 * Reference ticks for the horizontal waterfall X-axis: always includes 0 and well-separated
 * extremes (plus midpoint when all values lie on one side of 0).
 */
export function waterfallAxisTicks(ranges: [number, number][]): number[] {
    if (ranges.length === 0) return [0]
    let min = 0
    let max = 0
    for (const [a, b] of ranges) {
        if (a < min) min = a
        if (b < min) min = b
        if (a > max) max = a
        if (b > max) max = b
    }
    const span = max - min
    if (span <= 0) return [0]
    const ticks = new Set<number>([0])
    if (min < 0 && 0 - min >= span * 0.14) ticks.add(min)
    if (max > 0 && max >= span * 0.14) ticks.add(max)
    if (ticks.size === 2) {
        const onlyExtreme = min < 0 && !ticks.has(max) ? min : max
        ticks.add(Math.round((onlyExtreme / 2) * 100) / 100)
    }
    return [...ticks].sort((a, b) => a - b)
}

/** Pick the index in `timestamps` closest to horizontal plot `ratio` in [0, 1] (`<=` prefers the actual event over a 0-baseline duplicate). */
export function nearestTimeIndex(timestamps: number[], ratio: number): number {
    if (timestamps.length === 0) return -1
    const min = Math.min(...timestamps)
    const max = Math.max(...timestamps)
    if (min === max) return timestamps.length - 1
    const clamped = Math.min(1, Math.max(0, ratio))
    const target = min + clamped * (max - min)
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < timestamps.length; i++) {
        const dist = Math.abs(timestamps[i] - target)
        if (dist <= bestDist) {
            bestDist = dist
            bestIdx = i
        }
    }
    return bestIdx
}

/**
 * Resolve clicked datum index from Recharts `onClick` state, falling back to pointer X coordinate
 * when tooltip hover state isn't active yet (e.g. touch tap on mobile without prior hover).
 */
export function resolveTimeClickIndex(
    timestamps: number[],
    state: unknown,
    event: unknown,
    margin: {left: number; right: number},
): number {
    const st = state as {activeTooltipIndex?: unknown; activeLabel?: unknown} | null | undefined
    const rawIdx = st?.activeTooltipIndex
    if (rawIdx != null && rawIdx !== '' && Number.isFinite(Number(rawIdx))) {
        const n = Number(rawIdx)
        if (n >= 0 && n < timestamps.length) return n
    }
    const lbl = Number(st?.activeLabel)
    if (Number.isFinite(lbl)) {
        const found = timestamps.findIndex(t => t === lbl)
        if (found >= 0) return found
    }
    const ev = event as {clientX?: number; currentTarget?: {getBoundingClientRect?: () => DOMRect}} | null | undefined
    const rect = ev?.currentTarget?.getBoundingClientRect?.()
    if (rect && rect.width > 0 && typeof ev?.clientX === 'number' && Number.isFinite(ev.clientX)) {
        const plotWidth = Math.max(1, rect.width - margin.left - margin.right)
        const ratio = (ev.clientX - rect.left - margin.left) / plotWidth
        return nearestTimeIndex(timestamps, ratio)
    }
    return -1
}


