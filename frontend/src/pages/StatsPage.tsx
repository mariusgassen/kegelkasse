import {useEffect, useMemo, useState} from 'react'
import {useEveningList} from '../hooks/useEvening'
import {useHashTab} from '@/hooks/usePage.ts'
import {useQuery} from '@tanstack/react-query'
import {useAppStore} from '@/store/app'
import {api} from '../api/client'
import {useT, useI18n} from '@/i18n'
import type {TranslationKey} from '@/i18n/de'
import {Empty} from '@/components/ui/Empty.tsx'
import {SkeletonRows, SkeletonChart} from '@/components/ui/Skeleton'
import {ItemReactionBar} from '@/components/ui/ItemReactionBar.tsx'
import {CommentThread} from '@/components/ui/CommentThread.tsx'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {Avatar} from '@/components/ui/Avatar.tsx'
import {StatTile} from '@/components/ui/StatTile.tsx'
import {MemberBadges, MeBadge} from '@/components/ui/MemberBadges.tsx'
import type {Evening, EveningPlayer, Game, PenaltyLogEntry} from '@/types.ts'
import type {CorrelationStats, EveningCorrelation} from '@/types.ts'
import {computeHallOfShame, type ShameEntry} from '@/lib/stats'
import {playerColor, withAlpha} from '@/lib/chartColors.ts'
import {axisLeftPad, compactEuro} from '@/lib/chartAxis.ts'
import {StatsLab} from '@/components/stats/StatsLab.tsx'
import {useThrowTracking} from '@/hooks/useClub.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function feShort(v: number) {
    return '€' + v.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})
}


// ── Cumulative chart ────────────────────────────────────────────────────────

type ChartEvent = { ts: number; delta: number; entry?: PenaltyLogEntry }
type ChartSeries = { id: number; name: string; color: string; events: ChartEvent[] }
type SelectedPoint = { seriesId: number; entryId: number }

const PAD = {top: 12, right: 12, bottom: 22}
const VW = 400, VH = 140
const AXIS_FONT = 15
const IH = VH - PAD.top - PAD.bottom

function CumulativeChart({series, yFormat, title, selected, onSelect}: {
    series: ChartSeries[]
    yFormat: (v: number) => string
    title: string
    selected?: SelectedPoint | null
    onSelect?: (point: SelectedPoint | null) => void
}) {
    const allTs = series.flatMap(s => s.events.map(e => e.ts))
    const hasData = allTs.length > 0
    const tMin = hasData ? Math.min(...allTs) : 0
    const tMax = hasData ? Math.max(...allTs) : 1
    const tSpan = Math.max(tMax - tMin, 60_000) // at least 1 minute span

    const maxVal = Math.max(
        0.01,
        ...series.map(s => s.events.reduce((sum, e) => sum + e.delta, 0))
    )

    // The gutter is measured from the actual tick labels: a fixed one drawn for "€12" clips
    // "€1.234,56" straight out of the chart, and a euro axis routinely reaches four figures.
    const yTickValues = [0, 0.5, 1].map(f => f * maxVal)
    const yTickLabels = yTickValues.map(yFormat)
    const padLeft = axisLeftPad(yTickLabels, AXIS_FONT, {gap: 5, min: 26})
    const IW = VW - padLeft - PAD.right

    const xS = (t: number) => padLeft + ((t - tMin) / tSpan) * IW
    const yS = (v: number) => PAD.top + IH - (v / maxVal) * IH

    function buildPath(events: { ts: number; delta: number }[]) {
        const sorted = [...events].sort((a, b) => a.ts - b.ts)
        let cum = 0
        let d = `M ${xS(tMin)},${yS(0)}`
        for (const e of sorted) {
            d += ` H ${xS(e.ts)} V ${yS(cum + e.delta)}`
            cum += e.delta
        }
        d += ` H ${xS(tMin + tSpan)}`
        return d
    }

    const yTicks = yTickValues.map((v, i) => ({v, y: yS(v), label: yTickLabels[i]}))
    const fTime = (ms: number) =>
        new Date(ms).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})
    const xTicks = hasData
        ? [tMin, tMin + tSpan / 2, tMin + tSpan].map(t => ({label: fTime(t), x: xS(t)}))
        : []

    return (
        <div className="mb-1">
            <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">{title}</div>
            <svg width="100%" viewBox={`0 0 ${VW} ${VH}`}
                 style={{overflow: 'visible', display: 'block'}}
                 onClick={onSelect ? () => onSelect(null) : undefined}>
                {/* Grid */}
                {yTicks.filter(t => t.v > 0).map((tick, i) => (
                    <line key={i} x1={padLeft} y1={tick.y} x2={VW - PAD.right} y2={tick.y}
                          stroke="var(--line)" strokeWidth="0.8" strokeDasharray="3,3"/>
                ))}
                {/* Y labels */}
                {yTicks.map((tick, i) => (
                    <text key={i} x={padLeft - 5} y={tick.y + 3.5} textAnchor="end"
                          fontSize={AXIS_FONT} fill="var(--muted)">{tick.label}</text>
                ))}
                {/* X labels */}
                {xTicks.map((tick, i) => (
                    <text key={i} x={tick.x} y={VH - 4} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
                          fontSize={AXIS_FONT} fill="var(--muted)">{tick.label}</text>
                ))}
                {/* Series */}
                {series.map(s => (
                    <path key={s.id} d={buildPath(s.events)}
                          fill="none" stroke={s.color} strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round"
                          opacity={s.events.length > 0 ? 1 : 0.15}/>
                ))}
                {/* Dots */}
                {series.map(s => {
                    let cum = 0
                    return [...s.events].sort((a, b) => a.ts - b.ts).map((e, i) => {
                        cum += e.delta
                        const isSelected = !!(selected && e.entry && selected.seriesId === s.id && selected.entryId === e.entry.id)
                        const cx = xS(e.ts), cy = yS(cum)
                        const interactive = !!(onSelect && e.entry)
                        const toggle = () => onSelect!(isSelected ? null : {seriesId: s.id, entryId: e.entry!.id})
                        return (
                            <g key={i}
                               tabIndex={interactive ? 0 : undefined}
                               role={interactive ? 'button' : undefined}
                               aria-label={interactive ? `${e.entry!.penalty_type_name} – ${e.entry!.player_name} – ${fe(e.entry!.amount)}` : undefined}
                               style={interactive ? {cursor: 'pointer'} : undefined}
                               onClick={interactive ? (evt) => {
                                   evt.stopPropagation()
                                   toggle()
                               } : undefined}
                               onKeyDown={interactive ? (evt) => {
                                   if (evt.key === 'Enter' || evt.key === ' ') {
                                       evt.preventDefault()
                                       evt.stopPropagation()
                                       toggle()
                                   }
                               } : undefined}>
                                {interactive && (
                                    <circle cx={cx} cy={cy} r="9" fill="transparent"/>
                                )}
                                <circle cx={cx} cy={cy} r={isSelected ? 4.5 : 2.5}
                                        fill={s.color} stroke="var(--canvas)"
                                        strokeWidth={isSelected ? 1.5 : 1}
                                        style={{transition: 'r 0.12s'}}/>
                            </g>
                        )
                    })
                })}
                {/* Axes */}
                <line x1={padLeft} y1={PAD.top} x2={padLeft} y2={PAD.top + IH}
                      stroke="var(--line)" strokeWidth="1"/>
                <line x1={padLeft} y1={PAD.top + IH} x2={VW - PAD.right} y2={PAD.top + IH}
                      stroke="var(--line)" strokeWidth="1"/>
            </svg>
        </div>
    )
}

// ── Evening timeline section ────────────────────────────────────────────────

function EveningTimeline({evening, t}: { evening: Evening; t: (k: any) => string }) {
    const allIds = evening.players.map(p => p.id)
    const [selected, setSelected] = useState<number[]>(allIds)
    const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null)

    // Stable color per player (by index in evening.players, not filtered index)
    const colorOf = (pid: number) => playerColor(allIds.indexOf(pid))

    const toggle = (id: number) =>
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

    const activePlayers = evening.players.filter(p => selected.includes(p.id))

    const penaltySeries: ChartSeries[] = activePlayers.map(p => ({
        id: p.id, name: p.name, color: colorOf(p.id),
        events: evening.penalty_log
            .filter(l => l.player_id === p.id && !('is_deleted' in l && (l as any).is_deleted))
            .map(l => ({
                ts: l.client_timestamp,
                delta: l.mode === 'euro' ? l.amount : (l.unit_amount != null ? l.amount * l.unit_amount : 0),
                entry: l,
            })),
    }))

    const drinkSeries: ChartSeries[] = activePlayers.map(p => ({
        id: p.id, name: p.name, color: colorOf(p.id),
        events: evening.drink_rounds
            .filter(r => r.participant_ids.includes(p.id))
            .map(r => ({ts: r.client_timestamp, delta: 1})),
    }))

    const selectedDetail = selectedPoint
        ? (() => {
            const ser = penaltySeries.find(s => s.id === selectedPoint.seriesId)
            const ev = ser?.events.find(e => e.entry?.id === selectedPoint.entryId)
            if (!ser || !ev || !ev.entry) return null
            const fTime = (ts: number) =>
                new Date(ts).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})
            return {player: ser.name, color: ser.color, entry: ev.entry, amount: ev.delta, time: fTime(ev.ts)}
        })()
        : null

    // Check across ALL players (not just selected) to decide if the section should render at all
    const anyPenaltyTotal = evening.players.some(p =>
        evening.penalty_log.some(l => l.player_id === p.id && !('is_deleted' in l && (l as any).is_deleted)))
    const anyDrinkTotal = evening.players.some(p =>
        evening.drink_rounds.some(r => r.participant_ids.includes(p.id)))

    if (!anyPenaltyTotal && !anyDrinkTotal) {
        return (
            <div>
                <div className="sec-heading text-sm mt-4">📈 Verlauf</div>
                <Empty icon="📈" text="Noch keine Daten"/>
            </div>
        )
    }

    return (
        <div>
            <div className="sec-heading text-sm mt-4">📈 Verlauf</div>

            {/* Player filter */}
            <div className="flex flex-wrap gap-1.5 mb-3">
                {evening.players.map(p => {
                    const on = selected.includes(p.id)
                    const col = colorOf(p.id)
                    return (
                        <button key={p.id} type="button"
                                className="chip flex items-center gap-1"
                                style={on
                                    ? {borderColor: col, color: col, background: withAlpha(col), transition: 'none'}
                                    : {opacity: 0.4, transition: 'none'}}
                                onClick={() => toggle(p.id)}>
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background: col}}/>
                            {p.is_king ? '👑 ' : ''}{p.name}
                        </button>
                    )
                })}
            </div>

            <div className="kce-card p-3">
                {anyPenaltyTotal && (
                    <>
                        <CumulativeChart
                            series={penaltySeries} yFormat={compactEuro} title="Strafen €"
                            selected={selectedPoint}
                            onSelect={setSelectedPoint}
                        />
                        {selectedDetail ? (
                            <div className="flex items-center gap-2 mb-2 px-1.5 py-1 rounded text-sm"
                                 style={{background: withAlpha(selectedDetail.color), borderLeft: `2px solid ${selectedDetail.color}`}}>
                                <span className="text-muted flex-shrink-0">{selectedDetail.time}</span>
                                <span className="font-bold flex-shrink-0" style={{color: selectedDetail.color}}>{selectedDetail.player}</span>
                                <span className="text-ink truncate flex-1">
                                    {selectedDetail.entry.icon ? `${selectedDetail.entry.icon} ` : ''}{selectedDetail.entry.penalty_type_name}
                                </span>
                                <span className="text-danger-fg font-bold flex-shrink-0">{feShort(selectedDetail.amount)}</span>
                            </div>
                        ) : (
                            <div className="text-xs text-muted/60 italic mb-2 px-1.5">
                                ☝️ {t('stats.tapPenaltyDot')}
                            </div>
                        )}
                    </>
                )}
                {anyDrinkTotal && (
                    <CumulativeChart series={drinkSeries} yFormat={v => `${Math.round(v)}`} title="Getränke"/>
                )}

                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-line">
                    {activePlayers.map(p => (
                        <div key={p.id} className="flex items-center gap-1.5">
                            <div className="w-4 h-1.5 rounded-full" style={{background: colorOf(p.id)}}/>
                            <span className="text-xs text-muted font-bold">{p.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

// ── Throw performance components ────────────────────────────────────────────

function ThrowTrendSmall({evenings}: { evenings: {avg_pins: number; date: string}[] }) {
    const avgs = evenings.map(e => e.avg_pins)
    const minV = Math.min(...avgs)
    const maxV = Math.max(...avgs)
    const range = Math.max(maxV - minV, 1)
    const W = 300, H = 50, PAD = 6
    const iw = W - PAD * 2
    const ih = H - PAD * 2
    const n = avgs.length
    const pts = avgs.map((v, i) => {
        const x = PAD + (n === 1 ? iw / 2 : (i / (n - 1)) * iw)
        const y = PAD + ih - ((v - minV) / range) * ih
        return {x, y, v}
    })
    const polyline = pts.map(p => `${p.x},${p.y}`).join(' ')
    return (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display: 'block', overflow: 'visible'}}>
            <polyline points={polyline} fill="none" stroke="var(--accent-fg)" strokeWidth="2"
                      strokeLinejoin="round" strokeLinecap="round"/>
            {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="var(--accent-fg)">
                    <title>{p.v}</title>
                </circle>
            ))}
        </svg>
    )
}

// ── Evening donut chart ─────────────────────────────────────────────────────

function EveningDonutChart({evening, totalEuro, penaltyCount, beerRounds, shotRounds, t, onSelectPlayer}: {
    evening: Evening
    totalEuro: number
    penaltyCount: number
    beerRounds: number
    shotRounds: number
    t: (k: any) => string
    onSelectPlayer: (player: EveningPlayer) => void
}) {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [showAbsent, setShowAbsent] = useState(true)
    const [drinkDetail, setDrinkDetail] = useState<'beer' | 'shots' | null>(null)
    const [gamesOpen, setGamesOpen] = useState(false)
    const [timelineOpen, setTimelineOpen] = useState(false)
    const gameCount = evening.games.length
    const finishedGameCount = evening.games.filter(g => g.status === 'finished').length
    const gameCountLabel = gameCount === 0 || finishedGameCount === gameCount
        ? String(gameCount)
        : `${finishedGameCount}/${gameCount}`

    // Present players: group by player_id
    const presentTotals = evening.players.map(p => {
        const total = evening.penalty_log
            .filter(l => l.player_id === p.id && !(l as any).is_deleted)
            .reduce((s, l) => s + (l.mode === 'euro' ? l.amount : (l.unit_amount != null ? l.amount * l.unit_amount : 0)), 0)
        return {id: `p:${p.id}`, name: p.name, total}
    }).filter(p => p.total > 0)

    // Absent members: player_id === null, regular_member_id set — group by regular_member_id
    const absentMap = new Map<string, {name: string; total: number}>()
    for (const l of evening.penalty_log) {
        if (l.player_id === null && l.regular_member_id != null && !(l as any).is_deleted) {
            const key = `r:${l.regular_member_id}`
            const amount = l.mode === 'euro' ? l.amount : (l.unit_amount != null ? l.amount * l.unit_amount : 0)
            const existing = absentMap.get(key)
            if (existing) existing.total += amount
            else absentMap.set(key, {name: l.player_name, total: amount})
        }
    }
    const absentTotals = [...absentMap.entries()]
        .map(([id, v]) => ({id, ...v}))
        .filter(p => p.total > 0)
    const hasAbsent = absentTotals.length > 0

    const allTotals = (showAbsent ? [...presentTotals, ...absentTotals] : presentTotals)
        .sort((a, b) => b.total - a.total)
    const visibleTotal = allTotals.reduce((s, p) => s + p.total, 0)
    const hasData = visibleTotal > 0 && allTotals.length > 0

    if (!hasData && !hasAbsent) {
        return (
            <>
            <div className="grid grid-cols-2 gap-2 mb-4">
                <StatTile size="lg" value={fe(totalEuro)} label={t('stats.totalEuro')}/>
                <StatTile size="lg" value={penaltyCount} label={t('stats.penalties')}
                          onClick={() => setTimelineOpen(true)} disabled={penaltyCount === 0}/>
                <StatTile size="lg" value={`🍺 ${beerRounds}`} label={t('drinks.beer')}
                          onClick={() => setDrinkDetail('beer')}/>
                <StatTile size="lg" value={`🥃 ${shotRounds}`} label={t('drinks.shots')}
                          onClick={() => setDrinkDetail('shots')}/>
                {gameCount > 0 && (
                    <StatTile size="lg" className="col-span-2" value={`🏆 ${gameCountLabel}`}
                              label={t('stats.games')} onClick={() => setGamesOpen(true)}/>
                )}
            </div>
            {drinkDetail && (
                <DrinkRoundsDetailSheet
                    evening={evening}
                    initialTab={drinkDetail}
                    t={t}
                    onClose={() => setDrinkDetail(null)}
                />
            )}
            {gamesOpen && (
                <GamesDetailSheet evening={evening} t={t} onClose={() => setGamesOpen(false)}/>
            )}
            {timelineOpen && (
                <PenaltyTimelineSheet
                    evening={evening}
                    t={t}
                    onSelectPlayer={p => { setTimelineOpen(false); onSelectPlayer(p) }}
                    onClose={() => setTimelineOpen(false)}
                />
            )}
            </>
        )
    }

    const R = 70
    const CX = 100, CY = 100
    const SW = 28
    const CIRC = 2 * Math.PI * R

    let accumulated = 0
    const segments = allTotals.map((p, i) => {
        const arcLen = visibleTotal > 0 ? (p.total / visibleTotal) * CIRC : 0
        const rotation = (accumulated / CIRC) * 360 - 90
        const seg = {
            ...p,
            arcLen,
            rotation,
            color: playerColor(i),
        }
        accumulated += arcLen
        return seg
    })

    const selected = selectedId ? segments.find(s => s.id === selectedId) : null

    return (
        <>
        <div className="mb-4">
            <div className="flex gap-3 items-center mb-3">
                <div style={{flexShrink: 0, width: 150}}>
                    <svg width="150" height="150" viewBox="0 0 200 200"
                         onClick={() => setSelectedId(null)}
                         style={{cursor: 'default'}}>
                        <circle cx={CX} cy={CY} r={R} fill="none"
                                stroke="var(--surface-2)" strokeWidth={SW}/>
                        {segments.map(seg => {
                            const isSelected = selectedId === seg.id
                            const dimmed = selectedId !== null && !isSelected
                            const toggle = () => setSelectedId(isSelected ? null : seg.id)
                            return (
                                <circle key={seg.id}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={`${seg.name} – ${fe(seg.total)}`}
                                        cx={CX} cy={CY} r={R}
                                        fill="none"
                                        stroke={seg.color}
                                        strokeWidth={isSelected ? SW + 6 : SW}
                                        strokeDasharray={`${seg.arcLen} ${CIRC}`}
                                        strokeDashoffset={0}
                                        transform={`rotate(${seg.rotation}, ${CX}, ${CY})`}
                                        strokeLinecap="butt"
                                        opacity={dimmed ? 0.35 : 1}
                                        style={{transition: 'opacity 0.15s, stroke-width 0.15s', cursor: 'pointer', outline: 'none'}}
                                        onClick={e => { e.stopPropagation(); toggle() }}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                toggle()
                                            }
                                        }}/>
                            )
                        })}
                        {selected ? (
                            <>
                                <text x={CX} y={CY - 8} textAnchor="middle" fontSize="17"
                                      fill={selected.color} fontWeight="bold">
                                    {feShort(selected.total)}
                                </text>
                                <text x={CX} y={CY + 8} textAnchor="middle" fontSize="16"
                                      fill="var(--ink)">
                                    {selected.name.length > 10 ? selected.name.slice(0, 9) + '…' : selected.name}
                                </text>
                            </>
                        ) : (
                            <>
                                <text x={CX} y={CY - 8} textAnchor="middle" fontSize="18"
                                      fill="var(--ink)" fontWeight="bold">
                                    {feShort(visibleTotal)}
                                </text>
                                <text x={CX} y={CY + 8} textAnchor="middle" fontSize="16"
                                      fill="var(--muted)">
                                    {penaltyCount} {t('stats.penalties')}
                                </text>
                                <text x={CX} y={CY + 26} textAnchor="middle" fontSize="16"
                                      fill="var(--muted)">{t('stats.totalEuro')}</text>
                            </>
                        )}
                    </svg>
                </div>
                <div className="flex flex-col gap-2 flex-1">
                    <button type="button" className="kce-card p-2 text-center active:opacity-70 transition-opacity" onClick={() => setDrinkDetail('beer')}>
                        <div className="font-display font-bold text-accent-fg text-lg leading-tight">🍺 {beerRounds}</div>
                        <div className="text-xs text-muted font-bold tracking-wider mt-0.5 uppercase">{t('drinks.beer')}</div>
                    </button>
                    <button type="button" className="kce-card p-2 text-center active:opacity-70 transition-opacity" onClick={() => setDrinkDetail('shots')}>
                        <div className="font-display font-bold text-accent-fg text-lg leading-tight">🥃 {shotRounds}</div>
                        <div className="text-xs text-muted font-bold tracking-wider mt-0.5 uppercase">{t('drinks.shots')}</div>
                    </button>
                    {gameCount > 0 && (
                        <button type="button" className="kce-card p-2 text-center active:opacity-70 transition-opacity"
                                onClick={() => setGamesOpen(true)}>
                            <div className="font-display font-bold text-accent-fg text-lg leading-tight">🏆 {gameCountLabel}</div>
                            <div className="text-xs text-muted font-bold tracking-wider mt-0.5 uppercase">{t('stats.games')}</div>
                        </button>
                    )}
                </div>
            </div>
            <div className="kce-card p-2">
                <div className="flex items-center justify-between mb-1.5 gap-2">
                    <div className="text-xs font-bold text-muted uppercase tracking-wider">
                        {t('stats.penaltyDistribution')}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {hasAbsent && (
                            <button type="button"
                                    className="chip"
                                    style={showAbsent ? {borderColor: 'var(--accent-fg)', color: 'var(--accent-fg)', background: 'color-mix(in srgb, var(--accent) 15%, transparent)'} : {borderColor: 'var(--line)', color: 'var(--muted)', opacity: 0.6}}
                                    onClick={() => { setShowAbsent(v => !v); setSelectedId(null) }}>
                                🏠 {t('stats.toggleAbsent')}
                            </button>
                        )}
                        <button type="button"
                                className="chip"
                                onClick={() => setTimelineOpen(true)}>
                            📋 {t('stats.penaltyTimeline')}
                        </button>
                    </div>
                </div>
                <div className="flex flex-col gap-1">
                    {segments.map(seg => {
                        const isSelected = selectedId === seg.id
                        return (
                            <div key={seg.id}
                                 className="flex items-center justify-between gap-2 rounded px-1 py-0.5 transition-colors"
                                 style={{background: isSelected ? withAlpha(seg.color) : 'transparent', cursor: 'pointer'}}
                                 onClick={() => setSelectedId(isSelected ? null : seg.id)}>
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                         style={{background: seg.color}}/>
                                    <span className="text-sm text-ink truncate">{seg.name}</span>
                                    {seg.id.startsWith('r:') && (
                                        <span className="text-xs text-muted">🏠</span>
                                    )}
                                </div>
                                <span className="text-sm font-bold flex-shrink-0"
                                      style={{color: isSelected ? seg.color : 'var(--accent-fg)'}}>
                                    {feShort(seg.total)}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
        {drinkDetail && (
            <DrinkRoundsDetailSheet
                evening={evening}
                initialTab={drinkDetail}
                t={t}
                onClose={() => setDrinkDetail(null)}
            />
        )}
        {gamesOpen && (
            <GamesDetailSheet evening={evening} t={t} onClose={() => setGamesOpen(false)}/>
        )}
        {timelineOpen && (
            <PenaltyTimelineSheet
                evening={evening}
                t={t}
                onSelectPlayer={p => { setTimelineOpen(false); onSelectPlayer(p) }}
                onClose={() => setTimelineOpen(false)}
            />
        )}
        </>
    )
}

// ── Games detail sheet ──────────────────────────────────────────────────────

function GamesDetailSheet({evening, t, onClose}: {
    evening: Evening
    t: (k: any) => string
    onClose: () => void
}) {
    const throwTracking = useThrowTracking()
    const games = [...evening.games].sort((a, b) => a.client_timestamp - b.client_timestamp)

    const playerName = (pid: number) => {
        const p = evening.players.find(pl => pl.id === pid)
        return p ? (p.nickname || p.name) : '?'
    }
    const teamName = (tid: number) => evening.teams.find(team => team.id === tid)?.name ?? '?'

    const refLabel = (ref: string) => {
        if (ref.startsWith('p:')) return playerName(parseInt(ref.slice(2)))
        if (ref.startsWith('t:')) return teamName(parseInt(ref.slice(2)))
        return ref
    }

    const fTime = (iso: string | null) =>
        iso ? new Date(iso).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'}) : null

    const statusLabel = (g: Game) => {
        if (g.status === 'finished') return {text: t('stats.gameStatusFinished'), color: 'var(--accent-fg)'}
        if (g.status === 'running') return {text: t('stats.gameStatusRunning'), color: 'var(--positive-fg)'}
        return {text: t('stats.gameStatusOpen'), color: 'var(--muted)'}
    }

    return (
        <Sheet open onClose={onClose} title={t('stats.gamesDetail')}>
            {games.length === 0 ? (
                <div className="text-sm text-muted text-center py-4">{t('stats.noGames')}</div>
            ) : (
                <div className="space-y-2">
                    {games.map(g => {
                        const status = statusLabel(g)
                        const scoreEntries = Object.entries(g.scores ?? {})
                            .map(([ref, score]) => ({ref, label: refLabel(ref), score, isWinner: g.winner_ref === ref}))
                            .sort((a, b) => b.score - a.score)
                        const throws = g.throws ?? []
                        const totalPins = throws.reduce((s, th) => s + th.pins, 0)
                        const throwCount = throws.length
                        const avgPins = throwCount > 0 ? (totalPins / throwCount).toFixed(1) : null
                        const startedAt = fTime(g.started_at)
                        const finishedAt = fTime(g.finished_at)
                        return (
                            <div key={g.id} className="kce-card p-3">
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                    <div className="font-bold text-ink text-sm flex items-center gap-1 min-w-0">
                                        {g.is_opener && <span role="img" aria-label={t('game.isOpener')}>👑</span>}
                                        <span className="truncate">{g.name}</span>
                                    </div>
                                    <span className="text-xs font-bold uppercase tracking-wider flex-shrink-0"
                                          style={{color: status.color}}>
                                        {status.text}
                                    </span>
                                </div>

                                {g.winner_name && (
                                    <div className="text-xs text-accent-fg font-bold mb-1.5">
                                        🏆 {g.winner_name}
                                    </div>
                                )}

                                {(startedAt || finishedAt) && (
                                    <div className="text-xs text-muted mb-1.5">
                                        {startedAt && <>⏱ {startedAt}</>}
                                        {startedAt && finishedAt && ' · '}
                                        {finishedAt && <>🏁 {finishedAt}</>}
                                    </div>
                                )}

                                {scoreEntries.length > 0 && (
                                    <div className="mb-1.5">
                                        <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">
                                            {t('stats.scores')}
                                        </div>
                                        <div className="space-y-0.5">
                                            {scoreEntries.map(s => (
                                                <div key={s.ref} className="flex items-center justify-between text-xs">
                                                    <span className={s.isWinner ? 'text-accent-fg font-bold' : 'text-ink'}>
                                                        {s.isWinner ? '🏆 ' : ''}{s.label}
                                                    </span>
                                                    <span className={s.isWinner ? 'text-accent-fg font-bold' : 'text-muted'}>
                                                        {s.score}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {throwTracking && throwCount > 0 && (
                                    <div className="flex justify-around text-center pt-1.5 border-t border-line">
                                        <div>
                                            <div className="font-bold text-ink text-xs">{totalPins}</div>
                                            <div className="text-xs text-muted">{t('stats.totalPins')}</div>
                                        </div>
                                        <div>
                                            <div className="font-bold text-ink text-xs">{throwCount}</div>
                                            <div className="text-xs text-muted">{t('stats.throwCount')}</div>
                                        </div>
                                        {avgPins !== null && (
                                            <div>
                                                <div className="font-bold text-accent-fg text-xs">{avgPins}</div>
                                                <div className="text-xs text-muted">{t('stats.avgPins')}</div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {g.note && (
                                    <div className="text-sm text-muted mt-1.5 italic">
                                        {g.note}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </Sheet>
    )
}

// ── Penalty timeline sheet ──────────────────────────────────────────────────

function PenaltyTimelineSheet({evening, t, onSelectPlayer, onClose}: {
    evening: Evening
    t: (k: any) => string
    onSelectPlayer: (player: EveningPlayer) => void
    onClose: () => void
}) {
    const entries = evening.penalty_log
        .filter(l => !('is_deleted' in l && (l as any).is_deleted))
        .sort((a, b) => a.client_timestamp - b.client_timestamp)

    const fTime = (ts: number) =>
        new Date(ts).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})

    return (
        <Sheet open onClose={onClose} title={t('stats.penaltyTimeline')}>
            {entries.length === 0 ? (
                <div className="text-sm text-muted text-center py-4">{t('stats.noPenalties')}</div>
            ) : (
                <div className="space-y-1.5">
                    {entries.map(l => {
                        const amount = l.mode === 'euro' ? l.amount : (l.unit_amount != null ? l.amount * l.unit_amount : 0)
                        const player = l.player_id != null ? evening.players.find(p => p.id === l.player_id) : null
                        const displayName = player ? (player.nickname || player.name) : l.player_name
                        return (
                            <div key={l.id} className="flex items-center gap-2 text-xs">
                                <span className="text-muted flex-shrink-0 tabular-nums">{fTime(l.client_timestamp)}</span>
                                <span className="text-ink truncate flex-1">
                                    {l.icon ? `${l.icon} ` : ''}{l.penalty_type_name}
                                </span>
                                {player ? (
                                    <button type="button"
                                            className="chip flex-shrink-0"
                                            onClick={() => onSelectPlayer(player)}>
                                        {player.is_king ? '👑 ' : ''}{displayName}
                                    </button>
                                ) : (
                                    <span className="chip flex-shrink-0"
                                          style={{opacity: 0.7, cursor: 'default'}}>
                                        🏠 {displayName}
                                    </span>
                                )}
                                <span className="text-danger-fg font-bold flex-shrink-0 tabular-nums">{feShort(amount)}</span>
                            </div>
                        )
                    })}
                </div>
            )}
        </Sheet>
    )
}

// ── Year evenings bar chart ─────────────────────────────────────────────────

// Fed from the year-stats response, which is the only endpoint that carries per-evening
// penalty totals — the evening list does not, which used to leave this chart permanently blank.
function YearEveningsBarChart({evenings, t}: {
    evenings: {id: number; date: string; venue: string | null; penalty_total: number}[]
    t: (k: any) => string
}) {
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

    const bars = [...evenings]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-12)

    if (bars.length < 2) return null

    const allZero = bars.every(b => (b.penalty_total ?? 0) === 0)
    if (allZero) return null

    const VW = 400, VH = 74
    const PAD_T = 4, PAD_B = 24, PAD_H = 4
    const IH = VH - PAD_T - PAD_B
    const IW = VW - PAD_H * 2
    const maxP = Math.max(...bars.map(b => b.penalty_total ?? 0), 0.01)
    const gap = 3
    const barW = Math.max(2, (IW / bars.length) - gap)

    const fShortDate = (d: string) =>
        new Date(d).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'})
    const fLongDate = (d: string) =>
        new Date(d).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'})

    const selected = selectedIdx !== null ? bars[selectedIdx] : null

    return (
        <div className="kce-card p-3 mb-4">
            {/* Header row: title + selected detail */}
            <div className="flex items-center justify-between gap-2 mb-2" style={{minHeight: 18}}>
                <div className="text-xs font-bold text-muted uppercase tracking-wider flex-shrink-0">
                    {t('stats.eveningBars')}
                </div>
                {selected ? (
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-accent-fg flex-shrink-0">
                            {feShort(selected.penalty_total ?? 0)}
                        </span>
                        <span className="text-xs text-muted truncate">
                            {fLongDate(selected.date)}{selected.venue ? ` · ${selected.venue}` : ''}
                        </span>
                    </div>
                ) : (
                    <span className="text-xs text-muted/50 italic">
                        ☝️ antippen
                    </span>
                )}
            </div>
            <svg width="100%" viewBox={`0 0 ${VW} ${VH}`}
                 style={{display: 'block', overflow: 'visible'}}
                 onClick={() => setSelectedIdx(null)}>
                {bars.map((bar, i) => {
                    const x = PAD_H + i * (barW + gap)
                    const h = Math.max(2, ((bar.penalty_total ?? 0) / maxP) * IH)
                    const y = PAD_T + IH - h
                    const labelX = x + barW / 2
                    const isSelected = selectedIdx === i
                    const dimmed = selectedIdx !== null && !isSelected
                    // Show every label when ≤6, every 2nd when 7–12; always show selected
                    const showLabel = isSelected || bars.length <= 6 || i % 2 === 0

                    return (
                        <g key={bar.id}
                           onClick={e => { e.stopPropagation(); setSelectedIdx(isSelected ? null : i) }}
                           style={{cursor: 'pointer'}}>
                            {/* Wider touch target */}
                            <rect x={x - 2} y={PAD_T} width={barW + 4} height={IH + PAD_B - 2}
                                  fill="transparent"/>
                            <rect x={x} y={y} width={barW} height={h} rx="2"
                                  fill="var(--accent-fg)"
                                  opacity={dimmed ? 0.28 : isSelected ? 1 : 0.78}
                                  style={{transition: 'opacity 0.12s'}}/>
                            {showLabel && (
                                <text x={labelX} y={VH - 6} textAnchor="middle"
                                      fontSize="15"
                                      fontWeight={isSelected ? 'bold' : 'normal'}
                                      fill={isSelected ? 'var(--accent-fg)' : 'var(--muted)'}>
                                    {fShortDate(bar.date)}
                                </text>
                            )}
                        </g>
                    )
                })}
                <line x1={PAD_H} y1={PAD_T + IH} x2={VW - PAD_H} y2={PAD_T + IH}
                      stroke="var(--line)" strokeWidth="1"/>
            </svg>
        </div>
    )
}

// ── Year podium ─────────────────────────────────────────────────────────────

function YearPodium({players, myMemberId, t, onSelect}: {
    players: YearPlayer[]
    myMemberId: number | null | undefined
    t: (k: any) => string
    onSelect: (player: YearPlayer, rank: number) => void
}) {
    if (players.length < 3) return null

    const PODIUM_CONFIG = [
        {rank: 1, displayOrder: 1, height: 64, avatarSize: 40, gradient: 'linear-gradient(135deg,#9ca3af,#d1d5db)', label: '🥈', borderColor: '#9ca3af'},
        {rank: 0, displayOrder: 2, height: 80, avatarSize: 48, gradient: 'linear-gradient(135deg,var(--accent-shade),var(--accent))', label: '🥇', borderColor: 'var(--accent-fg)'},
        {rank: 2, displayOrder: 3, height: 52, avatarSize: 36, gradient: 'linear-gradient(135deg,#78450c,var(--tier-bronze))', label: '🥉', borderColor: '#cd7f32'},
    ]

    return (
        <div className="kce-card p-3 mb-4">
            <div className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
                {t('stats.podium')}
            </div>
            <div style={{display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 12, paddingBottom: 4}}>
                {PODIUM_CONFIG.map(cfg => {
                    const p = players[cfg.rank]
                    const rm = useAppStore.getState().regularMembers.find(m => m.id === p.regular_member_id)
                    const isMe = p.regular_member_id != null && p.regular_member_id === myMemberId
                    const displayName = p.nickname || p.name
                    return (
                        <button key={cfg.rank} type="button" onClick={() => onSelect(p, cfg.rank)} style={{order: cfg.displayOrder, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0, flex: '0 0 88px', background: 'none', border: 'none', padding: 0, cursor: 'pointer'}} className="active:opacity-70 transition-opacity">
                            <div style={{
                                width: cfg.avatarSize, height: cfg.avatarSize, borderRadius: '50%',
                                overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: cfg.gradient, border: `2px solid ${cfg.borderColor}`,
                                fontSize: Math.round(cfg.avatarSize * 0.35), fontWeight: 'bold',
                                color: 'var(--canvas)', flexShrink: 0,
                            }}>
                                {rm?.avatar
                                    ? <img src={rm.avatar} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}}/>
                                    : displayName[0].toUpperCase()
                                }
                            </div>
                            <div style={{textAlign: 'center', maxWidth: 88}}>
                                <div style={{fontSize: 13, fontWeight: 'bold', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                    {displayName}
                                </div>
                                {isMe && <MeBadge/>}
                            </div>
                            <div style={{fontSize: 12, color: 'var(--danger-fg)', fontWeight: 'bold'}}>
                                {feShort(p.penalty_total)}
                            </div>
                            <div style={{
                                width: 72, height: cfg.height,
                                background: cfg.gradient, borderRadius: '4px 4px 0 0',
                                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                                paddingTop: 8,
                            }}>
                                <span style={{fontSize: cfg.rank === 0 ? 22 : 18}}>{cfg.label}</span>
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// ── Hall of Shame ────────────────────────────────────────────────────────────

function HallOfShame({players, t, onSelect}: {
    players: YearPlayer[]
    t: (k: any) => string
    onSelect: (player: YearPlayer, rank: number) => void
}) {
    const throwTracking = useThrowTracking()
    // Drop the throw-based "weakest average" award when the club doesn't track throws.
    const entries = computeHallOfShame(players).filter(e => throwTracking || e.key !== 'worstThrow')
    if (entries.length === 0) return null

    const formatValue = (e: ShameEntry<YearPlayer>) => {
        switch (e.key) {
            case 'rate':
                return `${fe(e.rawValue)}/Abend`
            case 'thirst':
                return `${e.rawValue} ${t('stats.rounds')}`
            case 'worstThrow':
                return `Ø ${e.rawValue}`
            case 'bridesmaid':
                return `${e.rawValue} ${t('stats.evenings')} ${t('stats.noWins')}`
        }
    }

    return (
        <div className="mb-4">
            <div className="text-xs font-extrabold text-muted uppercase mb-2">{t('stats.hos')}</div>
            {entries.map(e => (
                <button key={e.key} type="button"
                        className="kce-card p-3 mb-2 flex items-center gap-3 w-full text-left active:opacity-70 transition-opacity"
                        onClick={() => onSelect(e.player, players.indexOf(e.player))}>
                    <span className="text-2xl">{e.icon}</span>
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-muted">{t(`stats.shame.${e.key}` as any)}</div>
                        <div className="text-sm font-bold truncate">{e.player.nickname || e.player.name}</div>
                    </div>
                    <div className="text-accent-fg font-bold text-sm flex-shrink-0">{formatValue(e)}</div>
                </button>
            ))}
        </div>
    )
}

// ── Throw performance components ────────────────────────────────────────────

function PlayerThrowDetail({memberId, year, t}: { memberId: number; year: number; t: (k: any) => string }) {
    const {data, isLoading} = useQuery({
        queryKey: ['member-throw-stats', memberId, year],
        queryFn: () => api.getMemberThrowStats(memberId, year),
        staleTime: 1000 * 60 * 5,
    })
    if (isLoading) return <div className="text-xs text-muted py-2 text-center">{t('action.loading')}</div>
    if (!data || data.throw_count === 0) return <div className="text-xs text-muted py-2 text-center">{t('stats.noThrowData')}</div>
    return (
        <div className="mt-2 pt-2" style={{borderTop: '1px solid var(--line)'}}>
            <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">{t('stats.throwStats')}</div>
            <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="text-center">
                    <div className="font-bold text-ink text-sm">{data.avg_pins ?? '—'}</div>
                    <div className="text-xs text-muted">{t('stats.avgPins')}</div>
                </div>
                <div className="text-center">
                    <div className="font-bold text-positive-fg text-sm">{data.best_avg ?? '—'}</div>
                    <div className="text-xs text-muted">{t('profile.bestAvg')}</div>
                </div>
                <div className="text-center">
                    <div className="font-bold text-danger-fg text-sm">{data.worst_avg ?? '—'}</div>
                    <div className="text-xs text-muted">{t('profile.worstAvg')}</div>
                </div>
            </div>
            {data.evenings.length > 1 && (
                <div className="mb-2">
                    <div className="text-xs text-muted mb-1">{t('stats.throwTrend')}</div>
                    <ThrowTrendSmall evenings={data.evenings}/>
                </div>
            )}
            <div className="space-y-0.5">
                {data.evenings.map(e => (
                    <div key={e.evening_id} className="flex items-center justify-between text-xs">
                        <span className="text-muted">
                            {new Date(e.date).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'})}
                            {e.location ? ` · ${e.location}` : ''}
                        </span>
                        <span className="font-bold text-ink">Ø {e.avg_pins} ({e.throw_count} {t('stats.throwCount')})</span>
                    </div>
                ))}
            </div>
            <div className="text-xs text-muted text-right mt-1">
                {data.throw_count} {t('stats.throwCount')} · {data.total_pins} {t('stats.totalPins')}
            </div>
        </div>
    )
}

// ── Player detail sheet ─────────────────────────────────────────────────────

type YearPlayer = {
    name: string; nickname: string | null; regular_member_id: number | null
    evenings: number; penalty_total: number; penalty_count: number
    game_wins: number; beer_rounds: number; shot_rounds: number
    total_pins: number; throw_count: number; avg_pins: number | null
}

function PlayerDetailSheet({player, year, rank, isMe, t, onClose}: {
    player: YearPlayer
    year: number
    rank: number
    isMe: boolean
    t: (k: any) => string
    onClose: () => void
}) {
    const throwTracking = useThrowTracking()
    const medals = ['🥇', '🥈', '🥉']
    const rm = useAppStore.getState().regularMembers.find(m => m.id === player.regular_member_id)
    const displayName = player.nickname || player.name

    return (
        <Sheet open onClose={onClose} title={t('stats.playerDetail')}>
            {/* Player header */}
            <div className="flex items-center gap-3 mb-5">
                <Avatar name={displayName} src={rm?.avatar} size="lg"/>
                <div className="min-w-0">
                    <div className="font-bold text-ink text-base flex items-center gap-1.5 flex-wrap">
                        <span className="text-xl">{medals[rank] ?? `${rank + 1}.`}</span>
                        <span className="truncate">{displayName}</span>
                        {isMe && <MeBadge/>}
                    </div>
                    <div className="text-xs text-muted">{year}</div>
                </div>
            </div>

            {/* Year stats grid */}
            <div className="grid grid-cols-3 gap-2 mb-4">
                <StatTile tone="negative" label={t('member.totalPenalties')}
                          value={player.penalty_total.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})}/>
                <StatTile tone="default" value={player.evenings} label={t('stats.evenings')}/>
                <StatTile value={player.game_wins} label={t('stats.wins')}/>
                <StatTile tone="default" value={`🍺 ${player.beer_rounds}`} label={t('stats.beer')}/>
                <StatTile tone="default" value={`🥃 ${player.shot_rounds}`} label={t('stats.shotRounds')}/>
                <StatTile tone="muted" value={player.penalty_count} label={t('stats.penalties')}/>
            </div>

            {/* Throw performance */}
            {throwTracking && player.regular_member_id != null && (
                <div className="kce-card p-3">
                    <PlayerThrowDetail memberId={player.regular_member_id} year={year} t={t}/>
                </div>
            )}
        </Sheet>
    )
}

// ── Evening player detail sheet ─────────────────────────────────────────────

function EveningPlayerDetailSheet({player, evening, pins, t, onClose}: {
    player: EveningPlayer
    evening: Evening
    pins: any[]
    t: (k: any) => string
    onClose: () => void
}) {
    const rm = useAppStore.getState().regularMembers.find(m => m.id === player.regular_member_id)
    const user = useAppStore(s => s.user)
    const locale = useI18n(s => s.locale)
    const isMe = player.regular_member_id === user?.regular_member_id
    const displayName = player.nickname || player.name

    const penalties = evening.penalty_log
        .filter(l => l.player_id === player.id && !('is_deleted' in l && (l as any).is_deleted))
        .sort((a, b) => a.client_timestamp - b.client_timestamp)
    const penaltyTotal = penalties.reduce((s, l) => s + (l.mode === 'euro' ? l.amount : (l.unit_amount != null ? l.amount * l.unit_amount : 0)), 0)
    const playerWon = (g: { winner_ref: string | null }) =>
        g.winner_ref === `p:${player.id}` || (!!player.team_id && g.winner_ref === `t:${player.team_id}`)
    const wins = evening.games.filter(playerWon).length
    const beerRoundsPlayer = evening.drink_rounds.filter(r => r.drink_type === 'beer' && r.participant_ids.includes(player.id))
    const shotRoundsPlayer = evening.drink_rounds.filter(r => r.drink_type === 'shots' && r.participant_ids.includes(player.id))

    const gamesWithPlayer = evening.games.filter(g =>
        playerWon(g) || (g.throws ?? []).some(th => th.player_id === player.id)
    )

    const playerThrows = evening.games.flatMap(g => g.throws ?? []).filter(th => th.player_id === player.id)
    const totalPins = playerThrows.reduce((s, th) => s + th.pins, 0)
    const throwCount = playerThrows.length
    const avgPins = throwCount > 0 ? (totalPins / throwCount).toFixed(1) : null
    const throwsWithPins = playerThrows.filter(th => th.pin_states && th.pin_states.length === 9)
    const pinCounts = Array(9).fill(0)
    for (const th of throwsWithPins) for (let i = 0; i < 9; i++) if (th.pin_states[i]) pinCounts[i]++
    const maxPinCount = Math.max(...pinCounts, 1)
    const hasHeatmap = throwsWithPins.length > 0

    const PIN_POS: [number, number][] = [
        [0.50, 0.10],
        [0.30, 0.30], [0.70, 0.30],
        [0.10, 0.50], [0.50, 0.50], [0.90, 0.50],
        [0.30, 0.70], [0.70, 0.70],
        [0.50, 0.90],
    ]

    const fTime = (ts: number | null | undefined) =>
        ts ? new Date(ts).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'}) : '—'

    return (
        <Sheet open onClose={onClose} title={displayName}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <Avatar name={displayName} src={rm?.avatar} size="lg"/>
                <div className="min-w-0">
                    <div className="font-bold text-ink text-base flex items-center gap-1.5 flex-wrap">
                        <span className="truncate">{displayName}</span>
                        <MemberBadges isMe={isMe} isKing={player.is_king} pins={pins}
                                      memberId={player.regular_member_id}/>
                    </div>
                    <div className="text-xs text-muted">{new Date(evening.date).toLocaleDateString(locale, {weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'})}</div>
                </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 mb-4">
                <StatTile tone="negative" value={fe(penaltyTotal)} label={t('stats.penalties')}/>
                <StatTile value={wins} label={t('stats.wins')}/>
                <StatTile size="sm" tone="default" label={t('drinks.title')}
                          value={`🍺${beerRoundsPlayer.length} · 🥃${shotRoundsPlayer.length}`}/>
            </div>

            {/* Penalty breakdown */}
            <div className="kce-card p-3 mb-3">
                <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2">{t('stats.penaltyBreakdown')}</div>
                {penalties.length === 0 ? (
                    <div className="text-xs text-muted text-center py-1">{t('stats.noPenalties')}</div>
                ) : (
                    <div className="space-y-1.5">
                        {penalties.map(l => {
                            const amount = l.mode === 'euro' ? l.amount : (l.unit_amount != null ? l.amount * l.unit_amount : 0)
                            return (
                                <div key={l.id} className="flex items-center gap-2 text-xs">
                                    <span className="text-muted flex-shrink-0">{fTime(l.client_timestamp)}</span>
                                    <span className="text-ink truncate flex-1">{l.icon ? `${l.icon} ` : ''}{l.penalty_type_name}</span>
                                    <span className="text-danger-fg font-bold flex-shrink-0">{feShort(amount)}</span>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Games */}
            {gamesWithPlayer.length > 0 && (
                <div className="kce-card p-3 mb-3">
                    <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2">{t('stats.gameResults')}</div>
                    <div className="space-y-1.5">
                        {gamesWithPlayer.map(g => {
                            const won = g.winner_ref === `p:${player.id}` || (!!player.team_id && g.winner_ref === `t:${player.team_id}`)
                            const gameThrows = (g.throws ?? []).filter(th => th.player_id === player.id)
                            const gamePins = gameThrows.reduce((s, th) => s + th.pins, 0)
                            return (
                                <div key={g.id} className="flex items-center justify-between gap-2 text-xs">
                                    <span className={won ? 'text-accent-fg font-bold' : 'text-ink'}>
                                        {won ? '🏆 ' : ''}{g.name}
                                    </span>
                                    {gameThrows.length > 0 && (
                                        <span className="text-muted flex-shrink-0">
                                            🎳 {gamePins} ({gameThrows.length} {t('stats.throwCount')})
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Drink rounds */}
            {(beerRoundsPlayer.length > 0 || shotRoundsPlayer.length > 0) && (
                <div className="kce-card p-3 mb-3">
                    <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2">{t('stats.drinkRoundsDetail')}</div>
                    <div className="space-y-1">
                        {beerRoundsPlayer.map((r, i) => (
                            <div key={r.id} className="flex items-center justify-between text-xs">
                                <span className="text-ink">🍺 {t('drinks.beer')} {t('stats.drinkRound')} {i + 1}</span>
                                <span className="text-muted">{fTime(r.client_timestamp)}</span>
                            </div>
                        ))}
                        {shotRoundsPlayer.map((r, i) => (
                            <div key={r.id} className="flex items-center justify-between text-xs">
                                <span className="text-ink">🥃 {t('drinks.shots')} {t('stats.drinkRound')} {i + 1}</span>
                                <span className="text-muted">{fTime(r.client_timestamp)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Throw stats + heatmap */}
            {throwCount > 0 && (
                <div className="kce-card p-3">
                    <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2">{t('stats.throwStats')}</div>
                    <div className="flex justify-around text-center mb-3">
                        <div>
                            <div className="font-bold text-ink text-sm">{totalPins}</div>
                            <div className="text-xs text-muted">{t('stats.totalPins')}</div>
                        </div>
                        <div>
                            <div className="font-bold text-ink text-sm">{throwCount}</div>
                            <div className="text-xs text-muted">{t('stats.throwCount')}</div>
                        </div>
                        {avgPins !== null && (
                            <div>
                                <div className="font-bold text-accent-fg text-sm">{avgPins}</div>
                                <div className="text-xs text-muted">{t('stats.avgPins')}</div>
                            </div>
                        )}
                    </div>
                    {hasHeatmap && (
                        <>
                            <div className="text-xs text-muted text-center mb-2">{t('stats.heatmap')}</div>
                            <svg width="120" height="100" viewBox="0 0 120 100" style={{display: 'block', margin: '0 auto', overflow: 'visible'}}>
                                {PIN_POS.map(([px, py], i) => {
                                    const ratio = pinCounts[i] / maxPinCount
                                    const cx = px * 120
                                    const cy = py * 100
                                    return (
                                        <g key={i}>
                                            <circle
                                                cx={cx} cy={cy} r="11"
                                                fill={ratio === 0 ? 'var(--surface-2)' : `color-mix(in srgb, var(--accent) ${Math.round(ratio * 100)}%, var(--surface-2))`}
                                                stroke={ratio > 0 ? 'var(--accent-fg)' : 'var(--line)'}
                                                strokeWidth="1.5"
                                            />
                                            {pinCounts[i] > 0 && (
                                                <text
                                                    x={cx} y={cy}
                                                    textAnchor="middle"
                                                    dominantBaseline="central"
                                                    fontSize="12"
                                                    fontWeight="bold"
                                                    fill="white"
                                                    stroke="rgba(0,0,0,0.55)"
                                                    strokeWidth="2.5"
                                                    paintOrder="stroke"
                                                >
                                                    {pinCounts[i]}
                                                </text>
                                            )}
                                        </g>
                                    )
                                })}
                            </svg>
                        </>
                    )}
                </div>
            )}
        </Sheet>
    )
}

// ── Drink rounds detail sheet ────────────────────────────────────────────────

function DrinkRoundsDetailSheet({evening, initialTab, t, onClose}: {
    evening: Evening
    initialTab: 'beer' | 'shots'
    t: (k: any) => string
    onClose: () => void
}) {
    const [tab, setTab] = useState<'beer' | 'shots'>(initialTab)
    const beerRounds = evening.drink_rounds.filter(r => r.drink_type === 'beer')
    const shotRounds = evening.drink_rounds.filter(r => r.drink_type === 'shots')
    const rounds = tab === 'beer' ? beerRounds : shotRounds

    const fTime = (ts: number | null | undefined) =>
        ts ? new Date(ts).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'}) : '—'

    const playerName = (pid: number) => {
        const p = evening.players.find(pl => pl.id === pid)
        return p ? (p.nickname || p.name) : '?'
    }

    return (
        <Sheet open onClose={onClose} title={t('stats.drinkRoundsDetail')}>
            <div className="flex gap-2 mb-4">
                <button
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${tab === 'beer' ? 'bg-accent/20 text-accent-fg border-accent/40' : 'bg-surface-2 text-muted border-line'}`}
                    onClick={() => setTab('beer')}>
                    🍺 {t('drinks.beer')} ({beerRounds.length})
                </button>
                <button
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${tab === 'shots' ? 'bg-accent/20 text-accent-fg border-accent/40' : 'bg-surface-2 text-muted border-line'}`}
                    onClick={() => setTab('shots')}>
                    🥃 {t('drinks.shots')} ({shotRounds.length})
                </button>
            </div>
            {rounds.length === 0 ? (
                <div className="text-sm text-muted text-center py-4">{t('drinks.noRounds')}</div>
            ) : (
                <div className="space-y-2">
                    {rounds.map((r, i) => (
                        <div key={r.id} className="kce-card p-3">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-bold text-ink">
                                    {tab === 'beer' ? '🍺' : '🥃'} {t('stats.drinkRound')} {i + 1}
                                    {r.variety ? ` · ${r.variety}` : ''}
                                </span>
                                <span className="text-xs text-muted">{fTime(r.client_timestamp)}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {r.participant_ids.map(pid => (
                                    <span key={pid} className="chip">{playerName(pid)}</span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Sheet>
    )
}



// ── Main page ───────────────────────────────────────────────────────────────

export function StatsPage() {
    const t = useT()
    const user = useAppStore(s => s.user)
    const activeEveningId = useAppStore(s => s.activeEveningId)
    const currentYear = new Date().getFullYear()
    const [tab, setTab] = useHashTab<'evening' | 'year' | 'lab'>('evening', ['evening', 'year', 'lab'])
    const [year, setYear] = useState(currentYear)
    const [memberSearch, setMemberSearch] = useState('')
    const [showAllMembers, setShowAllMembers] = useState(false)
    const [pickedId, setPickedId] = useState<number | null>(null)
    const [openCommentHighlightId, setOpenCommentHighlightId] = useState<number | null>(null)
    const [selectedPlayer, setSelectedPlayer] = useState<{player: YearPlayer; rank: number} | null>(null)
    const [eveningPlayerDetail, setEveningPlayerDetail] = useState<EveningPlayer | null>(null)

    const {data: eveningList = [], isLoading: eveningsLoading} = useEveningList()
    const sortedEvenings = [...eveningList].sort((a, b) => b.date.localeCompare(a.date))

    // Only show year chips for years that have at least one evening
    const yearsWithEvenings = [...new Set(eveningList.map(e => new Date(e.date).getFullYear()))].sort((a, b) => b - a)

    // Fallback chain: picked → active → latest closed
    const effectiveId = pickedId ?? activeEveningId ?? sortedEvenings[0]?.id ?? null

    const {data: selectedEvening} = useQuery({
        queryKey: ['evening', effectiveId],
        queryFn: () => api.getEvening(effectiveId!),
        enabled: !!effectiveId,
        staleTime: effectiveId === activeEveningId ? 1000 * 15 : 1000 * 60 * 5,
    })

    const evening = selectedEvening ?? null
    const eveningStats = evening ? computeEveningStats(evening, user?.regular_member_id, t) : null

    const {data: yearStats, isLoading: yearStatsLoading} = useQuery({
        queryKey: ['stats', year],
        queryFn: () => api.getYearStats(year),
        staleTime: 1000 * 60 * 5,
    })

    const {data: pins = []} = useQuery({
        queryKey: ['pins'],
        queryFn: api.listPins,
        staleTime: 1000 * 60 * 5,
    })

    const players = yearStats?.players ?? []
    const mq = memberSearch.trim().toLowerCase()
    const filteredPlayers = mq ? players.filter(p => (p.nickname || p.name).toLowerCase().includes(mq)) : players
    const maxPenalty = filteredPlayers[0]?.penalty_total ?? 1
    const displayPlayers = mq || showAllMembers ? filteredPlayers : filteredPlayers.slice(0, 5)

    const fDate = (dateStr: string) =>
        new Date(dateStr).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'})

    return (
        <>
        <div className="page-scroll px-3 py-3 pb-24">
            <div className="sec-heading">{t('stats.title')}</div>

            {/* ── Tab strip ── */}
            <div className="flex gap-1 mb-3">
                {(['evening', 'year', 'lab'] as const).map(tb => (
                    <button key={tb} type="button"
                            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === tb ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
                            onClick={() => setTab(tb)}>
                        {tb === 'evening' ? t('stats.evening') : tb === 'year' ? t('stats.year') : t('stats.tab.lab')}
                    </button>
                ))}
            </div>

            {tab === 'evening' && (
            <>
            {eveningsLoading && sortedEvenings.length === 0 ? (
                <SkeletonRows rows={4}/>
            ) : sortedEvenings.length === 0 ? (
                <Empty icon="🎳" text={t('stats.noData')}/>
            ) : (
                <>
                    {/* Evening picker */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 -mx-3 px-3" style={{scrollbarWidth: 'none'}}>
                        {sortedEvenings.map(e => {
                            const isActive = e.id === activeEveningId
                            const isSelected = e.id === effectiveId
                            return (
                                <button key={e.id} type="button"
                                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isSelected ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
                                        onClick={() => setPickedId(e.id)}>
                                    {isActive ? '🎳 ' : ''}{fDate(e.date)}{e.venue ? ` · ${e.venue}` : ''}
                                </button>
                            )
                        })}
                    </div>

                    {evening && eveningStats ? (
                        <>
                            <EveningDonutChart
                                evening={evening}
                                totalEuro={eveningStats.totalEuro}
                                penaltyCount={eveningStats.penaltyCount}
                                beerRounds={eveningStats.beerRounds}
                                shotRounds={eveningStats.shotRounds}
                                t={t}
                                onSelectPlayer={p => setEveningPlayerDetail(p)}
                            />

                            {eveningStats.hallOfFame.length > 0 && (
                                <>
                                    <div className="text-xs font-extrabold text-muted uppercase mb-2">{t('stats.hof')}</div>
                                    {eveningStats.hallOfFame.map((h, i) => (
                                        <div key={i} className="kce-card p-3 mb-2 flex items-center gap-3">
                                            <span className="text-2xl">{h.icon}</span>
                                            <div className="flex-1">
                                                <div className="text-xs font-bold text-muted">{h.label}</div>
                                                <div className="text-sm font-bold">{h.name}</div>
                                            </div>
                                            <div className="text-accent-fg font-bold text-sm">{h.value}</div>
                                        </div>
                                    ))}
                                </>
                            )}

                            <EveningTimeline evening={evening} t={t}/>

                            {evening.highlights.length > 0 && (
                                <>
                                    <div className="sec-heading text-sm mt-4">✨ {t('highlight.title').replace('✨ ', '')}</div>
                                    <div className="flex flex-col gap-2 mb-2">
                                        {[...evening.highlights].reverse().map(h => (
                                            <div key={h.id} id={`item-${h.id}`} className="kce-card p-3">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-base flex-shrink-0">✨</span>
                                                    <div className="flex-1 min-w-0">
                                                        {h.media_url && (
                                                            <img src={h.media_url} alt=""
                                                                 className="mt-1 rounded max-h-64 max-w-full object-contain border border-line/40"/>
                                                        )}
                                                        {h.text && <div className="text-sm mt-1">{h.text}</div>}
                                                    </div>
                                                </div>
                                                <ItemReactionBar
                                                    parentType="highlight" parentId={h.id}
                                                    commentOpen={openCommentHighlightId === h.id}
                                                    onCommentToggle={() => setOpenCommentHighlightId(openCommentHighlightId === h.id ? null : h.id)}
                                                />
                                                <CommentThread
                                                    parentType="highlight" parentId={h.id}
                                                    open={openCommentHighlightId === h.id}
                                                    onOpenChange={v => setOpenCommentHighlightId(v ? h.id : null)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            {evening.players.length > 0 && (
                                <>
                                    <div className="sec-heading text-sm mt-4">🃏 Spieler-Karten</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[...evening.players].sort((a, b) => {
                                            if (a.regular_member_id === user?.regular_member_id) return -1
                                            if (b.regular_member_id === user?.regular_member_id) return 1
                                            return 0
                                        }).map(p => {
                                            const rm = useAppStore.getState().regularMembers.find(m => m.id === p.regular_member_id)
                                            const pTotal = evening.penalty_log.filter(l => l.player_id === p.id).reduce((s, l) => s + (l.mode === 'euro' ? l.amount : (l.unit_amount != null ? l.amount * l.unit_amount : 0)), 0)
                                            const beerC = evening.drink_rounds.filter(r => r.drink_type === 'beer' && r.participant_ids.includes(p.id)).length
                                            const wins = evening.games.filter(g => g.winner_ref === `p:${p.id}` || (!!p.team_id && g.winner_ref === `t:${p.team_id}`)).length
                                            // Throw stats for this player across all games of the evening
                                            const playerThrows = evening.games.flatMap(g => g.throws ?? []).filter(th => th.player_id === p.id)
                                            const totalPins = playerThrows.reduce((s, th) => s + th.pins, 0)
                                            const throwCount = playerThrows.length
                                            const avgPins = throwCount > 0 ? (totalPins / throwCount).toFixed(1) : null
                                            // Heatmap: count per-pin hits across all throws with pin_states
                                            const throwsWithPins = playerThrows.filter(th => th.pin_states && th.pin_states.length === 9)
                                            const pinCounts = Array(9).fill(0)
                                            for (const th of throwsWithPins) for (let i = 0; i < 9; i++) if (th.pin_states[i]) pinCounts[i]++
                                            const maxPinCount = Math.max(...pinCounts, 1)
                                            const hasHeatmap = throwsWithPins.length > 0
                                            const PIN_POS: [number, number][] = [
                                                [0.50, 0.10],
                                                [0.30, 0.30], [0.70, 0.30],
                                                [0.10, 0.50], [0.50, 0.50], [0.90, 0.50],
                                                [0.30, 0.70], [0.70, 0.70],
                                                [0.50, 0.90],
                                            ]
                                            return (
                                                <button key={p.id} type="button" className="kce-card p-3 w-full text-left active:opacity-70 transition-opacity" onClick={() => setEveningPlayerDetail(p)}>
                                                    <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center font-display font-bold text-on-accent text-sm mb-2"
                                                         style={{background: 'linear-gradient(135deg,var(--accent-shade),var(--accent))', margin: '0 auto'}}>
                                                        {rm?.avatar
                                                            ? <img src={rm.avatar} alt="" className="w-full h-full object-cover"/>
                                                            : p.name[0].toUpperCase()
                                                        }
                                                    </div>
                                                    <div className="text-center text-xs font-bold mb-2 truncate flex items-center justify-center gap-1">
                                                        {p.is_king ? '👑 ' : ''}
                                                        {p.name}
                                                        <MemberBadges isMe={p.regular_member_id === user?.regular_member_id}
                                                                      pins={pins} memberId={p.regular_member_id}/>
                                                    </div>
                                                    <div className="flex justify-around text-center">
                                                        <div>
                                                            <div className="text-accent-fg font-bold text-sm">{wins}</div>
                                                            <div className="text-xs text-muted">{t('stats.wins')}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-danger-fg font-bold text-sm">{fe(pTotal)}</div>
                                                            <div className="text-xs text-muted">{t('stats.penalties')}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-accent-fg font-bold text-sm">🍺{beerC}</div>
                                                            <div className="text-xs text-muted">{t('stats.beer')}</div>
                                                        </div>
                                                    </div>
                                                    {throwCount > 0 && (
                                                        <div className="mt-2 pt-2" style={{borderTop: '1px solid var(--line)'}}>
                                                            <div className="flex justify-around text-center">
                                                                <div>
                                                                    <div className="text-ink font-bold text-sm">🎳{totalPins}</div>
                                                                    <div className="text-xs text-muted">{t('stats.totalPins')}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-ink font-bold text-sm">{throwCount}</div>
                                                                    <div className="text-xs text-muted">{t('stats.throwCount')}</div>
                                                                </div>
                                                                {avgPins !== null && (
                                                                    <div>
                                                                        <div className="text-ink font-bold text-sm">{avgPins}</div>
                                                                        <div className="text-xs text-muted">{t('stats.avgPins')}</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {hasHeatmap && (
                                                                <div className="mt-2">
                                                                    <div className="text-xs text-muted text-center mb-1">{t('stats.heatmap')}</div>
                                                                    <svg width="100" height="85" viewBox="0 0 80 68" style={{display: 'block', margin: '0 auto', overflow: 'visible'}}>
                                                                        {PIN_POS.map(([px, py], i) => {
                                                                            const ratio = pinCounts[i] / maxPinCount
                                                                            const cx = px * 80
                                                                            const cy = py * 68
                                                                            return (
                                                                                <g key={i}>
                                                                                    <circle
                                                                                        cx={cx} cy={cy} r="8"
                                                                                        fill={ratio === 0 ? 'var(--surface-2)' : `color-mix(in srgb, var(--accent) ${Math.round(ratio * 100)}%, var(--surface-2))`}
                                                                                        stroke={ratio > 0 ? 'var(--accent-fg)' : 'var(--line)'}
                                                                                        strokeWidth="1.5"
                                                                                    />
                                                                                    {pinCounts[i] > 0 && (
                                                                                        <text
                                                                                            x={cx} y={cy}
                                                                                            textAnchor="middle"
                                                                                            dominantBaseline="central"
                                                                                            fontSize="10"
                                                                                            fontWeight="bold"
                                                                                            fill="white"
                                                                                            stroke="rgba(0,0,0,0.55)"
                                                                                            strokeWidth="2.5"
                                                                                            paintOrder="stroke"
                                                                                        >
                                                                                            {pinCounts[i]}
                                                                                        </text>
                                                                                    )}
                                                                                </g>
                                                                            )
                                                                        })}
                                                                    </svg>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <SkeletonChart height="200px"/>
                    )}
                </>
            )}
            </>
            )}

            {/* Year picker — shared by the Jahr tab and the Statistik-Labor. */}
            {tab !== 'evening' && (
            <div className="flex items-center justify-end mb-2">
                <div className="flex gap-1">
                    {yearsWithEvenings.map(y => (
                        <button key={y} type="button"
                                className={`text-xs font-extrabold px-2.5 py-1 rounded-lg transition-all ${year === y ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
                                onClick={() => setYear(y)}>
                            {y}
                        </button>
                    ))}
                </div>
            </div>
            )}

            {tab === 'year' && (
            <>
            {/* ── Jahresrückblick ── */}
            {yearStatsLoading && !yearStats ? (
                <SkeletonRows rows={4}/>
            ) : !yearStats || yearStats.evening_count === 0 ? (
                <Empty icon="📅" text={`${t('stats.noYearData')} ${year}`}/>
            ) : (
                <>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                        <StatTile size="lg" value={String(yearStats.evening_count)} label={t('stats.evenings')}/>
                        <StatTile size="lg" value={fe(yearStats.total_penalties)} label={t('member.totalPenalties')}/>
                        <StatTile size="lg" value={`🍺 ${yearStats.total_beers}`} label={t('drinks.beer')}/>
                    </div>

                    <YearEveningsBarChart evenings={yearStats.evenings ?? []} t={t}/>

                    {!mq && players.length >= 3 && (
                        <YearPodium players={players} myMemberId={user?.regular_member_id} t={t} onSelect={(p, rank) => setSelectedPlayer({player: p, rank})}/>
                    )}

                    {!mq && (
                        <HallOfShame players={players} t={t} onSelect={(p, rank) => setSelectedPlayer({player: p, rank})}/>
                    )}

                    <div className="text-xs font-extrabold text-muted uppercase mb-2">{t('stats.yearPenalties')}</div>
                    <input
                        className="kce-input mb-3"
                        value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)}
                        placeholder={t('stats.memberSearch')}
                    />
                    {displayPlayers.map((p, i) => {
                        const rank = players.indexOf(p)
                        const isMe = p.regular_member_id != null && p.regular_member_id === user?.regular_member_id
                        const barWidth = maxPenalty > 0 ? (p.penalty_total / maxPenalty) * 100 : 0
                        const medals = ['🥇', '🥈', '🥉']
                        return (
                            <button
                                key={i}
                                type="button"
                                className={`kce-card p-3 mb-2 w-full text-left active:opacity-70 transition-opacity ${isMe ? 'ring-1 ring-accent/40' : ''}`}
                                onClick={() => setSelectedPlayer({player: p, rank})}
                            >
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="text-base w-6 text-center flex-shrink-0">
                                        {medals[rank] ??
                                            <span className="text-xs text-muted font-bold">{rank + 1}.</span>}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate flex items-center gap-1">
                                            {p.nickname || p.name}
                                            <MemberBadges isMe={isMe} pins={pins} memberId={p.regular_member_id}/>
                                        </div>
                                        <div className="text-xs text-muted">
                                            {p.evenings} {t('stats.evenings')} · {p.game_wins} {t('stats.wins')} · 🍺{p.beer_rounds}
                                        </div>
                                        {p.throw_count > 0 && (
                                            <div className="text-xs text-muted">
                                                🎳 Ø {p.avg_pins} · {p.throw_count} {t('stats.throwCount')}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-danger-fg font-bold text-sm flex-shrink-0">{fe(p.penalty_total)}</div>
                                </div>
                                <div className="h-1 rounded-full overflow-hidden"
                                     style={{background: 'var(--surface-2)'}}>
                                    <div className="h-full rounded-full transition-all"
                                         style={{
                                             width: `${barWidth}%`,
                                             background: isMe ? 'var(--accent)'
                                                 : i === 0 ? 'var(--danger-fg)' : i < 3 ? 'var(--accent-deep)' : 'var(--muted)'
                                         }}/>
                                </div>
                            </button>
                        )
                    })}

                    {!mq && filteredPlayers.length > 5 && (
                        <button type="button"
                                className="w-full text-xs text-muted py-2 font-bold"
                                onClick={() => setShowAllMembers(v => !v)}>
                            {showAllMembers ? t('stats.showLess') : `${t('stats.showAllMembers')} (${filteredPlayers.length})`}
                        </button>
                    )}
                </>
            )}
            </>
            )}

            {tab === 'lab' && (
                <StatsLab
                    year={year}
                    players={players}
                    evenings={sortedEvenings}
                    myMemberId={user?.regular_member_id}
                    onSelectYear={y => setYear(y)}
                    onSelectMember={mid => {
                        const idx = players.findIndex(p => p.regular_member_id === mid)
                        if (idx >= 0) setSelectedPlayer({player: players[idx], rank: idx})
                    }}
                />
            )}
        </div>

        {selectedPlayer && (
            <PlayerDetailSheet
                player={selectedPlayer.player}
                year={year}
                rank={selectedPlayer.rank}
                isMe={selectedPlayer.player.regular_member_id === user?.regular_member_id}
                t={t}
                onClose={() => setSelectedPlayer(null)}
            />
        )}
        {eveningPlayerDetail && evening && (
            <EveningPlayerDetailSheet
                player={eveningPlayerDetail}
                evening={evening}
                pins={pins}
                t={t}
                onClose={() => setEveningPlayerDetail(null)}
            />
        )}
        </>
    )
}

function computeEveningStats(evening: Evening, myMemberId: number | null | undefined, t: (k: TranslationKey) => string) {
    const totalEuro = evening.penalty_log.reduce((s, l) => s + (l.mode === 'euro' ? l.amount : (l.unit_amount != null ? l.amount * l.unit_amount : 0)), 0)
    const penaltyCount = evening.penalty_log.length
    const beerRounds = evening.drink_rounds.filter(r => r.drink_type === 'beer').reduce((s, r) => s + r.participant_ids.length, 0)
    const shotRounds = evening.drink_rounds.filter(r => r.drink_type === 'shots').reduce((s, r) => s + r.participant_ids.length, 0)

    const byPlayer = (fn: (pid: number) => number) =>
        [...evening.players].sort((a, b) => fn(b.id) - fn(a.id))[0]

    const strafenTotal = (pid: number) => evening.penalty_log.filter(l => l.player_id === pid).reduce((s, l) => s + (l.mode === 'euro' ? l.amount : (l.unit_amount != null ? l.amount * l.unit_amount : 0)), 0)
    const beerCount = (pid: number) => evening.drink_rounds.filter(r => r.drink_type === 'beer' && r.participant_ids.includes(pid)).length
    const shotCount = (pid: number) => evening.drink_rounds.filter(r => r.drink_type === 'shots' && r.participant_ids.includes(pid)).length
    const nullCount = (pid: number) => evening.penalty_log.filter(l => l.player_id === pid && l.penalty_type_name.toLowerCase().includes('null')).length

    const topStrafen = byPlayer(strafenTotal)
    const topBeer = byPlayer(beerCount)
    const topShots = byPlayer(shotCount)
    const topNull = byPlayer(nullCount)
    const cleanest = [...evening.players].sort((a, b) => strafenTotal(a.id) - strafenTotal(b.id))[0]

    // Spielkönig: count game wins per **member**. When a team wins, every member of that team scores a win.
    // Teams themselves can never be Spielkönig — the title is awarded to a person.
    const winsByPlayerId: Record<number, number> = {}
    evening.games.forEach(g => {
        if (!g.winner_ref) return
        if (g.winner_ref.startsWith('p:')) {
            const pid = Number(g.winner_ref.slice(2))
            if (Number.isFinite(pid)) winsByPlayerId[pid] = (winsByPlayerId[pid] || 0) + 1
        } else if (g.winner_ref.startsWith('t:')) {
            const tid = Number(g.winner_ref.slice(2))
            if (!Number.isFinite(tid)) return
            evening.players.filter(p => p.team_id === tid).forEach(p => {
                winsByPlayerId[p.id] = (winsByPlayerId[p.id] || 0) + 1
            })
        }
    })
    const topWinnerEntry = Object.entries(winsByPlayerId).sort((a, b) => b[1] - a[1])[0]
    const topWinnerPlayer = topWinnerEntry ? evening.players.find(p => p.id === Number(topWinnerEntry[0])) : null
    const topWinner: [string, number] | undefined = topWinnerPlayer
        ? [topWinnerPlayer.name, topWinnerEntry![1]]
        : undefined

    const hof = [
        topStrafen && strafenTotal(topStrafen.id) > 0 && {
            icon: '🤑',
            label: t('stats.penaltyKing'),
            name: topStrafen.name,
            value: fe(strafenTotal(topStrafen.id))
        },
        topNull && nullCount(topNull.id) > 0 && {
            icon: '🚫',
            label: t('stats.nullKing'),
            name: topNull.name,
            value: nullCount(topNull.id) + ' ' + t('stats.nulls')
        },
        topBeer && beerCount(topBeer.id) > 0 && {
            icon: '🍺',
            label: t('stats.beerChamp'),
            name: topBeer.name,
            value: beerCount(topBeer.id) + ' ' + t('stats.rounds')
        },
        topShots && shotCount(topShots.id) > 0 && {
            icon: '🥃',
            label: t('stats.shotNose'),
            name: topShots.name,
            value: shotCount(topShots.id) + ' ' + t('stats.rounds')
        },
        topWinner && {icon: '🏆', label: t('stats.gameKing'), name: topWinner[0], value: topWinner[1] + ' ' + t('stats.wins')},
        cleanest && strafenTotal(cleanest.id) === 0 && {
            icon: '😇',
            label: t('stats.cleanest'),
            name: cleanest.name,
            value: t('stats.noPenalty')
        },
    ].filter(Boolean) as { icon: string; label: string; name: string; value: string }[]

    return {totalEuro, penaltyCount, beerRounds, shotRounds, hallOfFame: hof}
}
