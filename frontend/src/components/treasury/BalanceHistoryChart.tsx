import {useState} from 'react'
import {CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, XAxis, YAxis} from 'recharts'
import {Empty} from '@/components/ui/Empty.tsx'
import {SkeletonChart} from '@/components/ui/Skeleton'
import {axisLeftPad, compactEuro} from '@/lib/chartAxis.ts'
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

const BH_AXIS_FONT = 12
const BH_VH = 180
const BH_VW = 334
const BH_PX_PER_EVENT = 40

const KIND_META: Record<BalanceEvent['kind'], { icon: string; color: string }> = {
    payment: {icon: '💰', color: 'var(--positive-fg)'},
    expense: {icon: '💸', color: 'var(--accent-deep)'},
    penalty: {icon: '⚠️', color: 'var(--danger-fg)'},
    debt: {icon: '📉', color: 'var(--accent-2-fg)'},
}

const withAlpha = (col: string) => `color-mix(in srgb, ${col} 13%, transparent)`

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
    // Gutter measured from the actual euro labels — a fixed one clips as soon as a club's
    // balance reaches four figures.
    const padLeft = axisLeftPad(
        [minV, 0, maxV].map(v => compactEuro(v)), BH_AXIS_FONT, {gap: 6, min: 30})
    // x = bucket index (discrete, evenly spaced); a single bucket sits mid-chart.
    const xMax = buckets.length <= 1 ? 1 : buckets.length - 1
    const xS = (ts: number) => {
        if (buckets.length <= 1) return 0.5
        return bucketIndex.get(bucketStart(ts, granularity)) ?? 0
    }

    // Step line: hold the previous value until a point's x, then jump (Recharts "stepAfter"), starting
    // at the window baseline and running out to the right edge.
    function lineData(valueAt: (p: DualPoint) => number, baseline: number) {
        return [{x: 0, v: baseline}, ...points.map(p => ({x: xS(p.ts), v: valueAt(p)}))]
            .concat([{x: xMax, v: points.length ? valueAt(points[points.length - 1]) : baseline}])
    }

    const yTickValues = [minV, 0, maxV].filter((v, i, arr) => arr.indexOf(v) === i)

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

    // Date labels sit on the bucket x-positions chosen above; the selected bucket's label is bold.
    const labelAt = new Map<number, { text: string; selected: boolean }>()
    points.forEach((p, i) => {
        if (labelOwnerIndices.has(i)) labelAt.set(xS(p.ts), {text: fAxisDate(p.ts), selected: selectedIndices.has(i)})
    })
    const xTicks = Array.from(labelAt.keys()).sort((a, b) => a - b)

    const markers = clusters.map(cluster => {
        const last = cluster.points[cluster.points.length - 1]
        // Overlay markers sit on the balance (virtual) line in club scope, but on the dedicated
        // penalties line in the member three-line view; actual markers on the paid line.
        const y = cluster.onOverlay ? (threeLine ? penaltyAt(last) : last.virtual) : last.actual
        return {cluster, last, x: xS(last.ts), y}
    })

    const chart = (
        <div style={{width: isAll ? chartWidth : '100%', flexShrink: 0}}>
            <ResponsiveContainer width="100%" height={BH_VH}>
                <ComposedChart margin={{top: 12, right: 6, bottom: 0, left: 0}}
                               onClick={() => setSelectedClusterKey(null)}>
                    <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false}/>
                    <ReferenceLine y={0} stroke="var(--line)" strokeWidth={1.2}/>
                    <XAxis type="number" dataKey="x" domain={[0, xMax]} ticks={xTicks} interval={0}
                           padding={{left: 8, right: 8}} stroke="var(--line)" tickLine={false}
                           tick={(tp: any) => {
                               const info = labelAt.get(tp.payload.value)
                               return (
                                   <text x={tp.x} y={tp.y + 12} textAnchor="middle" fontSize={BH_AXIS_FONT}
                                         fontWeight={info?.selected ? 'bold' : 'normal'}
                                         fill={info?.selected ? 'var(--accent-fg)' : 'var(--muted)'}>
                                       {info?.text}
                                   </text>
                               )
                           }}/>
                    <YAxis type="number" domain={[minV, maxV]} ticks={yTickValues} interval={0}
                           tickFormatter={(v: number) => compactEuro(v)} width={padLeft} stroke="var(--line)"
                           tick={{fill: 'var(--muted)', fontSize: BH_AXIS_FONT}}/>
                    {threeLine ? (
                        <>
                            {/* Penalties (cumulative fines, red) → paid (ink) → balance on top (accent, emphasized). */}
                            <Line data={lineData(penaltyAt, penaltyBaseline)} dataKey="v" type="stepAfter"
                                  stroke={KIND_META.penalty.color} strokeWidth={1.8} strokeOpacity={0.9}
                                  dot={false} activeDot={false} isAnimationActive={false}/>
                            <Line data={lineData(p => p.actual, actualBaseline)} dataKey="v" type="stepAfter"
                                  stroke="var(--ink)" strokeWidth={1.8} dot={false} activeDot={false} isAnimationActive={false}/>
                            <Line data={lineData(p => p.virtual, actualBaseline + overlayBaseline)} dataKey="v" type="stepAfter"
                                  stroke="var(--accent-fg)" strokeWidth={2.4} dot={false} activeDot={false} isAnimationActive={false}/>
                        </>
                    ) : (
                        <>
                            <Line data={lineData(p => p.virtual, actualBaseline + overlayBaseline)} dataKey="v" type="stepAfter"
                                  stroke="var(--accent-fg)" strokeWidth={2} strokeDasharray="4 3" strokeOpacity={0.85}
                                  dot={false} activeDot={false} isAnimationActive={false}/>
                            <Line data={lineData(p => p.actual, actualBaseline)} dataKey="v" type="stepAfter"
                                  stroke="var(--ink)" strokeWidth={2.2} dot={false} activeDot={false} isAnimationActive={false}/>
                        </>
                    )}
                    <Scatter data={markers} dataKey="y" isAnimationActive={false}
                             shape={(sp: any) => {
                                 const {cluster, last} = sp.payload as typeof markers[number]
                                 const lastEvent = last.event!
                                 const meta = KIND_META[lastEvent.kind]
                                 const count = cluster.points.length
                                 const isSelected = selectedClusterKey === cluster.key
                                 const toggle = () => setSelectedClusterKey(isSelected ? null : cluster.key)
                                 // Every marker is clickable — including the club-wide debt overlay points, whose
                                 // detail shows the change in outstanding debt and the resulting balance.
                                 const ariaLabel = count > 1
                                     ? `${count}× – ${fDateTime(last.ts)}`
                                     : `${lastEvent.label || KIND_LABEL[lastEvent.kind]} – ${fDateTime(lastEvent.ts)} – ${fe(lastEvent.delta)}`
                                 return (
                                     <g tabIndex={0} role="button" aria-label={ariaLabel} style={{cursor: 'pointer'}}
                                        onClick={(evt) => { evt.stopPropagation(); toggle() }}
                                        onKeyDown={(evt) => {
                                            if (evt.key === 'Enter' || evt.key === ' ') {
                                                evt.preventDefault(); evt.stopPropagation(); toggle()
                                            }
                                        }}>
                                         {/* Generous transparent hit target so the small dots are easy to tap. */}
                                         <circle cx={sp.cx} cy={sp.cy} r={13} fill="transparent"/>
                                         <circle cx={sp.cx} cy={sp.cy} r={isSelected ? 5 : count > 1 ? 3.5 : 2.5}
                                                 fill={meta.color} stroke="var(--canvas)" strokeWidth={isSelected ? 1.5 : 1}/>
                                         {count > 1 && (
                                             <text x={sp.cx} y={sp.cy - (isSelected ? 8.5 : 7)} textAnchor="middle"
                                                   fontSize={BH_AXIS_FONT} fontWeight="bold" fill={meta.color}>×{count}</text>
                                         )}
                                     </g>
                                 )
                             }}/>
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    )

    return (
        <div className="kce-card p-3 mb-3">
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex gap-1">
                    {(['month', 'year', 'all'] as const).map(g => (
                        <button key={g} type="button"
                                className={`px-2.5 py-1 rounded-lg text-sm font-bold transition-all ${granularity === g ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
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
                                className="w-6 h-6 flex items-center justify-center rounded-md bg-surface-2 text-muted font-bold disabled:opacity-30">
                            ‹
                        </button>
                        <span className="text-sm font-bold text-muted min-w-[64px] text-center">{win.label}</span>
                        <button type="button" aria-label={t('treasury.history.nextPeriod')}
                                disabled={atEnd}
                                onClick={() => page(1)}
                                className="w-6 h-6 flex items-center justify-center rounded-md bg-surface-2 text-muted font-bold disabled:opacity-30">
                            ›
                        </button>
                    </div>
                )}
            </div>

            {loading && !hasData ? (
                <SkeletonChart height="180px"/>
            ) : !hasData ? (
                <Empty icon="📈" text={t('treasury.history.noData')}/>
            ) : isAll ? (
                <div className="overflow-x-auto">{chart}</div>
            ) : chart}

            {hasData && (selectedCluster ? (
                <>
                    <div className="flex flex-col gap-1 mt-2 max-h-40 overflow-y-auto" data-testid="history-detail">
                        {selectedCluster.points.map(p => {
                            const ev = p.event!
                            const meta = KIND_META[ev.kind]
                            return (
                                <div key={ev.id} className="flex items-center gap-2 px-1.5 py-1 rounded text-sm"
                                     style={{background: withAlpha(meta.color), borderLeft: `2px solid ${meta.color}`}}>
                                    <span className="text-muted flex-shrink-0">{fDateTime(ev.ts)}</span>
                                    <span className="flex-shrink-0">{ev.icon ?? meta.icon}</span>
                                    <span className="text-xs text-muted flex-shrink-0">{KIND_LABEL[ev.kind]}</span>
                                    <span className="text-ink truncate flex-1">{ev.label}</span>
                                    <span className="font-bold flex-shrink-0" style={{color: meta.color}}>{fe(ev.delta)}</span>
                                </div>
                            )
                        })}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 px-1.5 text-xs">
                        <span className="text-muted">{t('treasury.history.balanceAfter')}</span>
                        <span className="font-bold" style={{color: 'var(--ink)'}}>
                            {actualLabel}: {fe(selectedCluster.points[selectedCluster.points.length - 1].actual)}
                        </span>
                        {threeLine && overlayLabel && (
                            <span className="font-bold" style={{color: KIND_META.penalty.color}}>
                                {overlayLabel}: {fe(penaltyAt(selectedCluster.points[selectedCluster.points.length - 1]))}
                            </span>
                        )}
                        <span className="font-bold opacity-85" style={{color: 'var(--accent-fg)'}}>
                            {virtualLabel}: {fe(selectedCluster.points[selectedCluster.points.length - 1].virtual)}
                        </span>
                    </div>
                </>
            ) : (
                <div className="text-xs text-muted/60 italic mt-2 px-1.5">☝️ {t('treasury.history.tapHint')}</div>
            ))}

            {hasData && (
                <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-line">
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-1.5 rounded-full" style={{background: 'var(--ink)'}}/>
                        <span className="text-xs text-muted font-bold">{actualLabel}</span>
                    </div>
                    {threeLine && overlayLabel && (
                        <div className="flex items-center gap-1.5">
                            <div className="w-4 h-1.5 rounded-full" style={{background: KIND_META.penalty.color, opacity: 0.9}}/>
                            <span className="text-xs text-muted font-bold">{overlayLabel}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-1.5 rounded-full" style={{background: 'var(--accent)', opacity: 0.85}}/>
                        <span className="text-xs text-muted font-bold">{virtualLabel}</span>
                    </div>
                </div>
            )}
        </div>
    )
}
