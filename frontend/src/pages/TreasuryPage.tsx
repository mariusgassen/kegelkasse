import {useEffect, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ModeToggle} from '@/components/ui/ModeToggle.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {toastError} from '@/utils/error.ts'
import {showToast} from '@/components/ui/Toast.tsx'
import {parseAmount} from '@/utils/parse.ts'
import {useHashTab} from '@/hooks/usePage.ts'
import {getHashParams, clearHashParams} from '@/utils/hashParams.ts'
import {
    type BalanceEvent,
    type Granularity,
    bucketStart,
    clubEventsFromBookings,
    clusterPoints,
    cumulativeBaseline,
    debtEventsFromTimeline,
    eventsInWindow,
    formatTick,
    memberPaymentEvents,
    memberPenaltyEvents,
    mergeDualSeries,
    windowBounds,
} from '@/lib/balanceHistory.ts'
import {paidShare, refundPaidIn, shareSettlement, treasurySummary, writeOffOutstandingDebt} from '@/lib/treasurySummary.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fDate(iso: string | null) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'})
}

type Balance = {
    regular_member_id: number; name: string; nickname: string | null;
    penalty_total: number; payments_total: number; balance: number
}

type Payment = {
    id: number; regular_member_id: number; member_name: string;
    amount: number; note: string | null; created_at: string | null; updated_at: string | null; date: string | null
}

type MemberPayment = {
    id: number; amount: number; note: string | null; created_at: string | null; updated_at: string | null; date: string | null
}

type Expense = {
    id: number; amount: number; description: string; created_at: string | null; updated_at: string | null; date: string | null
}

// Unified booking entry for the Buchungen tab
type BookingEntry =
    | { kind: 'payment'; data: Payment }
    | { kind: 'expense'; data: Expense }

// Booking being edited in the edit sheet
type EditTarget =
    | { kind: 'payment'; id: number; memberId: number; label: string }
    | { kind: 'expense'; id: number }

// Thin progress bar: how much of the accrued penalties is already paid.
// Makes the "Strafen vs. Bezahlt" relation tangible at a glance.
function PaidShareBar({b}: { b: Pick<Balance, 'payments_total' | 'penalty_total'> }) {
    const share = paidShare(b)
    if (share === null) return null
    return (
        <div className="h-1 rounded-full bg-kce-surface2 border border-kce-border mt-1.5 overflow-hidden">
            <div className="h-full rounded-full"
                 style={{
                     width: `${Math.round(share * 100)}%`,
                     background: share >= 1 ? '#22c55e' : 'var(--kce-primary)',
                 }}/>
        </div>
    )
}

// One clickable row in the Kassenstand hero's money-flow breakdown. Tapping
// it expands the underlying bookings that make up the row's total, so
// e.g. "965,20 €" isn't just a number to take on faith.
type FlowItem = { id?: number | null; label: string; amount: number; date?: string | null }

function FlowRow({icon, label, amountLabel, colorClass, open, onToggle, items, myId, noEntriesLabel, testId}: {
    icon: string
    label: string
    amountLabel: string
    colorClass: string
    open: boolean
    onToggle: () => void
    items: FlowItem[]
    myId?: number | null
    noEntriesLabel: string
    testId?: string
}) {
    return (
        <div>
            <button type="button" className="flex items-center justify-between w-full text-left" onClick={onToggle}>
                <span className="text-kce-muted">{icon} {label}</span>
                <span className={`font-bold ${colorClass}`} data-testid={testId}>{amountLabel}</span>
            </button>
            {open && (
                items.length === 0
                    ? <div className="pl-4 py-1 text-[11px] text-kce-muted">{noEntriesLabel}</div>
                    : (
                        <div className="pl-4 pb-1 pt-0.5 flex flex-col gap-0.5">
                            {items.map((it, i) => (
                                <div key={it.id ?? i} className="flex items-center justify-between text-[11px] text-kce-muted gap-2">
                                    <span className="truncate flex items-center gap-1 min-w-0">
                                        <span className="truncate">{it.label}</span>
                                        {myId != null && it.id === myId &&
                                            <span className="text-[9px] text-kce-amber font-bold flex-shrink-0">Ich</span>}
                                        {it.date && <span className="opacity-60 flex-shrink-0">· {fDate(it.date)}</span>}
                                    </span>
                                    <span className="flex-shrink-0">{fe(it.amount)}</span>
                                </div>
                            ))}
                        </div>
                    )
            )}
        </div>
    )
}

// ── Balance history chart (Übersicht tab) ───────────────────────────────────

const BH_PAD = {top: 12, right: 10, bottom: 22, left: 46}
const BH_VH = 160
const BH_VW = 400
const BH_IH = BH_VH - BH_PAD.top - BH_PAD.bottom
const BH_PX_PER_EVENT = 32

const KIND_META: Record<BalanceEvent['kind'], { icon: string; color: string }> = {
    payment: {icon: '💰', color: '#22c55e'},
    expense: {icon: '💸', color: '#f97316'},
    penalty: {icon: '⚠️', color: '#ef4444'},
    debt: {icon: '📉', color: '#a78bfa'},
}

const withAlpha = (col: string) => col.startsWith('#') ? col + '22' : 'rgba(232,160,32,0.13)'

function BalanceHistoryChart({actualEvents, overlayEvents, actualLabel, virtualLabel, t}: {
    actualEvents: BalanceEvent[]
    overlayEvents: BalanceEvent[]
    actualLabel: string
    virtualLabel: string
    t: (k: any) => string
}) {
    const [granularity, setGranularity] = useState<Granularity>('month')
    const [anchor, setAnchor] = useState(() => new Date())
    const [selectedClusterKey, setSelectedClusterKey] = useState<string | null>(null)

    const allEvents = [...actualEvents, ...overlayEvents]
    const hasData = allEvents.length > 0
    const isAll = granularity === 'all'

    const win = windowBounds(granularity, anchor, allEvents)
    const actualBaseline = cumulativeBaseline(actualEvents, win.start)
    const overlayBaseline = cumulativeBaseline(overlayEvents, win.start)
    const windowedActual = isAll ? actualEvents : eventsInWindow(actualEvents, win.start, win.end)
    const windowedOverlay = isAll ? overlayEvents : eventsInWindow(overlayEvents, win.start, win.end)
    const points = mergeDualSeries(windowedActual, windowedOverlay, actualBaseline, overlayBaseline)

    function periodKey(d: Date) {
        return granularity === 'year' ? d.getFullYear() : d.getFullYear() * 12 + d.getMonth()
    }
    const earliestTs = hasData ? Math.min(...allEvents.map(e => e.ts)) : Date.now()
    const atStart = periodKey(anchor) <= periodKey(new Date(earliestTs))
    const atEnd = periodKey(anchor) >= periodKey(new Date())

    function page(dir: -1 | 1) {
        setSelectedClusterKey(null)
        setAnchor(prev => granularity === 'year'
            ? new Date(prev.getFullYear() + dir, 0, 1)
            : new Date(prev.getFullYear(), prev.getMonth() + dir, 1))
    }

    function changeGranularity(g: Granularity) {
        setGranularity(g)
        setAnchor(new Date())
        setSelectedClusterKey(null)
    }

    const values = [actualBaseline, actualBaseline + overlayBaseline, ...points.map(p => p.actual), ...points.map(p => p.virtual)]
    const minV = Math.min(0, ...values)
    const maxV = Math.max(0, ...values)
    const span = Math.max(maxV - minV, 1)

    const chartWidth = isAll ? Math.max(BH_VW, points.length * BH_PX_PER_EVENT) : BH_VW
    const innerWidth = chartWidth - BH_PAD.left - BH_PAD.right
    const xEnd = isAll ? Math.max(win.end, ...allEvents.map(e => e.ts), win.start + 1) : win.end
    const xSpan = Math.max(xEnd - win.start, 1)

    // Month/year views cluster points onto discrete, evenly-spaced buckets (evening/month) instead of
    // a continuous time scale — most days in a month (or months in a year) have no activity, so
    // proportional-to-time spacing would waste most of the chart width on empty gaps.
    const buckets = isAll ? [] : Array.from(new Set(points.map(p => bucketStart(p.ts, granularity)))).sort((a, b) => a - b)
    const bucketIndex = new Map(buckets.map((b, i) => [b, i]))
    const xS = (ts: number) => {
        if (isAll) return BH_PAD.left + ((ts - win.start) / xSpan) * innerWidth
        if (buckets.length === 0) return BH_PAD.left
        const idx = bucketIndex.get(bucketStart(ts, granularity)) ?? 0
        return buckets.length === 1 ? BH_PAD.left + innerWidth / 2 : BH_PAD.left + (idx / (buckets.length - 1)) * innerWidth
    }
    const yS = (v: number) => BH_PAD.top + BH_IH - ((v - minV) / span) * BH_IH

    function buildPath(key: 'actual' | 'virtual', baseline: number) {
        const startX = isAll ? xS(win.start) : BH_PAD.left
        const endX = isAll ? xS(xEnd) : BH_PAD.left + innerWidth
        let d = `M ${startX},${yS(baseline)}`
        for (const p of points) d += ` H ${xS(p.ts)} V ${yS(p[key])}`
        d += ` H ${endX}`
        return d
    }

    const yTicks = [minV, 0, maxV].filter((v, i, arr) => arr.indexOf(v) === i).map(v => ({v, y: yS(v)}))

    // Cluster points sharing the same x-axis bucket + curve into one marker, so a bucket with
    // several bookings gets a single clickable dot instead of stacked circles where only the
    // last-drawn one is reachable; clicking it lists every underlying entry below.
    const clusters = clusterPoints(points, granularity)
    const selectedCluster = clusters.find(c => c.key === selectedClusterKey) ?? null
    const selectedIndices = new Set(selectedCluster ? selectedCluster.points.map(p => points.indexOf(p)) : [])

    const fAxisDate = (ts: number) => formatTick(ts, granularity)

    // Choose which x-positions carry a date label. In the bucketed month/year views the x-axis is a
    // discrete list of buckets, so we label per bucket (sampled only when crowded) — the previous
    // index-based sampling skipped whole buckets whenever several bookings shared one bucket, which
    // is why some columns showed a marker but no date beneath it. 'all' keeps a continuous time
    // scale, so there we sample by point index and de-duplicate identical day labels.
    const labelOwnerIndices = new Set<number>()
    if (isAll) {
        const labelEvery = points.length <= 6 ? 1 : points.length <= 14 ? 2 : Math.ceil(points.length / 8)
        const labelOwnerByDate = new Map<string, number>()
        points.forEach((p, i) => {
            if (!(i % labelEvery === 0 || selectedIndices.has(i))) return
            const dateKey = fAxisDate(p.ts)
            if (!labelOwnerByDate.has(dateKey) || selectedIndices.has(i)) labelOwnerByDate.set(dateKey, i)
        })
        labelOwnerByDate.forEach(i => labelOwnerIndices.add(i))
    } else {
        // One representative point index per bucket; prefer a selected point so the active bucket's
        // label renders highlighted.
        const ownerForBucket = new Map<number, number>()
        points.forEach((p, i) => {
            const b = bucketStart(p.ts, granularity)
            if (!ownerForBucket.has(b) || selectedIndices.has(i)) ownerForBucket.set(b, i)
        })
        const bucketEvery = buckets.length <= 8 ? 1 : Math.ceil(buckets.length / 8)
        buckets.forEach((b, bi) => {
            const owner = ownerForBucket.get(b)
            if (owner === undefined) return
            if (bi % bucketEvery === 0 || selectedIndices.has(owner)) labelOwnerIndices.add(owner)
        })
    }

    const KIND_LABEL: Record<BalanceEvent['kind'], string> = {
        payment: t('treasury.history.kindPayment'),
        expense: t('treasury.history.kindExpense'),
        penalty: t('treasury.history.kindPenalty'),
        debt: t('treasury.history.kindDebt'),
    }

    function fDateTime(ts: number) {
        return new Date(ts).toLocaleString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'})
    }

    const chart = (
        <svg width={isAll ? chartWidth : '100%'} height={BH_VH} viewBox={`0 0 ${chartWidth} ${BH_VH}`}
             style={{display: 'block', overflow: 'visible', flexShrink: 0}}
             onClick={() => setSelectedClusterKey(null)}>
            {yTicks.map((tick, i) => (
                <line key={i} x1={BH_PAD.left} y1={tick.y} x2={chartWidth - BH_PAD.right} y2={tick.y}
                      stroke="var(--kce-border)" strokeWidth={tick.v === 0 ? 1.2 : 0.8}
                      strokeDasharray={tick.v === 0 ? undefined : '3,3'}/>
            ))}
            {!isAll && yTicks.map((tick, i) => (
                <text key={`t-${i}`} x={BH_PAD.left - 5} y={tick.y + 3.5} textAnchor="end"
                      fontSize="10" fill="var(--kce-muted)">{fe(tick.v)}</text>
            ))}
            <path d={buildPath('virtual', actualBaseline + overlayBaseline)}
                  fill="none" stroke="var(--kce-primary)" strokeWidth="2" strokeDasharray="4,3"
                  strokeLinecap="round" strokeLinejoin="round" opacity={0.85}/>
            <path d={buildPath('actual', actualBaseline)}
                  fill="none" stroke="var(--kce-cream)" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round"/>
            {points.map((p, i) => (
                labelOwnerIndices.has(i) ? (
                    <text key={`label-${i}`} x={xS(p.ts)} y={BH_VH - 6} textAnchor="middle" fontSize="10"
                          fontWeight={selectedIndices.has(i) ? 'bold' : 'normal'}
                          fill={selectedIndices.has(i) ? 'var(--kce-primary)' : 'var(--kce-muted)'}>
                        {fAxisDate(p.ts)}
                    </text>
                ) : null
            ))}
            {clusters.map(cluster => {
                const last = cluster.points[cluster.points.length - 1]
                const lastEvent = last.event!
                const meta = KIND_META[lastEvent.kind]
                const cx = xS(last.ts), cy = yS(cluster.onOverlay ? last.virtual : last.actual)
                const count = cluster.points.length
                const isSelected = selectedClusterKey === cluster.key
                const toggle = () => setSelectedClusterKey(isSelected ? null : cluster.key)
                // Every marker is clickable — including the club-wide debt overlay points, whose
                // detail shows the change in outstanding debt and the resulting balance.
                const ariaLabel = count > 1
                    ? `${count}× – ${fDateTime(last.ts)}`
                    : `${lastEvent.label || KIND_LABEL[lastEvent.kind]} – ${fDateTime(lastEvent.ts)} – ${fe(lastEvent.delta)}`
                return (
                    <g key={cluster.key}
                       tabIndex={0}
                       role="button"
                       aria-label={ariaLabel}
                       style={{cursor: 'pointer'}}
                       onClick={(evt) => { evt.stopPropagation(); toggle() }}
                       onKeyDown={(evt) => {
                           if (evt.key === 'Enter' || evt.key === ' ') {
                               evt.preventDefault()
                               evt.stopPropagation()
                               toggle()
                           }
                       }}>
                        {/* Generous transparent hit target so the small dots are easy to tap. */}
                        <circle cx={cx} cy={cy} r="13" fill="transparent"/>
                        <circle cx={cx} cy={cy} r={isSelected ? 5 : count > 1 ? 3.5 : 2.5}
                                fill={meta.color} stroke="var(--kce-bg)"
                                strokeWidth={isSelected ? 1.5 : 1}/>
                        {count > 1 && (
                            <text x={cx} y={cy - (isSelected ? 8.5 : 7)} textAnchor="middle" fontSize="8"
                                  fontWeight="bold" fill={meta.color}>
                                ×{count}
                            </text>
                        )}
                    </g>
                )
            })}
            <line x1={BH_PAD.left} y1={BH_PAD.top + BH_IH} x2={chartWidth - BH_PAD.right} y2={BH_PAD.top + BH_IH}
                  stroke="var(--kce-border)" strokeWidth="1"/>
        </svg>
    )

    return (
        <div className="kce-card p-3 mb-3">
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex gap-1">
                    {(['month', 'year', 'all'] as const).map(g => (
                        <button key={g} type="button"
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${granularity === g ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                                onClick={() => changeGranularity(g)}>
                            {t(`treasury.history.${g}` as 'treasury.history.month' | 'treasury.history.year' | 'treasury.history.all')}
                        </button>
                    ))}
                </div>
                {!isAll && (
                    <div className="flex items-center gap-1.5">
                        <button type="button" aria-label={t('treasury.history.prevPeriod')}
                                disabled={atStart}
                                onClick={() => page(-1)}
                                className="w-6 h-6 flex items-center justify-center rounded-md bg-kce-surface2 text-kce-muted font-bold disabled:opacity-30">
                            ‹
                        </button>
                        <span className="text-[11px] font-bold text-kce-muted min-w-[64px] text-center">{win.label}</span>
                        <button type="button" aria-label={t('treasury.history.nextPeriod')}
                                disabled={atEnd}
                                onClick={() => page(1)}
                                className="w-6 h-6 flex items-center justify-center rounded-md bg-kce-surface2 text-kce-muted font-bold disabled:opacity-30">
                            ›
                        </button>
                    </div>
                )}
            </div>

            {!hasData ? (
                <Empty icon="📈" text={t('treasury.history.noData')}/>
            ) : isAll ? (
                <div className="flex">
                    <svg width={BH_PAD.left + 4} height={BH_VH} viewBox={`0 0 ${BH_PAD.left + 4} ${BH_VH}`}
                         style={{flexShrink: 0, overflow: 'visible'}}>
                        {yTicks.map((tick, i) => (
                            <text key={i} x={BH_PAD.left - 5} y={tick.y + 3.5} textAnchor="end"
                                  fontSize="10" fill="var(--kce-muted)">{fe(tick.v)}</text>
                        ))}
                    </svg>
                    <div className="overflow-x-auto flex-1">{chart}</div>
                </div>
            ) : chart}

            {hasData && (selectedCluster ? (
                <>
                    <div className="flex flex-col gap-1 mt-2 max-h-40 overflow-y-auto" data-testid="history-detail">
                        {selectedCluster.points.map(p => {
                            const ev = p.event!
                            const meta = KIND_META[ev.kind]
                            return (
                                <div key={ev.id} className="flex items-center gap-2 px-1.5 py-1 rounded text-[11px]"
                                     style={{background: withAlpha(meta.color), borderLeft: `2px solid ${meta.color}`}}>
                                    <span className="text-kce-muted flex-shrink-0">{fDateTime(ev.ts)}</span>
                                    <span className="flex-shrink-0">{ev.icon ?? meta.icon}</span>
                                    <span className="text-[10px] text-kce-muted flex-shrink-0">{KIND_LABEL[ev.kind]}</span>
                                    <span className="text-kce-cream truncate flex-1">{ev.label}</span>
                                    <span className="font-bold flex-shrink-0" style={{color: meta.color}}>{fe(ev.delta)}</span>
                                </div>
                            )
                        })}
                    </div>
                    <div className="flex items-center gap-3 mt-1 px-1.5 text-[10px]">
                        <span className="text-kce-muted">{t('treasury.history.balanceAfter')}</span>
                        <span className="font-bold" style={{color: 'var(--kce-cream)'}}>
                            {actualLabel}: {fe(selectedCluster.points[selectedCluster.points.length - 1].actual)}
                        </span>
                        <span className="font-bold opacity-85" style={{color: 'var(--kce-primary)'}}>
                            {virtualLabel}: {fe(selectedCluster.points[selectedCluster.points.length - 1].virtual)}
                        </span>
                    </div>
                </>
            ) : (
                <div className="text-[9px] text-kce-muted/60 italic mt-2 px-1.5">☝️ {t('treasury.history.tapHint')}</div>
            ))}

            {hasData && (
                <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-kce-border">
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-1.5 rounded-full" style={{background: 'var(--kce-cream)'}}/>
                        <span className="text-[10px] text-kce-muted font-bold">{actualLabel}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-1.5 rounded-full" style={{background: 'var(--kce-primary)', opacity: 0.85}}/>
                        <span className="text-[10px] text-kce-muted font-bold">{virtualLabel}</span>
                    </div>
                </div>
            )}
        </div>
    )
}

export function TreasuryPage() {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const regularMembers = useAppStore(s => s.regularMembers)
    const admin = isAdmin(user)

    const [tab, setTab] = useHashTab<'overview' | 'accounts' | 'bookings'>('overview', ['overview', 'accounts', 'bookings'])
    const [showHelp, setShowHelp] = useState(false)
    const [showExportSheet, setShowExportSheet] = useState(false)
    const [showAccountsChart, setShowAccountsChart] = useState(false)
    const [flowDetail, setFlowDetail] = useState<'paidIn' | 'expenses' | 'otherIncome' | 'outstanding' | null>(null)
    const [showSettled, setShowSettled] = useState(false)
    const [showBalanceFilter, setShowBalanceFilter] = useState(false)
    const [balanceFilterIds, setBalanceFilterIds] = useState<Set<number>>(new Set())
    // View scope: restrict every filtered figure/list to just the selected members.
    const [balanceOnlySelected, setBalanceOnlySelected] = useState(false)
    // "What if the selected members left" adjustments (independent, only apply when
    // NOT in "only selected" view). Write-off outstanding debt is the historical default.
    const [balanceWriteOffDebt, setBalanceWriteOffDebt] = useState(true)
    const [balanceRefundPaid, setBalanceRefundPaid] = useState(false)
    const [balanceSettleShare, setBalanceSettleShare] = useState(false)

    const clearBalanceFilter = () => {
        setBalanceFilterIds(new Set())
        setBalanceOnlySelected(false)
        setBalanceWriteOffDebt(true)
        setBalanceRefundPaid(false)
        setBalanceSettleShare(false)
    }

    // Club data (for PayPal handle)
    const {data: club} = useQuery({
        queryKey: ['club'],
        queryFn: api.getClub,
        staleTime: 1000 * 60,
    })

    // My pending payment requests (for own PayPal section)
    const {data: myPaymentRequests = [], refetch: refetchMyPaymentRequests} = useQuery({
        queryKey: ['my-payment-requests'],
        queryFn: api.getMyPaymentRequests,
        enabled: !!user?.regular_member_id,
        staleTime: 1000 * 30,
    })

    // Balances — always loaded (used in overview + accounts tabs)
    const {data: balances = [], refetch: refetchBalances} = useQuery({
        queryKey: ['member-balances'],
        queryFn: api.getMemberBalances,
        staleTime: 1000 * 30,
    })

    // Guest balances — always loaded
    const {data: guestBalances = [], refetch: refetchGuestBalances} = useQuery({
        queryKey: ['guest-balances'],
        queryFn: api.getGuestBalances,
        staleTime: 1000 * 30,
    })

    // Expenses — loaded for bookings tab + overview
    const {data: expenses = [], refetch: refetchExpenses} = useQuery({
        queryKey: ['club-expenses'],
        queryFn: api.getExpenses,
        staleTime: 1000 * 30,
    })

    // All payments — loaded for bookings tab + overview (Kasse balance-history graph)
    const {data: allPayments = [], refetch: refetchAllPayments} = useQuery({
        queryKey: ['all-payments'],
        queryFn: api.getAllPayments,
        enabled: tab === 'bookings' || tab === 'overview' || showExportSheet,
        staleTime: 1000 * 30,
    })

    // Per-member payments — loaded when a member is expanded in accounts tab
    const [accountSearch, setAccountSearch] = useState('')
    const [bookingSearch, setBookingSearch] = useState('')
    const [expandedMember, setExpandedMember] = useState<number | null>(null)
    const [deepLinkRid, setDeepLinkRid] = useState<number | null>(null)

    // Deep-link: ?memberName=X pre-fills search; ?rid=N opens payment-request confirm sheet
    function handleDeepLink() {
        const params = getHashParams()
        const memberName = params.get('memberName')
        const memberId = params.get('member')
        const rid = params.get('rid')
        if (memberName || memberId || rid) {
            if (memberName) {
                setBookingSearch(memberName)
                setAccountSearch(memberName)
            }
            if (memberId) setExpandedMember(parseInt(memberId, 10))
            if (rid) {
                setTab('accounts' as Parameters<typeof setTab>[0])
                setDeepLinkRid(parseInt(rid, 10))
            }
            clearHashParams()
        }
    }
    useEffect(() => {
        handleDeepLink()
        const onHash = () => handleDeepLink()
        window.addEventListener('hashchange', onHash)
        return () => window.removeEventListener('hashchange', onHash)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
    const {data: memberPayments = []} = useQuery({
        queryKey: ['member-payments', expandedMember],
        queryFn: () => expandedMember ? api.getMemberPayments(expandedMember) : null,
        enabled: !!expandedMember,
        staleTime: 1000 * 30,
    })

    // Balance-history graph (Übersicht tab) — Kasse (club) vs Mitglied (individual) scope
    const [historyScope, setHistoryScope] = useState<'club' | 'member'>('club')
    const [historyMemberId, setHistoryMemberId] = useState<number | null>(null)
    const allHistoryMembers = [...balances, ...(guestBalances as Balance[])] as Balance[]
    const myHistoryDefault = allHistoryMembers.find(m => m.regular_member_id === user?.regular_member_id)
    const effectiveHistoryMemberId = historyMemberId
        ?? myHistoryDefault?.regular_member_id
        ?? allHistoryMembers[0]?.regular_member_id
        ?? null

    const {data: debtTimeline = []} = useQuery({
        queryKey: ['treasury-debt-timeline'],
        queryFn: api.getTreasuryDebtTimeline,
        enabled: tab === 'overview' && historyScope === 'club',
        staleTime: 1000 * 30,
    })
    const {data: historyMemberPayments = []} = useQuery({
        queryKey: ['member-payments', effectiveHistoryMemberId],
        queryFn: () => effectiveHistoryMemberId ? api.getMemberPayments(effectiveHistoryMemberId) : null,
        enabled: tab === 'overview' && historyScope === 'member' && !!effectiveHistoryMemberId,
        staleTime: 1000 * 30,
    })
    const {data: historyMemberPenalties = []} = useQuery({
        queryKey: ['member-penalties', effectiveHistoryMemberId],
        queryFn: () => effectiveHistoryMemberId ? api.getMemberPenalties(effectiveHistoryMemberId) : null,
        enabled: tab === 'overview' && historyScope === 'member' && !!effectiveHistoryMemberId,
        staleTime: 1000 * 30,
    })

    // Payment sheet (for members and guests)
    const [reportingMyPayment, setReportingMyPayment] = useState(false)
    const [myPaymentAmount, setMyPaymentAmount] = useState('')

    const [paymentTarget, setPaymentTarget] = useState<{ id: number; name: string } | null>(null)
    const [paymentMode, setPaymentMode] = useState<'deposit' | 'withdrawal'>('deposit')
    const [paymentAmount, setPaymentAmount] = useState('')
    const [paymentNote, setPaymentNote] = useState('')
    const [saving, setSaving] = useState(false)
    const [remindingDebtors, setRemindingDebtors] = useState(false)

    const [exportYear, setExportYear] = useState<number | null>(null)
    const [exportFormat, setExportFormat] = useState<'xlsx' | 'pdf'>('xlsx')
    const [exporting, setExporting] = useState(false)
    const exportYears = Array.from(new Set(
        [
            ...(allPayments as Payment[]).map(p => p.date ?? p.created_at),
            ...(expenses as Expense[]).map(e => e.date ?? e.created_at),
        ]
            .filter((d): d is string => !!d)
            .map(d => new Date(d).getFullYear())
    )).sort((a, b) => b - a)

    async function downloadReport() {
        setExporting(true)
        try {
            await api.downloadReport(exportYear ?? undefined, exportFormat)
            showToast(t('report.downloaded'))
            setShowExportSheet(false)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setExporting(false)
        }
    }

    function openPaymentSheet(id: number, name: string, prefillAmount?: number) {
        setPaymentTarget({id, name})
        setPaymentMode('deposit')
        setPaymentAmount(prefillAmount ? prefillAmount.toFixed(2) : '')
        setPaymentNote('')
    }

    async function submitPayment() {
        if (!paymentTarget) return
        const abs = parseAmount(paymentAmount)
        if (!abs || abs <= 0) return
        const amount = paymentMode === 'deposit' ? abs : -abs
        setSaving(true)
        try {
            await api.createMemberPayment({
                regular_member_id: paymentTarget.id,
                amount,
                note: paymentNote || undefined,
            })
            refetchBalances()
            refetchGuestBalances()
            qc.invalidateQueries({queryKey: ['member-payments', paymentTarget.id]})
            qc.invalidateQueries({queryKey: ['all-payments']})
            setPaymentTarget(null)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    const [confirmDeletePayment, setConfirmDeletePayment] = useState<{ id: number; memberId: number } | null>(null)
    const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null)
    const [deletePaymentReason, setDeletePaymentReason] = useState('')

    async function deletePayment(pid: number, mid: number, reason: string) {
        setDeletingPaymentId(pid)
        try {
            await api.deleteMemberPayment(pid, reason || undefined)
            refetchBalances()
            refetchGuestBalances()
            qc.invalidateQueries({queryKey: ['member-payments', mid]})
            qc.invalidateQueries({queryKey: ['all-payments']})
            refetchAllPayments()
            setConfirmDeletePayment(null)
            setDeletePaymentReason('')
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setDeletingPaymentId(null)
        }
    }

    // Payment requests (admin only)
    const {data: paymentRequests = [], refetch: refetchPaymentRequests} = useQuery({
        queryKey: ['payment-requests'],
        queryFn: api.getPaymentRequests,
        enabled: admin,
        staleTime: 1000 * 30,
    })

    async function confirmRequest(rid: number, mid: number) {
        try {
            await api.confirmPaymentRequest(rid)
            refetchPaymentRequests()
            refetchBalances()
            refetchGuestBalances()
            qc.invalidateQueries({queryKey: ['member-payments', mid]})
            qc.invalidateQueries({queryKey: ['all-payments']})
            qc.invalidateQueries({queryKey: ['my-payment-requests']})
            qc.invalidateQueries({queryKey: ['my-balance']})
        } catch (e: unknown) { toastError(e) }
    }

    async function rejectRequest(rid: number) {
        try {
            await api.rejectPaymentRequest(rid)
            refetchPaymentRequests()
            qc.invalidateQueries({queryKey: ['my-payment-requests']})
        } catch (e: unknown) { toastError(e) }
    }

    // Expense operations
    const [confirmDeleteExpense, setConfirmDeleteExpense] = useState<number | null>(null)
    const [deletingExpenseId, setDeletingExpenseId] = useState<number | null>(null)
    const [deleteExpenseReason, setDeleteExpenseReason] = useState('')

    async function deleteExpense(eid: number, reason: string) {
        setDeletingExpenseId(eid)
        try {
            await api.deleteExpense(eid, reason || undefined)
            refetchExpenses()
            refetchBalances()
            refetchGuestBalances()
            setConfirmDeleteExpense(null)
            setDeleteExpenseReason('')
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setDeletingExpenseId(null)
        }
    }

    // Edit booking sheet — shared by member payments and club expenses
    const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
    const [editDirection, setEditDirection] = useState<'in' | 'out'>('in')
    const [editAmount, setEditAmount] = useState('')
    const [editNote, setEditNote] = useState('')
    const [editDate, setEditDate] = useState('')
    const [savingEdit, setSavingEdit] = useState(false)

    function openEditPayment(p: { id: number; amount: number; note: string | null; created_at: string | null; date: string | null }, memberId: number, label: string) {
        setEditTarget({kind: 'payment', id: p.id, memberId, label})
        setEditDirection(p.amount >= 0 ? 'in' : 'out')
        setEditAmount(Math.abs(p.amount).toFixed(2))
        setEditNote(p.note ?? '')
        setEditDate(p.date ?? (p.created_at ? p.created_at.slice(0, 10) : ''))
    }

    function openEditExpense(e: Expense) {
        setEditTarget({kind: 'expense', id: e.id})
        // Positive expense amount = money going out, negative = income
        setEditDirection(e.amount >= 0 ? 'out' : 'in')
        setEditAmount(Math.abs(e.amount).toFixed(2))
        setEditNote(e.description)
        setEditDate(e.date ?? (e.created_at ? e.created_at.slice(0, 10) : ''))
    }

    async function submitEdit() {
        if (!editTarget) return
        const abs = parseAmount(editAmount)
        if (!abs || abs <= 0) return
        setSavingEdit(true)
        try {
            if (editTarget.kind === 'payment') {
                const amount = editDirection === 'in' ? abs : -abs
                await api.updateMemberPayment(editTarget.id, {amount, note: editNote, date: editDate})
                refetchBalances()
                refetchGuestBalances()
                qc.invalidateQueries({queryKey: ['member-payments', editTarget.memberId]})
                qc.invalidateQueries({queryKey: ['all-payments']})
            } else {
                if (!editNote.trim()) return
                const amount = editDirection === 'out' ? abs : -abs
                await api.updateExpense(editTarget.id, {amount, description: editNote.trim(), date: editDate})
                refetchExpenses()
                refetchBalances()
                refetchGuestBalances()
            }
            setEditTarget(null)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSavingEdit(false)
        }
    }

    // Guest cost transfer sheet — credit guest + debit chosen regular member
    const [transferGuest, setTransferGuest] = useState<{ id: number; name: string } | null>(null)
    const [transferTargetId, setTransferTargetId] = useState<number | null>(null)
    const [transferAmount, setTransferAmount] = useState('')
    const [transferNote, setTransferNote] = useState('')
    const [transferring, setTransferring] = useState(false)

    function openTransferSheet(id: number, name: string, prefillAmount: number) {
        setTransferGuest({id, name})
        setTransferTargetId(null)
        setTransferAmount(prefillAmount > 0 ? prefillAmount.toFixed(2) : '')
        setTransferNote('')
    }

    async function submitTransfer() {
        if (!transferGuest || !transferTargetId) return
        const abs = parseAmount(transferAmount)
        if (!abs || abs <= 0) return
        setTransferring(true)
        try {
            await api.transferGuestCosts({
                guest_id: transferGuest.id,
                target_member_id: transferTargetId,
                amount: abs,
                note: transferNote || undefined,
            })
            refetchBalances()
            refetchGuestBalances()
            qc.invalidateQueries({queryKey: ['member-payments', transferGuest.id]})
            qc.invalidateQueries({queryKey: ['member-payments', transferTargetId]})
            qc.invalidateQueries({queryKey: ['all-payments']})
            setTransferGuest(null)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setTransferring(false)
        }
    }

    // New booking sheet — unified for Club expenses and member payments
    const [bookingSheet, setBookingSheet] = useState(false)
    const [bookingTarget, setBookingTarget] = useState<'club' | number>('club')
    const [bookingDirection, setBookingDirection] = useState<'in' | 'out'>('out')
    const [bookingAmount, setBookingAmount] = useState('')
    const [bookingNote, setBookingNote] = useState('')
    const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [savingBooking, setSavingBooking] = useState(false)

    function openBookingSheet() {
        setBookingTarget('club')
        setBookingDirection('out')
        setBookingAmount('')
        setBookingNote('')
        setBookingDate(new Date().toISOString().slice(0, 10))
        setBookingSheet(true)
    }

    // Only regular (non-guest) members in the booking sheet picker
    const memberPickerList = (balances as Balance[]).filter(b => {
        const rm = regularMembers.find(r => r.id === b.regular_member_id)
        return rm && !rm.is_guest
    })

    async function submitBooking() {
        const abs = parseAmount(bookingAmount)
        if (!abs || abs <= 0) return
        setSavingBooking(true)
        try {
            if (bookingTarget === 'club') {
                if (!bookingNote.trim()) return
                // Positive = expense (Ausgabe), negative = income (Einnahme)
                const amount = bookingDirection === 'out' ? abs : -abs
                await api.createExpense({
                    amount,
                    description: bookingNote.trim(),
                    date: bookingDate || undefined,
                })
                refetchExpenses()
            } else {
                const amount = bookingDirection === 'in' ? abs : -abs
                await api.createMemberPayment({
                    regular_member_id: bookingTarget,
                    amount,
                    note: bookingNote || undefined,
                    date: bookingDate || undefined,
                })
                refetchBalances()
                refetchGuestBalances()
                qc.invalidateQueries({queryKey: ['member-payments', bookingTarget]})
                qc.invalidateQueries({queryKey: ['all-payments']})
            }
            setBookingSheet(false)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSavingBooking(false)
        }
    }

    // Balance filter — applies globally across the overview tab: the Kassenstand
    // hero (paid-in/outstanding/cash-on-hand/projected), its money-flow breakdown
    // rows, the "Offen & Guthaben" tiles/lists, and the club-scope history graph's
    // actual (cash) line all derive from effectiveBalances. Two mutually exclusive
    // shapes:
    //   • "Nur Auswahl anzeigen" (balanceOnlySelected) — a pure view scope that
    //     restricts everything to just the selected members.
    //   • otherwise a "what if the selection left the club" simulation, driven by
    //     independent adjustments: write off their outstanding debt, refund their
    //     already-paid money (drops paidIn), and/or settle their 1/n share of
    //     other-income minus expenses (a cash payout, applied as shareOut below).
    // Guests are never part of the selectable filter, so guest data always passes
    // through untouched. Only the Konten tab (whole-club per-account view) stays
    // unfiltered.
    const balanceFilterActive = balanceFilterIds.size > 0
    const effectiveBalances = !balanceFilterActive
        ? balances
        : balanceOnlySelected
            ? balances.filter(b => balanceFilterIds.has(b.regular_member_id))
            : (() => {
                let b = balances
                if (balanceWriteOffDebt) b = writeOffOutstandingDebt(b, balanceFilterIds)
                if (balanceRefundPaid) b = refundPaidIn(b, balanceFilterIds)
                return b
            })()

    // Derived overview stats — full money flow: paid-in → expenses → cash on
    // hand, plus outstanding debt (members + guests) and the projected cash
    // if everyone settled up. Kept in lib/treasurySummary.ts (pure, tested).
    const summary = treasurySummary(effectiveBalances, guestBalances as Balance[], expenses as Expense[])
    // Positive = money the leaving selection would draw out of the till (lowers
    // cash on hand); negative = they'd pay in to settle their share (raises it).
    // Only in the removal simulation ("only selected" view never pays anyone out).
    const shareOut = (balanceFilterActive && !balanceOnlySelected && balanceSettleShare)
        ? shareSettlement(summary.otherIncome, summary.expensesGross, balances.length, balanceFilterIds.size)
        : 0
    const totalExpenses = summary.expensesNet
    const kassenstand = summary.cashOnHand - shareOut
    const projectedCash = summary.projectedCash - shareOut

    // Per-click breakdowns for the Kassenstand hero rows — same source data,
    // just grouped/filtered per row instead of netted into a single figure.
    const allBalancesForFlow = [...effectiveBalances, ...(guestBalances as Balance[])] as Balance[]
    const paidInBreakdown = allBalancesForFlow
        .filter(b => Math.abs(b.payments_total) > 0.001)
        .map(b => ({id: b.regular_member_id, label: b.nickname || b.name, amount: b.payments_total}))
        .sort((a, b) => b.amount - a.amount)
    const expensesBreakdown = (expenses as Expense[])
        .filter(e => e.amount > 0)
        .map(e => ({id: e.id, label: e.description, amount: e.amount, date: e.date ?? e.created_at}))
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    const otherIncomeBreakdown = (expenses as Expense[])
        .filter(e => e.amount < 0)
        .map(e => ({id: e.id, label: e.description, amount: Math.abs(e.amount), date: e.date ?? e.created_at}))
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    const outstandingBreakdown = allBalancesForFlow
        .filter(b => b.balance < -0.01)
        .map(b => ({id: b.regular_member_id, label: b.nickname || b.name, amount: Math.abs(b.balance)}))
        .sort((a, b) => b.amount - a.amount)

    const totalOutstanding = balances.reduce((s, b) => b.balance < 0 ? s + Math.abs(b.balance) : s, 0)
    const totalSurplus = balances.reduce((s, b) => b.balance > 0 ? s + b.balance : s, 0)
    // Total paid in by members (gross deposits) — separate from totalSurplus (credit),
    // since credit is money the till already owes back to the member, not free cash.
    const totalPaidMembers = balances.reduce((s, b) => s + b.payments_total, 0)
    const maxAccountPenalty = balances.reduce((m, b) => Math.max(m, b.penalty_total), 0)
    // Unfiltered debtor/credit counts — used by the Konten tab's account totals,
    // which are not affected by the Übersicht balance filter below.
    const debtors = [...balances].filter(b => b.balance < -0.01).sort((a, b) => a.balance - b.balance)
    const credits = balances.filter(b => b.balance > 0.01).sort((a, b) => b.balance - a.balance)

    // "Offen & Guthaben" section below — driven by effectiveBalances so the
    // balance filter (exclude/only selected players) scopes these without
    // touching the Konten tab totals above, which stay on the raw balances.
    const filteredTotalOutstanding = effectiveBalances.reduce((s, b) => b.balance < 0 ? s + Math.abs(b.balance) : s, 0)
    const filteredTotalSurplus = effectiveBalances.reduce((s, b) => b.balance > 0 ? s + b.balance : s, 0)
    const filteredDebtors = [...effectiveBalances].filter(b => b.balance < -0.01).sort((a, b) => a.balance - b.balance)
    const filteredCredits = effectiveBalances.filter(b => b.balance > 0.01).sort((a, b) => b.balance - a.balance)
    const filteredExactlySettled = effectiveBalances.filter(b => b.balance >= -0.01 && b.balance <= 0.01)

    const guestDebtors = (guestBalances as Balance[]).filter(b => b.balance < -0.01)
        .sort((a, b) => a.balance - b.balance)

    // Balance-history graph events — Kasse: actual cash bookings + outstanding-debt overlay;
    // Mitglied: actual payments + penalty overlay (payments minus penalties = true balance).
    // The Kasse-scope "actual" line honors the balance filter's "only" mode (guests always
    // pass through, since they're never part of the selectable filter); "exclude" leaves it
    // untouched since money already received doesn't stop being real. The debt/projection
    // overlay stays whole-club regardless — it's a single club-wide timeline from the backend,
    // not attributable to individual members.
    const guestIds = new Set((guestBalances as Balance[]).map(b => b.regular_member_id))
    const filteredClubPayments = (balanceFilterActive && balanceOnlySelected)
        ? (allPayments as Payment[]).filter(p => guestIds.has(p.regular_member_id) || balanceFilterIds.has(p.regular_member_id))
        : (allPayments as Payment[])
    const historyActualEvents = historyScope === 'club'
        ? clubEventsFromBookings(filteredClubPayments, expenses as Expense[])
        : memberPaymentEvents(historyMemberPayments as MemberPayment[])
    const historyOverlayEvents = historyScope === 'club'
        ? debtEventsFromTimeline(debtTimeline)
        : memberPenaltyEvents(historyMemberPenalties as any[])

    // Merged bookings for Buchungen tab — sorted by effective date desc
    // Uses the `date` field if set (admin backdate), otherwise `created_at`
    const mergedBookings: BookingEntry[] = [
        ...(allPayments as Payment[]).map(p => ({kind: 'payment' as const, data: p})),
        ...(expenses as Expense[]).map(e => ({kind: 'expense' as const, data: e})),
    ].sort((a, b) => {
        const ta = a.data.date ?? a.data.created_at ?? ''
        const tb = b.data.date ?? b.data.created_at ?? ''
        return tb.localeCompare(ta)
    })

    const aq = accountSearch.trim().toLowerCase()
    const filteredBalances = aq
        ? [...balances].filter(b => b.name.toLowerCase().includes(aq) || (b.nickname ?? '').toLowerCase().includes(aq))
        : balances

    const bq = bookingSearch.trim().toLowerCase()
    const filteredBookings = bq
        ? mergedBookings.filter(entry =>
            entry.kind === 'payment'
                ? entry.data.member_name.toLowerCase().includes(bq) || (entry.data.note ?? '').toLowerCase().includes(bq)
                : entry.data.description.toLowerCase().includes(bq)
        )
        : mergedBookings

    const paypalHandle = (club as any)?.settings?.paypal_me as string | undefined
    const myRegularMemberId = user?.regular_member_id
    const myBalanceEntry = balances.find(b => b.regular_member_id === myRegularMemberId)
    const myDebtAmount = myBalanceEntry && myBalanceEntry.balance < -0.01 ? Math.abs(myBalanceEntry.balance) : 0
    const hasPendingMyRequest = myPaymentRequests.some((r: any) => r.status === 'pending')

    const pendingRequestCount = admin ? paymentRequests.length : 0
    const TABS = [
        {id: 'overview', label: t('treasury.tab.overview')},
        {id: 'accounts', label: t('treasury.tab.accounts') + (pendingRequestCount > 0 ? ` (${pendingRequestCount})` : '')},
        {id: 'bookings', label: t('treasury.tab.bookings')},
    ] as const

    const isClubBooking = bookingTarget === 'club'
    const bookingValid = parseAmount(bookingAmount) > 0 && (isClubBooking ? bookingNote.trim().length > 0 : true)
    const editValid = parseAmount(editAmount) > 0 && (editTarget?.kind === 'expense' ? editNote.trim().length > 0 : true)

    return (
        <div className="page-scroll px-3 py-3 pb-24">
            <div className="flex items-center justify-between mb-3">
                <div className="sec-heading mb-0">💰 {t('nav.treasury')}</div>
                {admin && (
                    <button
                        type="button"
                        onClick={() => setShowExportSheet(true)}
                        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-kce-surface2 text-kce-muted hover:bg-kce-surface transition-all">
                        {t('report.export')}
                    </button>
                )}
            </div>

            {/* Tab strip */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
                {TABS.map(tb => (
                    <button key={tb.id} type="button"
                            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === tb.id ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                            onClick={() => setTab(tb.id)}>
                        {tb.label}
                    </button>
                ))}
            </div>

            {/* ── Übersicht ── */}
            {tab === 'overview' && (
                <div>
                    {/* Mein Konto — own status first: what did I pay, what is still open? */}
                    {myBalanceEntry && (
                        <div className="kce-card p-4 mb-3">
                            <div className="text-xs font-bold text-kce-muted uppercase tracking-wider mb-1">
                                👤 {t('treasury.my.title')}
                            </div>
                            <div className="flex items-end justify-between gap-3">
                                <div>
                                    {myBalanceEntry.balance < -0.01 ? (
                                        <>
                                            <div className="font-display font-bold text-2xl text-red-400">{fe(Math.abs(myBalanceEntry.balance))}</div>
                                            <div className="text-[11px] text-red-400 font-bold">{t('treasury.my.owe')}</div>
                                        </>
                                    ) : myBalanceEntry.balance > 0.01 ? (
                                        <>
                                            <div className="font-display font-bold text-2xl text-green-400">+{fe(myBalanceEntry.balance)}</div>
                                            <div className="text-[11px] text-green-400 font-bold">{t('treasury.my.credit')}</div>
                                            <div className="text-[10px] text-kce-muted">{t('treasury.my.creditHint')}</div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="font-display font-bold text-2xl text-green-400">✓ {t('treasury.my.settled')}</div>
                                            <div className="text-[10px] text-kce-muted">{t('treasury.my.settledHint')}</div>
                                        </>
                                    )}
                                </div>
                                <div className="text-right text-xs text-kce-muted flex-shrink-0">
                                    <div>{t('treasury.penaltiesLabel')}: <span className="font-bold text-kce-cream">{fe(myBalanceEntry.penalty_total)}</span></div>
                                    <div>{t('treasury.paidLabel')}: <span className="font-bold text-kce-cream">{fe(myBalanceEntry.payments_total)}</span></div>
                                </div>
                            </div>
                            {paidShare(myBalanceEntry) !== null && (
                                <>
                                    <PaidShareBar b={myBalanceEntry}/>
                                    <div className="text-[10px] text-kce-muted mt-1">
                                        {Math.round((paidShare(myBalanceEntry) ?? 0) * 100)}% {t('treasury.my.paidShare')}
                                    </div>
                                </>
                            )}
                            {myDebtAmount > 0 && paypalHandle && (
                                <div className="mt-2 pt-2 border-t border-kce-border">
                                    {!hasPendingMyRequest ? (
                                        !reportingMyPayment ? (
                                            <div className="flex gap-2">
                                                <a
                                                    href={`https://paypal.me/${paypalHandle}/${myDebtAmount.toFixed(2)}EUR`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="btn-primary flex-1 text-center text-sm py-2 no-underline"
                                                >
                                                    {t('profile.payNow')}
                                                </a>
                                                <button className="btn-secondary flex-1 btn-sm"
                                                        onClick={() => { setReportingMyPayment(true); setMyPaymentAmount('') }}>
                                                    {t('profile.reportPayment')}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
                                                    <input
                                                        className="kce-input flex-1"
                                                        type="text" inputMode="decimal"
                                                        value={myPaymentAmount}
                                                        placeholder={myDebtAmount.toFixed(2)}
                                                        onChange={e => setMyPaymentAmount(e.target.value)}
                                                    />
                                                </div>
                                                <div className="flex gap-2">
                                                    <button className="btn-secondary flex-1 btn-sm"
                                                            onClick={() => { setReportingMyPayment(false); setMyPaymentAmount('') }}>
                                                        {t('action.cancel')}
                                                    </button>
                                                    <button className="btn-primary flex-1 btn-sm" onClick={async () => {
                                                        const amt = myPaymentAmount.trim()
                                                            ? parseFloat(myPaymentAmount.replace(',', '.'))
                                                            : myDebtAmount
                                                        if (!amt || amt <= 0) return
                                                        try {
                                                            await api.createPaymentRequest({amount: amt})
                                                            await refetchMyPaymentRequests()
                                                            if (admin) refetchPaymentRequests()
                                                            setReportingMyPayment(false)
                                                            setMyPaymentAmount('')
                                                            showToast(t('profile.reportPayment'))
                                                        } catch (e) { toastError(e) }
                                                    }}>
                                                        {t('profile.reportPayment')}
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    ) : (
                                        <div className="text-xs text-kce-amber text-center py-1">
                                            ⏳ {t('paymentRequest.pending')}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Nach Spielern filtern — collapsible, scopes the Kassenstand hero, den Verlauf-Graph (Kasse-Modus) und die Offen/Guthaben-Kacheln/Listen unten auf eine Auswahl von Mitgliedern */}
                    <div className="kce-card mb-3 overflow-hidden" data-testid="balance-filter">
                        <div className="w-full p-3 flex items-center justify-between gap-2">
                            <button type="button" className="flex items-center gap-2 text-left flex-1 min-w-0"
                                    aria-expanded={showBalanceFilter}
                                    onClick={() => setShowBalanceFilter(v => !v)}>
                                <span className="text-xs font-bold text-kce-muted truncate">🔍 {t('treasury.balanceFilter.title')}</span>
                                {balanceFilterActive && (
                                    <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-kce-amber text-kce-bg text-[10px] font-bold"
                                          data-testid="balance-filter-active">{balanceFilterIds.size}</span>
                                )}
                                <span className="text-kce-muted text-xs ml-auto flex-shrink-0">{showBalanceFilter ? '▲' : '▼'}</span>
                            </button>
                            {balanceFilterActive && (
                                <button type="button" className="flex-shrink-0 text-[10px] text-kce-muted underline px-1"
                                        data-testid="balance-filter-clear"
                                        onClick={clearBalanceFilter}>
                                    {t('treasury.balanceFilter.clear')}
                                </button>
                            )}
                        </div>
                        {showBalanceFilter && (
                            <div className="px-3 pb-3">
                                <div className="text-[11px] text-kce-muted mb-2">{t('treasury.balanceFilter.hint')}</div>
                                <div className="flex gap-2 flex-wrap mb-2">
                                    {[...balances].sort((a, b) => {
                                        if (a.regular_member_id === myRegularMemberId) return -1
                                        if (b.regular_member_id === myRegularMemberId) return 1
                                        return 0
                                    }).map(m => {
                                        const selected = balanceFilterIds.has(m.regular_member_id)
                                        const isMe = m.regular_member_id === myRegularMemberId
                                        return (
                                            <button key={m.regular_member_id} type="button"
                                                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${selected ? 'bg-kce-amber text-kce-bg border-kce-amber' : 'bg-kce-surface2 text-kce-muted border-kce-border'}`}
                                                    onClick={() => setBalanceFilterIds(prev => {
                                                        const next = new Set(prev)
                                                        if (next.has(m.regular_member_id)) next.delete(m.regular_member_id)
                                                        else next.add(m.regular_member_id)
                                                        return next
                                                    })}>
                                                {m.nickname || m.name}
                                                {isMe && <span className={`ml-1 text-[9px] font-bold ${selected ? 'text-kce-bg' : 'text-kce-amber'}`}>Ich</span>}
                                            </button>
                                        )
                                    })}
                                </div>
                                {balanceFilterActive && (
                                    <div className="flex flex-col gap-2 pt-1 border-t border-kce-border" data-testid="balance-filter-options">
                                        {/* View scope — a pure "show me only these members" filter, distinct from the removal simulation below */}
                                        <label className="flex items-start gap-2 cursor-pointer pt-2">
                                            <input type="checkbox" className="mt-0.5 flex-shrink-0" checked={balanceOnlySelected}
                                                   data-testid="balance-opt-only"
                                                   onChange={e => setBalanceOnlySelected(e.target.checked)}/>
                                            <span>
                                                <span className="text-xs font-bold text-kce-cream">{t('treasury.balanceFilter.onlySelected')}</span>
                                                <span className="block text-[10px] text-kce-muted">{t('treasury.balanceFilter.onlySelectedHint')}</span>
                                            </span>
                                        </label>
                                        {/* Removal-simulation adjustments — only meaningful when NOT scoping to the subset */}
                                        <div className={`flex flex-col gap-2 ${balanceOnlySelected ? 'opacity-40 pointer-events-none' : ''}`}
                                             aria-disabled={balanceOnlySelected}>
                                            <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider">{t('treasury.balanceFilter.simHeading')}</div>
                                            <label className="flex items-start gap-2 cursor-pointer">
                                                <input type="checkbox" className="mt-0.5 flex-shrink-0" checked={balanceWriteOffDebt}
                                                       disabled={balanceOnlySelected} data-testid="balance-opt-writeoff"
                                                       onChange={e => setBalanceWriteOffDebt(e.target.checked)}/>
                                                <span>
                                                    <span className="text-xs font-bold text-kce-cream">{t('treasury.balanceFilter.optWriteOff')}</span>
                                                    <span className="block text-[10px] text-kce-muted">{t('treasury.balanceFilter.optWriteOffHint')}</span>
                                                </span>
                                            </label>
                                            <label className="flex items-start gap-2 cursor-pointer">
                                                <input type="checkbox" className="mt-0.5 flex-shrink-0" checked={balanceRefundPaid}
                                                       disabled={balanceOnlySelected} data-testid="balance-opt-refund"
                                                       onChange={e => setBalanceRefundPaid(e.target.checked)}/>
                                                <span>
                                                    <span className="text-xs font-bold text-kce-cream">{t('treasury.balanceFilter.optRefund')}</span>
                                                    <span className="block text-[10px] text-kce-muted">{t('treasury.balanceFilter.optRefundHint')}</span>
                                                </span>
                                            </label>
                                            <label className="flex items-start gap-2 cursor-pointer">
                                                <input type="checkbox" className="mt-0.5 flex-shrink-0" checked={balanceSettleShare}
                                                       disabled={balanceOnlySelected} data-testid="balance-opt-share"
                                                       onChange={e => setBalanceSettleShare(e.target.checked)}/>
                                                <span>
                                                    <span className="text-xs font-bold text-kce-cream">{t('treasury.balanceFilter.optShare')}</span>
                                                    <span className="block text-[10px] text-kce-muted">{t('treasury.balanceFilter.optShareHint')}</span>
                                                </span>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Kassenstand hero — with explicit money-flow breakdown */}
                    <div className="kce-card p-4 mb-3"
                         style={{background: 'linear-gradient(135deg, var(--kce-surface), var(--kce-surface2))'}}>
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-xs font-bold text-kce-muted uppercase tracking-wider mb-0.5">💰
                                    {t('treasury.cashOnHand')}
                                </div>
                                <div className={`font-display font-bold text-3xl ${kassenstand >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fe(kassenstand)}</div>
                                <div className="text-[10px] text-kce-muted mt-1">{t('treasury.cashOnHandHint')}</div>
                            </div>
                            <span className="text-4xl opacity-20">💰</span>
                        </div>
                        <div className="mt-3 pt-2 border-t border-kce-border flex flex-col gap-1 text-xs">
                            <FlowRow
                                icon="⬆" label={t('treasury.flow.paidIn')}
                                amountLabel={`+${fe(summary.paidIn)}`} colorClass="text-green-400"
                                open={flowDetail === 'paidIn'} onToggle={() => setFlowDetail(flowDetail === 'paidIn' ? null : 'paidIn')}
                                items={paidInBreakdown} myId={myRegularMemberId} noEntriesLabel={t('treasury.flow.noEntries')}
                                testId="flow-amount-paidIn"
                            />
                            <FlowRow
                                icon="⬇" label={t('treasury.flow.expenses')}
                                amountLabel={`-${fe(summary.expensesGross)}`} colorClass="text-orange-400"
                                open={flowDetail === 'expenses'} onToggle={() => setFlowDetail(flowDetail === 'expenses' ? null : 'expenses')}
                                items={expensesBreakdown} noEntriesLabel={t('treasury.flow.noEntries')}
                                testId="flow-amount-expenses"
                            />
                            {summary.otherIncome > 0 && (
                                <FlowRow
                                    icon="⬆" label={t('treasury.flow.otherIncome')}
                                    amountLabel={`+${fe(summary.otherIncome)}`} colorClass="text-green-400"
                                    open={flowDetail === 'otherIncome'} onToggle={() => setFlowDetail(flowDetail === 'otherIncome' ? null : 'otherIncome')}
                                    items={otherIncomeBreakdown} noEntriesLabel={t('treasury.flow.noEntries')}
                                    testId="flow-amount-otherIncome"
                                />
                            )}
                            {Math.abs(shareOut) >= 0.005 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-kce-muted">⚖️ {t('treasury.flow.shareSettlement')}</span>
                                    <span className={`font-bold ${shareOut > 0 ? 'text-orange-400' : 'text-green-400'}`}
                                          data-testid="flow-amount-share">
                                        {shareOut > 0 ? `-${fe(shareOut)}` : `+${fe(-shareOut)}`}
                                    </span>
                                </div>
                            )}
                            {summary.outstanding > 0 && (
                                <>
                                    <FlowRow
                                        icon="🔴" label={t('treasury.flow.outstanding')}
                                        amountLabel={fe(summary.outstanding)} colorClass="text-red-400"
                                        open={flowDetail === 'outstanding'} onToggle={() => setFlowDetail(flowDetail === 'outstanding' ? null : 'outstanding')}
                                        items={outstandingBreakdown} myId={myRegularMemberId} noEntriesLabel={t('treasury.flow.noEntries')}
                                        testId="flow-amount-outstanding"
                                    />
                                    <div className="flex items-center justify-between pt-1 border-t border-kce-border">
                                        <span className="text-kce-muted">→ {t('treasury.flow.projected')}</span>
                                        <span className="font-bold" style={{color: 'var(--kce-cream)'}}>{fe(projectedCash)}</span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* How does the treasury work? — tucked away inside the hero, less prominent than a standalone card */}
                        <div className="mt-2 pt-2 border-t border-kce-border">
                            <button type="button" className="w-full flex items-center justify-between text-left"
                                    aria-expanded={showHelp}
                                    onClick={() => setShowHelp(v => !v)}>
                                <span className="text-[10px] text-kce-muted">❓ {t('treasury.help.title')}</span>
                                <span className="text-kce-muted text-[10px]">{showHelp ? '▲' : '▼'}</span>
                            </button>
                            {showHelp && (
                                <ul className="pt-1.5 flex flex-col gap-1 text-[10px] text-kce-muted list-disc list-inside">
                                    <li>{t('treasury.help.penalties')}</li>
                                    <li>{t('treasury.help.payments')}</li>
                                    <li>{t('treasury.help.cash')}</li>
                                    <li>{t('treasury.help.credit')}</li>
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* ── Balance-history graph ── */}
                    <div className="kce-card p-3 mb-3">
                        <div className="sec-heading mb-2">{t('treasury.history.heading')}</div>
                        <ModeToggle
                            options={[
                                {value: 'club', label: `🏛️ ${t('treasury.history.scopeClub')}`},
                                {value: 'member', label: `👤 ${t('treasury.history.scopeMember')}`},
                            ]}
                            value={historyScope}
                            onChange={v => setHistoryScope(v as 'club' | 'member')}/>
                        {historyScope === 'member' && allHistoryMembers.length > 0 && (
                            <div className="flex gap-2 flex-wrap mt-2">
                                {[...allHistoryMembers].sort((a, b) => {
                                    if (a.regular_member_id === user?.regular_member_id) return -1
                                    if (b.regular_member_id === user?.regular_member_id) return 1
                                    return 0
                                }).map(m => {
                                    const isActive = effectiveHistoryMemberId === m.regular_member_id
                                    const isMe = m.regular_member_id === user?.regular_member_id
                                    return (
                                        <button key={m.regular_member_id} type="button"
                                                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isActive ? 'bg-kce-amber text-kce-bg border-kce-amber' : 'bg-kce-surface2 text-kce-muted border-kce-border'}`}
                                                onClick={() => setHistoryMemberId(m.regular_member_id)}>
                                            {m.nickname || m.name}
                                            {isMe && <span className={`ml-1 text-[9px] font-bold ${isActive ? 'text-kce-bg' : 'text-kce-amber'}`}>Ich</span>}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    <BalanceHistoryChart
                        key={historyScope === 'club' ? 'club' : `member-${effectiveHistoryMemberId}`}
                        actualEvents={historyActualEvents}
                        overlayEvents={historyOverlayEvents}
                        actualLabel={historyScope === 'club' ? t('treasury.history.actual') : t('treasury.history.actualMember')}
                        virtualLabel={historyScope === 'club' ? t('treasury.history.virtualClub') : t('treasury.history.virtualMember')}
                        t={t}/>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="kce-card p-4 flex flex-col gap-1">
                            <span className="text-xs text-kce-muted">{t('treasury.openLabel')}</span>
                            <span className="font-display font-bold text-red-400 text-xl">{fe(filteredTotalOutstanding)}</span>
                            <span
                                className="text-[10px] text-kce-muted">{filteredDebtors.length} {t('treasury.membersCount')}</span>
                        </div>
                        <div className="kce-card p-4 flex flex-col gap-1">
                            <span className="text-xs text-kce-muted">{t('treasury.creditLabel')}</span>
                            <span className="font-display font-bold text-green-400 text-xl">{fe(filteredTotalSurplus)}</span>
                            <span
                                className="text-[10px] text-kce-muted">{filteredCredits.length} {t('treasury.membersCount')}</span>
                        </div>
                    </div>

                    {filteredDebtors.length === 0 && filteredCredits.length === 0
                        ? <div
                            className="kce-card p-4 text-center text-sm font-bold text-green-400">{t('treasury.noOutstanding')}</div>
                        : null
                    }

                    {filteredDebtors.length > 0 && (
                        <>
                            <div className="sec-heading flex items-center justify-between">
                                <span>{t('treasury.openLabel')}</span>
                                {admin && (
                                    <button
                                        disabled={remindingDebtors}
                                        onClick={async () => {
                                            setRemindingDebtors(true)
                                            try {
                                                await api.remindDebtors()
                                                showToast(t('treasury.remindDebtorsDone'))
                                            } catch (e: unknown) {
                                                toastError(e)
                                            } finally {
                                                setRemindingDebtors(false)
                                            }
                                        }}
                                        className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-kce-surface2 text-kce-muted transition-all">
                                        {remindingDebtors ? '…' : t('treasury.remindDebtors')}
                                    </button>
                                )}
                            </div>
                            {filteredDebtors.map((b, i) => {
                                const isMe = b.regular_member_id === myRegularMemberId
                                return (
                                    <div key={b.regular_member_id} className="kce-card mb-2 overflow-hidden">
                                        <div className="p-3 flex items-center gap-3">
                                            <span
                                                className="text-sm font-display font-bold text-kce-muted w-5 text-center flex-shrink-0">
                                                {i + 1}.
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                                    {b.nickname || b.name}
                                                    {isMe && <span className="text-[9px] text-kce-amber font-bold">Ich</span>}
                                                </div>
                                                <div className="text-xs text-kce-muted">
                                                    {t('treasury.penaltiesLabel')}: {fe(b.penalty_total)} · {t('treasury.paidLabel')}: {fe(b.payments_total)}
                                                </div>
                                                <PaidShareBar b={b}/>
                                            </div>
                                            <span
                                                className="font-bold text-red-400 text-sm flex-shrink-0">{fe(b.balance)}</span>
                                            {admin && (
                                                <button className="btn-primary btn-sm flex-shrink-0"
                                                        onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                                    {t('treasury.payment.settle')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </>
                    )}

                    {filteredCredits.length > 0 && (
                        <>
                            <div className="sec-heading mt-2">{t('treasury.creditLabel')}</div>
                            <p className="text-xs text-kce-muted mb-2">{t('treasury.creditHint')}</p>
                            {[...filteredCredits].sort((a, b) => {
                        if (a.regular_member_id === myRegularMemberId) return -1
                        if (b.regular_member_id === myRegularMemberId) return 1
                        return 0
                    }).map(b => (
                                <div key={b.regular_member_id} className="kce-card p-3 mb-2 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                            {b.nickname || b.name}
                                            {b.regular_member_id === myRegularMemberId && <span className="text-[9px] text-kce-amber font-bold">Ich</span>}
                                        </div>
                                        <div className="text-xs text-kce-muted">
                                            {t('treasury.penaltiesLabel')}: {fe(b.penalty_total)} · {t('treasury.paidLabel')}: {fe(b.payments_total)}
                                        </div>
                                    </div>
                                    <span
                                        className="font-bold text-green-400 text-sm flex-shrink-0">+{fe(b.balance)}</span>
                                </div>
                            ))}
                        </>
                    )}

                    {filteredExactlySettled.length > 0 && (filteredDebtors.length > 0 || filteredCredits.length > 0) && (
                        <div className="mt-2">
                            <button type="button" className="w-full flex items-center justify-center gap-1 text-xs text-kce-muted"
                                    aria-expanded={showSettled}
                                    onClick={() => setShowSettled(v => !v)}>
                                <span>+ {filteredExactlySettled.length} {t('treasury.settledCount')}</span>
                                <span className="text-[9px]">{showSettled ? '▲' : '▼'}</span>
                            </button>
                            {showSettled && (
                                <div className="flex flex-wrap justify-center gap-1.5 mt-1.5">
                                    {[...filteredExactlySettled].sort((a, b) => {
                                        if (a.regular_member_id === myRegularMemberId) return -1
                                        if (b.regular_member_id === myRegularMemberId) return 1
                                        return 0
                                    }).map(b => (
                                        <span key={b.regular_member_id}
                                              className="px-2 py-1 rounded-full bg-kce-surface2 border border-kce-border text-[11px] text-kce-muted flex items-center gap-1">
                                            {b.nickname || b.name}
                                            {b.regular_member_id === myRegularMemberId &&
                                                <span className="text-[9px] text-kce-amber font-bold">Ich</span>}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Gäste ausstehend ── */}
                    {guestDebtors.length > 0 && (
                        <>
                            <div className="sec-heading mt-3">{t('treasury.guestsLabel')}</div>
                            <p className="text-xs text-kce-muted mb-2">{t('treasury.guestsHint')}</p>
                            {guestDebtors.map(b => (
                                <div key={b.regular_member_id}
                                     className="kce-card mb-2 overflow-hidden">
                                    <div className="p-3 flex items-center gap-3">
                                        <span className="text-sm">👤</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate">{b.nickname || b.name}</div>
                                            <div className="text-xs text-kce-muted">
                                                {t('treasury.penaltiesLabel')}: {fe(b.penalty_total)} · {t('treasury.paidLabel')}: {fe(b.payments_total)}
                                            </div>
                                            <PaidShareBar b={b}/>
                                        </div>
                                        <span className="font-bold text-red-400 text-sm flex-shrink-0">{fe(b.balance)}</span>
                                        {admin && (
                                            <button className="btn-primary btn-sm flex-shrink-0"
                                                    onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                                {t('treasury.payment.settle')}
                                            </button>
                                        )}
                                    </div>
                                    {admin && (
                                        <div className="border-t border-kce-border px-3 pb-3 pt-2">
                                            <button className="btn-secondary btn-sm w-full"
                                                    onClick={() => openTransferSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                                ↪️ {t('treasury.transfer.button')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </>
                    )}

                </div>
            )}

            {/* ── Konten ── */}
            {tab === 'accounts' && (
                <div>
                    {/* Pending payment requests (admin only) */}
                    {admin && paymentRequests.length > 0 && (
                        <div className="mb-4">
                            <div className="sec-heading">{t('paymentRequest.pendingTitle')}</div>
                            {paymentRequests.map(r => (
                                <div key={r.id} className={`kce-card p-3 mb-2 flex items-center gap-3 ${deepLinkRid === r.id ? 'ring-2 ring-kce-amber' : ''}`}>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate">{r.member_name}</div>
                                        <div className="text-xs text-kce-muted">
                                            {r.created_at ? new Date(r.created_at).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'}) : ''}
                                            {r.note ? ` · ${r.note}` : ''}
                                        </div>
                                    </div>
                                    <span className="font-bold text-kce-amber flex-shrink-0">{fe(r.amount)}</span>
                                    <button
                                        className="btn-primary btn-sm flex-shrink-0 text-xs px-2 py-1"
                                        onClick={() => confirmRequest(r.id, r.regular_member_id)}>
                                        {t('paymentRequest.confirm')}
                                    </button>
                                    <button
                                        className="btn-secondary btn-sm flex-shrink-0 text-xs px-2 py-1"
                                        onClick={() => rejectRequest(r.id)}>
                                        {t('paymentRequest.reject')}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {admin && paymentRequests.length === 0 && (
                        <div className="text-xs text-kce-muted text-center py-2 mb-3">
                            {t('paymentRequest.none')}
                        </div>
                    )}

                    {/* Gesamt-Übersicht: offene & bezahlte Beträge über alle Konten */}
                    {balances.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="kce-card p-4 flex flex-col gap-1">
                                <span className="text-xs text-kce-muted">{t('treasury.accounts.totalOpen')}</span>
                                <span className="font-display font-bold text-red-400 text-xl">{fe(totalOutstanding)}</span>
                                <span className="text-[10px] text-kce-muted">{debtors.length} {t('treasury.membersCount')}</span>
                            </div>
                            <div className="kce-card p-4 flex flex-col gap-1">
                                <span className="text-xs text-kce-muted">{t('treasury.accounts.totalPaid')}</span>
                                <span className="font-display font-bold text-green-400 text-xl">{fe(totalPaidMembers)}</span>
                                {totalSurplus > 0
                                    ? <span className="text-[10px] text-kce-muted">{t('treasury.accounts.creditOwed')}: {fe(totalSurplus)}</span>
                                    : <span className="text-[10px] text-kce-muted">{credits.length} {t('treasury.membersCount')}</span>
                                }
                            </div>
                        </div>
                    )}

                    {/* Anteil pro Spieler — bezahlter (grün) vs. offener (rot) Anteil der Strafen, skaliert auf das größte Konto */}
                    {balances.length > 0 && (
                        <div className="kce-card mb-3 overflow-hidden">
                            <button type="button" className="w-full p-3 flex items-center justify-between text-left"
                                    aria-expanded={showAccountsChart}
                                    onClick={() => setShowAccountsChart(v => !v)}>
                                <span className="text-xs font-bold text-kce-muted">📊 {t('treasury.accounts.shareChart')}</span>
                                <span className="text-kce-muted text-xs">{showAccountsChart ? '▲' : '▼'}</span>
                            </button>
                            {showAccountsChart && (
                                <div className="px-3 pb-3">
                                    <div className="flex items-center justify-end gap-3 text-[10px] text-kce-muted mb-2">
                                        <span className="flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{background: '#22c55e'}}/>
                                            {t('treasury.paidLabel')}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{background: '#ef4444'}}/>
                                            {t('treasury.accounts.shareChartOpen')}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-2.5">
                                        {[...balances].sort((a, b) => b.penalty_total - a.penalty_total).map(b => {
                                            const isMe = b.regular_member_id === myRegularMemberId
                                            const paidPortion = Math.max(0, Math.min(b.payments_total, b.penalty_total))
                                            const openPortion = Math.max(0, b.penalty_total - b.payments_total)
                                            const paidPct = maxAccountPenalty > 0 ? (paidPortion / maxAccountPenalty) * 100 : 0
                                            const openPct = maxAccountPenalty > 0 ? (openPortion / maxAccountPenalty) * 100 : 0
                                            return (
                                                <div key={b.regular_member_id}>
                                                    <div className="flex items-center justify-between text-xs mb-1">
                                                        <span className="font-bold truncate flex items-center gap-1">
                                                            {b.nickname || b.name}
                                                            {isMe && <span className="text-[9px] text-kce-amber font-bold">Ich</span>}
                                                        </span>
                                                        <span className="text-kce-muted flex-shrink-0">{fe(paidPortion)} / {fe(b.penalty_total)}</span>
                                                    </div>
                                                    <div className="h-1.5 rounded-full overflow-hidden flex"
                                                         style={{background: 'var(--kce-surface2)', gap: '2px'}}>
                                                        {paidPct > 0 && <div className="h-full rounded-full" style={{width: `${paidPct}%`, background: '#22c55e'}}/>}
                                                        {openPct > 0 && <div className="h-full rounded-full" style={{width: `${openPct}%`, background: '#ef4444'}}/>}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <input
                        className="kce-input mb-3"
                        value={accountSearch}
                        onChange={e => setAccountSearch(e.target.value)}
                        placeholder={t('treasury.accounts.search')}
                    />
                    {filteredBalances.length === 0
                        ? <Empty icon="👤" text={t('treasury.noData')}/>
                        : [...filteredBalances].sort((a, b) => {
                            if (myRegularMemberId) {
                                if (a.regular_member_id === myRegularMemberId) return -1
                                if (b.regular_member_id === myRegularMemberId) return 1
                            }
                            return a.balance - b.balance
                        }).map(b => {
                            const hasDebt = b.balance < -0.01
                            const hasCredit = b.balance > 0.01
                            const isExpanded = expandedMember === b.regular_member_id
                            const isMe = b.regular_member_id === myRegularMemberId
                            const dotColor = hasDebt
                                ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                                : hasCredit
                                    ? 'linear-gradient(135deg,#22c55e,#16a34a)'
                                    : 'linear-gradient(135deg,#6b7280,#4b5563)'
                            return (
                                <div key={b.regular_member_id} className="kce-card mb-2 overflow-hidden">
                                    <button className="w-full p-3 flex items-center gap-3 text-left"
                                            onClick={() => setExpandedMember(isExpanded ? null : b.regular_member_id)}>
                                        <div
                                            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-kce-bg text-xs flex-shrink-0"
                                            style={{background: dotColor}}>
                                            {b.name[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                                {b.nickname || b.name}
                                                {isMe && <span className="text-[9px] text-kce-amber font-bold">Ich</span>}
                                            </div>
                                            <div className="text-xs text-kce-muted">
                                                {t('treasury.penaltiesLabel')}: {fe(b.penalty_total)} · {t('treasury.paidLabel')}: {fe(b.payments_total)}
                                            </div>
                                            <PaidShareBar b={b}/>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            {hasDebt && (
                                                <div className="font-bold text-sm text-red-400">{fe(b.balance)}</div>
                                            )}
                                            {hasCredit && (
                                                <div className="font-bold text-sm text-green-400">+{fe(b.balance)}</div>
                                            )}
                                            {!hasDebt && !hasCredit && (
                                                <div className="text-sm text-kce-muted">✓</div>
                                            )}
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="border-t border-kce-border px-3 pb-3 pt-2">
                                            <div
                                                className="text-xs font-bold text-kce-muted mb-2">{t('treasury.payment.history')}</div>
                                            {(memberPayments as MemberPayment[]).length === 0
                                                ?
                                                <p className="text-xs text-kce-muted mb-2">{t('treasury.payment.noHistory')}</p>
                                                : (memberPayments as MemberPayment[]).map(p => (
                                                    <div key={p.id} className="flex items-center gap-2 mb-1.5 text-xs">
                                                        <span
                                                            className={`font-bold flex-shrink-0 w-20 ${p.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                            {p.amount >= 0 ? '+' : ''}{fe(p.amount)}
                                                        </span>
                                                        <span
                                                            className="text-kce-muted truncate flex-1">{p.note ?? (p.amount >= 0 ? t('treasury.payment.deposit') : t('treasury.payment.withdrawal'))}</span>
                                                        <span
                                                            className="text-kce-muted flex-shrink-0">{p.updated_at && <span title={t('treasury.booking.edited')}>✏️ </span>}{fDate(p.date ?? p.created_at)}</span>
                                                        {admin && (
                                                            <button className="btn-secondary btn-xs flex-shrink-0"
                                                                    aria-label={t('treasury.booking.edit')}
                                                                    onClick={() => openEditPayment(p, b.regular_member_id, b.nickname || b.name)}>✏️</button>
                                                        )}
                                                        {admin && (
                                                            <button className="btn-danger btn-xs flex-shrink-0"
                                                                    onClick={() => setConfirmDeletePayment({id: p.id, memberId: b.regular_member_id})}>✕</button>
                                                        )}
                                                    </div>
                                                ))
                                            }
                                            {/* PayPal payment option for own account */}
                                            {isMe && myDebtAmount > 0 && paypalHandle && (
                                                <div className="mt-2 pt-2 border-t border-kce-border flex flex-col gap-2">
                                                    {!hasPendingMyRequest ? (
                                                        !reportingMyPayment ? (
                                                            <div className="flex gap-2">
                                                                <a
                                                                    href={`https://paypal.me/${paypalHandle}/${myDebtAmount.toFixed(2)}EUR`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="btn-primary flex-1 text-center text-sm py-2 no-underline"
                                                                >
                                                                    {t('profile.payNow')}
                                                                </a>
                                                                <button className="btn-secondary flex-1 btn-sm"
                                                                        onClick={() => { setReportingMyPayment(true); setMyPaymentAmount('') }}>
                                                                    {t('profile.reportPayment')}
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
                                                                    <input
                                                                        className="kce-input flex-1"
                                                                        type="text" inputMode="decimal"
                                                                        value={myPaymentAmount}
                                                                        placeholder={myDebtAmount.toFixed(2)}
                                                                        onChange={e => setMyPaymentAmount(e.target.value)}
                                                                    />
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <button className="btn-secondary flex-1 btn-sm"
                                                                            onClick={() => { setReportingMyPayment(false); setMyPaymentAmount('') }}>
                                                                        {t('action.cancel')}
                                                                    </button>
                                                                    <button className="btn-primary flex-1 btn-sm" onClick={async () => {
                                                                        const amt = myPaymentAmount.trim()
                                                                            ? parseFloat(myPaymentAmount.replace(',', '.'))
                                                                            : myDebtAmount
                                                                        if (!amt || amt <= 0) return
                                                                        try {
                                                                            await api.createPaymentRequest({amount: amt})
                                                                            await refetchMyPaymentRequests()
                                                                            if (admin) refetchPaymentRequests()
                                                                            setReportingMyPayment(false)
                                                                            setMyPaymentAmount('')
                                                                            showToast(t('profile.reportPayment'))
                                                                        } catch (e) { toastError(e) }
                                                                    }}>
                                                                        {t('profile.reportPayment')}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )
                                                    ) : (
                                                        <div className="text-xs text-kce-amber text-center py-1">
                                                            ⏳ {t('paymentRequest.pending')}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {admin && (
                                                <div className="flex gap-2 mt-2">
                                                    {hasDebt && (
                                                        <button className="btn-primary btn-sm flex-1"
                                                                onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                                            💸 {t('treasury.payment.settle')}
                                                        </button>
                                                    )}
                                                    <button
                                                        className={`btn-secondary btn-sm ${hasDebt ? '' : 'w-full'}`}
                                                        onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name)}>
                                                        + {t('treasury.payment.record')}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    }

                    {/* Guest accounts section */}
                    {(guestBalances as Balance[]).length > 0 && (
                        <>
                            <div className="sec-heading mt-3">{t('treasury.guestsLabel')}</div>
                            {(guestBalances as Balance[]).sort((a, b) => a.balance - b.balance).map(b => {
                                const hasDebt = b.balance < -0.01
                                return (
                                    <div key={b.regular_member_id} className="kce-card p-3 mb-2 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-kce-bg text-xs flex-shrink-0"
                                             style={{background: hasDebt ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#6b7280,#4b5563)'}}>
                                            {b.name[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate flex items-center gap-1">
                                                {b.nickname || b.name}
                                                <span className="text-[9px] text-kce-muted font-bold border border-kce-border rounded px-1">{t('player.guestLabel')}</span>
                                            </div>
                                            <div className="text-xs text-kce-muted">
                                                {t('treasury.penaltiesLabel')}: {fe(b.penalty_total)} · {t('treasury.paidLabel')}: {fe(b.payments_total)}
                                            </div>
                                            <PaidShareBar b={b}/>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            {hasDebt
                                                ? <div className="font-bold text-sm text-red-400">{fe(b.balance)}</div>
                                                : <div className="text-sm text-kce-muted">✓</div>
                                            }
                                        </div>
                                        {admin && hasDebt && (
                                            <button className="btn-primary btn-sm flex-shrink-0"
                                                    onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                                {t('treasury.payment.settle')}
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </>
                    )}
                </div>
            )}

            {/* ── Buchungen ── */}
            {tab === 'bookings' && (
                <div>
                    <input
                        className="kce-input mb-3"
                        value={bookingSearch}
                        onChange={e => setBookingSearch(e.target.value)}
                        placeholder={t('treasury.bookings.search')}
                    />
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <span className="text-xs text-kce-muted">{t('treasury.netExpenses')}</span>
                            <div className={`font-bold text-sm ${-totalExpenses >= 0 ? 'text-green-400' : 'text-orange-400'}`}>{fe(-totalExpenses)}</div>
                        </div>
                        {admin && (
                            <button className="btn-primary btn-sm" onClick={openBookingSheet}>
                                + {t('treasury.booking.add')}
                            </button>
                        )}
                    </div>

                    {filteredBookings.length === 0
                        ? <Empty icon="📋" text={t('treasury.payment.noHistory')}/>
                        : filteredBookings.map((entry, idx) => {
                            if (entry.kind === 'payment') {
                                const p = entry.data
                                return (
                                    <div key={`p-${p.id}`} className="kce-card p-3 mb-2 flex items-center gap-3">
                                        <span className={`text-xl flex-shrink-0 ${p.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {p.amount >= 0 ? '⬆' : '⬇'}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                                {p.member_name}
                                                {p.regular_member_id === myRegularMemberId && <span className="text-[9px] text-kce-amber font-bold">Ich</span>}
                                            </div>
                                            <div className="text-xs text-kce-muted truncate">
                                                {p.note ?? (p.amount >= 0 ? t('treasury.payment.deposit') : t('treasury.payment.withdrawal'))}
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className={`font-bold text-sm ${p.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {p.amount >= 0 ? '+' : ''}{fe(p.amount)}
                                            </div>
                                            <div className="text-xs text-kce-muted">{p.updated_at && <span title={t('treasury.booking.edited')}>✏️ </span>}{fDate(p.date ?? p.created_at)}</div>
                                        </div>
                                        {admin && (
                                            <button className="btn-secondary btn-xs flex-shrink-0"
                                                    aria-label={t('treasury.booking.edit')}
                                                    onClick={() => openEditPayment(p, p.regular_member_id, p.member_name)}>✏️</button>
                                        )}
                                        {admin && (
                                            <button className="btn-danger btn-xs flex-shrink-0"
                                                    onClick={() => setConfirmDeletePayment({id: p.id, memberId: p.regular_member_id})}>✕</button>
                                        )}
                                    </div>
                                )
                            } else {
                                const e = entry.data
                                return (
                                    <div key={`e-${e.id}`} className="kce-card p-3 mb-2 flex items-center gap-3">
                                        <span className={`text-xl flex-shrink-0 ${e.amount < 0 ? 'text-green-400' : 'text-orange-400'}`}>
                                            {e.amount < 0 ? '⬆' : '⬇'}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                                {e.description}
                                                <span className="text-[9px] text-kce-muted font-bold border border-kce-border rounded px-1">{t('treasury.booking.club')}</span>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className={`font-bold text-sm ${e.amount < 0 ? 'text-green-400' : 'text-orange-400'}`}>
                                                {e.amount < 0 ? '+' : '-'}{fe(Math.abs(e.amount))}
                                            </div>
                                            <div className="text-xs text-kce-muted">{e.updated_at && <span title={t('treasury.booking.edited')}>✏️ </span>}{fDate(e.date ?? e.created_at)}</div>
                                        </div>
                                        {admin && (
                                            <button className="btn-secondary btn-xs flex-shrink-0"
                                                    aria-label={t('treasury.booking.edit')}
                                                    onClick={() => openEditExpense(e)}>✏️</button>
                                        )}
                                        {admin && (
                                            <button className="btn-danger btn-xs flex-shrink-0"
                                                    onClick={() => setConfirmDeleteExpense(e.id)}>✕</button>
                                        )}
                                    </div>
                                )
                            }
                        })
                    }
                </div>
            )}

            {/* Confirm payment deletion */}
            <Sheet open={!!confirmDeletePayment} onClose={() => {setConfirmDeletePayment(null); setDeletePaymentReason('')}}
                   title={t('treasury.payment.deleteConfirm')}>
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-kce-muted">{t('treasury.payment.deleteConfirmHint')}</p>
                    <input className="kce-input" value={deletePaymentReason}
                           onChange={e => setDeletePaymentReason(e.target.value)}
                           placeholder={t('treasury.payment.deleteReasonPlaceholder')} />
                    <div className="flex gap-2">
                        <button className="btn-secondary btn-sm flex-1"
                                onClick={() => {setConfirmDeletePayment(null); setDeletePaymentReason('')}}>
                            {t('action.cancel')}
                        </button>
                        <button className="btn-danger btn-sm flex-1" disabled={deletingPaymentId !== null}
                                onClick={() => confirmDeletePayment && deletePayment(confirmDeletePayment.id, confirmDeletePayment.memberId, deletePaymentReason)}>
                            {t('action.delete')}
                        </button>
                    </div>
                </div>
            </Sheet>

            {/* Confirm expense deletion */}
            <Sheet open={!!confirmDeleteExpense} onClose={() => {setConfirmDeleteExpense(null); setDeleteExpenseReason('')}}
                   title={t('treasury.expense.deleteConfirm')}>
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-kce-muted">{t('treasury.expense.deleteConfirmHint')}</p>
                    <input className="kce-input" value={deleteExpenseReason}
                           onChange={e => setDeleteExpenseReason(e.target.value)}
                           placeholder={t('treasury.expense.deleteReasonPlaceholder')} />
                    <div className="flex gap-2">
                        <button className="btn-secondary btn-sm flex-1"
                                onClick={() => {setConfirmDeleteExpense(null); setDeleteExpenseReason('')}}>
                            {t('action.cancel')}
                        </button>
                        <button className="btn-danger btn-sm flex-1" disabled={deletingExpenseId !== null}
                                onClick={() => confirmDeleteExpense !== null && deleteExpense(confirmDeleteExpense, deleteExpenseReason)}>
                            {t('action.delete')}
                        </button>
                    </div>
                </div>
            </Sheet>

            {/* Edit booking sheet */}
            <Sheet open={!!editTarget} onClose={() => setEditTarget(null)}
                   title={`✏️ ${t('treasury.booking.edit')}`} onSubmit={submitEdit}>
                <div className="flex flex-col gap-3">
                    {editTarget?.kind === 'payment' && (
                        <div>
                            <label className="field-label">
                                {t('treasury.booking.for')}: <span className="font-bold text-kce-text">{editTarget.label}</span>
                            </label>
                        </div>
                    )}

                    {/* Direction */}
                    <ModeToggle
                        options={editTarget?.kind === 'expense'
                            ? [
                                {value: 'in', label: `⬆ ${t('treasury.booking.income')}`},
                                {value: 'out', label: `⬇ ${t('treasury.booking.expense')}`},
                            ]
                            : [
                                {value: 'in', label: `⬆ ${t('treasury.payment.deposit')}`},
                                {value: 'out', label: `⬇ ${t('treasury.payment.withdrawal')}`},
                            ]
                        }
                        value={editDirection}
                        onChange={v => setEditDirection(v as 'in' | 'out')}/>

                    {/* Amount */}
                    <div>
                        <label className="field-label">{t('treasury.payment.amount')}</label>
                        <div className="flex items-center gap-2">
                            <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={editAmount} onChange={e => setEditAmount(e.target.value)}
                                   placeholder="0,00" autoFocus/>
                        </div>
                    </div>

                    {/* Note / description */}
                    <div>
                        <label className="field-label">
                            {editTarget?.kind === 'expense' ? t('treasury.expense.description') : t('treasury.payment.note')}
                        </label>
                        <input className="kce-input" value={editNote}
                               onChange={e => setEditNote(e.target.value)}
                               placeholder={editTarget?.kind === 'expense' ? t('treasury.expense.descPlaceholder') : t('treasury.payment.notePlaceholder')}/>
                    </div>

                    {/* Date override */}
                    <div>
                        <label className="field-label">{t('treasury.expense.date')}</label>
                        <input type="date" className="kce-input" value={editDate}
                               onChange={e => setEditDate(e.target.value)}/>
                    </div>

                    <button type="submit" className="btn-primary w-full"
                            disabled={savingEdit || !editValid}>
                        ✓ {t('action.save')}
                    </button>
                </div>
            </Sheet>

            {/* Guest cost transfer sheet */}
            <Sheet open={!!transferGuest} onClose={() => setTransferGuest(null)}
                   title={`↪️ ${t('treasury.transfer.title')}`} onSubmit={submitTransfer}>
                <div className="flex flex-col gap-3">
                    <p className="text-xs text-kce-muted">
                        {t('treasury.transfer.hint')}
                    </p>
                    <div>
                        <label className="field-label">
                            {t('treasury.transfer.fromGuest')}: <span className="font-bold text-kce-text">{transferGuest?.name ?? ''}</span>
                        </label>
                    </div>
                    <div>
                        <label className="field-label">{t('treasury.transfer.target')}</label>
                        {memberPickerList.length === 0
                            ? <p className="text-xs text-kce-muted">{t('treasury.transfer.noTargets')}</p>
                            : (
                                <div className="flex gap-2 flex-wrap">
                                    {memberPickerList.map(m => (
                                        <button key={m.regular_member_id} type="button"
                                                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${transferTargetId === m.regular_member_id ? 'bg-kce-amber text-kce-bg border-kce-amber' : 'bg-kce-surface2 text-kce-muted border-kce-border'}`}
                                                onClick={() => setTransferTargetId(m.regular_member_id)}>
                                            {m.nickname || m.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                    </div>
                    <div>
                        <label className="field-label">{t('treasury.payment.amount')}</label>
                        <div className="flex items-center gap-2">
                            <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={transferAmount} onChange={e => setTransferAmount(e.target.value)}
                                   placeholder="0,00"/>
                        </div>
                    </div>
                    <div>
                        <label className="field-label">{t('treasury.payment.note')}</label>
                        <input className="kce-input" value={transferNote}
                               onChange={e => setTransferNote(e.target.value)}
                               placeholder={t('treasury.transfer.notePlaceholder')}/>
                    </div>
                    <button type="submit" className="btn-primary w-full"
                            disabled={transferring || !transferTargetId || parseAmount(transferAmount) <= 0}>
                        ✓ {t('treasury.transfer.submit')}
                    </button>
                </div>
            </Sheet>

            {/* Payment sheet */}
            <Sheet open={!!paymentTarget} onClose={() => setPaymentTarget(null)}
                   title={`💰 ${paymentTarget?.name ?? ''}`} onSubmit={submitPayment}>
                <div className="flex flex-col gap-3">
                    <ModeToggle
                        options={[
                            {value: 'deposit', label: `⬆ ${t('treasury.payment.deposit')}`},
                            {value: 'withdrawal', label: `⬇ ${t('treasury.payment.withdrawal')}`},
                        ]}
                        value={paymentMode}
                        onChange={v => setPaymentMode(v as 'deposit' | 'withdrawal')}/>
                    <div>
                        <label className="field-label">{t('treasury.payment.amount')}</label>
                        <div className="flex items-center gap-2">
                            <span
                                className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                                   placeholder="0,00" autoFocus/>
                        </div>
                    </div>
                    <div>
                        <label className="field-label">{t('treasury.payment.note')}</label>
                        <input className="kce-input" value={paymentNote}
                               onChange={e => setPaymentNote(e.target.value)}
                               placeholder={t('treasury.payment.notePlaceholder')}/>
                    </div>
                    <button type="submit" className="btn-primary w-full"
                            disabled={saving || !paymentAmount || parseAmount(paymentAmount) <= 0}>
                        ✓ {t('treasury.payment.record')}
                    </button>
                </div>
            </Sheet>

            {/* New booking sheet */}
            <Sheet open={bookingSheet} onClose={() => setBookingSheet(false)}
                   title={`📋 ${t('treasury.booking.add')}`} onSubmit={submitBooking}>
                <div className="flex flex-col gap-3">
                    {/* Target: Club or member */}
                    <div>
                        <label className="field-label">{t('treasury.booking.for')}</label>
                        <div className="flex gap-2 flex-wrap">
                            <button type="button"
                                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${bookingTarget === 'club' ? 'bg-kce-amber text-kce-bg border-kce-amber' : 'bg-kce-surface2 text-kce-muted border-kce-border'}`}
                                    onClick={() => { setBookingTarget('club'); setBookingDirection('out') }}>
                                🏛️ {t('treasury.booking.club')}
                            </button>
                            {memberPickerList.map(m => (
                                <button key={m.regular_member_id} type="button"
                                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${bookingTarget === m.regular_member_id ? 'bg-kce-amber text-kce-bg border-kce-amber' : 'bg-kce-surface2 text-kce-muted border-kce-border'}`}
                                        onClick={() => { setBookingTarget(m.regular_member_id); setBookingDirection('in') }}>
                                    {m.nickname || m.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Direction */}
                    <ModeToggle
                        options={isClubBooking
                            ? [
                                {value: 'in', label: `⬆ ${t('treasury.booking.income')}`},
                                {value: 'out', label: `⬇ ${t('treasury.booking.expense')}`},
                            ]
                            : [
                                {value: 'in', label: `⬆ ${t('treasury.payment.deposit')}`},
                                {value: 'out', label: `⬇ ${t('treasury.payment.withdrawal')}`},
                            ]
                        }
                        value={bookingDirection}
                        onChange={v => setBookingDirection(v as 'in' | 'out')}/>

                    {/* Amount */}
                    <div>
                        <label className="field-label">{t('treasury.payment.amount')}</label>
                        <div className="flex items-center gap-2">
                            <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={bookingAmount} onChange={e => setBookingAmount(e.target.value)}
                                   placeholder="0,00" autoFocus/>
                        </div>
                    </div>

                    {/* Note / description */}
                    <div>
                        <label className="field-label">
                            {isClubBooking ? t('treasury.expense.description') : t('treasury.payment.note')}
                        </label>
                        <input className="kce-input" value={bookingNote}
                               onChange={e => setBookingNote(e.target.value)}
                               placeholder={isClubBooking ? t('treasury.expense.descPlaceholder') : t('treasury.payment.notePlaceholder')}/>
                    </div>

                    {/* Date override */}
                    <div>
                        <label className="field-label">{t('treasury.expense.date')}</label>
                        <input type="date" className="kce-input" value={bookingDate}
                               onChange={e => setBookingDate(e.target.value)}/>
                    </div>

                    <button type="submit" className="btn-primary w-full"
                            disabled={savingBooking || !bookingValid}>
                        ✓ {t('action.save')}
                    </button>
                </div>
            </Sheet>

            {/* Export sheet — admin only */}
            <Sheet open={showExportSheet} onClose={() => setShowExportSheet(false)}
                   title={`📊 ${t('report.export')}`} onSubmit={downloadReport}>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="field-label">{t('report.year')}</label>
                        <select
                            value={exportYear ?? ''}
                            onChange={e => setExportYear(e.target.value ? parseInt(e.target.value, 10) : null)}
                            className="kce-input">
                            <option value="">{t('report.yearAll')}</option>
                            {exportYears.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="field-label">{t('report.format')}</label>
                        <select
                            value={exportFormat}
                            onChange={e => setExportFormat(e.target.value as 'xlsx' | 'pdf')}
                            className="kce-input">
                            <option value="xlsx">Excel</option>
                            <option value="pdf">PDF</option>
                        </select>
                    </div>
                    <button type="submit" className="btn-primary w-full" disabled={exporting}>
                        {exporting ? t('report.downloading') : t('report.download')}
                    </button>
                </div>
            </Sheet>

        </div>
    )
}
