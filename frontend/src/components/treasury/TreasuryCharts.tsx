import {memo, useCallback, useId, useMemo, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {
    Area, AreaChart, Bar, BarChart, Cell, LabelList, ReferenceDot, ReferenceLine, Pie, PieChart, Rectangle, ResponsiveContainer, Sankey, Tooltip, Treemap, XAxis, YAxis,
} from 'recharts'
import {api} from '@/api/client.ts'
import {compactEuro} from '@/lib/chartAxis.ts'
import {chartAnimation} from '@/lib/motion.ts'
import {router} from '@/router'
import {useT} from '@/i18n'
import {useAppStore} from '@/store/app.ts'
import {Caption} from '@/components/ui/Caption.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {SkeletonChart} from '@/components/ui/Skeleton.tsx'
import {clubEventsFromBookings} from '@/lib/balanceHistory.ts'
import {treasurySummary} from '@/lib/treasurySummary.ts'
import {
    cashTrend, debtTiles, eveningBars, eventsInYear, flowTarget, formatTimeAxisTick, paidOpenSplit, resolveTimeClickIndex,
    sankeyGraph, timeAxisTicks, waterfallAxisTicks, waterfallSteps, zeroSplitOffset,
    type DebtTile as DebtTileItem, type EveningBar, type SankeyGraph, type TrendPoint, type WaterfallStep,
} from '@/lib/treasuryCharts.ts'

// Colours are semantic tokens only (CLAUDE.md): `-fg` twins are the ones readable as chart marks on
// the themed page background. Recharts passes the strings straight into SVG presentation attributes,
// which resolve `var(--…)` at paint time, so a club theme / dark-light switch repaints for free.
const C = {
    positive: 'var(--positive-fg)',
    danger: 'var(--danger-fg)',
    dangerTintFg: 'var(--danger-tint-fg)',
    accent: 'var(--accent-fg)',
    ink: 'var(--ink)',
    muted: 'var(--muted)',
    line: 'var(--line)',
    surface: 'var(--surface-2)',
}
const TICK = {fill: C.muted, fontSize: 12}

const ZERO_DOMAIN = [(m: number) => Math.min(0, m), (m: number) => Math.max(0, m)] as const
const TIME_DOMAIN = ['dataMin', 'dataMax'] as const
const AUTO_TOP_DOMAIN = [0, 'auto'] as const
const TREND_MARGIN = {top: 6, right: 16, bottom: 0, left: 16}
const WATERFALL_MARGIN = {top: 4, right: 18, bottom: 4, left: 18}
const EVENINGS_MARGIN = {top: 8, right: 8, bottom: 0, left: 0}
const SANKEY_MARGIN = {top: 4, right: 90, bottom: 4, left: 4}
const TREND_CURSOR = {stroke: C.muted}
const BAR_CURSOR = {fill: C.line, opacity: 0.3}
const TREND_ACTIVE_DOT = {r: 5, fill: C.accent}
const SANKEY_LINK = {stroke: C.muted, strokeOpacity: 0.35}
const BAR_POINTER = {cursor: 'pointer'} as const

function waterfallBarShape(p: any) {
    const range: [number, number] | undefined = p?.payload?.range
    const isNeg = Array.isArray(range) && range[0] < 0
    return <Rectangle {...p} radius={isNeg ? [4, 0, 0, 4] : [0, 4, 4, 0]}/>
}

function fe(v: number | null | undefined) {
    return (v ?? 0).toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}
const TIP = {
    contentStyle: {background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12, color: C.ink},
    labelStyle: {color: C.ink},
    itemStyle: {color: C.ink},
}

function go(to: string, search: Record<string, unknown>) {
    router.navigate({to, search} as never).catch(() => {})
}
function goFlow(key: string) {
    const target = flowTarget(key)
    if (target) go('/treasury', {tab: target.tab})
}

export type Pick = {chart: string; label: string; value: string; point?: TrendPoint; open?: () => void}

export function PickBar({sel, chart}: { sel: Pick | null; chart: string }) {
    const t = useT()
    if (!sel || sel.chart !== chart) return null
    return (
        <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-surface-2 border border-line" data-testid={`pick-${chart}`}>
            <div className="flex-1 min-w-0">
                <div className="text-xs text-muted truncate">{sel.label}</div>
                <div className="font-display font-bold text-ink">{sel.value}</div>
            </div>
            {sel.open && (
                <button type="button" className="btn-secondary text-sm" onClick={sel.open} data-testid={`pick-open-${chart}`}>
                    {t('treasury.charts.openAction')} ›
                </button>
            )}
        </div>
    )
}

function dayLabel(ts: number) {
    return new Date(ts).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'})
}

function preventMouseSelect(e: React.MouseEvent) {
    e.preventDefault()
}

function ChartCard({title, hint, children, testId}: { title: string; hint?: string; children: React.ReactNode; testId: string }) {
    return (
        <div className="kce-card p-3 mb-3 select-none" data-testid={testId}
             style={{WebkitUserSelect: 'none'}} onMouseDown={preventMouseSelect}>
            <Caption className="mb-1">{title}</Caption>
            {hint && <p className="text-xs text-muted mb-2">{hint}</p>}
            {children}
        </div>
    )
}

type StepLabels = Record<WaterfallStep['key'] | 'unpaid', string>
function stepLabel(labels: StepLabels, key: string): string {
    return (labels as Record<string, string>)[key] ?? labels.unpaid
}

const STEP_COLOR: Record<WaterfallStep['kind'], string> = {in: C.positive, out: C.danger, total: C.accent}

const TrendCard = memo(function TrendCard({
    trend, title, sel, onSelect,
}: {
    trend: TrendPoint[]
    title: string
    sel: Pick | null
    onSelect: (pick: Pick) => void
}) {
    const baseId = useId()
    const strokeGradId = `${baseId}-stroke`
    const fillGradId = `${baseId}-fill`

    const timestamps = useMemo(() => trend.map(p => p.ts), [trend])
    const split = useMemo(() => zeroSplitOffset(trend.map(p => p.value)), [trend])
    const trendTicks = useMemo(() => timeAxisTicks(timestamps, 3), [timestamps])
    const minTs = trend[0]?.ts ?? 0
    const maxTs = trend[trend.length - 1]?.ts ?? 0
    const formatX = useCallback((v: number) => formatTimeAxisTick(v, minTs, maxTs), [minTs, maxTs])

    const handleClick = useCallback((st: unknown, evt?: unknown) => {
        const idx = resolveTimeClickIndex(timestamps, st, evt, TREND_MARGIN)
        const p = idx >= 0 && idx < trend.length ? trend[idx] : undefined
        if (p) {
            onSelect({
                chart: 'trend',
                label: dayLabel(p.ts),
                value: fe(p.value),
                point: p,
                open: () => go('/treasury', {tab: 'bookings'}),
            })
        }
    }, [timestamps, trend, onSelect])

    const trendAllNonPositive = trend.length > 0 && trend.every(p => p.value <= 0)
    const areaStroke = split.mixed ? `url(#${strokeGradId})` : split.solidColor
    const areaFill = split.mixed ? `url(#${fillGradId})` : split.solidColor
    const selectedPoint = sel?.point

    return (
        <ChartCard testId="chart-trend" title={title}>
            <div aria-label={title} role="img">
                <ResponsiveContainer width="100%" height={156}>
                    <AreaChart data={trend} margin={TREND_MARGIN} onClick={handleClick} style={BAR_POINTER}>
                        {split.mixed && (
                            <defs>
                                <linearGradient id={strokeGradId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset={0} stopColor={C.positive} stopOpacity={1}/>
                                    <stop offset={split.offset} stopColor={C.positive} stopOpacity={1}/>
                                    <stop offset={split.offset} stopColor={C.danger} stopOpacity={1}/>
                                    <stop offset={1} stopColor={C.danger} stopOpacity={1}/>
                                </linearGradient>
                                <linearGradient id={fillGradId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset={0} stopColor={C.positive} stopOpacity={0.15}/>
                                    <stop offset={split.offset} stopColor={C.positive} stopOpacity={0.15}/>
                                    <stop offset={split.offset} stopColor={C.danger} stopOpacity={0.15}/>
                                    <stop offset={1} stopColor={C.danger} stopOpacity={0.15}/>
                                </linearGradient>
                            </defs>
                        )}
                        <XAxis dataKey="ts" type="number" scale="time" domain={TIME_DOMAIN as unknown as [string, string]}
                               tick={TICK} stroke={C.line} tickLine={false} ticks={trendTicks} interval={0}
                               tickFormatter={formatX}/>
                        <YAxis hide domain={ZERO_DOMAIN as unknown as [any, any]}/>
                        <ReferenceLine y={0} stroke={C.muted} strokeDasharray="3 3"
                                       label={{value: '0', position: trendAllNonPositive ? 'insideTopLeft' : 'insideBottomLeft', fill: C.muted, fontSize: 12}}/>
                        <Tooltip {...TIP} cursor={TREND_CURSOR}
                                 content={({active, payload}) => {
                                     const p = active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined
                                     if (!p) return null
                                     return (
                                         <div style={TIP.contentStyle} className="px-3 py-2">
                                             <div style={{fontWeight: 700}}>{dayLabel(p.ts)}</div>
                                             <div>{fe(p.value)}</div>
                                         </div>
                                     )
                                 }}/>
                        <Area type="stepAfter" dataKey="value" baseValue={0} stroke={areaStroke} fill={areaFill}
                              fillOpacity={split.mixed ? 1 : 0.15} strokeWidth={2} dot={false}
                              activeDot={TREND_ACTIVE_DOT} {...chartAnimation()}/>
                        {selectedPoint && (
                            <ReferenceDot x={selectedPoint.ts} y={selectedPoint.value} r={5}
                                          fill={selectedPoint.value < -0.01 ? C.danger : C.positive}
                                          stroke="var(--canvas)" strokeWidth={2}/>
                        )}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <PickBar sel={sel} chart="trend"/>
        </ChartCard>
    )
})

const WaterfallCard = memo(function WaterfallCard({
    steps, title, hint, sel, onSelect, stepLabels,
}: {
    steps: WaterfallStep[]
    title: string
    hint: string
    sel: Pick | null
    onSelect: (pick: Pick) => void
    stepLabels: StepLabels
}) {
    const waterfallData = useMemo(() => steps.map(s => ({...s, name: stepLabel(stepLabels, s.key)})), [steps, stepLabels])
    const waterfallTicks = useMemo(() => waterfallAxisTicks(steps.map(s => s.range)), [steps])
    const waterfallCells = useMemo(
        () => waterfallData.map(s => <Cell key={s.key} fill={STEP_COLOR[s.kind]}/>),
        [waterfallData],
    )
    const formatX = useCallback((v: number) => compactEuro(v), [])
    const handleBarClick = useCallback((d: unknown) => {
        const st = d as WaterfallStep & {name: string}
        onSelect({
            chart: 'waterfall',
            label: st.name,
            value: fe(st.amount),
            open: flowTarget(st.key) ? () => goFlow(st.key) : undefined,
        })
    }, [onSelect])
    const renderLabel = useCallback((p: unknown) => {
        // Name + amount above the bar keeps the full width for the bars (no category axis);
        // stroke halo keeps the 0-axis line from cutting through text when negative bars shift it right.
        const {y, index, payload} = p as {y: number; index: number; payload?: WaterfallStep & {name: string}}
        const d = payload ?? waterfallData[index]
        return d ? (
            <text x={18} y={y - 5} fill={C.ink} stroke="var(--surface)" strokeWidth={4}
                  strokeLinejoin="round" paintOrder="stroke" fontSize={12}>
                {d.name} · {fe(d.amount)}
            </text>
        ) : null
    }, [waterfallData])

    return (
        <ChartCard testId="chart-waterfall" title={title} hint={hint}>
            {/* Horizontal bars: six step names don't fit side by side on a phone-width axis. */}
            <ResponsiveContainer width="100%" height={waterfallData.length * 58 + 28}>
                <BarChart data={waterfallData} layout="vertical" margin={WATERFALL_MARGIN} barCategoryGap={20}>
                    <XAxis type="number" domain={ZERO_DOMAIN as unknown as [any, any]} ticks={waterfallTicks}
                           interval={0} tickFormatter={formatX} tick={TICK} stroke={C.line} tickLine={false}/>
                    <YAxis type="category" dataKey="name" hide/>
                    <ReferenceLine x={0} stroke={C.muted}/>
                    <Tooltip {...TIP} cursor={BAR_CURSOR}
                             content={({active, payload}) => {
                                 const step = active ? (payload?.[0]?.payload as (WaterfallStep & { name: string }) | undefined) : undefined
                                 if (!step) return null
                                 return (
                                     <div style={TIP.contentStyle} className="px-3 py-2">
                                         <div style={{fontWeight: 700}}>{step.name}</div>
                                         <div>{fe(step.amount)}</div>
                                     </div>
                                 )
                             }}/>
                    <Bar dataKey="range" {...chartAnimation()} shape={waterfallBarShape}
                         onClick={handleBarClick} style={BAR_POINTER}>
                        {waterfallCells}
                        <LabelList dataKey="name" content={renderLabel}/>
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
            <PickBar sel={sel} chart="waterfall"/>
        </ChartCard>
    )
})

const TreemapCard = memo(function TreemapCard({
    tiles, title, hint, emptyText, sel, onSelect,
}: {
    tiles: DebtTileItem[]
    title: string
    hint: string
    emptyText: string
    sel: Pick | null
    onSelect: (pick: Pick) => void
}) {
    const handleOpen = useCallback((id: number, name: string, size: number) => {
        onSelect({
            chart: 'treemap',
            label: name,
            value: fe(size),
            open: () => go('/treasury', {tab: 'accounts', member: id}),
        })
    }, [onSelect])

    const tileContent = useMemo(() => <DebtTile onOpen={handleOpen}/>, [handleOpen])

    return (
        <ChartCard testId="chart-treemap" title={title} hint={hint}>
            {tiles.length === 0 ? <Empty text={emptyText}/> : (
                <ResponsiveContainer width="100%" height={220}>
                    <Treemap data={tiles} dataKey="size" nameKey="name" {...chartAnimation()} content={tileContent}>
                        <Tooltip {...TIP} formatter={(v) => fe(Number(v))}/>
                    </Treemap>
                </ResponsiveContainer>
            )}
            <PickBar sel={sel} chart="treemap"/>
        </ChartCard>
    )
})

const EveningsCard = memo(function EveningsCard({
    bars, title, hint, emptyText, penaltiesLabel, loading, sel, onSelect,
}: {
    bars: EveningBar[]
    title: string
    hint: string
    emptyText: string
    penaltiesLabel: string
    loading: boolean
    sel: Pick | null
    onSelect: (pick: Pick) => void
}) {
    const handleBarClick = useCallback((d: unknown) => {
        const b = d as EveningBar
        onSelect({
            chart: 'evenings',
            label: b.label,
            value: fe(b.penalty_total),
            open: () => go('/schedule', {evening: b.id}),
        })
    }, [onSelect])

    return (
        <ChartCard testId="chart-evenings" title={title} hint={hint}>
            {loading ? <SkeletonChart height="180px"/> : bars.length === 0 ? <Empty text={emptyText}/> : (
                <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={bars} margin={EVENINGS_MARGIN}>
                        <XAxis dataKey="label" tick={TICK} stroke={C.line} interval="preserveStartEnd"/>
                        <YAxis hide domain={AUTO_TOP_DOMAIN as unknown as [number, 'auto']}/>
                        <Tooltip {...TIP} formatter={(v) => fe(Number(v))} cursor={BAR_CURSOR}/>
                        <Bar dataKey="penalty_total" name={penaltiesLabel} fill={C.accent} radius={[4, 4, 0, 0]}
                             {...chartAnimation()} style={BAR_POINTER} onClick={handleBarClick}/>
                    </BarChart>
                </ResponsiveContainer>
            )}
            <PickBar sel={sel} chart="evenings"/>
        </ChartCard>
    )
})

const SankeyCard = memo(function SankeyCard({
    sankey, title, hint, emptyText, sel, onSelect, stepLabels,
}: {
    sankey: SankeyGraph
    title: string
    hint: string
    emptyText: string
    sel: Pick | null
    onSelect: (pick: Pick) => void
    stepLabels: StepLabels
}) {
    const labelFor = useCallback((k: string) => stepLabel(stepLabels, k), [stepLabels])
    const handleOpen = useCallback((k: string, v: number) => {
        onSelect({
            chart: 'sankey',
            label: stepLabel(stepLabels, k),
            value: fe(v),
            open: flowTarget(k) ? () => goFlow(k) : undefined,
        })
    }, [stepLabels, onSelect])
    const nodeContent = useMemo(() => <SankeyNode label={labelFor} onOpen={handleOpen}/>, [labelFor, handleOpen])

    return (
        <ChartCard testId="chart-sankey" title={title} hint={hint}>
            {sankey.links.length === 0 ? <Empty text={emptyText}/> : (
                <ResponsiveContainer width="100%" height={220}>
                    <Sankey data={sankey} nodePadding={24} nodeWidth={10} margin={SANKEY_MARGIN}
                            node={nodeContent} link={SANKEY_LINK}>
                        <Tooltip {...TIP} formatter={(v) => fe(Number(v))}/>
                    </Sankey>
                </ResponsiveContainer>
            )}
            <PickBar sel={sel} chart="sankey"/>
        </ChartCard>
    )
})

const DonutCard = memo(function DonutCard({
    paid, open, title, hint, emptyText, paidLabel, openLabel, sel, onSelect,
}: {
    paid: number
    open: number
    title: string
    hint: string
    emptyText: string
    paidLabel: string
    openLabel: string
    sel: Pick | null
    onSelect: (pick: Pick) => void
}) {
    const splitTotal = paid + open
    const splitData = useMemo(() => [
        {key: 'paid', name: paidLabel, value: paid, color: C.positive},
        {key: 'open', name: openLabel, value: open, color: C.danger},
    ].filter(d => d.value > 0), [paid, open, paidLabel, openLabel])
    const splitCells = useMemo(() => splitData.map(d => <Cell key={d.key} fill={d.color}/>), [splitData])

    const handlePieClick = useCallback((d: unknown) => {
        const x = d as {name: string; value: number}
        onSelect({
            chart: 'donut',
            label: x.name,
            value: fe(x.value),
            open: () => go('/treasury', {tab: 'accounts'}),
        })
    }, [onSelect])

    return (
        <ChartCard testId="chart-donut" title={title} hint={hint}>
            {splitTotal <= 0 ? <Empty text={emptyText}/> : (
                <div className="flex items-center gap-4">
                    <div className="relative flex-shrink-0" style={{width: 150, height: 150}}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={splitData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70}
                                     paddingAngle={2} stroke="var(--canvas)" {...chartAnimation()}
                                     style={BAR_POINTER} onClick={handlePieClick}>
                                    {splitCells}
                                </Pie>
                                <Tooltip {...TIP} formatter={(v) => fe(Number(v))}/>
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="font-display font-bold text-lg text-ink" data-testid="donut-pct">
                                {Math.round((paid / splitTotal) * 100)} %
                            </span>
                            <span className="text-xs text-muted">{paidLabel}</span>
                        </div>
                    </div>
                    <ul className="text-sm flex flex-col gap-1.5">
                        {splitData.map(d => (
                            <li key={d.key} className="flex items-center gap-2">
                                <span aria-hidden className="inline-block w-3 h-3 rounded-full" style={{background: d.color}}/>
                                <span className="text-muted">{d.name}</span>
                                <span className="font-bold text-ink">{fe(d.value)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <PickBar sel={sel} chart="donut"/>
        </ChartCard>
    )
})

export function TreasuryCharts() {
    const t = useT()
    const myMemberId = useAppStore(s => s.user?.regular_member_id ?? null)
    const thisYear = new Date().getFullYear()
    // Period filter: scopes the cash trend and the per-evening bars. The waterfall, treemap, Sankey and donut
    // are snapshots of the current balances and are intentionally not period-bound.
    const [period, setPeriod] = useState<number | null>(thisYear)
    const year = period ?? thisYear
    // Tap = select (shows the value in a bar under the chart), a second explicit tap on the bar's button opens the
    // data. A touch device has no hover, so a tap that jumps straight away would never reveal the number.
    const [sel, setSel] = useState<Pick | null>(null)

    const handlePeriodChange = useCallback((v: number | null) => {
        setPeriod(v)
        setSel(prev => (prev?.chart === 'trend' || prev?.chart === 'evenings' ? null : prev))
    }, [])

    const handleSelect = useCallback((pick: Pick) => setSel(pick), [])

    const sPaidIn = t('treasury.charts.step.paidIn')
    const sExpenses = t('treasury.charts.step.expenses')
    const sOtherIncome = t('treasury.charts.step.otherIncome')
    const sCash = t('treasury.charts.step.cash')
    const sOutstanding = t('treasury.charts.step.outstanding')
    const sProjected = t('treasury.charts.step.projected')
    const sUnpaid = t('treasury.charts.step.unpaid')
    const stepLabels = useMemo<StepLabels>(() => ({
        paidIn: sPaidIn,
        expenses: sExpenses,
        otherIncome: sOtherIncome,
        cash: sCash,
        outstanding: sOutstanding,
        projected: sProjected,
        unpaid: sUnpaid,
    }), [sPaidIn, sExpenses, sOtherIncome, sCash, sOutstanding, sProjected, sUnpaid])

    const {data: balances = [], isLoading: l1} = useQuery({queryKey: ['member-balances'], queryFn: api.getMemberBalances, staleTime: 30_000})
    const {data: guests = [], isLoading: l2} = useQuery({queryKey: ['guest-balances'], queryFn: api.getGuestBalances, staleTime: 30_000})
    const {data: expenses = [], isLoading: l3} = useQuery({queryKey: ['club-expenses'], queryFn: api.getExpenses, staleTime: 30_000})
    const {data: payments = []} = useQuery({queryKey: ['all-payments'], queryFn: api.getAllPayments, staleTime: 30_000})
    const {data: yearStats, isLoading: l5} = useQuery({queryKey: ['stats', year], queryFn: () => api.getYearStats(year), staleTime: 5 * 60_000})

    const summary = useMemo(() => treasurySummary(balances, guests, expenses), [balances, guests, expenses])
    const steps = useMemo(() => waterfallSteps(summary), [summary])
    const tiles = useMemo(() => debtTiles([...balances, ...guests], myMemberId), [balances, guests, myMemberId])
    const bars = useMemo(() => eveningBars(yearStats?.evenings ?? []), [yearStats])
    const sankey = useMemo(() => sankeyGraph(summary), [summary])
    const split = useMemo(() => paidOpenSplit([...balances, ...guests]), [balances, guests])
    const trend = useMemo(() => cashTrend(eventsInYear(clubEventsFromBookings(payments, expenses), period)), [payments, expenses, period])

    if (l1 || l2 || l3) return <SkeletonChart height="260px" data-testid="charts-loading"/>

    return (
        <div data-testid="treasury-charts">
            <p className="text-xs text-muted mb-3">{t('treasury.charts.intro')}</p>
            <div className="flex gap-1.5 mb-3" role="group" aria-label={t('treasury.charts.period')}>
                {([[thisYear, String(thisYear)], [thisYear - 1, String(thisYear - 1)], [null, t('treasury.charts.periodAll')]] as [number | null, string][]).map(([v, label]) => (
                    <button key={label} type="button" className={`chip ${period === v ? 'active' : ''}`} aria-pressed={period === v}
                            onClick={() => handlePeriodChange(v)} data-testid={`period-${v ?? 'all'}`}>{label}</button>
                ))}
            </div>
            <p className="text-xs text-muted mb-3">{t('treasury.charts.periodHint')}</p>

            {/* 1 — Kassenverlauf (Zeitraum) */}
            {trend.length > 1 && (
                <TrendCard
                    trend={trend}
                    title={t('treasury.charts.trend')}
                    sel={sel?.chart === 'trend' ? sel : null}
                    onSelect={handleSelect}
                />
            )}

            {/* 2 — Wasserfall (aktueller Stand) */}
            <WaterfallCard
                steps={steps}
                title={t('treasury.charts.waterfall')}
                hint={t('treasury.charts.waterfallHint')}
                sel={sel?.chart === 'waterfall' ? sel : null}
                onSelect={handleSelect}
                stepLabels={stepLabels}
            />

            {/* 3 — Treemap */}
            <TreemapCard
                tiles={tiles}
                title={t('treasury.charts.treemap')}
                hint={t('treasury.charts.treemapHint')}
                emptyText={t('treasury.charts.noDebt')}
                sel={sel?.chart === 'treemap' ? sel : null}
                onSelect={handleSelect}
            />

            {/* 4 — Pro Abend */}
            <EveningsCard
                bars={bars}
                title={`${t('treasury.charts.evenings')} ${year}`}
                hint={t('treasury.charts.eveningsHint')}
                emptyText={t('treasury.charts.noEvenings')}
                penaltiesLabel={t('treasury.charts.penalties')}
                loading={l5}
                sel={sel?.chart === 'evenings' ? sel : null}
                onSelect={handleSelect}
            />

            {/* 5 — Sankey */}
            <SankeyCard
                sankey={sankey}
                title={t('treasury.charts.sankey')}
                hint={t('treasury.charts.sankeyHint')}
                emptyText={t('treasury.charts.noFlow')}
                sel={sel?.chart === 'sankey' ? sel : null}
                onSelect={handleSelect}
                stepLabels={stepLabels}
            />

            {/* 6 — Donut */}
            <DonutCard
                paid={split.paid}
                open={split.open}
                title={t('treasury.charts.donut')}
                hint={t('treasury.charts.donutHint')}
                emptyText={t('treasury.charts.noPenalties')}
                paidLabel={t('treasury.charts.paid')}
                openLabel={t('treasury.charts.open')}
                sel={sel?.chart === 'donut' ? sel : null}
                onSelect={handleSelect}
            />
        </div>
    )
}

// Treemap tile: debt amount on danger-tint using its contrast-checked danger-tint-fg twin; own account outlined in accent.
function DebtTile(props: any) {
    const clipId = useId()
    const {x, y, width, height, name, size, isMe, id, onOpen} = props
    // Recharts also renders the treemap root (no size/id) through this content
    if (width == null || width < 2 || height < 2 || size == null) return null
    const showText = width > 56 && height > 34
    return (
        <g style={{cursor: 'pointer'}} role="button" tabIndex={0} aria-label={`${name} ${fe(size)}`}
           onClick={() => onOpen?.(id, name, size)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpen?.(id, name, size) }}>
            <rect x={x} y={y} width={width} height={height} rx={4}
                  fill="var(--danger-tint)" stroke={isMe ? C.accent : 'var(--canvas)'} strokeWidth={isMe ? 3 : 2}/>
            {showText && (
                <>
                    <defs>
                        <clipPath id={clipId}>
                            <rect x={x + 2} y={y + 2} width={Math.max(0, width - 4)} height={Math.max(0, height - 4)} rx={2}/>
                        </clipPath>
                    </defs>
                    <g clipPath={`url(#${clipId})`}>
                        <text x={x + 6} y={y + 17} fontSize={12} fontWeight={700} fill={C.dangerTintFg} stroke="none">{name}</text>
                        <text x={x + 6} y={y + 33} fontSize={12} fill={C.dangerTintFg} stroke="none">{fe(size)}</text>
                    </g>
                </>
            )}
        </g>
    )
}

const NODE_COLOR: Record<string, string> = {
    paidIn: C.positive, otherIncome: C.positive, outstanding: C.danger,
    expenses: C.danger, cash: C.accent, unpaid: C.danger,
}

function SankeyNode(props: any) {
    const {x, y, width, height, payload, label, onOpen} = props
    const key: string = payload?.key ?? ''
    const right = (payload?.depth ?? 0) > 0
    return (
        <g style={{cursor: 'pointer'}} onClick={() => onOpen?.(key, payload?.value ?? 0)}>
            <rect x={x} y={y} width={width} height={height} rx={2} fill={NODE_COLOR[key] ?? C.muted}/>
            <text x={right ? x + width + 6 : x - 6} y={y + height / 2} textAnchor={right ? 'start' : 'end'}
                  dominantBaseline="middle" fontSize={12} fill={C.ink}>
                {label(key)}
            </text>
        </g>
    )
}
