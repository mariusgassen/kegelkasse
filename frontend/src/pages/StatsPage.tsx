import {useEffect, useMemo, useState} from 'react'
import {useEveningList} from '../hooks/useEvening'
import {useQuery} from '@tanstack/react-query'
import {useAppStore} from '@/store/app'
import {api} from '../api/client'
import {useT, useI18n} from '@/i18n'
import type {TranslationKey} from '@/i18n/de'
import {Empty} from '@/components/ui/Empty.tsx'
import {ItemReactionBar} from '@/components/ui/ItemReactionBar.tsx'
import {CommentThread} from '@/components/ui/CommentThread.tsx'
import {Sheet} from '@/components/ui/Sheet.tsx'
import type {Evening, EveningPlayer, Game, PenaltyLogEntry} from '@/types.ts'
import type {CorrelationStats, EveningCorrelation} from '@/types.ts'
import {interpretR, linearRegression, pearson} from '@/lib/stats'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function feShort(v: number) {
    return '€' + v.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2})
}

// 20 distinct Tailwind colours — no amber (reserved for app primary / "me" highlight).
// Ordered for max visual spread across the first 8–10 slots (most clubs).
const PLAYER_COLORS = [
    '#22c55e', '#60a5fa', '#ec4899', '#a78bfa', '#34d399',
    '#14b8a6', '#f43f5e', '#f97316', '#84cc16', '#06b6d4',
    '#8b5cf6', '#d946ef', '#ef4444', '#0ea5e9', '#6366f1',
    '#10b981', '#a855f7', '#fb7185', '#4ade80', '#818cf8',
]
const playerColor = (index: number) => PLAYER_COLORS[index % PLAYER_COLORS.length]
// 13%-opacity tint: hex colors get '#rrggbb22', amber CSS variable gets rgba()
const withAlpha = (col: string) =>
    col.startsWith('#') ? col + '22' : 'rgba(232,160,32,0.13)'

// ── Cumulative chart ────────────────────────────────────────────────────────

type ChartEvent = { ts: number; delta: number; entry?: PenaltyLogEntry }
type ChartSeries = { id: number; name: string; color: string; events: ChartEvent[] }
type SelectedPoint = { seriesId: number; entryId: number }

const PAD = {top: 12, right: 12, bottom: 22, left: 38}
const VW = 400, VH = 140
const IW = VW - PAD.left - PAD.right
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

    const xS = (t: number) => PAD.left + ((t - tMin) / tSpan) * IW
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

    const yTicks = [0, 0.5, 1].map(f => ({v: f * maxVal, y: yS(f * maxVal)}))
    const fTime = (ms: number) =>
        new Date(ms).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})
    const xTicks = hasData
        ? [tMin, tMin + tSpan / 2, tMin + tSpan].map(t => ({label: fTime(t), x: xS(t)}))
        : []

    return (
        <div className="mb-1">
            <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider mb-1">{title}</div>
            <svg width="100%" viewBox={`0 0 ${VW} ${VH}`}
                 style={{overflow: 'visible', display: 'block'}}
                 onClick={onSelect ? () => onSelect(null) : undefined}>
                {/* Grid */}
                {yTicks.filter(t => t.v > 0).map((tick, i) => (
                    <line key={i} x1={PAD.left} y1={tick.y} x2={VW - PAD.right} y2={tick.y}
                          stroke="var(--kce-border)" strokeWidth="0.8" strokeDasharray="3,3"/>
                ))}
                {/* Y labels */}
                {yTicks.map((tick, i) => (
                    <text key={i} x={PAD.left - 5} y={tick.y + 3.5} textAnchor="end"
                          fontSize="9" fill="var(--kce-muted)">{yFormat(tick.v)}</text>
                ))}
                {/* X labels */}
                {xTicks.map((tick, i) => (
                    <text key={i} x={tick.x} y={VH - 4} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
                          fontSize="9" fill="var(--kce-muted)">{tick.label}</text>
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
                        return (
                            <g key={i}
                               style={interactive ? {cursor: 'pointer'} : undefined}
                               onClick={interactive ? (evt) => {
                                   evt.stopPropagation()
                                   onSelect!(isSelected ? null : {seriesId: s.id, entryId: e.entry!.id})
                               } : undefined}>
                                {interactive && (
                                    <circle cx={cx} cy={cy} r="9" fill="transparent"/>
                                )}
                                <circle cx={cx} cy={cy} r={isSelected ? 4.5 : 2.5}
                                        fill={s.color} stroke="var(--kce-bg)"
                                        strokeWidth={isSelected ? 1.5 : 1}
                                        style={{transition: 'r 0.12s'}}/>
                            </g>
                        )
                    })
                })}
                {/* Axes */}
                <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + IH}
                      stroke="var(--kce-border)" strokeWidth="1"/>
                <line x1={PAD.left} y1={PAD.top + IH} x2={VW - PAD.right} y2={PAD.top + IH}
                      stroke="var(--kce-border)" strokeWidth="1"/>
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
                            series={penaltySeries} yFormat={feShort} title="Strafen €"
                            selected={selectedPoint}
                            onSelect={setSelectedPoint}
                        />
                        {selectedDetail ? (
                            <div className="flex items-center gap-2 mb-2 px-1.5 py-1 rounded text-[11px]"
                                 style={{background: withAlpha(selectedDetail.color), borderLeft: `2px solid ${selectedDetail.color}`}}>
                                <span className="text-kce-muted flex-shrink-0">{selectedDetail.time}</span>
                                <span className="font-bold flex-shrink-0" style={{color: selectedDetail.color}}>{selectedDetail.player}</span>
                                <span className="text-kce-cream truncate flex-1">
                                    {selectedDetail.entry.icon ? `${selectedDetail.entry.icon} ` : ''}{selectedDetail.entry.penalty_type_name}
                                </span>
                                <span className="text-red-400 font-bold flex-shrink-0">{feShort(selectedDetail.amount)}</span>
                            </div>
                        ) : (
                            <div className="text-[9px] text-kce-muted/60 italic mb-2 px-1.5">
                                ☝️ {t('stats.tapPenaltyDot')}
                            </div>
                        )}
                    </>
                )}
                {anyDrinkTotal && (
                    <CumulativeChart series={drinkSeries} yFormat={v => `${Math.round(v)}`} title="Getränke"/>
                )}

                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-kce-border">
                    {activePlayers.map(p => (
                        <div key={p.id} className="flex items-center gap-1.5">
                            <div className="w-4 h-1.5 rounded-full" style={{background: colorOf(p.id)}}/>
                            <span className="text-[10px] text-kce-muted font-bold">{p.name}</span>
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
            <polyline points={polyline} fill="none" stroke="var(--kce-amber)" strokeWidth="2"
                      strokeLinejoin="round" strokeLinecap="round"/>
            {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="var(--kce-amber)">
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
                <StatBox value={fe(totalEuro)} label={t('stats.totalEuro')}/>
                <button type="button" className="kce-card p-3 text-center active:opacity-70 transition-opacity"
                        onClick={() => setTimelineOpen(true)}
                        disabled={penaltyCount === 0}>
                    <div className="font-display font-bold text-kce-amber text-xl leading-tight">{penaltyCount}</div>
                    <div className="text-[9px] text-kce-muted font-bold tracking-wider mt-0.5 uppercase">{t('stats.penalties')}</div>
                </button>
                <button type="button" className="kce-card p-3 text-center active:opacity-70 transition-opacity" onClick={() => setDrinkDetail('beer')}>
                    <div className="font-display font-bold text-kce-amber text-xl leading-tight">🍺 {beerRounds}</div>
                    <div className="text-[9px] text-kce-muted font-bold tracking-wider mt-0.5 uppercase">{t('drinks.beer')}</div>
                </button>
                <button type="button" className="kce-card p-3 text-center active:opacity-70 transition-opacity" onClick={() => setDrinkDetail('shots')}>
                    <div className="font-display font-bold text-kce-amber text-xl leading-tight">🥃 {shotRounds}</div>
                    <div className="text-[9px] text-kce-muted font-bold tracking-wider mt-0.5 uppercase">{t('drinks.shots')}</div>
                </button>
                {gameCount > 0 && (
                    <button type="button"
                            className="kce-card p-3 text-center active:opacity-70 transition-opacity col-span-2"
                            onClick={() => setGamesOpen(true)}>
                        <div className="font-display font-bold text-kce-amber text-xl leading-tight">🏆 {gameCountLabel}</div>
                        <div className="text-[9px] text-kce-muted font-bold tracking-wider mt-0.5 uppercase">{t('stats.games')}</div>
                    </button>
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
                <div style={{flexShrink: 0, width: 120}}>
                    <svg width="120" height="120" viewBox="0 0 200 200"
                         onClick={() => setSelectedId(null)}
                         style={{cursor: 'default'}}>
                        <circle cx={CX} cy={CY} r={R} fill="none"
                                stroke="var(--kce-surface2)" strokeWidth={SW}/>
                        {segments.map(seg => {
                            const isSelected = selectedId === seg.id
                            const dimmed = selectedId !== null && !isSelected
                            return (
                                <circle key={seg.id}
                                        cx={CX} cy={CY} r={R}
                                        fill="none"
                                        stroke={seg.color}
                                        strokeWidth={isSelected ? SW + 6 : SW}
                                        strokeDasharray={`${seg.arcLen} ${CIRC}`}
                                        strokeDashoffset={0}
                                        transform={`rotate(${seg.rotation}, ${CX}, ${CY})`}
                                        strokeLinecap="butt"
                                        opacity={dimmed ? 0.35 : 1}
                                        style={{transition: 'opacity 0.15s, stroke-width 0.15s', cursor: 'pointer'}}
                                        onClick={e => { e.stopPropagation(); setSelectedId(isSelected ? null : seg.id) }}/>
                            )
                        })}
                        {selected ? (
                            <>
                                <text x={CX} y={CY - 8} textAnchor="middle" fontSize="12"
                                      fill={selected.color} fontWeight="bold">
                                    {feShort(selected.total)}
                                </text>
                                <text x={CX} y={CY + 8} textAnchor="middle" fontSize="9"
                                      fill="var(--kce-cream)">
                                    {selected.name.length > 10 ? selected.name.slice(0, 9) + '…' : selected.name}
                                </text>
                            </>
                        ) : (
                            <>
                                <text x={CX} y={CY - 8} textAnchor="middle" fontSize="13"
                                      fill="var(--kce-cream)" fontWeight="bold">
                                    {feShort(visibleTotal)}
                                </text>
                                <text x={CX} y={CY + 8} textAnchor="middle" fontSize="10"
                                      fill="var(--kce-muted)">
                                    {penaltyCount} {t('stats.penalties')}
                                </text>
                                <text x={CX} y={CY + 22} textAnchor="middle" fontSize="9"
                                      fill="var(--kce-muted)">{t('stats.totalEuro')}</text>
                            </>
                        )}
                    </svg>
                </div>
                <div className="flex flex-col gap-2 flex-1">
                    <button type="button" className="kce-card p-2 text-center active:opacity-70 transition-opacity" onClick={() => setDrinkDetail('beer')}>
                        <div className="font-display font-bold text-kce-amber text-lg leading-tight">🍺 {beerRounds}</div>
                        <div className="text-[9px] text-kce-muted font-bold tracking-wider mt-0.5 uppercase">{t('drinks.beer')}</div>
                    </button>
                    <button type="button" className="kce-card p-2 text-center active:opacity-70 transition-opacity" onClick={() => setDrinkDetail('shots')}>
                        <div className="font-display font-bold text-kce-amber text-lg leading-tight">🥃 {shotRounds}</div>
                        <div className="text-[9px] text-kce-muted font-bold tracking-wider mt-0.5 uppercase">{t('drinks.shots')}</div>
                    </button>
                    {gameCount > 0 && (
                        <button type="button" className="kce-card p-2 text-center active:opacity-70 transition-opacity"
                                onClick={() => setGamesOpen(true)}>
                            <div className="font-display font-bold text-kce-amber text-lg leading-tight">🏆 {gameCountLabel}</div>
                            <div className="text-[9px] text-kce-muted font-bold tracking-wider mt-0.5 uppercase">{t('stats.games')}</div>
                        </button>
                    )}
                </div>
            </div>
            <div className="kce-card p-2">
                <div className="flex items-center justify-between mb-1.5 gap-2">
                    <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider">
                        {t('stats.penaltyDistribution')}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {hasAbsent && (
                            <button type="button"
                                    className="chip text-[9px]"
                                    style={showAbsent ? {borderColor: 'var(--kce-amber)', color: 'var(--kce-amber)', background: 'color-mix(in srgb, var(--kce-amber) 15%, transparent)'} : {borderColor: 'var(--kce-border)', color: 'var(--kce-muted)', opacity: 0.6}}
                                    onClick={() => { setShowAbsent(v => !v); setSelectedId(null) }}>
                                🏠 {t('stats.toggleAbsent')}
                            </button>
                        )}
                        <button type="button"
                                className="chip text-[9px]"
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
                                    <span className="text-[11px] text-kce-cream truncate">{seg.name}</span>
                                    {seg.id.startsWith('r:') && (
                                        <span className="text-[9px] text-kce-muted">🏠</span>
                                    )}
                                </div>
                                <span className="text-[11px] font-bold flex-shrink-0"
                                      style={{color: isSelected ? seg.color : 'var(--kce-amber)'}}>
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
        if (g.status === 'finished') return {text: t('stats.gameStatusFinished'), color: 'var(--kce-amber)'}
        if (g.status === 'running') return {text: t('stats.gameStatusRunning'), color: '#22c55e'}
        return {text: t('stats.gameStatusOpen'), color: 'var(--kce-muted)'}
    }

    return (
        <Sheet open onClose={onClose} title={t('stats.gamesDetail')}>
            {games.length === 0 ? (
                <div className="text-sm text-kce-muted text-center py-4">{t('stats.noGames')}</div>
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
                                    <div className="font-bold text-kce-cream text-sm flex items-center gap-1 min-w-0">
                                        {g.is_opener && <span title="Eröffnungsspiel">👑</span>}
                                        <span className="truncate">{g.name}</span>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0"
                                          style={{color: status.color}}>
                                        {status.text}
                                    </span>
                                </div>

                                {g.winner_name && (
                                    <div className="text-xs text-kce-amber font-bold mb-1.5">
                                        🏆 {g.winner_name}
                                    </div>
                                )}

                                {(startedAt || finishedAt) && (
                                    <div className="text-[10px] text-kce-muted mb-1.5">
                                        {startedAt && <>⏱ {startedAt}</>}
                                        {startedAt && finishedAt && ' · '}
                                        {finishedAt && <>🏁 {finishedAt}</>}
                                    </div>
                                )}

                                {scoreEntries.length > 0 && (
                                    <div className="mb-1.5">
                                        <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider mb-1">
                                            {t('stats.scores')}
                                        </div>
                                        <div className="space-y-0.5">
                                            {scoreEntries.map(s => (
                                                <div key={s.ref} className="flex items-center justify-between text-xs">
                                                    <span className={s.isWinner ? 'text-kce-amber font-bold' : 'text-kce-cream'}>
                                                        {s.isWinner ? '🏆 ' : ''}{s.label}
                                                    </span>
                                                    <span className={s.isWinner ? 'text-kce-amber font-bold' : 'text-kce-muted'}>
                                                        {s.score}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {throwCount > 0 && (
                                    <div className="flex justify-around text-center pt-1.5 border-t border-kce-border">
                                        <div>
                                            <div className="font-bold text-kce-cream text-xs">{totalPins}</div>
                                            <div className="text-[9px] text-kce-muted">{t('stats.totalPins')}</div>
                                        </div>
                                        <div>
                                            <div className="font-bold text-kce-cream text-xs">{throwCount}</div>
                                            <div className="text-[9px] text-kce-muted">{t('stats.throwCount')}</div>
                                        </div>
                                        {avgPins !== null && (
                                            <div>
                                                <div className="font-bold text-kce-amber text-xs">{avgPins}</div>
                                                <div className="text-[9px] text-kce-muted">{t('stats.avgPins')}</div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {g.note && (
                                    <div className="text-[11px] text-kce-muted mt-1.5 italic">
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
                <div className="text-sm text-kce-muted text-center py-4">{t('stats.noPenalties')}</div>
            ) : (
                <div className="space-y-1.5">
                    {entries.map(l => {
                        const amount = l.mode === 'euro' ? l.amount : (l.unit_amount != null ? l.amount * l.unit_amount : 0)
                        const player = l.player_id != null ? evening.players.find(p => p.id === l.player_id) : null
                        const displayName = player ? (player.nickname || player.name) : l.player_name
                        return (
                            <div key={l.id} className="flex items-center gap-2 text-xs">
                                <span className="text-kce-muted flex-shrink-0 tabular-nums">{fTime(l.client_timestamp)}</span>
                                <span className="text-kce-cream truncate flex-1">
                                    {l.icon ? `${l.icon} ` : ''}{l.penalty_type_name}
                                </span>
                                {player ? (
                                    <button type="button"
                                            className="chip text-[10px] flex-shrink-0"
                                            onClick={() => onSelectPlayer(player)}>
                                        {player.is_king ? '👑 ' : ''}{displayName}
                                    </button>
                                ) : (
                                    <span className="chip text-[10px] flex-shrink-0"
                                          style={{opacity: 0.7, cursor: 'default'}}>
                                        🏠 {displayName}
                                    </span>
                                )}
                                <span className="text-red-400 font-bold flex-shrink-0 tabular-nums">{feShort(amount)}</span>
                            </div>
                        )
                    })}
                </div>
            )}
        </Sheet>
    )
}

// ── Year evenings bar chart ─────────────────────────────────────────────────

function YearEveningsBarChart({eveningList, year, t}: {
    eveningList: {id: number; date: string; venue: string | null; penalty_total: number}[]
    year: number
    t: (k: any) => string
}) {
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

    const bars = [...eveningList]
        .filter(e => new Date(e.date).getFullYear() === year)
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
                <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider flex-shrink-0">
                    {t('stats.eveningBars')}
                </div>
                {selected ? (
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-kce-amber flex-shrink-0">
                            {feShort(selected.penalty_total ?? 0)}
                        </span>
                        <span className="text-[10px] text-kce-muted truncate">
                            {fLongDate(selected.date)}{selected.venue ? ` · ${selected.venue}` : ''}
                        </span>
                    </div>
                ) : (
                    <span className="text-[10px] text-kce-muted/50 italic">
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
                                  fill="var(--kce-amber)"
                                  opacity={dimmed ? 0.28 : isSelected ? 1 : 0.78}
                                  style={{transition: 'opacity 0.12s'}}/>
                            {showLabel && (
                                <text x={labelX} y={VH - 6} textAnchor="middle"
                                      fontSize="10"
                                      fontWeight={isSelected ? 'bold' : 'normal'}
                                      fill={isSelected ? 'var(--kce-amber)' : 'var(--kce-muted)'}>
                                    {fShortDate(bar.date)}
                                </text>
                            )}
                        </g>
                    )
                })}
                <line x1={PAD_H} y1={PAD_T + IH} x2={VW - PAD_H} y2={PAD_T + IH}
                      stroke="var(--kce-border)" strokeWidth="1"/>
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
        {rank: 0, displayOrder: 2, height: 80, avatarSize: 48, gradient: 'linear-gradient(135deg,#c4701a,#e8a020)', label: '🥇', borderColor: '#e8a020'},
        {rank: 2, displayOrder: 3, height: 52, avatarSize: 36, gradient: 'linear-gradient(135deg,#78450c,#cd7f32)', label: '🥉', borderColor: '#cd7f32'},
    ]

    return (
        <div className="kce-card p-3 mb-4">
            <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider mb-3">
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
                                color: 'var(--kce-bg)', flexShrink: 0,
                            }}>
                                {rm?.avatar
                                    ? <img src={rm.avatar} alt="" style={{width: '100%', height: '100%', objectFit: 'cover'}}/>
                                    : displayName[0].toUpperCase()
                                }
                            </div>
                            <div style={{textAlign: 'center', maxWidth: 88}}>
                                <div style={{fontSize: 11, fontWeight: 'bold', color: 'var(--kce-cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                    {displayName}
                                </div>
                                {isMe && <span className="text-[9px] text-kce-amber font-bold">Ich</span>}
                            </div>
                            <div style={{fontSize: 10, color: '#f87171', fontWeight: 'bold'}}>
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

// ── Throw performance components ────────────────────────────────────────────

function PlayerThrowDetail({memberId, year, t}: { memberId: number; year: number; t: (k: any) => string }) {
    const {data, isLoading} = useQuery({
        queryKey: ['member-throw-stats', memberId, year],
        queryFn: () => api.getMemberThrowStats(memberId, year),
        staleTime: 1000 * 60 * 5,
    })
    if (isLoading) return <div className="text-xs text-kce-muted py-2 text-center">{t('action.loading')}</div>
    if (!data || data.throw_count === 0) return <div className="text-xs text-kce-muted py-2 text-center">{t('stats.noThrowData')}</div>
    return (
        <div className="mt-2 pt-2" style={{borderTop: '1px solid var(--kce-border)'}}>
            <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider mb-1">{t('stats.throwStats')}</div>
            <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="text-center">
                    <div className="font-bold text-kce-cream text-sm">{data.avg_pins ?? '—'}</div>
                    <div className="text-[9px] text-kce-muted">{t('stats.avgPins')}</div>
                </div>
                <div className="text-center">
                    <div className="font-bold text-green-400 text-sm">{data.best_avg ?? '—'}</div>
                    <div className="text-[9px] text-kce-muted">{t('profile.bestAvg')}</div>
                </div>
                <div className="text-center">
                    <div className="font-bold text-red-400 text-sm">{data.worst_avg ?? '—'}</div>
                    <div className="text-[9px] text-kce-muted">{t('profile.worstAvg')}</div>
                </div>
            </div>
            {data.evenings.length > 1 && (
                <div className="mb-2">
                    <div className="text-[9px] text-kce-muted mb-1">{t('stats.throwTrend')}</div>
                    <ThrowTrendSmall evenings={data.evenings}/>
                </div>
            )}
            <div className="space-y-0.5">
                {data.evenings.map(e => (
                    <div key={e.evening_id} className="flex items-center justify-between text-[10px]">
                        <span className="text-kce-muted">
                            {new Date(e.date).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'})}
                            {e.location ? ` · ${e.location}` : ''}
                        </span>
                        <span className="font-bold text-kce-cream">Ø {e.avg_pins} ({e.throw_count} {t('stats.throwCount')})</span>
                    </div>
                ))}
            </div>
            <div className="text-[9px] text-kce-muted text-right mt-1">
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
    const medals = ['🥇', '🥈', '🥉']
    const rm = useAppStore.getState().regularMembers.find(m => m.id === player.regular_member_id)
    const displayName = player.nickname || player.name

    return (
        <Sheet open onClose={onClose} title={t('stats.playerDetail')}>
            {/* Player header */}
            <div className="flex items-center gap-3 mb-5">
                <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center font-display font-bold text-kce-bg text-lg flex-shrink-0"
                     style={{background: 'linear-gradient(135deg,#c4701a,#e8a020)'}}>
                    {rm?.avatar
                        ? <img src={rm.avatar} alt="" className="w-full h-full object-cover"/>
                        : displayName[0].toUpperCase()
                    }
                </div>
                <div className="min-w-0">
                    <div className="font-bold text-kce-cream text-base flex items-center gap-1.5 flex-wrap">
                        <span className="text-xl">{medals[rank] ?? `${rank + 1}.`}</span>
                        <span className="truncate">{displayName}</span>
                        {isMe && <span className="text-[9px] text-kce-amber font-bold">Ich</span>}
                    </div>
                    <div className="text-xs text-kce-muted">{year}</div>
                </div>
            </div>

            {/* Year stats grid */}
            <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="kce-card p-3 text-center">
                    <div className="font-display font-bold text-red-400 text-lg leading-tight">
                        {player.penalty_total.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})}
                    </div>
                    <div className="text-[9px] text-kce-muted uppercase tracking-wider mt-0.5">{t('member.totalPenalties')}</div>
                </div>
                <div className="kce-card p-3 text-center">
                    <div className="font-display font-bold text-kce-cream text-lg leading-tight">{player.evenings}</div>
                    <div className="text-[9px] text-kce-muted uppercase tracking-wider mt-0.5">{t('stats.evenings')}</div>
                </div>
                <div className="kce-card p-3 text-center">
                    <div className="font-display font-bold text-kce-amber text-lg leading-tight">{player.game_wins}</div>
                    <div className="text-[9px] text-kce-muted uppercase tracking-wider mt-0.5">{t('stats.wins')}</div>
                </div>
                <div className="kce-card p-3 text-center">
                    <div className="font-display font-bold text-kce-cream text-lg leading-tight">🍺 {player.beer_rounds}</div>
                    <div className="text-[9px] text-kce-muted uppercase tracking-wider mt-0.5">{t('stats.beer')}</div>
                </div>
                <div className="kce-card p-3 text-center">
                    <div className="font-display font-bold text-kce-cream text-lg leading-tight">🥃 {player.shot_rounds}</div>
                    <div className="text-[9px] text-kce-muted uppercase tracking-wider mt-0.5">{t('stats.shotRounds')}</div>
                </div>
                <div className="kce-card p-3 text-center">
                    <div className="font-display font-bold text-kce-muted text-lg leading-tight">{player.penalty_count}</div>
                    <div className="text-[9px] text-kce-muted uppercase tracking-wider mt-0.5">{t('stats.penalties')}</div>
                </div>
            </div>

            {/* Throw performance */}
            {player.regular_member_id != null && (
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
                <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center font-display font-bold text-kce-bg text-lg flex-shrink-0"
                     style={{background: 'linear-gradient(135deg,#c4701a,#e8a020)'}}>
                    {rm?.avatar
                        ? <img src={rm.avatar} alt="" className="w-full h-full object-cover"/>
                        : displayName[0].toUpperCase()
                    }
                </div>
                <div className="min-w-0">
                    <div className="font-bold text-kce-cream text-base flex items-center gap-1.5 flex-wrap">
                        {player.is_king && <span>👑</span>}
                        <span className="truncate">{displayName}</span>
                        {isMe && <span className="text-[9px] text-kce-amber font-bold flex-shrink-0">Ich</span>}
                        {pins.filter((pin: any) => pin.holder_regular_member_id === player.regular_member_id).map((pin: any) => (
                            <span key={pin.id} title={pin.name}>{pin.icon}</span>
                        ))}
                    </div>
                    <div className="text-xs text-kce-muted">{new Date(evening.date).toLocaleDateString(locale, {weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'})}</div>
                </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="kce-card p-3 text-center">
                    <div className="font-display font-bold text-red-400 text-lg leading-tight">{fe(penaltyTotal)}</div>
                    <div className="text-[9px] text-kce-muted uppercase tracking-wider mt-0.5">{t('stats.penalties')}</div>
                </div>
                <div className="kce-card p-3 text-center">
                    <div className="font-display font-bold text-kce-amber text-lg leading-tight">{wins}</div>
                    <div className="text-[9px] text-kce-muted uppercase tracking-wider mt-0.5">{t('stats.wins')}</div>
                </div>
                <div className="kce-card p-3 text-center">
                    <div className="font-display font-bold text-kce-cream text-base leading-tight">🍺{beerRoundsPlayer.length} · 🥃{shotRoundsPlayer.length}</div>
                    <div className="text-[9px] text-kce-muted uppercase tracking-wider mt-0.5">{t('drinks.title')}</div>
                </div>
            </div>

            {/* Penalty breakdown */}
            <div className="kce-card p-3 mb-3">
                <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider mb-2">{t('stats.penaltyBreakdown')}</div>
                {penalties.length === 0 ? (
                    <div className="text-xs text-kce-muted text-center py-1">{t('stats.noPenalties')}</div>
                ) : (
                    <div className="space-y-1.5">
                        {penalties.map(l => {
                            const amount = l.mode === 'euro' ? l.amount : (l.unit_amount != null ? l.amount * l.unit_amount : 0)
                            return (
                                <div key={l.id} className="flex items-center gap-2 text-xs">
                                    <span className="text-kce-muted flex-shrink-0">{fTime(l.client_timestamp)}</span>
                                    <span className="text-kce-cream truncate flex-1">{l.icon ? `${l.icon} ` : ''}{l.penalty_type_name}</span>
                                    <span className="text-red-400 font-bold flex-shrink-0">{feShort(amount)}</span>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Games */}
            {gamesWithPlayer.length > 0 && (
                <div className="kce-card p-3 mb-3">
                    <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider mb-2">{t('stats.gameResults')}</div>
                    <div className="space-y-1.5">
                        {gamesWithPlayer.map(g => {
                            const won = g.winner_ref === `p:${player.id}` || (!!player.team_id && g.winner_ref === `t:${player.team_id}`)
                            const gameThrows = (g.throws ?? []).filter(th => th.player_id === player.id)
                            const gamePins = gameThrows.reduce((s, th) => s + th.pins, 0)
                            return (
                                <div key={g.id} className="flex items-center justify-between gap-2 text-xs">
                                    <span className={won ? 'text-kce-amber font-bold' : 'text-kce-cream'}>
                                        {won ? '🏆 ' : ''}{g.name}
                                    </span>
                                    {gameThrows.length > 0 && (
                                        <span className="text-kce-muted flex-shrink-0">
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
                    <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider mb-2">{t('stats.drinkRoundsDetail')}</div>
                    <div className="space-y-1">
                        {beerRoundsPlayer.map((r, i) => (
                            <div key={r.id} className="flex items-center justify-between text-xs">
                                <span className="text-kce-cream">🍺 {t('drinks.beer')} {t('stats.drinkRound')} {i + 1}</span>
                                <span className="text-kce-muted">{fTime(r.client_timestamp)}</span>
                            </div>
                        ))}
                        {shotRoundsPlayer.map((r, i) => (
                            <div key={r.id} className="flex items-center justify-between text-xs">
                                <span className="text-kce-cream">🥃 {t('drinks.shots')} {t('stats.drinkRound')} {i + 1}</span>
                                <span className="text-kce-muted">{fTime(r.client_timestamp)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Throw stats + heatmap */}
            {throwCount > 0 && (
                <div className="kce-card p-3">
                    <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider mb-2">{t('stats.throwStats')}</div>
                    <div className="flex justify-around text-center mb-3">
                        <div>
                            <div className="font-bold text-kce-cream text-sm">{totalPins}</div>
                            <div className="text-[9px] text-kce-muted">{t('stats.totalPins')}</div>
                        </div>
                        <div>
                            <div className="font-bold text-kce-cream text-sm">{throwCount}</div>
                            <div className="text-[9px] text-kce-muted">{t('stats.throwCount')}</div>
                        </div>
                        {avgPins !== null && (
                            <div>
                                <div className="font-bold text-kce-amber text-sm">{avgPins}</div>
                                <div className="text-[9px] text-kce-muted">{t('stats.avgPins')}</div>
                            </div>
                        )}
                    </div>
                    {hasHeatmap && (
                        <>
                            <div className="text-[9px] text-kce-muted text-center mb-2">{t('stats.heatmap')}</div>
                            <svg width="120" height="100" viewBox="0 0 120 100" style={{display: 'block', margin: '0 auto', overflow: 'visible'}}>
                                {PIN_POS.map(([px, py], i) => {
                                    const ratio = pinCounts[i] / maxPinCount
                                    const cx = px * 120
                                    const cy = py * 100
                                    return (
                                        <g key={i}>
                                            <circle
                                                cx={cx} cy={cy} r="11"
                                                fill={ratio === 0 ? 'var(--kce-surface2)' : `color-mix(in srgb, var(--kce-amber) ${Math.round(ratio * 100)}%, var(--kce-surface2))`}
                                                stroke={ratio > 0 ? 'var(--kce-amber)' : 'var(--kce-border)'}
                                                strokeWidth="1.5"
                                            />
                                            {pinCounts[i] > 0 && (
                                                <text
                                                    x={cx} y={cy}
                                                    textAnchor="middle"
                                                    dominantBaseline="central"
                                                    fontSize="8"
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
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${tab === 'beer' ? 'bg-kce-amber/20 text-kce-amber border-kce-amber/40' : 'bg-kce-surface2 text-kce-muted border-kce-border'}`}
                    onClick={() => setTab('beer')}>
                    🍺 {t('drinks.beer')} ({beerRounds.length})
                </button>
                <button
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${tab === 'shots' ? 'bg-kce-amber/20 text-kce-amber border-kce-amber/40' : 'bg-kce-surface2 text-kce-muted border-kce-border'}`}
                    onClick={() => setTab('shots')}>
                    🥃 {t('drinks.shots')} ({shotRounds.length})
                </button>
            </div>
            {rounds.length === 0 ? (
                <div className="text-sm text-kce-muted text-center py-4">{t('drinks.noRounds')}</div>
            ) : (
                <div className="space-y-2">
                    {rounds.map((r, i) => (
                        <div key={r.id} className="kce-card p-3">
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-bold text-kce-cream">
                                    {tab === 'beer' ? '🍺' : '🥃'} {t('stats.drinkRound')} {i + 1}
                                    {r.variety ? ` · ${r.variety}` : ''}
                                </span>
                                <span className="text-[10px] text-kce-muted">{fTime(r.client_timestamp)}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {r.participant_ids.map(pid => (
                                    <span key={pid} className="chip text-[10px]">{playerName(pid)}</span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Sheet>
    )
}

// ── Correlation section ─────────────────────────────────────────────────────

type CorrTab = 'evening' | 'member' | 'strength'

function rColor(r: number | null): string {
    if (r === null) return 'var(--kce-muted)'
    const a = Math.abs(r)
    if (a < 0.2) return 'var(--kce-muted)'
    if (r > 0) return a >= 0.5 ? '#22c55e' : '#4ade80'
    return a >= 0.5 ? '#ef4444' : '#f87171'
}

function rBadge(r: number | null, t: (k: TranslationKey) => string): { label: string; color: string } {
    if (r === null) return {label: t('stats.correlation.none'), color: rColor(null)}
    const cat = interpretR(r)
    if (cat === 'strong') return {label: t('stats.correlation.strong'), color: rColor(r)}
    if (cat === 'moderate') return {label: t('stats.correlation.moderate'), color: rColor(r)}
    return {label: t('stats.correlation.weak'), color: rColor(r)}
}

const SC_VW = 320, SC_VH = 220
const SC_PAD = {top: 12, right: 12, bottom: 30, left: 38}
const SC_IW = SC_VW - SC_PAD.left - SC_PAD.right
const SC_IH = SC_VH - SC_PAD.top - SC_PAD.bottom

interface ScatterPoint {
    x: number
    y: number
    label?: string
    color?: string
    size?: number
}

function ScatterChart({points, xLabel, yLabel, trendLine = false, selectedIndex, onSelect}: {
    points: ScatterPoint[]
    xLabel: string
    yLabel: string
    trendLine?: boolean
    selectedIndex?: number | null
    onSelect?: (idx: number) => void
}) {
    if (points.length === 0) return null
    const xs = points.map(p => p.x)
    const ys = points.map(p => p.y)
    const xMin = Math.min(...xs, 0)
    const xMax = Math.max(...xs, xMin + 1)
    const yMin = Math.min(...ys, 0)
    const yMax = Math.max(...ys, yMin + 1)
    const xRange = xMax - xMin || 1
    const yRange = yMax - yMin || 1
    const xS = (v: number) => SC_PAD.left + ((v - xMin) / xRange) * SC_IW
    const yS = (v: number) => SC_PAD.top + SC_IH - ((v - yMin) / yRange) * SC_IH

    const reg = trendLine && points.length >= 2
        ? linearRegression(points.map(p => ({x: p.x, y: p.y})))
        : null

    const xTicks = [0, 0.5, 1].map(f => xMin + f * xRange)
    const yTicks = [0, 0.5, 1].map(f => yMin + f * yRange)

    return (
        <svg viewBox={`0 0 ${SC_VW} ${SC_VH}`} className="w-full" style={{maxHeight: 260}}>
            {/* axes */}
            <line x1={SC_PAD.left} y1={SC_PAD.top} x2={SC_PAD.left} y2={SC_PAD.top + SC_IH}
                  stroke="var(--kce-border)" strokeWidth={1}/>
            <line x1={SC_PAD.left} y1={SC_PAD.top + SC_IH} x2={SC_PAD.left + SC_IW} y2={SC_PAD.top + SC_IH}
                  stroke="var(--kce-border)" strokeWidth={1}/>
            {/* y ticks */}
            {yTicks.map((tv, i) => (
                <g key={`y${i}`}>
                    <line x1={SC_PAD.left - 3} x2={SC_PAD.left} y1={yS(tv)} y2={yS(tv)}
                          stroke="var(--kce-border)"/>
                    <text x={SC_PAD.left - 5} y={yS(tv) + 3} textAnchor="end"
                          fontSize={9} fill="var(--kce-muted)">{tv.toFixed(yRange < 5 ? 1 : 0)}</text>
                </g>
            ))}
            {/* x ticks */}
            {xTicks.map((tv, i) => (
                <g key={`x${i}`}>
                    <line x1={xS(tv)} x2={xS(tv)} y1={SC_PAD.top + SC_IH} y2={SC_PAD.top + SC_IH + 3}
                          stroke="var(--kce-border)"/>
                    <text x={xS(tv)} y={SC_PAD.top + SC_IH + 12} textAnchor="middle"
                          fontSize={9} fill="var(--kce-muted)">{tv.toFixed(xRange < 5 ? 1 : 0)}</text>
                </g>
            ))}
            {/* trend line */}
            {reg && (
                <line
                    x1={xS(xMin)} y1={yS(reg.slope * xMin + reg.intercept)}
                    x2={xS(xMax)} y2={yS(reg.slope * xMax + reg.intercept)}
                    stroke="var(--kce-amber)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7}
                />
            )}
            {/* dots */}
            {points.map((p, i) => {
                const r = p.size ?? 4
                const isSelected = selectedIndex === i
                return (
                    <circle
                        key={i}
                        cx={xS(p.x)} cy={yS(p.y)} r={isSelected ? r + 2 : r}
                        fill={p.color ?? 'var(--kce-amber)'}
                        stroke={isSelected ? 'var(--kce-cream)' : 'none'}
                        strokeWidth={isSelected ? 1.5 : 0}
                        style={{cursor: onSelect ? 'pointer' : 'default'}}
                        onClick={onSelect ? () => onSelect(i) : undefined}
                    />
                )
            })}
            <text x={SC_VW - 4} y={SC_VH - 4} textAnchor="end" fontSize={9}
                  fill="var(--kce-muted)">{xLabel}</text>
            <text x={4} y={SC_PAD.top - 2} textAnchor="start" fontSize={9}
                  fill="var(--kce-muted)">{yLabel}</text>
        </svg>
    )
}

function DualAxisLineChart({bins, leftLabel, rightLabel, xFormat}: {
    bins: { t: string; cum_penalty: number; cum_drinks: number; delta_penalty?: number; delta_drinks?: number }[]
    leftLabel: string
    rightLabel: string
    xFormat?: (iso: string) => string
}) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null)
    if (bins.length === 0) return null
    const maxP = Math.max(1, ...bins.map(b => b.cum_penalty))
    const maxD = Math.max(1, ...bins.map(b => b.cum_drinks))
    const n = bins.length
    const xS = (i: number) => SC_PAD.left + (n === 1 ? SC_IW / 2 : (i / (n - 1)) * SC_IW)
    const yPenalty = (v: number) => SC_PAD.top + SC_IH - (v / maxP) * SC_IH
    const yDrinks = (v: number) => SC_PAD.top + SC_IH - (v / maxD) * SC_IH

    const pathP = bins.map((b, i) => `${i === 0 ? 'M' : 'L'} ${xS(i)} ${yPenalty(b.cum_penalty)}`).join(' ')
    const pathD = bins.map((b, i) => `${i === 0 ? 'M' : 'L'} ${xS(i)} ${yDrinks(b.cum_drinks)}`).join(' ')

    const fmtX = xFormat ?? ((iso: string) => {
        try {
            return new Date(iso).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
        } catch {
            return ''
        }
    })
    const tickIdx = n <= 6 ? bins.map((_, i) => i) : [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor(3 * n / 4), n - 1]

    return (
        <div>
            <svg viewBox={`0 0 ${SC_VW} ${SC_VH}`} className="w-full" style={{maxHeight: 260}}>
                {/* horizontal grid */}
                {[0, 0.25, 0.5, 0.75, 1].map(f => (
                    <line key={f} x1={SC_PAD.left} x2={SC_PAD.left + SC_IW}
                          y1={SC_PAD.top + f * SC_IH} y2={SC_PAD.top + f * SC_IH}
                          stroke="var(--kce-border)" strokeWidth={0.5} opacity={0.4}/>
                ))}
                {/* axes */}
                <line x1={SC_PAD.left} y1={SC_PAD.top} x2={SC_PAD.left} y2={SC_PAD.top + SC_IH}
                      stroke="var(--kce-border)"/>
                <line x1={SC_PAD.left + SC_IW} y1={SC_PAD.top} x2={SC_PAD.left + SC_IW} y2={SC_PAD.top + SC_IH}
                      stroke="var(--kce-border)"/>
                <line x1={SC_PAD.left} y1={SC_PAD.top + SC_IH} x2={SC_PAD.left + SC_IW} y2={SC_PAD.top + SC_IH}
                      stroke="var(--kce-border)"/>
                {/* y labels (left = penalty €) */}
                {[0, 0.5, 1].map(f => (
                    <text key={`l${f}`} x={SC_PAD.left - 4} y={SC_PAD.top + (1 - f) * SC_IH + 3}
                          textAnchor="end" fontSize={9} fill="var(--kce-muted)">
                        {(maxP * f).toFixed(maxP < 5 ? 1 : 0)}
                    </text>
                ))}
                {/* y labels (right = drinks) */}
                {[0, 0.5, 1].map(f => (
                    <text key={`r${f}`} x={SC_PAD.left + SC_IW + 4} y={SC_PAD.top + (1 - f) * SC_IH + 3}
                          textAnchor="start" fontSize={9} fill="var(--kce-cream)">
                        {Math.round(maxD * f)}
                    </text>
                ))}
                {/* x labels */}
                {tickIdx.map(i => (
                    <text key={`t${i}`} x={xS(i)} y={SC_PAD.top + SC_IH + 12} textAnchor="middle"
                          fontSize={8} fill="var(--kce-muted)">{fmtX(bins[i].t)}</text>
                ))}
                {/* penalty line */}
                <path d={pathP} fill="none" stroke="var(--kce-amber)" strokeWidth={1.8} strokeLinejoin="round"/>
                {/* drinks line */}
                <path d={pathD} fill="none" stroke="var(--kce-cream)" strokeWidth={1.8} strokeLinejoin="round" strokeDasharray="4 2"/>
                {/* hover dots */}
                {bins.map((b, i) => (
                    <g key={i} onClick={() => setHoverIdx(i === hoverIdx ? null : i)} style={{cursor: 'pointer'}}>
                        <circle cx={xS(i)} cy={yPenalty(b.cum_penalty)} r={hoverIdx === i ? 4 : 2.5}
                                fill="var(--kce-amber)"/>
                        <circle cx={xS(i)} cy={yDrinks(b.cum_drinks)} r={hoverIdx === i ? 4 : 2.5}
                                fill="var(--kce-cream)"/>
                        <rect x={xS(i) - 6} y={SC_PAD.top} width={12} height={SC_IH}
                              fill="transparent"/>
                    </g>
                ))}
                {/* legend */}
                <g>
                    <rect x={SC_PAD.left + 4} y={SC_PAD.top + 2} width={8} height={3} fill="var(--kce-amber)"/>
                    <text x={SC_PAD.left + 14} y={SC_PAD.top + 5} fontSize={8} fill="var(--kce-muted)">{leftLabel}</text>
                    <rect x={SC_PAD.left + 4} y={SC_PAD.top + 10} width={8} height={3} fill="var(--kce-cream)"/>
                    <text x={SC_PAD.left + 14} y={SC_PAD.top + 13} fontSize={8} fill="var(--kce-muted)">{rightLabel}</text>
                </g>
            </svg>
            {hoverIdx !== null && bins[hoverIdx] && (
                <div className="text-[10px] text-kce-muted text-center -mt-1">
                    {fmtX(bins[hoverIdx].t)}
                    {bins[hoverIdx].delta_penalty != null && ` · Δ€ ${bins[hoverIdx].delta_penalty!.toFixed(2)}`}
                    {bins[hoverIdx].delta_drinks != null && ` · Δ🍻 ${bins[hoverIdx].delta_drinks}`}
                    {bins[hoverIdx].delta_penalty == null && ` · € ${bins[hoverIdx].cum_penalty.toFixed(2)} · 🍻 ${bins[hoverIdx].cum_drinks}`}
                </div>
            )}
        </div>
    )
}

function pearsonDirectionKey(r: number | null): TranslationKey {
    if (r === null) return 'stats.correlation.dirNone'
    if (Math.abs(r) < 0.2) return 'stats.correlation.dirNone'
    return r > 0 ? 'stats.correlation.dirPositive' : 'stats.correlation.dirNegative'
}

function PearsonBadge({r, t, labelKey = 'stats.correlation.pearson'}: {
    r: number | null
    t: (k: TranslationKey) => string
    labelKey?: TranslationKey
}) {
    const badge = rBadge(r, t)
    const [open, setOpen] = useState(false)
    return (
        <div className="rounded-lg" style={{background: 'var(--kce-surface2)'}}>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex flex-col">
                    <div className="text-[10px] text-kce-muted uppercase font-bold">{t(labelKey)}</div>
                    <div className="text-xs font-bold" style={{color: badge.color}}>{badge.label}</div>
                </div>
                <div className="text-2xl font-extrabold" style={{color: badge.color}}>
                    {r === null ? '–' : r.toFixed(2)}
                </div>
            </div>
            {r !== null && (
                <div className="px-3 pb-2 text-[10px] text-kce-muted">
                    {t(pearsonDirectionKey(r))}
                    <button type="button"
                            className="ml-1 underline decoration-dotted"
                            onClick={() => setOpen(v => !v)}>
                        {open ? t('stats.correlation.rExplainHide') : t('stats.correlation.rExplainShow')}
                    </button>
                    {open && (
                        <div className="mt-1 leading-snug">{t('stats.correlation.rExplain')}</div>
                    )}
                </div>
            )}
        </div>
    )
}

// Tangible €-per-drink rate badge with optional comparison against a baseline.
// rate = penalty / drinks → reads as "each drink cost X €". Lower than the baseline
// means a relatively cheap evening (drank a lot per € fined), higher means expensive.
function DrinkRateBadge({
    label, rate, drinks, penalty, baselineRate, baselineLabel, t,
}: {
    label: string
    rate: number | null
    drinks: number
    penalty: number
    baselineRate?: number | null
    baselineLabel?: string
    t: (k: TranslationKey) => string
}) {
    const [open, setOpen] = useState(false)
    const ratio = baselineRate != null && baselineRate > 0 && rate != null ? rate / baselineRate : null
    const pct = ratio != null ? Math.round((ratio - 1) * 100) : null
    // Above baseline = each drink costs more (worse) → amber; below = cheaper drinks → green.
    const compareColor = pct == null ? 'var(--kce-muted)'
        : pct <= -20 ? '#22c55e'
        : pct >= 20 ? 'var(--kce-amber)'
        : 'var(--kce-muted)'
    return (
        <div className="rounded-lg mt-2" style={{background: 'var(--kce-surface2)'}}>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex flex-col min-w-0">
                    <div className="text-[10px] text-kce-muted uppercase font-bold">{label}</div>
                    <div className="text-xs text-kce-cream truncate">
                        🍻 {drinks} · €{penalty.toFixed(2)}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-extrabold text-kce-amber leading-none">
                        {rate == null ? '–' : fe(rate)}
                    </div>
                    <div className="text-[9px] text-kce-muted">{t('stats.correlation.rateUnit')}</div>
                </div>
            </div>
            {pct != null && baselineLabel && (
                <div className="px-3 pb-2 text-[10px] text-kce-muted">
                    <span style={{color: compareColor}} className="font-bold">
                        {pct > 0 ? '+' : ''}{pct}%
                    </span>
                    {' '}
                    {pct >= 0
                        ? t('stats.correlation.rateAbove').replace('{label}', baselineLabel)
                        : t('stats.correlation.rateBelow').replace('{label}', baselineLabel)}
                    {ratio != null && (
                        <span className="text-kce-muted/70"> ({ratio.toFixed(2)}×)</span>
                    )}
                    <button type="button"
                            className="ml-1 underline decoration-dotted"
                            onClick={() => setOpen(v => !v)}>
                        {open ? t('stats.correlation.rExplainHide') : t('stats.correlation.rExplainShow')}
                    </button>
                    {open && (
                        <div className="mt-1 leading-snug">{t('stats.correlation.rateExplain')}</div>
                    )}
                </div>
            )}
            {pct == null && rate != null && (
                <div className="px-3 pb-2 text-[10px] text-kce-muted leading-snug">
                    {t('stats.correlation.rateExplain')}
                </div>
            )}
            {rate == null && (
                <div className="px-3 pb-2 text-[10px] text-kce-muted">
                    {drinks === 0
                        ? t('stats.correlation.rateNoDrinks')
                        : t('stats.correlation.rateNoPenalty')}
                </div>
            )}
        </div>
    )
}

function MemberEveningScatter({members, myMemberId, t}: {
    members: import('@/types').CorrelationMemberPoint[]
    myMemberId: number | null | undefined
    t: (k: TranslationKey) => string
}) {
    const [focusedMember, setFocusedMember] = useState<number | null>(null)
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

    const colorFor = (memberId: number, idx: number) =>
        memberId === myMemberId ? 'var(--kce-amber)' : playerColor(idx)

    const memberColorMap = new Map<number, string>()
    members.forEach((m, i) => memberColorMap.set(m.regular_member_id, colorFor(m.regular_member_id, i)))

    // Build flat (member × evening) point list, filtered by focus if set
    const visible = focusedMember == null ? members : members.filter(m => m.regular_member_id === focusedMember)
    const points = visible.flatMap(m =>
        m.evening_points.map(p => ({
            x: p.penalty_euro,
            y: p.drink_count,
            color: memberColorMap.get(m.regular_member_id) ?? 'var(--kce-muted)',
            label: m.nickname || m.name,
            memberId: m.regular_member_id,
            date: p.date,
        })),
    )

    const fDate = (s: string) => new Date(s).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'})

    return (
        <>
            <div className="text-[10px] text-kce-muted mb-2">{t('stats.correlation.memberEveningHint')}</div>
            {/* Member legend pills */}
            <div className="flex gap-1.5 flex-wrap mb-2">
                <button type="button"
                        className={`chip ${focusedMember == null ? 'active' : ''}`}
                        onClick={() => { setFocusedMember(null); setSelectedIdx(null) }}>
                    {t('stats.correlation.allMembers')}
                </button>
                {members.map(m => {
                    const isSelected = m.regular_member_id === focusedMember
                    const isMe = m.regular_member_id === myMemberId
                    const color = memberColorMap.get(m.regular_member_id)!
                    return (
                        <button key={m.regular_member_id} type="button"
                                className="chip flex items-center gap-1"
                                style={isSelected
                                    ? {borderColor: color, color: color, background: withAlpha(color), transition: 'none'}
                                    : {transition: 'none'}}
                                onClick={() => {
                                    setFocusedMember(m.regular_member_id === focusedMember ? null : m.regular_member_id)
                                    setSelectedIdx(null)
                                }}>
                            <span className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{background: color}}/>
                            {m.nickname || m.name}{isMe ? ' · Ich' : ''}
                        </button>
                    )
                })}
            </div>

            {points.length === 0 ? (
                <Empty icon="📊" text={t('stats.correlation.empty')}/>
            ) : (
                <>
                    <ScatterChart
                        points={points.map(p => ({x: p.x, y: p.y, color: p.color, size: 4}))}
                        xLabel={t('stats.correlation.xPenalty')}
                        yLabel={t('stats.correlation.yDrinks')}
                        trendLine={focusedMember != null && points.length >= 2}
                        selectedIndex={selectedIdx}
                        onSelect={i => setSelectedIdx(i === selectedIdx ? null : i)}
                    />
                    {selectedIdx !== null && points[selectedIdx] && (
                        <div className="text-[10px] text-kce-muted text-center mb-2">
                            <span className="font-bold">{points[selectedIdx].label}</span>
                            {points[selectedIdx].memberId === myMemberId && (
                                <span className="text-kce-amber font-bold"> · Ich</span>
                            )}
                            {' · '}{fDate(points[selectedIdx].date)} · {fe(points[selectedIdx].x)} · 🍻 {points[selectedIdx].y}
                        </div>
                    )}
                    {focusedMember != null && (() => {
                        const m = members.find(x => x.regular_member_id === focusedMember)
                        if (!m) return null
                        return (
                            <PearsonBadge r={m.personal_pearson_r} t={t}/>
                        )
                    })()}
                </>
            )}
        </>
    )
}


function YearCumulativeDualAxis({evenings, t}: {
    evenings: { evening_id: number; date: string; penalty_euro: number; drink_count: number }[]
    t: (k: TranslationKey) => string
}) {
    if (evenings.length < 2) return null
    const sorted = [...evenings].sort((a, b) => a.date.localeCompare(b.date))
    let cumP = 0
    let cumD = 0
    const bins = sorted.map(e => {
        cumP += e.penalty_euro
        cumD += e.drink_count
        return {t: e.date, cum_penalty: cumP, cum_drinks: cumD}
    })
    const fDate = (s: string) => new Date(s).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'})

    return (
        <div className="mt-3">
            <div className="text-[10px] font-bold text-kce-muted uppercase mb-1">
                {t('stats.correlation.yearCumulativeTitle')}
            </div>
            <DualAxisLineChart
                bins={bins}
                leftLabel={t('stats.correlation.cumPenalty')}
                rightLabel={t('stats.correlation.cumDrinks')}
                xFormat={fDate}
            />
        </div>
    )
}


function EveningQuartileSummary({evenings, t}: {
    evenings: { penalty_euro: number; drink_count: number }[]
    t: (k: TranslationKey) => string
}) {
    if (evenings.length < 4) return null
    const sorted = [...evenings].sort((a, b) => a.penalty_euro - b.penalty_euro)
    const q = Math.max(1, Math.floor(sorted.length / 4))
    const bottom = sorted.slice(0, q)
    const top = sorted.slice(-q)
    const avg = (arr: typeof evenings) =>
        arr.length === 0 ? 0 : arr.reduce((s, e) => s + e.drink_count, 0) / arr.length
    const avgBottom = avg(bottom)
    const avgTop = avg(top)
    const reg = linearRegression(evenings.map(e => ({x: e.penalty_euro, y: e.drink_count})))
    const slopeText = reg
        ? reg.slope >= 0
            ? t('stats.correlation.slopeMore').replace('{n}', reg.slope.toFixed(2))
            : t('stats.correlation.slopeLess').replace('{n}', reg.slope.toFixed(2))
        : null
    const ratio = avgBottom > 0 ? (avgTop / avgBottom).toFixed(1) : null

    // Streak callout: top-5 vs bottom-5 absolute (only when there's enough separation)
    const streak = sorted.length >= 10
        ? {
            top5Avg: avg(sorted.slice(-5)),
            bottom5Avg: avg(sorted.slice(0, 5)),
        }
        : null

    return (
        <div className="mt-3">
            {slopeText && (
                <div className="text-[11px] text-kce-muted mb-2 text-center">{slopeText}</div>
            )}
            <div className="text-[10px] font-bold text-kce-muted uppercase mb-1">
                {t('stats.correlation.quartileTitle')}
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg" style={{background: 'var(--kce-surface2)'}}>
                    <div className="text-[10px] text-kce-muted">{t('stats.correlation.quartileTop')}</div>
                    <div className="text-base font-extrabold text-kce-amber">🍻 {avgTop.toFixed(1)}</div>
                    <div className="text-[10px] text-kce-muted">{t('stats.correlation.avgDrinks')}</div>
                </div>
                <div className="p-2 rounded-lg" style={{background: 'var(--kce-surface2)'}}>
                    <div className="text-[10px] text-kce-muted">{t('stats.correlation.quartileBottom')}</div>
                    <div className="text-base font-extrabold">🍻 {avgBottom.toFixed(1)}</div>
                    <div className="text-[10px] text-kce-muted">{t('stats.correlation.avgDrinks')}</div>
                </div>
            </div>
            {ratio && avgTop > avgBottom && (
                <div className="text-[11px] font-bold text-kce-amber text-center mt-2">
                    {t('stats.correlation.timesMore').replace('{n}', ratio)}
                </div>
            )}
            {streak && (
                <div className="mt-3">
                    <div className="text-[10px] font-bold text-kce-muted uppercase mb-1">
                        {t('stats.correlation.streakTitle')}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded-lg" style={{background: 'var(--kce-surface2)'}}>
                            <div className="text-[10px] text-kce-muted">{t('stats.correlation.streakTop5')}</div>
                            <div className="text-base font-extrabold text-kce-amber">🍻 {streak.top5Avg.toFixed(1)}</div>
                            <div className="text-[10px] text-kce-muted">{t('stats.correlation.avgDrinks')}</div>
                        </div>
                        <div className="p-2 rounded-lg" style={{background: 'var(--kce-surface2)'}}>
                            <div className="text-[10px] text-kce-muted">{t('stats.correlation.streakBottom5')}</div>
                            <div className="text-base font-extrabold">🍻 {streak.bottom5Avg.toFixed(1)}</div>
                            <div className="text-[10px] text-kce-muted">{t('stats.correlation.avgDrinks')}</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}


function CorrelationSection({year, myMemberId, t}: {
    year: number
    myMemberId: number | null | undefined
    t: (k: TranslationKey) => string
}) {
    const [tab, setTab] = useState<CorrTab>('strength')
    const [selectedDot, setSelectedDot] = useState<number | null>(null)

    const {data: corr, isLoading} = useQuery<CorrelationStats>({
        queryKey: ['correlation-stats', year],
        queryFn: () => api.getCorrelationStats(year),
        staleTime: 1000 * 60 * 5,
    })

    useEffect(() => {
        setSelectedDot(null)
    }, [tab, year])

    // Zero-drink evenings indicate missing data (we just weren't logging that night),
    // not a genuine "no drinks" observation — drop them everywhere and recompute r.
    const filteredCorr = useMemo<CorrelationStats | undefined>(() => {
        if (!corr) return corr
        const evenings = corr.evenings.filter(e => e.drink_count > 0)
        const overall_pearson_r = pearson(
            evenings.map(e => e.penalty_euro),
            evenings.map(e => e.drink_count),
        )
        const members = corr.members.map(m => {
            const evening_points = m.evening_points.filter(p => p.drink_count > 0)
            const total_penalty_euro = evening_points.reduce((s, p) => s + p.penalty_euro, 0)
            const total_drink_count = evening_points.reduce((s, p) => s + p.drink_count, 0)
            const personal_pearson_r = pearson(
                evening_points.map(p => p.penalty_euro),
                evening_points.map(p => p.drink_count),
            )
            return {
                ...m,
                evening_points,
                evenings_count: evening_points.length,
                total_penalty_euro,
                total_drink_count,
                personal_pearson_r,
            }
        })
        return {...corr, evenings, overall_pearson_r, members}
    }, [corr])

    // Year-wide "€ penalty per drink" — tangible baseline shown in the per-evening tab.
    const yearRate = useMemo(() => {
        if (!filteredCorr) return {drinks: 0, penalty: 0, rate: null as number | null}
        const drinks = filteredCorr.evenings.reduce((s, e) => s + e.drink_count, 0)
        const penalty = filteredCorr.evenings.reduce((s, e) => s + e.penalty_euro, 0)
        return {drinks, penalty, rate: drinks > 0 ? penalty / drinks : null}
    }, [filteredCorr])

    const fDate = (dateStr: string) =>
        new Date(dateStr).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'})

    const tabs: { key: CorrTab; labelKey: TranslationKey }[] = [
        {key: 'strength', labelKey: 'stats.correlation.tab.strength'},
        {key: 'evening', labelKey: 'stats.correlation.tab.perEvening'},
        {key: 'member', labelKey: 'stats.correlation.tab.perMember'},
    ]

    const hasYearData = filteredCorr && (filteredCorr.evenings.length > 0 || filteredCorr.members.length > 0)

    return (
        <div className="kce-card p-3 mb-4">
            <div className="flex items-baseline justify-between mb-1">
                <div className="text-sm font-extrabold">{t('stats.correlation.title')}</div>
            </div>
            <div className="text-[10px] text-kce-muted mb-2">{t('stats.correlation.subtitle')}</div>

            <div className="flex gap-1 overflow-x-auto pb-1 mb-3" style={{scrollbarWidth: 'none'}}>
                {tabs.map(({key, labelKey}) => (
                    <button
                        key={key} type="button"
                        className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-lg transition-all ${tab === key ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                        onClick={() => setTab(key)}
                    >
                        {t(labelKey)}
                    </button>
                ))}
            </div>

            {isLoading && <Empty icon="⏳" text="…"/>}

            {!isLoading && tab === 'evening' && (
                hasYearData && filteredCorr!.evenings.length > 0 ? (
                    <>
                        <ScatterChart
                            points={filteredCorr!.evenings.map(e => ({
                                x: e.penalty_euro, y: e.drink_count,
                                label: fDate(e.date),
                                color: 'var(--kce-amber)',
                            }))}
                            xLabel={t('stats.correlation.xPenalty')}
                            yLabel={t('stats.correlation.yDrinks')}
                            trendLine
                            selectedIndex={selectedDot}
                            onSelect={i => setSelectedDot(i === selectedDot ? null : i)}
                        />
                        {selectedDot !== null && filteredCorr!.evenings[selectedDot] && (
                            <div className="text-[10px] text-kce-muted text-center mb-2">
                                {fDate(filteredCorr!.evenings[selectedDot].date)} · {fe(filteredCorr!.evenings[selectedDot].penalty_euro)} · 🍻 {filteredCorr!.evenings[selectedDot].drink_count}
                            </div>
                        )}
                        <PearsonBadge r={filteredCorr!.overall_pearson_r} t={t}/>
                        <DrinkRateBadge
                            label={t('stats.correlation.yearRate')}
                            rate={yearRate.rate}
                            drinks={yearRate.drinks}
                            penalty={yearRate.penalty}
                            t={t}
                        />
                        <YearCumulativeDualAxis evenings={filteredCorr!.evenings} t={t}/>
                        <EveningQuartileSummary evenings={filteredCorr!.evenings} t={t}/>
                    </>
                ) : <Empty icon="📅" text={t('stats.correlation.empty')}/>
            )}

            {!isLoading && tab === 'member' && (
                hasYearData && filteredCorr!.members.length > 0 ? (
                    <MemberEveningScatter
                        members={filteredCorr!.members}
                        myMemberId={myMemberId}
                        t={t}
                    />
                ) : <Empty icon="👥" text={t('stats.correlation.empty')}/>
            )}

            {!isLoading && tab === 'strength' && hasYearData && (() => {
                const all = filteredCorr!.members
                const withR = all
                    .filter(m => m.personal_pearson_r !== null)
                    .sort((a, b) => {
                        if (a.regular_member_id === myMemberId) return -1
                        if (b.regular_member_id === myMemberId) return 1
                        // Sort by signed r descending: strong positive first, strong negative last.
                        return b.personal_pearson_r! - a.personal_pearson_r!
                    })
                const tooFew = all.filter(m => m.personal_pearson_r === null)

                // Fallback when no member has 3+ evenings yet (e.g. only 1–2 evenings into the year):
                // rank by € penalty per drink so the tab still says something useful.
                if (withR.length === 0) {
                    const withRate = all
                        .filter(m => m.total_drink_count > 0 && m.evening_points.length > 0)
                        .map(m => ({...m, rate: m.total_penalty_euro / m.total_drink_count}))
                        .sort((a, b) => {
                            if (a.regular_member_id === myMemberId) return -1
                            if (b.regular_member_id === myMemberId) return 1
                            return b.rate - a.rate
                        })
                    if (withRate.length === 0) {
                        return <Empty icon="📊" text={t('stats.correlation.empty')}/>
                    }
                    const maxRate = Math.max(...withRate.map(m => m.rate))
                    return (
                        <>
                            <div className="text-[10px] text-kce-muted mb-2 leading-snug">
                                {t('stats.correlation.fallbackRate')}
                            </div>
                            {withRate.map(m => {
                                const isMe = m.regular_member_id === myMemberId
                                const pct = maxRate > 0 ? (m.rate / maxRate) * 100 : 0
                                return (
                                    <div key={m.regular_member_id}
                                         className={`mb-2 p-2 rounded-lg ${isMe ? 'ring-1 ring-kce-amber/40' : ''}`}
                                         style={{background: 'var(--kce-surface2)'}}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="text-xs font-bold truncate flex items-center gap-1">
                                                {m.nickname || m.name}
                                                {isMe && <span className="text-[9px] text-kce-amber font-bold">Ich</span>}
                                            </div>
                                            <div className="text-xs font-extrabold flex-shrink-0 text-kce-amber">
                                                {fe(m.rate)} / 🍻
                                            </div>
                                        </div>
                                        <div className="h-1.5 rounded-full overflow-hidden"
                                             style={{background: 'var(--kce-bg)'}}>
                                            <div className="h-full rounded-full"
                                                 style={{width: `${pct}%`, background: 'var(--kce-amber)'}}/>
                                        </div>
                                        <div className="text-[9px] text-kce-muted mt-1">
                                            🍻 {m.total_drink_count} · €{m.total_penalty_euro.toFixed(2)} · {m.evening_points.length} {m.evening_points.length === 1 ? t('stats.eveningSingular') : t('stats.eveningsPlural')}
                                        </div>
                                    </div>
                                )
                            })}
                        </>
                    )
                }

                return (
                    <>
                        {/* Scale ticks: −1 · 0 · +1 */}
                        <div className="relative h-3 mb-1 text-[9px] text-kce-muted font-bold">
                            <span className="absolute left-0">−1</span>
                            <span className="absolute left-1/2 -translate-x-1/2">0</span>
                            <span className="absolute right-0">+1</span>
                        </div>
                        {withR.map(m => {
                            const r = m.personal_pearson_r!
                            const isMe = m.regular_member_id === myMemberId
                            const pct = Math.abs(r) * 50  // half-width fraction
                            return (
                                <div key={m.regular_member_id}
                                     className={`mb-2 p-2 rounded-lg ${isMe ? 'ring-1 ring-kce-amber/40' : ''}`}
                                     style={{background: 'var(--kce-surface2)'}}>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="text-xs font-bold truncate flex items-center gap-1">
                                            {m.nickname || m.name}
                                            {isMe && <span className="text-[9px] text-kce-amber font-bold">Ich</span>}
                                        </div>
                                        <div className="text-xs font-extrabold flex-shrink-0"
                                             style={{color: rColor(r)}}>
                                            {r > 0 ? '+' : ''}{r.toFixed(2)}
                                        </div>
                                    </div>
                                    {/* Diverging bar: centered at 0, fills left for negative, right for positive */}
                                    <div className="relative h-1.5 rounded-full overflow-hidden"
                                         style={{background: 'var(--kce-bg)'}}>
                                        <div className="absolute top-0 bottom-0 w-px"
                                             style={{left: '50%', background: 'var(--kce-border)'}}/>
                                        {r >= 0 ? (
                                            <div className="absolute top-0 bottom-0 rounded-r-full"
                                                 style={{left: '50%', width: `${pct}%`, background: rColor(r)}}/>
                                        ) : (
                                            <div className="absolute top-0 bottom-0 rounded-l-full"
                                                 style={{right: '50%', width: `${pct}%`, background: rColor(r)}}/>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                        {tooFew.length > 0 && (
                            <div className="text-[10px] text-kce-muted mt-2">
                                {t('stats.correlation.notEnoughEvenings')}: {tooFew.map(m => m.nickname || m.name).join(', ')}
                            </div>
                        )}
                    </>
                )
            })()}

        </div>
    )
}


function DeltaBarChart({bins, leftLabel, rightLabel}: {
    bins: { t: string; delta_penalty: number; cum_drinks: number }[]
    leftLabel: string
    rightLabel: string
}) {
    if (bins.length === 0) return null
    const maxP = Math.max(0.01, ...bins.map(b => b.delta_penalty))
    const maxD = Math.max(1, ...bins.map(b => b.cum_drinks))
    const n = bins.length
    const slot = SC_IW / n
    const barW = Math.max(2, slot * 0.4 - 1)

    const fmtTime = (iso: string) => {
        try {
            return new Date(iso).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
        } catch {
            return ''
        }
    }
    const tickIdx = n <= 6 ? bins.map((_, i) => i) : [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor(3 * n / 4), n - 1]

    return (
        <svg viewBox={`0 0 ${SC_VW} ${SC_VH}`} className="w-full" style={{maxHeight: 220}}>
            {/* horizontal grid */}
            {[0.25, 0.5, 0.75].map(f => (
                <line key={f} x1={SC_PAD.left} x2={SC_PAD.left + SC_IW}
                      y1={SC_PAD.top + f * SC_IH} y2={SC_PAD.top + f * SC_IH}
                      stroke="var(--kce-border)" strokeWidth={0.5} opacity={0.4}/>
            ))}
            {/* x baseline */}
            <line x1={SC_PAD.left} y1={SC_PAD.top + SC_IH} x2={SC_PAD.left + SC_IW} y2={SC_PAD.top + SC_IH}
                  stroke="var(--kce-border)"/>
            {/* y labels (left = Δ€) */}
            {[0, 0.5, 1].map(f => (
                <text key={`l${f}`} x={SC_PAD.left - 4} y={SC_PAD.top + (1 - f) * SC_IH + 3}
                      textAnchor="end" fontSize={9} fill="var(--kce-muted)">
                    {(maxP * f).toFixed(maxP < 5 ? 1 : 0)}
                </text>
            ))}
            {/* y labels (right = Δdrinks) */}
            {[0, 0.5, 1].map(f => (
                <text key={`r${f}`} x={SC_PAD.left + SC_IW + 4} y={SC_PAD.top + (1 - f) * SC_IH + 3}
                      textAnchor="start" fontSize={9} fill="var(--kce-cream)">
                    {Math.round(maxD * f)}
                </text>
            ))}
            {/* x labels */}
            {tickIdx.map(i => (
                <text key={`t${i}`} x={SC_PAD.left + (i + 0.5) * slot} y={SC_PAD.top + SC_IH + 12}
                      textAnchor="middle" fontSize={8} fill="var(--kce-muted)">{fmtTime(bins[i].t)}</text>
            ))}
            {/* bars */}
            {bins.map((b, i) => {
                const cx = SC_PAD.left + (i + 0.5) * slot
                const hP = (b.delta_penalty / maxP) * SC_IH
                const hD = (b.cum_drinks / maxD) * SC_IH
                return (
                    <g key={i}>
                        {b.delta_penalty > 0 && (
                            <rect x={cx - barW - 0.5} y={SC_PAD.top + SC_IH - hP} width={barW} height={hP}
                                  fill="var(--kce-amber)" rx={1}/>
                        )}
                        {b.cum_drinks > 0 && (
                            <rect x={cx + 0.5} y={SC_PAD.top + SC_IH - hD} width={barW} height={hD}
                                  fill="var(--kce-cream)" rx={1}/>
                        )}
                    </g>
                )
            })}
            {/* legend */}
            <g>
                <rect x={SC_PAD.left + 4} y={SC_PAD.top + 2} width={8} height={3} fill="var(--kce-amber)"/>
                <text x={SC_PAD.left + 14} y={SC_PAD.top + 5} fontSize={8} fill="var(--kce-muted)">{leftLabel}</text>
                <rect x={SC_PAD.left + 4} y={SC_PAD.top + 10} width={8} height={3} fill="var(--kce-cream)"/>
                <text x={SC_PAD.left + 14} y={SC_PAD.top + 13} fontSize={8} fill="var(--kce-muted)">{rightLabel}</text>
            </g>
        </svg>
    )
}


// ── Per-evening heat lanes (compare-all view) ───────────────────────────────
//
// One horizontal lane per member. The amber-tinted background cells show
// Δpenalty per time bin (intensity = relative € spike); the orange line
// overlays cumulative drinks ("intoxication") rising over the evening.
// Visual goal: spot where rising intoxication coincides with penalty heat.

const LANE_H = 38
const LANE_NAME_W = 84
const LANE_RIGHT_PAD = 56

function MemberHeatLane({
    bins, color, label, isMe = false, rPearson, globalMaxDelta, globalMaxCum, onFocus,
}: {
    bins: { t: string; delta_penalty: number; cum_drinks: number }[]
    color: string
    label: string
    isMe?: boolean
    rPearson?: number | null
    globalMaxDelta: number
    globalMaxCum: number
    onFocus?: () => void
}) {
    if (bins.length === 0) return null
    const n = bins.length
    const innerW = 320 - LANE_NAME_W - LANE_RIGHT_PAD
    const cellW = innerW / n
    const cumPath = bins.map((b, i) => {
        const x = LANE_NAME_W + (i + 0.5) * cellW
        const y = LANE_H - 4 - (b.cum_drinks / globalMaxCum) * (LANE_H - 10)
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ')

    const inner = (
        <svg viewBox={`0 0 320 ${LANE_H}`} className="w-full block" preserveAspectRatio="none"
             style={{height: LANE_H}}>
            {/* Member name */}
            <text x={6} y={LANE_H / 2 + 1} fontSize={10} fontWeight={700}
                  dominantBaseline="middle" fill="var(--kce-cream)">
                {isMe
                    ? (label.length > 7 ? `${label.slice(0, 6)}…` : label)
                    : (label.length > 11 ? `${label.slice(0, 10)}…` : label)}
                {isMe && <tspan fill="#e8a020" fontSize={7} dx={3}> Ich</tspan>}
            </text>

            {/* Background heat cells: Δpenalty intensity — tinted with the club primary */}
            {bins.map((b, i) => {
                const intensity = globalMaxDelta > 0 ? Math.min(1, b.delta_penalty / globalMaxDelta) : 0
                return (
                    <rect key={i}
                          x={LANE_NAME_W + i * cellW} y={2}
                          width={Math.max(0.5, cellW - 0.5)} height={LANE_H - 4}
                          fill="var(--kce-primary)" fillOpacity={intensity * 0.85}/>
                )
            })}

            {/* Cumulative drinks line — cream always contrasts with bg */}
            <path d={cumPath} fill="none" stroke="var(--kce-cream)" strokeWidth={1.6}
                  strokeLinejoin="round" opacity={0.95}/>
            {/* End-dot for the line */}
            {bins.length > 0 && (() => {
                const last = bins[bins.length - 1]
                const x = LANE_NAME_W + (bins.length - 0.5) * cellW
                const y = LANE_H - 4 - (last.cum_drinks / globalMaxCum) * (LANE_H - 10)
                return <circle cx={x} cy={y} r={2.5} fill="var(--kce-cream)"/>
            })()}

            {/* Totals at the right edge */}
            {(() => {
                const totalPenalty = bins.reduce((s, b) => s + b.delta_penalty, 0)
                const totalDrinks = bins[bins.length - 1].cum_drinks
                return (
                    <>
                        <text x={320 - 4} y={LANE_H / 2 - 3} fontSize={9} textAnchor="end"
                              fill="var(--kce-primary)" fontWeight={700}>
                            €{totalPenalty.toFixed(1)}
                        </text>
                        <text x={320 - 4} y={LANE_H / 2 + 8} fontSize={9} textAnchor="end"
                              fill="var(--kce-cream)" fontWeight={700}>
                            🍻 {totalDrinks}
                        </text>
                    </>
                )
            })()}

            {/* Color tag bar at far left of name area */}
            <rect x={0} y={0} width={3} height={LANE_H} fill={color}/>

            {/* Optional r badge in name area, small */}
            {rPearson != null && (
                <text x={LANE_NAME_W - 4} y={LANE_H / 2 + 1} fontSize={8} textAnchor="end"
                      dominantBaseline="middle" fill={rColor(rPearson)} fontWeight={700}>
                    r={rPearson.toFixed(2)}
                </text>
            )}
        </svg>
    )

    const className = `block w-full rounded-lg overflow-hidden mb-1 transition-all ${onFocus ? 'active:opacity-70' : ''} ${isMe ? 'ring-1 ring-kce-amber/40' : ''}`
    const style = {background: 'var(--kce-surface2)'}
    if (onFocus) {
        return (
            <button type="button" onClick={onFocus} aria-label={label}
                    className={className} style={style}>
                {inner}
            </button>
        )
    }
    return <div className={className} style={style}>{inner}</div>
}

function MemberHeatLanes({
    members, memberColors, myMemberId, onFocus, t,
}: {
    members: import('@/types').EveningCorrelationMember[]
    memberColors: Map<number, string>
    myMemberId: number | null | undefined
    onFocus: (memberId: number) => void
    t: (k: TranslationKey) => string
}) {
    const globalMaxDelta = Math.max(
        0.01,
        ...members.flatMap(m => m.bins.map(b => b.delta_penalty)),
    )
    const globalMaxCum = Math.max(
        1,
        ...members.flatMap(m => m.bins.map(b => b.cum_drinks)),
    )
    // Sort members by total drinks desc (most-intoxicated at top)
    const sorted = [...members].sort((a, b) => {
        const ad = a.bins.length ? a.bins[a.bins.length - 1].cum_drinks : 0
        const bd = b.bins.length ? b.bins[b.bins.length - 1].cum_drinks : 0
        return bd - ad
    })
    return (
        <div>
            <div className="text-[10px] text-kce-muted mb-2">
                {t('stats.correlation.heatLaneHint')}
            </div>
            {sorted.map(m => (
                <MemberHeatLane
                    key={m.evening_player_id}
                    bins={m.bins}
                    color={memberColors.get(m.evening_player_id) ?? 'var(--kce-muted)'}
                    label={m.nickname || m.name}
                    isMe={m.regular_member_id != null && m.regular_member_id === myMemberId}
                    rPearson={m.derivative_pearson_r}
                    globalMaxDelta={globalMaxDelta}
                    globalMaxCum={globalMaxCum}
                    onFocus={() => onFocus(m.evening_player_id)}
                />
            ))}
            {/* Legend */}
            <div className="flex items-center gap-3 mt-2 text-[10px] text-kce-muted">
                <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-2 rounded-sm" style={{background: 'rgba(232,160,32,0.85)'}}/>
                    {t('stats.correlation.deltaPenalty')}
                </span>
                <span className="flex items-center gap-1">
                    <span className="inline-block w-3" style={{height: 2, background: 'var(--kce-cream)'}}/>
                    {t('stats.correlation.cumDrinks')}
                </span>
            </div>
        </div>
    )
}


function EveningCorrelationPanel({eveningId, myMemberId, t}: {
    eveningId: number | null
    myMemberId: number | null | undefined
    t: (k: TranslationKey) => string
}) {
    // null = compare-all (overlay every member); number = focus on one member
    const [pickedMemberId, setPickedMemberId] = useState<number | null>(null)
    const [binMinutes, setBinMinutes] = useState<number>(15)

    useEffect(() => {
        setPickedMemberId(null)
    }, [eveningId])

    const {data: eveningCorr, isLoading} = useQuery<EveningCorrelation>({
        queryKey: ['evening-correlation', eveningId, binMinutes],
        queryFn: () => api.getEveningCorrelation(eveningId!, binMinutes),
        enabled: eveningId != null,
        staleTime: 1000 * 60 * 5,
    })

    const sortedMembers = useMemo(() => {
        if (!eveningCorr) return []
        return [...eveningCorr.members].sort((a, b) => {
            if (a.regular_member_id != null && a.regular_member_id === myMemberId) return -1
            if (b.regular_member_id != null && b.regular_member_id === myMemberId) return 1
            return b.bins.length - a.bins.length
        })
    }, [eveningCorr, myMemberId])

    const memberColors = useMemo(() => {
        const map = new Map<number, string>()
        sortedMembers.forEach((m, i) => {
            map.set(
                m.evening_player_id,
                m.regular_member_id === myMemberId
                    ? 'var(--kce-amber)'
                    : playerColor(i),
            )
        })
        return map
    }, [sortedMembers, myMemberId])

    // Per-member totals (drinks + penalty € over the whole evening) and a club-wide
    // average €-per-drink rate used as the comparison baseline.
    const totals = useMemo(() => {
        if (!eveningCorr) {
            return {byMember: new Map<number, {drinks: number; penalty: number; rate: number | null}>(),
                eveningDrinks: 0, eveningPenalty: 0, eveningRate: null as number | null}
        }
        const byMember = new Map<number, {drinks: number; penalty: number; rate: number | null}>()
        let eveningDrinks = 0
        let eveningPenalty = 0
        for (const m of eveningCorr.members) {
            const drinks = m.bins.length ? m.bins[m.bins.length - 1].cum_drinks : 0
            const penalty = m.bins.reduce((s, b) => s + b.delta_penalty, 0)
            const rate = drinks > 0 ? penalty / drinks : null
            byMember.set(m.evening_player_id, {drinks, penalty, rate})
            eveningDrinks += drinks
            eveningPenalty += penalty
        }
        const eveningRate = eveningDrinks > 0 ? eveningPenalty / eveningDrinks : null
        return {byMember, eveningDrinks, eveningPenalty, eveningRate}
    }, [eveningCorr])

    if (eveningId == null) return null

    const member = pickedMemberId == null ? null
        : eveningCorr?.members.find(m => m.evening_player_id === pickedMemberId) ?? null
    const compareMembers = sortedMembers.filter(m => m.bins.length > 0)

    return (
        <div className="kce-card p-3 mb-4 mt-6">
            <div className="sec-heading text-sm mb-1">{t('stats.correlation.title')}</div>
            <div className="text-[10px] text-kce-muted mb-2">
                {pickedMemberId == null ? t('stats.correlation.compareAllHint') : t('stats.correlation.subtitle')}
            </div>

            {/* Member pill picker — "Alle" + per-member */}
            {sortedMembers.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mb-2">
                    <button type="button"
                            className={`chip ${pickedMemberId == null ? 'active' : ''}`}
                            onClick={() => setPickedMemberId(null)}>
                        {t('stats.correlation.allMembers')}
                    </button>
                    {sortedMembers.map(m => {
                        const isSelected = m.evening_player_id === pickedMemberId
                        const isMe = m.regular_member_id != null && m.regular_member_id === myMemberId
                        const color = memberColors.get(m.evening_player_id)!
                        return (
                            <button key={m.evening_player_id} type="button"
                                    className="chip flex items-center gap-1"
                                    style={isSelected
                                        ? {borderColor: color, color: color, background: withAlpha(color), transition: 'none'}
                                        : {transition: 'none'}}
                                    onClick={() => setPickedMemberId(m.evening_player_id)}>
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background: color}}/>
                                {m.nickname || m.name}{isMe ? ' · Ich' : ''}
                            </button>
                        )
                    })}
                </div>
            )}

            {/* Bin-size pill picker */}
            <div className="flex gap-1.5 flex-wrap items-center mb-3">
                <span className="text-[10px] text-kce-muted mr-1">{t('stats.correlation.binMinutes')}:</span>
                {[5, 15, 30].map(m => (
                    <button key={m} type="button"
                            className={`chip ${binMinutes === m ? 'active' : ''}`}
                            onClick={() => setBinMinutes(m)}>
                        {m} {t('stats.correlation.minutes')}
                    </button>
                ))}
            </div>

            {isLoading && <Empty icon="⏳" text="…"/>}

            {/* Compare-all mode — one heat-lane per member */}
            {!isLoading && pickedMemberId == null && (
                compareMembers.length === 0
                    ? <Empty icon="🤷" text={t('stats.correlation.noEvents')}/>
                    : (
                        <>
                            <MemberHeatLanes
                                members={compareMembers}
                                memberColors={memberColors}
                                myMemberId={myMemberId}
                                onFocus={id => setPickedMemberId(id)}
                                t={t}
                            />
                            <DrinkRateBadge
                                label={t('stats.correlation.eveningRate')}
                                rate={totals.eveningRate}
                                drinks={totals.eveningDrinks}
                                penalty={totals.eveningPenalty}
                                t={t}
                            />
                        </>
                    )
            )}

            {/* Single-member focus mode */}
            {!isLoading && pickedMemberId != null && (!member || member.bins.length === 0) && (
                <Empty icon="🤷" text={t('stats.correlation.noEvents')}/>
            )}
            {!isLoading && member && member.bins.length > 0 && (
                <>
                    <DualAxisLineChart
                        bins={member.bins}
                        leftLabel={t('stats.correlation.cumPenalty')}
                        rightLabel={t('stats.correlation.cumDrinks')}
                    />
                    <div className="text-[10px] text-kce-muted text-center mt-1 mb-2">
                        {t('stats.correlation.deltaTitle')}
                    </div>
                    <DeltaBarChart
                        bins={member.bins}
                        leftLabel={t('stats.correlation.deltaPenalty')}
                        rightLabel={t('stats.correlation.deltaDrinks')}
                    />
                    <PearsonBadge r={member.derivative_pearson_r} t={t}
                                  labelKey="stats.correlation.derivativeR"/>
                    {(() => {
                        const tot = totals.byMember.get(member.evening_player_id)
                        if (!tot) return null
                        return (
                            <DrinkRateBadge
                                label={t('stats.correlation.memberRate')}
                                rate={tot.rate}
                                drinks={tot.drinks}
                                penalty={tot.penalty}
                                baselineRate={totals.eveningRate}
                                baselineLabel={t('stats.correlation.eveningAvg')}
                                t={t}
                            />
                        )
                    })()}
                </>
            )}
        </div>
    )
}


// ── Main page ───────────────────────────────────────────────────────────────

export function StatsPage() {
    const t = useT()
    const user = useAppStore(s => s.user)
    const activeEveningId = useAppStore(s => s.activeEveningId)
    const currentYear = new Date().getFullYear()
    const [year, setYear] = useState(currentYear)
    const [memberSearch, setMemberSearch] = useState('')
    const [showAllMembers, setShowAllMembers] = useState(false)
    const [pickedId, setPickedId] = useState<number | null>(null)
    const [openCommentHighlightId, setOpenCommentHighlightId] = useState<number | null>(null)
    const [selectedPlayer, setSelectedPlayer] = useState<{player: YearPlayer; rank: number} | null>(null)
    const [eveningPlayerDetail, setEveningPlayerDetail] = useState<EveningPlayer | null>(null)

    const {data: eveningList = []} = useEveningList()
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

    const {data: yearStats} = useQuery({
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

            {/* ── Evening analysis ── */}
            <div className="sec-heading text-sm">{t('stats.evening')}</div>

            {sortedEvenings.length === 0 ? (
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
                                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isSelected ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
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
                                    <div className="text-xs font-extrabold text-kce-muted uppercase mb-2">{t('stats.hof')}</div>
                                    {eveningStats.hallOfFame.map((h, i) => (
                                        <div key={i} className="kce-card p-3 mb-2 flex items-center gap-3">
                                            <span className="text-2xl">{h.icon}</span>
                                            <div className="flex-1">
                                                <div className="text-xs font-bold text-kce-muted">{h.label}</div>
                                                <div className="text-sm font-bold">{h.name}</div>
                                            </div>
                                            <div className="text-kce-amber font-bold text-sm">{h.value}</div>
                                        </div>
                                    ))}
                                </>
                            )}

                            <EveningTimeline evening={evening} t={t}/>

                            <EveningCorrelationPanel
                                eveningId={effectiveId}
                                myMemberId={user?.regular_member_id}
                                t={t}
                            />

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
                                                                 className="mt-1 rounded max-h-64 max-w-full object-contain border border-kce-border/40"/>
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
                                                    <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center font-display font-bold text-kce-bg text-sm mb-2"
                                                         style={{background: 'linear-gradient(135deg,#c4701a,#e8a020)', margin: '0 auto'}}>
                                                        {rm?.avatar
                                                            ? <img src={rm.avatar} alt="" className="w-full h-full object-cover"/>
                                                            : p.name[0].toUpperCase()
                                                        }
                                                    </div>
                                                    <div className="text-center text-xs font-bold mb-2 truncate flex items-center justify-center gap-1">
                                                        {p.is_king ? '👑 ' : ''}
                                                        {p.name}
                                                        {p.regular_member_id === user?.regular_member_id && <span className="text-[9px] text-kce-amber font-bold flex-shrink-0">Ich</span>}
                                                        {pins.filter((pin: any) => pin.holder_regular_member_id === p.regular_member_id).map((pin: any) => (
                                                            <span key={pin.id} title={pin.name}>{pin.icon}</span>
                                                        ))}
                                                    </div>
                                                    <div className="flex justify-around text-center">
                                                        <div>
                                                            <div className="text-kce-amber font-bold text-sm">{wins}</div>
                                                            <div className="text-[9px] text-kce-muted">{t('stats.wins')}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-red-400 font-bold text-sm">{fe(pTotal)}</div>
                                                            <div className="text-[9px] text-kce-muted">{t('stats.penalties')}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-kce-amber font-bold text-sm">🍺{beerC}</div>
                                                            <div className="text-[9px] text-kce-muted">{t('stats.beer')}</div>
                                                        </div>
                                                    </div>
                                                    {throwCount > 0 && (
                                                        <div className="mt-2 pt-2" style={{borderTop: '1px solid var(--kce-border)'}}>
                                                            <div className="flex justify-around text-center">
                                                                <div>
                                                                    <div className="text-kce-cream font-bold text-sm">🎳{totalPins}</div>
                                                                    <div className="text-[9px] text-kce-muted">{t('stats.totalPins')}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-kce-cream font-bold text-sm">{throwCount}</div>
                                                                    <div className="text-[9px] text-kce-muted">{t('stats.throwCount')}</div>
                                                                </div>
                                                                {avgPins !== null && (
                                                                    <div>
                                                                        <div className="text-kce-cream font-bold text-sm">{avgPins}</div>
                                                                        <div className="text-[9px] text-kce-muted">{t('stats.avgPins')}</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {hasHeatmap && (
                                                                <div className="mt-2">
                                                                    <div className="text-[9px] text-kce-muted text-center mb-1">{t('stats.heatmap')}</div>
                                                                    <svg width="80" height="68" viewBox="0 0 80 68" style={{display: 'block', margin: '0 auto', overflow: 'visible'}}>
                                                                        {PIN_POS.map(([px, py], i) => {
                                                                            const ratio = pinCounts[i] / maxPinCount
                                                                            const cx = px * 80
                                                                            const cy = py * 68
                                                                            return (
                                                                                <g key={i}>
                                                                                    <circle
                                                                                        cx={cx} cy={cy} r="8"
                                                                                        fill={ratio === 0 ? 'var(--kce-surface2)' : `color-mix(in srgb, var(--kce-amber) ${Math.round(ratio * 100)}%, var(--kce-surface2))`}
                                                                                        stroke={ratio > 0 ? 'var(--kce-amber)' : 'var(--kce-border)'}
                                                                                        strokeWidth="1.5"
                                                                                    />
                                                                                    {pinCounts[i] > 0 && (
                                                                                        <text
                                                                                            x={cx} y={cy}
                                                                                            textAnchor="middle"
                                                                                            dominantBaseline="central"
                                                                                            fontSize="7"
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
                        <Empty icon="📈" text="Lade..."/>
                    )}
                </>
            )}

            {/* ── Jahresrückblick ── */}
            <div className="sec-heading text-sm flex items-center justify-between mt-6">
                <span>{t('stats.year')}</span>
                <div className="flex gap-1">
                    {yearsWithEvenings.map(y => (
                        <button key={y} type="button"
                                className={`text-xs font-extrabold px-2.5 py-1 rounded-lg transition-all ${year === y ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                                onClick={() => setYear(y)}>
                            {y}
                        </button>
                    ))}
                </div>
            </div>

            {!yearStats || yearStats.evening_count === 0 ? (
                <Empty icon="📅" text={`${t('stats.noYearData')} ${year}`}/>
            ) : (
                <>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                        <StatBox value={String(yearStats.evening_count)} label={t('stats.evenings')}/>
                        <StatBox value={fe(yearStats.total_penalties)} label={t('member.totalPenalties')}/>
                        <StatBox value={`🍺 ${yearStats.total_beers}`} label={t('drinks.beer')}/>
                    </div>

                    <YearEveningsBarChart eveningList={eveningList} year={year} t={t}/>

                    <CorrelationSection
                        year={year}
                        myMemberId={user?.regular_member_id}
                        t={t}
                    />

                    {!mq && players.length >= 3 && (
                        <YearPodium players={players} myMemberId={user?.regular_member_id} t={t} onSelect={(p, rank) => setSelectedPlayer({player: p, rank})}/>
                    )}

                    <div className="text-xs font-extrabold text-kce-muted uppercase mb-2">{t('stats.yearPenalties')}</div>
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
                                className={`kce-card p-3 mb-2 w-full text-left active:opacity-70 transition-opacity ${isMe ? 'ring-1 ring-kce-amber/40' : ''}`}
                                onClick={() => setSelectedPlayer({player: p, rank})}
                            >
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="text-base w-6 text-center flex-shrink-0">
                                        {medals[rank] ??
                                            <span className="text-xs text-kce-muted font-bold">{rank + 1}.</span>}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate flex items-center gap-1">
                                            {p.nickname || p.name}
                                            {isMe && <span className="text-[9px] text-kce-amber font-bold">Ich</span>}
                                            {pins.filter((pin: any) => pin.holder_regular_member_id === p.regular_member_id).map((pin: any) => (
                                                <span key={pin.id} title={pin.name} className="flex-shrink-0">{pin.icon}</span>
                                            ))}
                                        </div>
                                        <div className="text-[10px] text-kce-muted">
                                            {p.evenings} {t('stats.evenings')} · {p.game_wins} {t('stats.wins')} · 🍺{p.beer_rounds}
                                        </div>
                                        {p.throw_count > 0 && (
                                            <div className="text-[10px] text-kce-muted">
                                                🎳 Ø {p.avg_pins} · {p.throw_count} {t('stats.throwCount')}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-red-400 font-bold text-sm flex-shrink-0">{fe(p.penalty_total)}</div>
                                </div>
                                <div className="h-1 rounded-full overflow-hidden"
                                     style={{background: 'var(--kce-surface2)'}}>
                                    <div className="h-full rounded-full transition-all"
                                         style={{
                                             width: `${barWidth}%`,
                                             background: isMe ? 'var(--kce-amber)'
                                                 : i === 0 ? '#ef4444' : i < 3 ? '#f97316' : 'var(--kce-muted)'
                                         }}/>
                                </div>
                            </button>
                        )
                    })}

                    {!mq && filteredPlayers.length > 5 && (
                        <button type="button"
                                className="w-full text-xs text-kce-muted py-2 font-bold"
                                onClick={() => setShowAllMembers(v => !v)}>
                            {showAllMembers ? t('stats.showLess') : `${t('stats.showAllMembers')} (${filteredPlayers.length})`}
                        </button>
                    )}
                </>
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

function StatBox({value, label}: { value: string; label: string }) {
    return (
        <div className="kce-card p-3 text-center">
            <div className="font-display font-bold text-kce-amber text-xl leading-tight">{value}</div>
            <div className="text-[9px] text-kce-muted font-bold tracking-wider mt-0.5 uppercase">{label}</div>
        </div>
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
