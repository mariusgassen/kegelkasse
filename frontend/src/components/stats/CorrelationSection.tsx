/**
 * Penalties × drinks correlation analysis (#43), extracted from StatsPage into the
 * Statistik-Labor (#68).
 *
 * `CorrelationSection` is the year-wide view (strength ranking, per-evening scatter,
 * per-member scatter); `EveningCorrelationPanel` is the within-evening derivative view
 * (heat lanes, bin picker). They share the r-colour/badge helpers, so they stay together.
 *
 * Both components own their `useQuery` calls against the same query keys the page uses, so
 * react-query serves them from cache — mounting them here issues no extra request.
 */
import {useEffect, useMemo, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {api} from '@/api/client'
import type {TranslationKey} from '@/i18n/de'
import {Empty} from '@/components/ui/Empty.tsx'
import {Loading} from '@/components/ui/Loading.tsx'
import type {CorrelationStats, EveningCorrelation} from '@/types.ts'
import {interpretR, linearRegression, pearson} from '@/lib/stats'
import {playerColor, withAlpha} from '@/lib/chartColors.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

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
                          fontSize={10} fill="var(--kce-muted)">{tv.toFixed(2)}</text>
                </g>
            ))}
            {/* x ticks */}
            {xTicks.map((tv, i) => (
                <g key={`x${i}`}>
                    <line x1={xS(tv)} x2={xS(tv)} y1={SC_PAD.top + SC_IH} y2={SC_PAD.top + SC_IH + 3}
                          stroke="var(--kce-border)"/>
                    <text x={xS(tv)} y={SC_PAD.top + SC_IH + 12} textAnchor="middle"
                          fontSize={10} fill="var(--kce-muted)">{tv.toFixed(2)}</text>
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
            <text x={SC_PAD.left + SC_IW / 2} y={SC_VH - 2} textAnchor="middle" fontSize={10}
                  fill="var(--kce-muted)">{xLabel}</text>
            <text transform={`translate(10, ${SC_PAD.top + SC_IH / 2}) rotate(-90)`}
                  textAnchor="middle" dominantBaseline="middle" fontSize={10}
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
                          textAnchor="end" fontSize={10} fill="var(--kce-muted)">
                        {(maxP * f).toFixed(maxP < 5 ? 1 : 0)}
                    </text>
                ))}
                {/* y labels (right = drinks) */}
                {[0, 0.5, 1].map(f => (
                    <text key={`r${f}`} x={SC_PAD.left + SC_IW + 4} y={SC_PAD.top + (1 - f) * SC_IH + 3}
                          textAnchor="start" fontSize={10} fill="var(--kce-cream)">
                        {Math.round(maxD * f)}
                    </text>
                ))}
                {/* x labels */}
                {tickIdx.map(i => (
                    <text key={`t${i}`} x={xS(i)} y={SC_PAD.top + SC_IH + 12} textAnchor="middle"
                          fontSize={9} fill="var(--kce-muted)">{fmtX(bins[i].t)}</text>
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
                    <text x={SC_PAD.left + 14} y={SC_PAD.top + 5} fontSize={9} fill="var(--kce-muted)">{leftLabel}</text>
                    <rect x={SC_PAD.left + 4} y={SC_PAD.top + 10} width={8} height={3} fill="var(--kce-cream)"/>
                    <text x={SC_PAD.left + 14} y={SC_PAD.top + 13} fontSize={9} fill="var(--kce-muted)">{rightLabel}</text>
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
                                    : (focusedMember != null ? {opacity: 0.4, transition: 'none'} : {transition: 'none'})}
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


export function CorrelationSection({year, myMemberId, t}: {
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

            {isLoading && <Loading className="py-8"/>}

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
                                {fDate(filteredCorr!.evenings[selectedDot].date)} · {fe(filteredCorr!.evenings[selectedDot].penalty_euro)} · 🍻 {filteredCorr!.evenings[selectedDot].drink_count.toFixed(2)}
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
                      textAnchor="end" fontSize={10} fill="var(--kce-muted)">
                    {(maxP * f).toFixed(maxP < 5 ? 1 : 0)}
                </text>
            ))}
            {/* y labels (right = Δdrinks) */}
            {[0, 0.5, 1].map(f => (
                <text key={`r${f}`} x={SC_PAD.left + SC_IW + 4} y={SC_PAD.top + (1 - f) * SC_IH + 3}
                      textAnchor="start" fontSize={10} fill="var(--kce-cream)">
                    {Math.round(maxD * f)}
                </text>
            ))}
            {/* x labels */}
            {tickIdx.map(i => (
                <text key={`t${i}`} x={SC_PAD.left + (i + 0.5) * slot} y={SC_PAD.top + SC_IH + 12}
                      textAnchor="middle" fontSize={9} fill="var(--kce-muted)">{fmtTime(bins[i].t)}</text>
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
                <text x={SC_PAD.left + 14} y={SC_PAD.top + 5} fontSize={9} fill="var(--kce-muted)">{leftLabel}</text>
                <rect x={SC_PAD.left + 4} y={SC_PAD.top + 10} width={8} height={3} fill="var(--kce-cream)"/>
                <text x={SC_PAD.left + 14} y={SC_PAD.top + 13} fontSize={9} fill="var(--kce-muted)">{rightLabel}</text>
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
                {isMe && <tspan fill="var(--kce-primary)" fontSize={7} dx={3}> Ich</tspan>}
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
                        <text x={320 - 4} y={LANE_H / 2 - 3} fontSize={10} textAnchor="end"
                              fill="var(--kce-primary)" fontWeight={700}>
                            €{totalPenalty.toFixed(1)}
                        </text>
                        <text x={320 - 4} y={LANE_H / 2 + 8} fontSize={10} textAnchor="end"
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
                <text x={LANE_NAME_W - 4} y={LANE_H / 2 + 1} fontSize={9} textAnchor="end"
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


export function EveningCorrelationPanel({eveningId, myMemberId, t}: {
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
            {/* Titled "within one evening" rather than reusing the year-wide section title —
                in the Statistik-Labor both panels sit next to each other (#68). */}
            <div className="sec-heading text-sm mb-1">🎲 {t('stats.correlation.tab.timeline')}</div>
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
                                        : (pickedMemberId != null ? {opacity: 0.4, transition: 'none'} : {transition: 'none'})}
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

            {isLoading && <Loading className="py-8"/>}

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