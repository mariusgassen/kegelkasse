import {useState} from 'react'
import {useEveningList} from '../hooks/useEvening'
import {useQuery} from '@tanstack/react-query'
import {useAppStore} from '@/store/app'
import {api} from '../api/client'
import {useT} from '@/i18n'
import type {TranslationKey} from '@/i18n/de'
import {Empty} from '@/components/ui/Empty.tsx'
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

// ── Main page ───────────────────────────────────────────────────────────────

export function StatsPage() {
    const t = useT()
    const user = useAppStore(s => s.user)
    const activeEveningId = useAppStore(s => s.activeEveningId)
    const currentYear = new Date().getFullYear()
    const [year, setYear] = useState(currentYear)
    const [showAllMembers, setShowAllMembers] = useState(false)
    const [pickedId, setPickedId] = useState<number | null>(null)

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
    const maxPenalty = players[0]?.penalty_total ?? 1
    const displayPlayers = showAllMembers ? players : players.slice(0, 5)

    const fDate = (dateStr: string) =>
        new Date(dateStr).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'})

    return (
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
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <StatBox value={fe(eveningStats.totalEuro)} label={t('stats.totalEuro')}/>
                                <StatBox value={String(eveningStats.penaltyCount)} label={t('stats.penalties')}/>
                                <StatBox value={`🍺 ${eveningStats.beerRounds}`} label={t('drinks.beer')}/>
                                <StatBox value={`🥃 ${eveningStats.shotRounds}`} label={t('drinks.shots')}/>
                            </div>

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
                                    <div className="flex flex-col gap-1.5 mb-2">
                                        {evening.highlights.map(h => (
                                            <div key={h.id} className="kce-card p-3 flex items-start gap-2">
                                                <span className="text-base flex-shrink-0">✨</span>
                                                <div className="text-sm">{h.text}</div>
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

                    <div className="text-xs font-extrabold text-kce-muted uppercase mb-2">{t('stats.yearPenalties')}</div>
                    {displayPlayers.map((p, i) => {
                        const isMe = p.regular_member_id != null && p.regular_member_id === user?.regular_member_id
                        const barWidth = maxPenalty > 0 ? (p.penalty_total / maxPenalty) * 100 : 0
                        const medals = ['🥇', '🥈', '🥉']
                        return (
                            <div key={i} className={`kce-card p-3 mb-2 ${isMe ? 'ring-1 ring-kce-amber/40' : ''}`}>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="text-base w-6 text-center flex-shrink-0">
                                        {medals[i] ??
                                            <span className="text-xs text-kce-muted font-bold">{i + 1}.</span>}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate flex items-center gap-1">
                                            {p.name}
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
                                                🎳 {p.total_pins} {t('stats.totalPins')} · Ø {p.avg_pins} · {p.throw_count} {t('stats.throwCount')}
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
                            </div>
                        )
                    })}

                    {players.length > 5 && (
                        <button type="button"
                                className="w-full text-xs text-kce-muted py-2 font-bold"
                                onClick={() => setShowAllMembers(v => !v)}>
                            {showAllMembers ? t('stats.showLess') : `${t('stats.showAllMembers')} (${players.length})`}
                        </button>
                    )}
                </>
            )}
        </div>
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
