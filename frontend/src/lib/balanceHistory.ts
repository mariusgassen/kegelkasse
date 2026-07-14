// Pure logic for the treasury balance-history graph (TreasuryPage's BalanceHistoryChart).
// Mirrors the precedent of lib/stats.ts: no SVG, no i18n — just event construction + windowing math.

export type BalanceEventKind = 'payment' | 'expense' | 'penalty' | 'debt'

export type BalanceEvent = {
    id: string
    ts: number
    delta: number
    kind: BalanceEventKind
    label: string
    icon?: string
}

export type Granularity = 'month' | 'year' | 'all'

export type DualPoint = {
    ts: number
    actual: number
    virtual: number
    event: BalanceEvent | null
}

type ClubPayment = { id: number; regular_member_id: number; member_name: string; amount: number; note: string | null; created_at: string | null; date?: string | null }
type ClubExpense = { id: number; amount: number; description: string; created_at: string | null; date: string | null }
type MemberPayment = { id: number; amount: number; note: string | null; created_at: string | null; date?: string | null }
type MemberPenalty = {
    id: number; amount: number; icon: string; penalty_type_name: string
    evening_id: number; evening_date: string | null; is_absence: boolean; created_at: string | null
}
type DebtCheckpoint = { ts: string; total_debt: number }

function parseTs(iso: string | null): number | null {
    if (!iso) return null
    const ms = new Date(iso).getTime()
    return Number.isNaN(ms) ? null : ms
}

function byTs(a: BalanceEvent, b: BalanceEvent): number {
    return a.ts - b.ts
}

// ── Event construction ──────────────────────────────────────────────────────

/** "Actual" event stream for the Kasse (club) scope — every payment + expense, signed by cash impact. */
export function clubEventsFromBookings(payments: ClubPayment[], expenses: ClubExpense[]): BalanceEvent[] {
    const events: BalanceEvent[] = []
    for (const p of payments) {
        const ts = parseTs(p.date ?? p.created_at)
        if (ts === null) continue
        events.push({id: `payment-${p.id}`, ts, delta: p.amount, kind: 'payment', label: p.member_name})
    }
    for (const e of expenses) {
        const ts = parseTs(e.date ?? e.created_at)
        if (ts === null) continue
        events.push({id: `expense-${e.id}`, ts, delta: -e.amount, kind: 'expense', label: e.description})
    }
    return events.sort(byTs)
}

/** "Actual" event stream for the Mitglied (member) scope — payments only (money physically paid in). */
export function memberPaymentEvents(payments: MemberPayment[]): BalanceEvent[] {
    const events: BalanceEvent[] = []
    for (const p of payments) {
        const ts = parseTs(p.date ?? p.created_at)
        if (ts === null) continue
        events.push({id: `payment-${p.id}`, ts, delta: p.amount, kind: 'payment', label: p.note ?? ''})
    }
    return events.sort(byTs)
}

/** "Virtual" overlay stream for the Mitglied scope — penalties reduce the balance on top of actual payments. */
export function memberPenaltyEvents(penalties: MemberPenalty[]): BalanceEvent[] {
    const events: BalanceEvent[] = []
    for (const pen of penalties) {
        const ts = parseTs(pen.created_at)
        if (ts === null) continue
        events.push({id: `penalty-${pen.id}`, ts, delta: -pen.amount, kind: 'penalty', label: pen.penalty_type_name, icon: pen.icon})
    }
    return events.sort(byTs)
}

/**
 * "Virtual" overlay stream for the Kasse scope — total outstanding member+guest debt over time.
 * Checkpoints are absolute levels, not deltas, so each event's delta is the diff from the previous
 * checkpoint. Not attributable to one booking (driven by club-wide activity), so kind is 'debt' —
 * callers must treat 'debt' events as non-clickable.
 */
export function debtEventsFromTimeline(checkpoints: DebtCheckpoint[]): BalanceEvent[] {
    const events: BalanceEvent[] = []
    let prev = 0
    for (let i = 0; i < checkpoints.length; i++) {
        const ts = parseTs(checkpoints[i].ts)
        if (ts === null) continue
        const delta = checkpoints[i].total_debt - prev
        prev = checkpoints[i].total_debt
        events.push({id: `debt-${i}`, ts, delta, kind: 'debt', label: ''})
    }
    return events.sort(byTs)
}

export function isAttributable(event: BalanceEvent): boolean {
    return event.kind !== 'debt'
}

// ── Windowing ────────────────────────────────────────────────────────────────

export function windowBounds(granularity: Granularity, anchor: Date, events: BalanceEvent[]): {start: number; end: number; label: string} {
    if (granularity === 'month') {
        const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1).getTime()
        const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1).getTime()
        const label = anchor.toLocaleDateString('de-DE', {month: 'long', year: 'numeric'})
        return {start, end, label}
    }
    if (granularity === 'year') {
        const start = new Date(anchor.getFullYear(), 0, 1).getTime()
        const end = new Date(anchor.getFullYear() + 1, 0, 1).getTime()
        return {start, end, label: String(anchor.getFullYear())}
    }
    // 'all'
    const allTs = events.map(e => e.ts)
    const now = Date.now()
    const start = allTs.length ? Math.min(...allTs) : anchor.getTime()
    const end = Math.max(now, ...allTs, start + 1)
    return {start, end, label: ''}
}

/** Sum of deltas strictly before windowStart — the carry-over so paging never resets the curve to zero. */
export function cumulativeBaseline(events: BalanceEvent[], windowStart: number): number {
    let sum = 0
    for (const e of events) if (e.ts < windowStart) sum += e.delta
    return sum
}

/** Events within [start, end), sorted ascending. */
export function eventsInWindow(events: BalanceEvent[], start: number, end: number): BalanceEvent[] {
    return events.filter(e => e.ts >= start && e.ts < end).sort(byTs)
}

// ── Dual-line series ─────────────────────────────────────────────────────────

/**
 * Merges an "actual" delta stream and a "virtual overlay" delta stream into one chronological
 * point list, carrying both running totals forward at every event from either stream. This makes
 * each line a proper step curve: the actual line stays flat at overlay-only points and vice versa.
 */
export function mergeDualSeries(
    actualEvents: BalanceEvent[],
    overlayEvents: BalanceEvent[],
    actualBaseline: number,
    overlayBaseline: number,
): DualPoint[] {
    const a = [...actualEvents].sort(byTs)
    const o = [...overlayEvents].sort(byTs)
    const points: DualPoint[] = []
    let runningActual = actualBaseline
    let runningOverlay = overlayBaseline
    let ai = 0, oi = 0
    while (ai < a.length || oi < o.length) {
        const nextA = ai < a.length ? a[ai] : null
        const nextO = oi < o.length ? o[oi] : null
        if (nextO === null || (nextA !== null && nextA.ts <= nextO.ts)) {
            runningActual += nextA!.delta
            points.push({ts: nextA!.ts, actual: runningActual, virtual: runningActual + runningOverlay, event: nextA})
            ai++
        } else {
            runningOverlay += nextO.delta
            points.push({ts: nextO.ts, actual: runningActual, virtual: runningActual + runningOverlay, event: nextO})
            oi++
        }
    }
    return points
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatTick(ts: number, granularity: Granularity): string {
    const d = new Date(ts)
    if (granularity === 'month') return d.toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'})
    if (granularity === 'year') return d.toLocaleDateString('de-DE', {month: 'short'})
    return d.toLocaleDateString('de-DE', {month: 'short', year: '2-digit'})
}

// ── X-axis clustering ───────────────────────────────────────────────────────

/**
 * Start-of-bucket timestamp an event's x-position clusters onto: one calendar day (an "evening",
 * the club's natural unit of activity) for month view, one calendar month for year view. 'all' has
 * no bucketing — it keeps a continuous time scale since it already spans years of sparse activity.
 */
export function bucketStart(ts: number, granularity: Granularity): number {
    const d = new Date(ts)
    if (granularity === 'year') return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
    if (granularity === 'month') return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    return ts
}

// ── Point clustering ─────────────────────────────────────────────────────────

export type PointCluster = {
    key: string
    /** Whether this cluster's events are drawn on the overlay curve (debt/penalty) rather than the actual curve. */
    onOverlay: boolean
    /** Chronologically ordered points sharing this cluster's bucket + curve; always non-empty. */
    points: DualPoint[]
}

/**
 * Groups chart points that land in the same x-axis bucket (and are drawn on the same curve —
 * actual vs. overlay) into one cluster. Reuses the exact bucket width the chart's x-axis already
 * uses for positioning, so several bookings on the same evening (month view) or month (year view)
 * collapse onto one clickable marker instead of stacked, mutually-hiding circles where only the
 * last-drawn one is reachable.
 */
export function clusterPoints(points: DualPoint[], granularity: Granularity): PointCluster[] {
    const clusters = new Map<string, PointCluster>()
    for (const p of points) {
        if (!p.event) continue
        const onOverlay = p.event.kind === 'debt' || p.event.kind === 'penalty'
        const key = `${bucketStart(p.ts, granularity)}-${onOverlay}`
        const existing = clusters.get(key)
        if (existing) existing.points.push(p)
        else clusters.set(key, {key, onOverlay, points: [p]})
    }
    return Array.from(clusters.values())
}
