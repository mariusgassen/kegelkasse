import {useMemo, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {
    Area, AreaChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Sankey, Tooltip, Treemap, XAxis, YAxis,
} from 'recharts'
import {api} from '@/api/client.ts'
import {router} from '@/router'
import {useT} from '@/i18n'
import {useAppStore} from '@/store/app.ts'
import {Caption} from '@/components/ui/Caption.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {SkeletonChart} from '@/components/ui/Skeleton.tsx'
import {clubEventsFromBookings} from '@/lib/balanceHistory.ts'
import {treasurySummary} from '@/lib/treasurySummary.ts'
import {
    cashTrend, debtTiles, eveningBars, eventsInYear, flowTarget, paidOpenSplit, sankeyGraph, waterfallSteps,
    type WaterfallStep,
} from '@/lib/treasuryCharts.ts'

// Colours are semantic tokens only (CLAUDE.md): `-fg` twins are the ones readable as chart marks on
// the themed page background. Recharts passes the strings straight into SVG presentation attributes,
// which resolve `var(--…)` at paint time, so a club theme / dark-light switch repaints for free.
const C = {
    positive: 'var(--positive-fg)',
    danger: 'var(--danger-fg)',
    accent: 'var(--accent-fg)',
    ink: 'var(--ink)',
    muted: 'var(--muted)',
    line: 'var(--line)',
    surface: 'var(--surface-2)',
}
const TICK = {fill: C.muted, fontSize: 12}

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}
function feShort(v: number) {
    return Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('de-DE', {maximumFractionDigits: 1})}k` : String(Math.round(v))
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

function ChartCard({title, hint, children, testId}: { title: string; hint?: string; children: React.ReactNode; testId: string }) {
    return (
        <div className="kce-card p-3 mb-3" data-testid={testId}>
            <Caption className="mb-1">{title}</Caption>
            {hint && <p className="text-xs text-muted mb-2">{hint}</p>}
            {children}
        </div>
    )
}

type TFn = ReturnType<typeof useT>
function stepLabel(t: TFn, key: string): string {
    switch (key) {
        case 'paidIn': return t('treasury.charts.step.paidIn')
        case 'expenses': return t('treasury.charts.step.expenses')
        case 'otherIncome': return t('treasury.charts.step.otherIncome')
        case 'cash': return t('treasury.charts.step.cash')
        case 'outstanding': return t('treasury.charts.step.outstanding')
        case 'projected': return t('treasury.charts.step.projected')
        default: return t('treasury.charts.step.unpaid')
    }
}

const STEP_COLOR: Record<WaterfallStep['kind'], string> = {in: C.positive, out: C.danger, total: C.accent}

export function TreasuryCharts() {
    const t = useT()
    const myMemberId = useAppStore(s => s.user?.regular_member_id ?? null)
    const thisYear = new Date().getFullYear()
    // Period filter: scopes the cash trend and the per-evening bars. The waterfall, treemap, Sankey and donut
    // are snapshots of the current balances and are intentionally not period-bound.
    const [period, setPeriod] = useState<number | null>(thisYear)
    const year = period ?? thisYear

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

    const waterfallData = steps.map(s => ({...s, name: stepLabel(t, s.key)}))
    const splitData = [
        {key: 'paid', name: t('treasury.charts.paid'), value: split.paid, color: C.positive},
        {key: 'open', name: t('treasury.charts.open'), value: split.open, color: C.danger},
    ].filter(d => d.value > 0)
    const splitTotal = split.paid + split.open

    return (
        <div data-testid="treasury-charts">
            <p className="text-xs text-muted mb-3">{t('treasury.charts.intro')}</p>
            <div className="flex gap-1.5 mb-3" role="group" aria-label={t('treasury.charts.period')}>
                {([[thisYear, String(thisYear)], [thisYear - 1, String(thisYear - 1)], [null, t('treasury.charts.periodAll')]] as [number | null, string][]).map(([v, label]) => (
                    <button key={label} type="button" className={`chip ${period === v ? 'active' : ''}`} aria-pressed={period === v}
                            onClick={() => setPeriod(v)} data-testid={`period-${v ?? 'all'}`}>{label}</button>
                ))}
            </div>
            <p className="text-xs text-muted mb-3">{t('treasury.charts.periodHint')}</p>

            {/* 1 — Wasserfall */}
            <ChartCard testId="chart-waterfall" title={t('treasury.charts.waterfall')} hint={t('treasury.charts.waterfallHint')}>
                {trend.length > 1 && (
                    <div className="mb-2" data-testid="chart-trend" aria-label={t('treasury.charts.trend')} role="img">
                        <div className="text-xs text-muted mb-0.5">{t('treasury.charts.trend')}</div>
                        <ResponsiveContainer width="100%" height={48}>
                            <AreaChart data={trend} margin={{top: 2, right: 0, bottom: 0, left: 0}}>
                                <Area type="monotone" dataKey="value" stroke={C.accent} fill={C.accent} fillOpacity={0.15}
                                      strokeWidth={2} dot={false} isAnimationActive={false}/>
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
                <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={waterfallData} margin={{top: 8, right: 8, bottom: 0, left: 0}}>
                        <XAxis dataKey="name" tick={TICK} stroke={C.line} interval={0}/>
                        <YAxis tick={TICK} stroke={C.line} tickFormatter={feShort} width={40}/>
                        <Tooltip {...TIP} formatter={(_v, _n, p) => fe((p?.payload as WaterfallStep).amount)} cursor={{fill: C.line, opacity: 0.3}}/>
                        <Bar dataKey="range" radius={[4, 4, 0, 0]} isAnimationActive={false}
                             onClick={(d) => goFlow((d as unknown as WaterfallStep).key)} style={{cursor: 'pointer'}}>
                            {waterfallData.map(s => <Cell key={s.key} fill={STEP_COLOR[s.kind]}/>)}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </ChartCard>

            {/* 2 — Treemap */}
            <ChartCard testId="chart-treemap" title={t('treasury.charts.treemap')} hint={t('treasury.charts.treemapHint')}>
                {tiles.length === 0 ? <Empty text={t('treasury.charts.noDebt')}/> : (
                    <ResponsiveContainer width="100%" height={220}>
                        <Treemap data={tiles} dataKey="size" nameKey="name" stroke="var(--canvas)" isAnimationActive={false}
                                 content={<DebtTile onOpen={(id: number) => go('/treasury', {tab: 'accounts', member: id})}/>}>
                            <Tooltip {...TIP} formatter={(v) => fe(Number(v))}/>
                        </Treemap>
                    </ResponsiveContainer>
                )}
            </ChartCard>

            {/* 3 — Pro Abend */}
            <ChartCard testId="chart-evenings" title={`${t('treasury.charts.evenings')} ${year}`} hint={t('treasury.charts.eveningsHint')}>
                {l5 ? <SkeletonChart height="180px"/> : bars.length === 0 ? <Empty text={t('treasury.charts.noEvenings')}/> : (
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={bars} margin={{top: 8, right: 8, bottom: 0, left: 0}}>
                            <XAxis dataKey="label" tick={TICK} stroke={C.line} interval="preserveStartEnd"/>
                            <YAxis tick={TICK} stroke={C.line} tickFormatter={feShort} width={40}/>
                            <Tooltip {...TIP} formatter={(v) => fe(Number(v))} cursor={{fill: C.line, opacity: 0.3}}/>
                            <Bar dataKey="penalty_total" fill={C.accent} radius={[4, 4, 0, 0]} isAnimationActive={false} style={{cursor: 'pointer'}}
                                 onClick={(d) => go('/schedule', {evening: (d as unknown as {id: number}).id})}/>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </ChartCard>

            {/* 4 — Sankey */}
            <ChartCard testId="chart-sankey" title={t('treasury.charts.sankey')} hint={t('treasury.charts.sankeyHint')}>
                {sankey.links.length === 0 ? <Empty text={t('treasury.charts.noFlow')}/> : (
                    <ResponsiveContainer width="100%" height={220}>
                        <Sankey data={sankey} nodePadding={24} nodeWidth={10} margin={{top: 4, right: 90, bottom: 4, left: 4}}
                                node={<SankeyNode label={(k: string) => stepLabel(t, k)} onOpen={goFlow}/>}
                                link={{stroke: C.muted, strokeOpacity: 0.35}}>
                            <Tooltip {...TIP} formatter={(v) => fe(Number(v))}/>
                        </Sankey>
                    </ResponsiveContainer>
                )}
            </ChartCard>

            {/* 5 — Donut */}
            <ChartCard testId="chart-donut" title={t('treasury.charts.donut')} hint={t('treasury.charts.donutHint')}>
                {splitTotal <= 0 ? <Empty text={t('treasury.charts.noPenalties')}/> : (
                    <div className="flex items-center gap-4">
                        <div className="relative flex-shrink-0" style={{width: 150, height: 150}}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={splitData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70}
                                         paddingAngle={2} stroke="var(--canvas)" isAnimationActive={false}
                                         style={{cursor: 'pointer'}} onClick={() => go('/treasury', {tab: 'accounts'})}>
                                        {splitData.map(d => <Cell key={d.key} fill={d.color}/>)}
                                    </Pie>
                                    <Tooltip {...TIP} formatter={(v) => fe(Number(v))}/>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="font-display font-bold text-lg text-ink" data-testid="donut-pct">
                                    {Math.round((split.paid / splitTotal) * 100)} %
                                </span>
                                <span className="text-xs text-muted">{t('treasury.charts.paid')}</span>
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
            </ChartCard>
        </div>
    )
}

// Treemap tile: debt amount in the danger colour, own account outlined in the accent.
function DebtTile(props: any) {
    const {x, y, width, height, name, size, isMe, id, onOpen} = props
    if (width == null || width < 2 || height < 2) return null
    const showText = width > 56 && height > 34
    return (
        <g style={{cursor: 'pointer'}} role="button" tabIndex={0} aria-label={`${name} ${fe(size)}`}
           onClick={() => onOpen?.(id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpen?.(id) }}>
            <rect x={x} y={y} width={width} height={height} rx={4}
                  fill="var(--danger-tint)" stroke={isMe ? C.accent : 'var(--canvas)'} strokeWidth={isMe ? 3 : 2}/>
            {showText && (
                <>
                    <text x={x + 6} y={y + 17} fontSize={12} fontWeight={700} fill="var(--danger-tint-fg)">{name}</text>
                    <text x={x + 6} y={y + 33} fontSize={12} fill="var(--danger-tint-fg)">{fe(size)}</text>
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
    const target = flowTarget(key)
    return (
        <g style={target ? {cursor: 'pointer'} : undefined} onClick={() => target && onOpen?.(key)}>
            <rect x={x} y={y} width={width} height={height} rx={2} fill={NODE_COLOR[key] ?? C.muted}/>
            <text x={right ? x + width + 6 : x - 6} y={y + height / 2} textAnchor={right ? 'start' : 'end'}
                  dominantBaseline="middle" fontSize={12} fill={C.ink}>
                {label(key)}
            </text>
        </g>
    )
}
