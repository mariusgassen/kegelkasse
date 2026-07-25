import {useState} from 'react'
import {Empty} from '@/components/ui/Empty.tsx'
import {Loading} from '@/components/ui/Loading.tsx'
import {
    type BalanceEvent,
    type DualPoint,
    type Granularity,
    bucketStart,
    clusterPoints,
    cumulativeBaseline,
    eventsInWindow,
    formatTick,
    mergeDualSeries,
    windowBounds,
} from '@/lib/balanceHistory.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

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

export function BalanceHistoryChart({actualEvents, overlayEvents, actualLabel, virtualLabel, overlayLabel, threeLine, loading, t}: {
    actualEvents: BalanceEvent[]
    overlayEvents: BalanceEvent[]
    actualLabel: string
    virtualLabel: string
    // Member scope draws a third "penalties" line (cumulative fines) alongside paid + balance; the
    // club scope keeps the two-line paid + incl.-debt view. overlayLabel names that third line.
    overlayLabel?: string
    threeLine?: boolean
    loading?: boolean
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

    // Cumulative penalties (member scope only): payments − balance, so a positive line rising in step
    // with fines incurred. Balance = paid − penalties, so the gap between the paid and penalty lines.
    const penaltyBaseline = -overlayBaseline
    const penaltyAt = (p: DualPoint) => p.actual - p.virtual

    const values = [actualBaseline, actualBaseline + overlayBaseline, ...points.map(p => p.actual), ...points.map(p => p.virtual)]
    if (threeLine) values.push(penaltyBaseline, ...points.map(penaltyAt))
    const minV = Math.min(0, ...values)
    const maxV = Math.max(0, ...values)
    const span = Math.max(maxV - minV, 1)

    // Every granularity clusters points onto discrete, evenly-spaced buckets (evening for month/all,
    // month for year) rather than a time-proportional axis — most days/months have no activity, so
    // proportional spacing wastes the width on gaps and piled every same-timestamp booking (e.g. a
    // season close) onto one x-position. 'all' keeps its own scrollable width (one column per bucket).
    const buckets = Array.from(new Set(points.map(p => bucketStart(p.ts, granularity)))).sort((a, b) => a - b)
    const bucketIndex = new Map(buckets.map((b, i) => [b, i]))
    const chartWidth = isAll ? Math.max(BH_VW, buckets.length * BH_PX_PER_EVENT) : BH_VW
    const innerWidth = chartWidth - BH_PAD.left - BH_PAD.right
    const xS = (ts: number) => {
        if (buckets.length === 0) return BH_PAD.left
        const idx = bucketIndex.get(bucketStart(ts, granularity)) ?? 0
        return buckets.length === 1 ? BH_PAD.left + innerWidth / 2 : BH_PAD.left + (idx / (buckets.length - 1)) * innerWidth
    }
    const yS = (v: number) => BH_PAD.top + BH_IH - ((v - minV) / span) * BH_IH

    function buildPath(valueAt: (p: DualPoint) => number, baseline: number) {
        let d = `M ${BH_PAD.left},${yS(baseline)}`
        for (const p of points) d += ` H ${xS(p.ts)} V ${yS(valueAt(p))}`
        d += ` H ${BH_PAD.left + innerWidth}`
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

    // Choose which x-positions carry a date label. Every view now shares a discrete bucket x-axis, so
    // we label per bucket (sampled only when crowded) with one representative point index each,
    // preferring a selected point so the active bucket's label renders highlighted.
    const labelOwnerIndices = new Set<number>()
    {
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
            {threeLine ? (
                <>
                    {/* Penalties (cumulative fines, red) → paid (cream) → balance on top (primary, emphasized). */}
                    <path d={buildPath(penaltyAt, penaltyBaseline)}
                          fill="none" stroke={KIND_META.penalty.color} strokeWidth="1.8"
                          strokeLinecap="round" strokeLinejoin="round" opacity={0.9}/>
                    <path d={buildPath(p => p.actual, actualBaseline)}
                          fill="none" stroke="var(--kce-cream)" strokeWidth="1.8"
                          strokeLinecap="round" strokeLinejoin="round"/>
                    <path d={buildPath(p => p.virtual, actualBaseline + overlayBaseline)}
                          fill="none" stroke="var(--kce-primary)" strokeWidth="2.4"
                          strokeLinecap="round" strokeLinejoin="round"/>
                </>
            ) : (
                <>
                    <path d={buildPath(p => p.virtual, actualBaseline + overlayBaseline)}
                          fill="none" stroke="var(--kce-primary)" strokeWidth="2" strokeDasharray="4,3"
                          strokeLinecap="round" strokeLinejoin="round" opacity={0.85}/>
                    <path d={buildPath(p => p.actual, actualBaseline)}
                          fill="none" stroke="var(--kce-cream)" strokeWidth="2.2"
                          strokeLinecap="round" strokeLinejoin="round"/>
                </>
            )}
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
                // Overlay markers sit on the balance (virtual) line in club scope, but on the
                // dedicated penalties line in the member three-line view; actual markers on the paid line.
                const cy = yS(cluster.onOverlay ? (threeLine ? penaltyAt(last) : last.virtual) : last.actual)
                const cx = xS(last.ts)
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

            {loading && !hasData ? (
                <Loading className="py-8"/>
            ) : !hasData ? (
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
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 px-1.5 text-[10px]">
                        <span className="text-kce-muted">{t('treasury.history.balanceAfter')}</span>
                        <span className="font-bold" style={{color: 'var(--kce-cream)'}}>
                            {actualLabel}: {fe(selectedCluster.points[selectedCluster.points.length - 1].actual)}
                        </span>
                        {threeLine && overlayLabel && (
                            <span className="font-bold" style={{color: KIND_META.penalty.color}}>
                                {overlayLabel}: {fe(penaltyAt(selectedCluster.points[selectedCluster.points.length - 1]))}
                            </span>
                        )}
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
                    {threeLine && overlayLabel && (
                        <div className="flex items-center gap-1.5">
                            <div className="w-4 h-1.5 rounded-full" style={{background: KIND_META.penalty.color, opacity: 0.9}}/>
                            <span className="text-[10px] text-kce-muted font-bold">{overlayLabel}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-1.5 rounded-full" style={{background: 'var(--kce-primary)', opacity: 0.85}}/>
                        <span className="text-[10px] text-kce-muted font-bold">{virtualLabel}</span>
                    </div>
                </div>
            )}
        </div>
    )
}
