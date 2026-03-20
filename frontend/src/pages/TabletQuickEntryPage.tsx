/**
 * Tablet/Landscape Quick Entry overlay — fullscreen panel for fast penalty & drink logging.
 * Two-column layout: players on the left, penalty type buttons (grouped by amount) + drinks on the right.
 * A "recent entries" bar at the bottom shows the last 8 events without leaving the mode.
 */
import {useMemo, useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {toastError} from '@/utils/error.ts'
import type {EveningPlayer, PenaltyType} from '@/types.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fTime(ms: number) {
    return new Date(ms).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})
}

interface Props {
    eveningId: number
    players: EveningPlayer[]
    onClose: () => void
}

export function TabletQuickEntryPage({eveningId, players, onClose}: Props) {
    const t = useT()
    const qc = useQueryClient()
    const {evening, invalidate} = useActiveEvening()
    const penaltyTypes = useAppStore(s => s.penaltyTypes)
    const user = useAppStore(s => s.user)

    const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([])
    // Per-penalty-type counter (for count mode), defaults to 1
    const [penaltyCounters, setPenaltyCounters] = useState<Record<number, number>>({})
    const [flashingPenaltyId, setFlashingPenaltyId] = useState<number | null>(null)
    const [flashingDrink, setFlashingDrink] = useState<'beer' | 'shots' | null>(null)
    const [loadingPenaltyId, setLoadingPenaltyId] = useState<number | null>(null)
    const [loadingDrink, setLoadingDrink] = useState<'beer' | 'shots' | null>(null)

    // Sort: current user first, then alphabetical
    const sortedPlayers = useMemo(() =>
        [...players].sort((a, b) => {
            const myId = user?.regular_member_id
            if (myId && a.regular_member_id === myId) return -1
            if (myId && b.regular_member_id === myId) return 1
            return a.name.localeCompare(b.name)
        }), [players, user?.regular_member_id])

    // Group penalty types by default_amount, sort groups ascending by amount
    const penaltyGroups = useMemo(() => {
        const map = new Map<number, PenaltyType[]>()
        const sorted = [...penaltyTypes].sort((a, b) => a.sort_order - b.sort_order)
        for (const pt of sorted) {
            const key = pt.default_amount
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(pt)
        }
        return [...map.entries()].sort(([a], [b]) => a - b)
    }, [penaltyTypes])

    // Last 8 events mixed (penalties + drinks), newest first
    const recentEvents = useMemo(() => {
        if (!evening) return []
        type Event = {key: string; icon: string; label: string; time: number}
        const events: Event[] = []
        for (const p of evening.penalty_log) {
            const count = p.amount > 1 ? ` ×${p.amount}` : ''
            events.push({
                key: `p-${p.id}`,
                icon: p.icon,
                label: `${p.player_name}${count}`,
                time: p.client_timestamp,
            })
        }
        for (const d of evening.drink_rounds) {
            const icon = d.drink_type === 'beer' ? '🍺' : '🥃'
            events.push({
                key: `d-${d.id}`,
                icon,
                label: `${d.participant_ids.length}×`,
                time: d.client_timestamp,
            })
        }
        return events.sort((a, b) => b.time - a.time).slice(0, 8)
    }, [evening])

    function togglePlayer(id: number) {
        setSelectedPlayerIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        )
    }

    function getCounter(ptId: number): number {
        return penaltyCounters[ptId] ?? 1
    }

    function setCounter(ptId: number, value: number) {
        setPenaltyCounters(prev => ({...prev, [ptId]: value}))
    }

    async function logPenalty(pt: PenaltyType) {
        if (selectedPlayerIds.length === 0 || loadingPenaltyId !== null) return
        const count = getCounter(pt.id)
        setLoadingPenaltyId(pt.id)
        try {
            await api.addPenalty(eveningId, {
                player_ids: selectedPlayerIds,
                penalty_type_name: pt.name,
                icon: pt.icon,
                amount: count,
                mode: 'count',
                unit_amount: pt.default_amount,
                client_timestamp: Math.min(Date.now(), new Date(evening!.date).getTime()),
            })
            invalidate()
            qc.invalidateQueries({queryKey: ['member-balances']})
            qc.invalidateQueries({queryKey: ['guest-balances']})
            setFlashingPenaltyId(pt.id)
            setTimeout(() => setFlashingPenaltyId(null), 800)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setLoadingPenaltyId(null)
        }
    }

    async function logDrink(type: 'beer' | 'shots') {
        if (selectedPlayerIds.length === 0 || loadingDrink !== null) return
        setLoadingDrink(type)
        try {
            await api.addDrinkRound(eveningId, {
                drink_type: type,
                participant_ids: selectedPlayerIds,
                client_timestamp: Math.min(Date.now(), new Date(evening!.date).getTime()),
            })
            invalidate()
            setFlashingDrink(type)
            setTimeout(() => setFlashingDrink(null), 800)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setLoadingDrink(null)
        }
    }

    const noSelection = selectedPlayerIds.length === 0

    return (
        <div
            style={{position: 'fixed', inset: 0, zIndex: 60, background: 'var(--kce-bg)', display: 'flex', flexDirection: 'column'}}
        >
            {/* ── Header bar ── */}
            <div
                className="flex items-center gap-3 px-3 py-2 flex-shrink-0"
                style={{background: 'var(--kce-surface)', borderBottom: '1px solid var(--kce-border)'}}
            >
                <span className="font-bold text-kce-amber text-sm">⚡ {t('quickEntry.title')}</span>
                <span className="text-xs text-kce-muted flex-1">
                    {noSelection
                        ? t('quickEntry.selectPlayer')
                        : `${selectedPlayerIds.length} ${t('quickEntry.selected')}`}
                </span>
                <button
                    type="button"
                    className="btn-secondary btn-xs"
                    onClick={() => setSelectedPlayerIds(sortedPlayers.map(p => p.id))}
                >
                    {t('action.all')}
                </button>
                <button
                    type="button"
                    className="btn-secondary btn-xs"
                    onClick={() => setSelectedPlayerIds([])}
                >
                    {t('action.none')}
                </button>
                <button type="button" className="btn-secondary btn-xs" onClick={onClose}>
                    ✕
                </button>
            </div>

            {/* ── Two-column body ── */}
            <div style={{flex: 1, overflow: 'hidden', display: 'flex'}}>

                {/* Left: player list */}
                <div
                    className="overflow-y-auto p-2 flex flex-col gap-1.5"
                    style={{width: '35%', borderRight: '1px solid var(--kce-border)', flexShrink: 0}}
                >
                    <div className="field-label px-1">{t('penalty.who')}</div>
                    {sortedPlayers.map(p => {
                        const isMe = user?.regular_member_id !== null &&
                            p.regular_member_id === user?.regular_member_id
                        const isSelected = selectedPlayerIds.includes(p.id)
                        return (
                            <button
                                key={p.id}
                                type="button"
                                className={`w-full text-left px-3 py-2.5 rounded-xl border font-bold text-sm
                                    transition-all active:scale-95 flex items-center gap-1.5
                                    ${isSelected
                                        ? 'border-kce-amber text-kce-amber'
                                        : 'border-kce-border text-kce-cream'}
                                `}
                                style={{
                                    background: isSelected ? 'rgba(232,160,32,0.12)' : 'var(--kce-surface2)',
                                }}
                                onClick={() => togglePlayer(p.id)}
                            >
                                {p.is_king && <span>👑</span>}
                                <span className="flex-1 truncate">{p.name}</span>
                                {isMe && (
                                    <span className="text-[9px] font-bold text-kce-amber flex-shrink-0">Ich</span>
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* Right: penalty groups + drinks */}
                <div className="flex-1 overflow-y-auto p-3">

                    {penaltyGroups.map(([amount, types]) => (
                        <div key={amount} className="mb-5">
                            <div className="field-label mb-2">{fe(amount)}</div>
                            <div className="flex flex-wrap gap-2">
                                {types.map(pt => {
                                    const isFlashing = flashingPenaltyId === pt.id
                                    const isLoading = loadingPenaltyId === pt.id
                                    const counter = getCounter(pt.id)
                                    return (
                                        <div key={pt.id} className="flex flex-col gap-1">
                                            <button
                                                type="button"
                                                disabled={noSelection || isLoading}
                                                className={`px-4 py-3 rounded-xl border font-bold text-sm
                                                    transition-all active:scale-95
                                                    disabled:opacity-40 disabled:cursor-not-allowed
                                                `}
                                                style={{
                                                    background: isFlashing
                                                        ? 'rgba(34,197,94,0.15)'
                                                        : 'var(--kce-surface2)',
                                                    borderColor: isFlashing ? '#16a34a' : 'var(--kce-border)',
                                                    color: isFlashing ? '#86efac' : 'var(--kce-cream)',
                                                }}
                                                onClick={() => logPenalty(pt)}
                                            >
                                                {isFlashing ? '✓ ' : ''}{pt.icon} {pt.name}
                                            </button>
                                            {/* Count chips: ×1 ×2 ×3 ×4 ×5 */}
                                            <div className="flex gap-1">
                                                {[1, 2, 3, 4, 5].map(n => (
                                                    <button
                                                        key={n}
                                                        type="button"
                                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all
                                                            ${counter === n
                                                                ? 'border-kce-amber text-kce-amber'
                                                                : 'border-kce-border text-kce-muted'}
                                                        `}
                                                        style={{
                                                            background: counter === n
                                                                ? 'rgba(232,160,32,0.12)'
                                                                : 'var(--kce-surface)',
                                                        }}
                                                        onClick={() => setCounter(pt.id, n)}
                                                    >
                                                        ×{n}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Drinks section */}
                    <div className="mb-5">
                        <div className="field-label mb-2">{t('drinks.title')}</div>
                        <div className="flex gap-2">
                            {(['beer', 'shots'] as const).map(dt => {
                                const isFlashing = flashingDrink === dt
                                const isLoading = loadingDrink === dt
                                return (
                                    <button
                                        key={dt}
                                        type="button"
                                        disabled={noSelection || isLoading}
                                        className={`flex-1 px-4 py-3 rounded-xl border font-bold text-sm
                                            transition-all active:scale-95
                                            disabled:opacity-40 disabled:cursor-not-allowed
                                        `}
                                        style={{
                                            background: isFlashing
                                                ? 'rgba(34,197,94,0.15)'
                                                : 'var(--kce-surface2)',
                                            borderColor: isFlashing ? '#16a34a' : 'var(--kce-border)',
                                            color: isFlashing ? '#86efac' : 'var(--kce-cream)',
                                        }}
                                        onClick={() => logDrink(dt)}
                                    >
                                        {isFlashing ? '✓ ' : ''}{dt === 'beer' ? `🍺 ${t('drinks.beer')}` : `🥃 ${t('drinks.shots')}`}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Recent entries bar ── */}
            {recentEvents.length > 0 && (
                <div
                    className="flex-shrink-0 px-3 py-2"
                    style={{
                        borderTop: '1px solid var(--kce-border)',
                        background: 'var(--kce-surface)',
                    }}
                >
                    <div className="field-label mb-1.5">{t('quickEntry.recent')}</div>
                    <div className="flex gap-2 overflow-x-auto pb-0.5" style={{scrollbarWidth: 'none'}}>
                        {recentEvents.map(ev => (
                            <div
                                key={ev.key}
                                className="flex-shrink-0 flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg"
                                style={{background: 'var(--kce-surface2)', border: '1px solid var(--kce-border)'}}
                            >
                                <span className="text-base leading-none">{ev.icon}</span>
                                <span className="text-[10px] text-kce-cream font-bold whitespace-nowrap">{ev.label}</span>
                                <span className="text-[9px] text-kce-muted">{fTime(ev.time)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
