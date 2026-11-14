import {useCallback, useId, useMemo, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts'
import {api} from '@/api/client.ts'
import {useT} from '@/i18n'
import {chartAnimation} from '@/lib/motion.ts'
import {memberPaymentEvents, memberPenaltyEvents} from '@/lib/balanceHistory.ts'
import {runningBalance} from '@/lib/treasuryBars.ts'
import {formatTimeAxisTick, resolveTimeClickIndex, timeAxisTicks, zeroSplitOffset} from '@/lib/treasuryCharts.ts'

const ZERO_DOMAIN = [(m: number) => Math.min(0, m), (m: number) => Math.max(0, m)] as const
const TIME_DOMAIN = ['dataMin', 'dataMax'] as const
const SPARK_MARGIN = {top: 6, right: 16, bottom: 0, left: 16}
const SPARK_TICK = {fill: 'var(--muted)', fontSize: 12}
const SPARK_CURSOR = {stroke: 'var(--muted)'}
const SPARK_ACTIVE_DOT = {r: 4}
const TIP_STYLE = {
    background: 'var(--surface-2)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--ink)',
}

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function dayLabel(ts: number) {
    return new Date(ts).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'})
}

/**
 * A small line of the member's own balance over time (payments up, penalties down), so the
 * Mein-Konto card shows the direction of travel, not only today's number. Shares its query keys
 * with the account history, so opening that history costs no extra request.
 */
export function MyBalanceSparkline({memberId}: { memberId: number }) {
    const t = useT()
    const baseId = useId()
    const strokeGradId = `${baseId}-stroke`
    const fillGradId = `${baseId}-fill`
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

    const {data: payments = []} = useQuery({
        queryKey: ['member-payments', memberId],
        queryFn: () => api.getMemberPayments(memberId),
        staleTime: 1000 * 30,
    })
    const {data: penalties = []} = useQuery({
        queryKey: ['member-penalties', memberId],
        queryFn: () => api.getMemberPenalties(memberId),
        staleTime: 1000 * 30,
    })

    const points = useMemo(
        () => runningBalance([...memberPaymentEvents(payments ?? []), ...memberPenaltyEvents(penalties ?? [])]),
        [payments, penalties],
    )
    const timestamps = useMemo(() => points.map(p => p.ts), [points])
    const split = useMemo(() => zeroSplitOffset(points.map(p => p.balance)), [points])
    const xTicks = useMemo(() => timeAxisTicks(timestamps, 3), [timestamps])

    const minTs = points[0]?.ts ?? 0
    const maxTs = points[points.length - 1]?.ts ?? 0
    const formatX = useCallback((v: number) => formatTimeAxisTick(v, minTs, maxTs), [minTs, maxTs])

    const handleChartClick = useCallback((st: unknown, evt?: unknown) => {
        const idx = resolveTimeClickIndex(timestamps, st, evt, SPARK_MARGIN)
        if (idx >= 0 && idx < points.length) {
            setSelectedIdx(prev => (prev === idx ? null : idx))
        }
    }, [timestamps, points.length])

    if (points.length < 3) return null

    const allNonPositive = points.every(p => p.balance <= 0)
    const selectedPoint = selectedIdx != null && selectedIdx < points.length ? points[selectedIdx] : null
    const areaStroke = split.mixed ? `url(#${strokeGradId})` : split.solidColor
    const areaFill = split.mixed ? `url(#${fillGradId})` : split.solidColor

    return (
        <div className="mt-2 select-none" data-testid="my-balance-sparkline" role="img" aria-label={t('treasury.my.trend')}
             style={{WebkitUserSelect: 'none'}} onMouseDown={e => e.preventDefault()}>
            <div className="text-xs text-muted mb-0.5">{t('treasury.my.trend')}</div>
            <div style={{width: '100%', height: 112}}>
                <ResponsiveContainer>
                    <AreaChart data={points} margin={SPARK_MARGIN} onClick={handleChartClick} style={{cursor: 'pointer'}}>
                        {split.mixed && (
                            <defs>
                                <linearGradient id={strokeGradId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset={0} stopColor="var(--positive-fg)" stopOpacity={1}/>
                                    <stop offset={split.offset} stopColor="var(--positive-fg)" stopOpacity={1}/>
                                    <stop offset={split.offset} stopColor="var(--danger-fg)" stopOpacity={1}/>
                                    <stop offset={1} stopColor="var(--danger-fg)" stopOpacity={1}/>
                                </linearGradient>
                                <linearGradient id={fillGradId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset={0} stopColor="var(--positive-fg)" stopOpacity={0.15}/>
                                    <stop offset={split.offset} stopColor="var(--positive-fg)" stopOpacity={0.15}/>
                                    <stop offset={split.offset} stopColor="var(--danger-fg)" stopOpacity={0.15}/>
                                    <stop offset={1} stopColor="var(--danger-fg)" stopOpacity={0.15}/>
                                </linearGradient>
                            </defs>
                        )}
                        <XAxis dataKey="ts" type="number" scale="time" domain={TIME_DOMAIN as unknown as [string, string]}
                               ticks={xTicks} interval={0} tickFormatter={formatX} tick={SPARK_TICK}
                               stroke="var(--line)" tickLine={false}/>
                        <YAxis hide domain={ZERO_DOMAIN as unknown as [any, any]}/>
                        <ReferenceLine y={0} stroke="var(--line)" strokeDasharray="3 3"
                                       label={{value: '0', position: allNonPositive ? 'insideTopLeft' : 'insideBottomLeft', fill: 'var(--muted)', fontSize: 12}}/>
                        <Tooltip cursor={SPARK_CURSOR}
                                 content={({active, payload}) => {
                                     const p = active ? (payload?.[0]?.payload as {ts: number; balance: number} | undefined) : undefined
                                     if (!p) return null
                                     return (
                                         <div style={TIP_STYLE} className="px-2.5 py-1.5">
                                             <div className="font-bold">{dayLabel(p.ts)}</div>
                                             <div>{fe(p.balance)}</div>
                                         </div>
                                     )
                                 }}/>
                        <Area type="stepAfter" dataKey="balance" baseValue={0} stroke={areaStroke} strokeWidth={2}
                              fill={areaFill} fillOpacity={split.mixed ? 1 : 0.15} dot={false}
                              activeDot={SPARK_ACTIVE_DOT} {...chartAnimation()}/>
                        {selectedPoint && (
                            <ReferenceDot x={selectedPoint.ts} y={selectedPoint.balance} r={4}
                                          fill={selectedPoint.balance < -0.01 ? 'var(--danger-fg)' : 'var(--positive-fg)'}
                                          stroke="var(--canvas)" strokeWidth={2}/>
                        )}
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            {selectedPoint && (
                <div className="flex items-center justify-between text-xs mt-1 px-2 py-1 rounded-lg bg-surface-2 border border-line"
                     data-testid="sparkline-selected">
                    <span className="text-muted">{dayLabel(selectedPoint.ts)}</span>
                    <span className="font-bold" style={{color: selectedPoint.balance < -0.01 ? 'var(--danger-fg)' : 'var(--positive-fg)'}}>
                        {fe(selectedPoint.balance)}
                    </span>
                </div>
            )}
        </div>
    )
}

