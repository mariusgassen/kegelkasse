import {useState} from 'react'
import {useEveningList} from '../hooks/useEvening'
import {useQuery} from '@tanstack/react-query'
import {useAppStore} from '@/store/app'
import {api} from '../api/client'
import {useT} from '@/i18n'
import type {TranslationKey} from '@/i18n/de'
import {Empty} from '@/components/ui/Empty.tsx'
import {ItemReactionBar} from '@/components/ui/ItemReactionBar.tsx'
import {CommentThread} from '@/components/ui/CommentThread.tsx'
import {Sheet} from '@/components/ui/Sheet.tsx'
import type {Evening} from '@/types.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function feShort(v: number) {
    if (v === 0) return '0'
    return '€' + v.toLocaleString('de-DE', {minimumFractionDigits: 0, maximumFractionDigits: 2})
}

const PLAYER_COLORS = ['#e8a020', '#22c55e', '#3b82f6', '#ec4899', '#a78bfa', '#f97316', '#14b8a6', '#f43f5e']

// ── Cumulative chart ────────────────────────────────────────────────────────

type ChartSeries = { id: number; name: string; color: string; events: { ts: number; delta: number }[] }

const PAD = {top: 12, right: 12, bottom: 22, left: 38}
const VW = 400, VH = 140
const IW = VW - PAD.left - PAD.right
const IH = VH - PAD.top - PAD.bottom

function CumulativeChart({series, yFormat, title}: {
    series: ChartSeries[]
    yFormat: (v: number) => string
    title: string
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
            <svg width="100%" viewBox={`0 0 ${VW} ${VH}`} style={{overflow: 'visible', display: 'block'}}>
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
                        return <circle key={i} cx={xS(e.ts)} cy={yS(cum)} r="2.5"
                                       fill={s.color} stroke="var(--kce-bg)" strokeWidth="1"/>
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

function EveningTimeline({evening}: { evening: Evening }) {
    const allIds = evening.players.map(p => p.id)
    const [selected, setSelected] = useState<number[]>(allIds)

    // Stable color per player (by index in evening.players, not filtered index)
    const colorOf = (pid: number) => PLAYER_COLORS[allIds.indexOf(pid) % PLAYER_COLORS.length]

    const toggle = (id: number) =>
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

    const activePlayers = evening.players.filter(p => selected.includes(p.id))

    const penaltySeries: ChartSeries[] = activePlayers.map(p => ({
        id: p.id, name: p.name, color: colorOf(p.id),
        events: evening.penalty_log
            .filter(l => l.player_id === p.id && !('is_deleted' in l && (l as any).is_deleted))
            .map(l => ({ts: l.client_timestamp, delta: l.mode === 'euro' ? l.amount : (l.unit_amount != null ? l.amount * l.unit_amount : 0)})),
    }))

    const drinkSeries: ChartSeries[] = activePlayers.map(p => ({
        id: p.id, name: p.name, color: colorOf(p.id),
        events: evening.drink_rounds
            .filter(r => r.participant_ids.includes(p.id))
            .map(r => ({ts: r.client_timestamp, delta: 1})),
    }))

    const hasAnyPenalty = penaltySeries.some(s => s.events.length > 0)
    const hasAnyDrink = drinkSeries.some(s => s.events.length > 0)

    if (!hasAnyPenalty && !hasAnyDrink) {
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
                                className="chip"
                                style={on
                                    ? {borderColor: col, color: col, background: col + '22'}
                                    : {opacity: 0.4}}
                                onClick={() => toggle(p.id)}>
                            {p.is_king ? '👑 ' : ''}{p.name}
                        </button>
                    )
                })}
            </div>

            <div className="kce-card p-3">
                {hasAnyPenalty && (
                    <CumulativeChart series={penaltySeries} yFormat={feShort} title="Strafen €"/>
                )}
                {hasAnyDrink && (
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

function EveningDonutChart({evening, totalEuro, penaltyCount, beerRounds, shotRounds, t}: {
    evening: Evening
    totalEuro: number
    penaltyCount: number
    beerRounds: number
    shotRounds: number
    t: (k: any) => string
}) {
    const playerTotals = evening.players.map(p => {
        const total = evening.penalty_log
            .filter(l => l.player_id === p.id && !(l as any).is_deleted)
            .reduce((s, l) => s + (l.mode === 'euro' ? l.amount : (l.unit_amount != null ? l.amount * l.unit_amount : 0)), 0)
        return {id: p.id, name: p.name, total}
    }).filter(p => p.total > 0)

    const hasData = totalEuro > 0 && playerTotals.length > 0

    if (!hasData) {
        return (
            <div className="grid grid-cols-2 gap-2 mb-4">
                <StatBox value={fe(totalEuro)} label={t('stats.totalEuro')}/>
                <StatBox value={String(penaltyCount)} label={t('stats.penalties')}/>
                <StatBox value={`🍺 ${beerRounds}`} label={t('drinks.beer')}/>
                <StatBox value={`🥃 ${shotRounds}`} label={t('drinks.shots')}/>
            </div>
        )
    }

    const R = 70
    const CX = 100, CY = 100
    const SW = 28
    const CIRC = 2 * Math.PI * R

    let accumulated = 0
    const segments = playerTotals.map((p, i) => {
        const arcLen = (p.total / totalEuro) * CIRC
        const rotation = (accumulated / CIRC) * 360 - 90
        const seg = {
            ...p,
            arcLen,
            rotation,
            color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        }
        accumulated += arcLen
        return seg
    })

    return (
        <div className="mb-4">
            <div className="flex gap-3 items-center mb-3">
                <div style={{flexShrink: 0, width: 120}}>
                    <svg width="120" height="120" viewBox="0 0 200 200">
                        <circle cx={CX} cy={CY} r={R} fill="none"
                                stroke="var(--kce-surface2)" strokeWidth={SW}/>
                        {segments.map(seg => (
                            <circle key={seg.id}
                                    cx={CX} cy={CY} r={R}
                                    fill="none"
                                    stroke={seg.color}
                                    strokeWidth={SW}
                                    strokeDasharray={`${seg.arcLen} ${CIRC}`}
                                    strokeDashoffset={0}
                                    transform={`rotate(${seg.rotation}, ${CX}, ${CY})`}
                                    strokeLinecap="butt"/>
                        ))}
                        <text x={CX} y={CY - 8} textAnchor="middle" fontSize="13"
                              fill="var(--kce-cream)" fontWeight="bold">
                            {feShort(totalEuro)}
                        </text>
                        <text x={CX} y={CY + 8} textAnchor="middle" fontSize="10"
                              fill="var(--kce-muted)">
                            {penaltyCount} {t('stats.penalties')}
                        </text>
                        <text x={CX} y={CY + 22} textAnchor="middle" fontSize="9"
                              fill="var(--kce-muted)">{t('stats.totalEuro')}</text>
                    </svg>
                </div>
                <div className="flex flex-col gap-2 flex-1">
                    <StatBox value={`🍺 ${beerRounds}`} label={t('drinks.beer')}/>
                    <StatBox value={`🥃 ${shotRounds}`} label={t('drinks.shots')}/>
                </div>
            </div>
            <div className="kce-card p-2">
                <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider mb-1.5">
                    {t('stats.penaltyDistribution')}
                </div>
                <div className="flex flex-col gap-1">
                    {segments.map(seg => (
                        <div key={seg.id} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                     style={{background: seg.color}}/>
                                <span className="text-[11px] text-kce-cream truncate">{seg.name}</span>
                            </div>
                            <span className="text-[11px] font-bold text-kce-amber flex-shrink-0">
                                {feShort(seg.total)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

// ── Year evenings bar chart ─────────────────────────────────────────────────

function YearEveningsBarChart({eveningList, year, t}: {
    eveningList: {id: number; date: string; venue: string | null; penalty_total: number}[]
    year: number
    t: (k: any) => string
}) {
    const bars = [...eveningList]
        .filter(e => new Date(e.date).getFullYear() === year)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-12)

    if (bars.length < 2) return null

    const allZero = bars.every(b => (b.penalty_total ?? 0) === 0)
    if (allZero) return null

    const VW = 400, VH = 80
    const PAD_T = 4, PAD_B = 22, PAD_H = 4
    const IH = VH - PAD_T - PAD_B
    const IW = VW - PAD_H * 2
    const maxP = Math.max(...bars.map(b => b.penalty_total ?? 0), 0.01)
    const gap = 3
    const barW = Math.max(2, (IW / bars.length) - gap)

    const fShortDate = (d: string) =>
        new Date(d).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'})

    return (
        <div className="kce-card p-3 mb-4">
            <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider mb-1">
                {t('stats.eveningBars')}
            </div>
            <svg width="100%" viewBox={`0 0 ${VW} ${VH}`} style={{display: 'block', overflow: 'visible'}}>
                {bars.map((bar, i) => {
                    const x = PAD_H + i * (barW + gap)
                    const h = Math.max(2, ((bar.penalty_total ?? 0) / maxP) * IH)
                    const y = PAD_T + IH - h
                    const labelX = x + barW / 2
                    const showLabel = bars.length <= 8 || i % 2 === 0
                    return (
                        <g key={bar.id}>
                            <rect x={x} y={y} width={barW} height={h} rx="2"
                                  fill="var(--kce-amber)" opacity="0.85"/>
                            {showLabel && (
                                <text x={labelX} y={VH - 6} textAnchor="middle"
                                      fontSize="8" fill="var(--kce-muted)">
                                    {fShortDate(bar.date)}
                                </text>
                            )}
                            <title>{fShortDate(bar.date)}: {feShort(bar.penalty_total ?? 0)}</title>
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

function YearPodium({players, myMemberId, t}: {
    players: YearPlayer[]
    myMemberId: number | null | undefined
    t: (k: any) => string
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
                        <div key={cfg.rank} style={{order: cfg.displayOrder, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0, flex: '0 0 88px'}}>
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
                        </div>
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

                            <EveningTimeline evening={evening}/>

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
                                            const wins = evening.games.filter(g => g.winner_ref === `p:${p.id}`).length
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
                                                <div key={p.id} className="kce-card p-3">
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
                                                                    <div style={{position: 'relative', width: 80, height: 68, margin: '0 auto'}}>
                                                                        {PIN_POS.map(([px, py], i) => {
                                                                            const ratio = pinCounts[i] / maxPinCount
                                                                            const bg = ratio === 0
                                                                                ? 'transparent'
                                                                                : `color-mix(in srgb, var(--kce-amber) ${Math.round(ratio * 100)}%, var(--kce-surface2))`
                                                                            return (
                                                                                <div key={i} style={{
                                                                                    position: 'absolute',
                                                                                    left: `${px * 100}%`, top: `${py * 100}%`,
                                                                                    transform: 'translate(-50%,-50%)',
                                                                                    width: 16, height: 16, borderRadius: '50%',
                                                                                    background: bg,
                                                                                    border: `2px solid ${ratio > 0 ? 'var(--kce-amber)' : '#555'}`,
                                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                                }}>
                                                                                    {pinCounts[i] > 0 && (
                                                                                        <span style={{fontSize: 7, color: 'var(--kce-bg)', fontWeight: 'bold', lineHeight: 1}}>
                                                                                            {pinCounts[i]}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            )
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
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

                    {!mq && players.length >= 3 && (
                        <YearPodium players={players} myMemberId={user?.regular_member_id} t={t}/>
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

    const winnersMap: Record<string, number> = {}
    evening.games.forEach(g => {
        if (g.winner_name) winnersMap[g.winner_name] = (winnersMap[g.winner_name] || 0) + 1
    })
    const topWinner = Object.entries(winnersMap).sort((a, b) => b[1] - a[1])[0]

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
