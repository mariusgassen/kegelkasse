/**
 * Quick Entry overlay — fullscreen panel for fast penalty & drink logging.
 * Three-column layout: players | penalties | drinks (separate).
 * Fully respects iOS safe-area insets (notch, home indicator, rounded corners).
 *
 * Camera strip (top): shows live throws for the running game, with per-throw
 * void and turn-order management (alternating teams / block mode).
 */
import {useEffect, useMemo, useRef, useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {useAppStore, isAdmin} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {toastError} from '@/utils/error.ts'
import {buildTurnOrder} from '@/lib/turnOrder.ts'
import type {EveningPlayer, Game, PenaltyType, Team} from '@/types.ts'

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

    // Penalty / drink state
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([])
    const [flashingPenaltyId, setFlashingPenaltyId] = useState<number | null>(null)
    const [flashingDrink, setFlashingDrink] = useState<'beer' | 'shots' | null>(null)
    const [loadingPenaltyId, setLoadingPenaltyId] = useState<number | null>(null)
    const [loadingDrink, setLoadingDrink] = useState<'beer' | 'shots' | null>(null)
    const [confirmingKey, setConfirmingKey] = useState<string | null>(null)
    const [deletingKey, setDeletingKey] = useState<string | null>(null)

    // Turn order state (mode comes from the game's turn_mode field)
    const [blockTeamIdx, setBlockTeamIdx] = useState(0)
    const [currentTurnIdx, setCurrentTurnIdx] = useState(0)

    // Finish game state
    const [finishGameOpen, setFinishGameOpen] = useState(false)
    const [finishWinnerRef, setFinishWinnerRef] = useState('')
    const [finishSaving, setFinishSaving] = useState(false)
    const [voidingThrowId, setVoidingThrowId] = useState<number | null>(null)

    // Throw correction
    const [editingThrowId, setEditingThrowId] = useState<number | null>(null)
    const [editPins, setEditPins] = useState(0)
    const [editCumulative, setEditCumulative] = useState<number | null>(null)
    const [savingEditId, setSavingEditId] = useState<number | null>(null)

    // Auto-advance refs — track game + throw count to detect new arrivals without false-positives
    const autoGameIdRef = useRef<number | undefined>(undefined)   // undefined = uninitialized
    const autoThrowsLenRef = useRef<number>(0)

    // Heatmap toggle
    const [showHeatmap, setShowHeatmap] = useState(false)

    // Sort: current user first, then alphabetical
    const sortedPlayers = useMemo(() =>
        [...players].sort((a, b) => {
            const myId = user?.regular_member_id
            if (myId && a.regular_member_id === myId) return -1
            if (myId && b.regular_member_id === myId) return 1
            return a.name.localeCompare(b.name)
        }), [players, user?.regular_member_id])

    // Group penalty types by default_amount, sort groups ascending by amount; skip 0€ groups
    const penaltyGroups = useMemo(() => {
        const map = new Map<number, PenaltyType[]>()
        const sorted = [...penaltyTypes].sort((a, b) => a.sort_order - b.sort_order)
        for (const pt of sorted) {
            if (pt.default_amount === 0) continue
            const key = pt.default_amount
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(pt)
        }
        return [...map.entries()].sort(([a], [b]) => a - b)
    }, [penaltyTypes])

    // Last 8 events mixed (penalties + drinks), newest first
    const recentEvents = useMemo(() => {
        if (!evening) return []
        type Event = {key: string; icon: string; label: string; time: number; id: number; type: 'penalty' | 'drink'}
        const events: Event[] = []
        for (const p of evening.penalty_log) {
            const count = p.amount > 1 ? ` ×${p.amount}` : ''
            events.push({
                key: `p-${p.id}`,
                icon: p.icon,
                label: `${p.player_name}${count}`,
                time: p.client_timestamp,
                id: p.id,
                type: 'penalty',
            })
        }
        for (const d of evening.drink_rounds) {
            const icon = d.drink_type === 'beer' ? '🍺' : '🥃'
            events.push({
                key: `d-${d.id}`,
                icon,
                label: `${d.participant_ids.length}×`,
                time: d.client_timestamp,
                id: d.id,
                type: 'drink',
            })
        }
        return events.sort((a, b) => b.time - a.time).slice(0, 8)
    }, [evening])

    // Active game for the strip: show for any open or running game (turn order is useful pre-start too)
    const activeGame: Game | undefined = useMemo(() =>
        evening?.games.find(g => (g.status === 'running' || g.status === 'open') && !(g as any).is_deleted),
        [evening])
    // Keep `runningGame` as alias for the finish-game actions (only valid when actually running)
    const runningGame = activeGame?.status === 'running' ? activeGame : undefined

    // Turn order — mode is fixed on the game, not a runtime choice
    const teams = evening?.teams ?? []
    const gameTurnMode = activeGame?.turn_mode ?? 'alternating'
    const turnOrder = useMemo(() =>
        buildTurnOrder(players, teams, gameTurnMode, blockTeamIdx),
        [players, teams, gameTurnMode, blockTeamIdx])
    const currentPlayer = turnOrder.length > 0
        ? turnOrder[currentTurnIdx % turnOrder.length]
        : null

    // Sync active player to backend whenever currentPlayer or activeGame changes
    // so the kiosk knows who is throwing without manual selection.
    useEffect(() => {
        if (!activeGame || activeGame.status !== 'running' || !eveningId) return
        const pid = currentPlayer?.id ?? null
        api.setActivePlayer(eveningId, activeGame.id, pid).catch(() => {})
    }, [currentPlayer?.id, activeGame?.id, activeGame?.status, eveningId])

    // Auto-advance turn when a new throw arrives via SSE.
    const liveThrows = activeGame?.throws ?? []
    useEffect(() => {
        const gid = activeGame?.id
        const len = liveThrows.length

        // Uninitialized or game changed → align turn index to existing throw count
        if (autoGameIdRef.current === undefined || autoGameIdRef.current !== gid) {
            autoGameIdRef.current = gid
            autoThrowsLenRef.current = len
            setCurrentTurnIdx(len)  // sync to server state so current player is correct
            return
        }

        const prev = autoThrowsLenRef.current
        autoThrowsLenRef.current = len  // always update baseline (handles resets too)

        if (len > prev) {
            // One or more new throws — advance by delta
            setCurrentTurnIdx(t => t + (len - prev))
        }
    }, [liveThrows.length, activeGame?.id])

    function advanceTurn() {
        setCurrentTurnIdx(prev => prev + 1)
    }

    function resetTurn() {
        setCurrentTurnIdx(0)
    }

    function switchTeam() {
        setBlockTeamIdx(prev => (prev + 1) % Math.max(teams.length, 1))
        setCurrentTurnIdx(0)
    }

    async function handleStartGame() {
        if (!activeGame || activeGame.status !== 'open' || !evening) return
        try {
            await api.startGame(evening.id, activeGame.id)
            invalidate()
        } catch (e: unknown) {
            toastError(e)
        }
    }

    function togglePlayer(id: number) {
        setSelectedPlayerIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        )
    }

    async function deleteRecentEvent(key: string, id: number, type: 'penalty' | 'drink') {
        if (deletingKey !== null) return
        if (confirmingKey !== key) {
            setConfirmingKey(key)
            return
        }
        setDeletingKey(key)
        setConfirmingKey(null)
        try {
            if (type === 'penalty') {
                await api.deletePenalty(eveningId, id)
            } else {
                await api.deleteDrinkRound(eveningId, id)
            }
            invalidate()
            qc.invalidateQueries({queryKey: ['member-balances']})
            qc.invalidateQueries({queryKey: ['guest-balances']})
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setDeletingKey(null)
        }
    }

    async function logPenalty(pt: PenaltyType) {
        if (selectedPlayerIds.length === 0 || loadingPenaltyId !== null) return
        setLoadingPenaltyId(pt.id)
        try {
            await api.addPenalty(eveningId, {
                player_ids: selectedPlayerIds,
                penalty_type_name: pt.name,
                icon: pt.icon,
                amount: 1,
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

    async function handleVoidThrow(gameId: number, throwId: number) {
        try {
            setVoidingThrowId(throwId)
            await api.deleteCameraThrow(eveningId, gameId, throwId)
            invalidate()
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setVoidingThrowId(null)
        }
    }

    function startEdit(th: {id: number; pins: number; cumulative: number | null}) {
        setEditingThrowId(th.id)
        setEditPins(th.pins)
        setEditCumulative(th.cumulative)
    }

    function cancelEdit() {
        setEditingThrowId(null)
    }

    async function handleSaveEdit(gameId: number) {
        if (editingThrowId === null) return
        setSavingEditId(editingThrowId)
        try {
            await api.updateCameraThrow(eveningId, gameId, editingThrowId, {
                pins: editPins,
                cumulative: editCumulative,
            })
            invalidate()
            setEditingThrowId(null)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSavingEditId(null)
        }
    }

    async function handleFinishGame() {
        if (!runningGame || !finishWinnerRef || !evening) return
        setFinishSaving(true)
        try {
            const lastThrow = liveThrows.slice(-1)[0]
            const scores: Record<string, number> = {}
            if (lastThrow?.cumulative != null) scores[finishWinnerRef] = lastThrow.cumulative
            let winnerName = finishWinnerRef
            if (finishWinnerRef.startsWith('p:')) {
                const pid = parseInt(finishWinnerRef.slice(2))
                winnerName = evening.players.find(p => p.id === pid)?.name ?? finishWinnerRef
            } else if (finishWinnerRef.startsWith('t:')) {
                const tid = parseInt(finishWinnerRef.slice(2))
                winnerName = evening.teams.find(t => t.id === tid)?.name ?? finishWinnerRef
            }
            await api.finishGame(evening.id, runningGame.id, {
                winner_ref: finishWinnerRef,
                winner_name: winnerName,
                scores,
                loser_penalty: runningGame.loser_penalty,
            })
            invalidate()
            setFinishGameOpen(false)
            setFinishWinnerRef('')
            resetTurn()
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setFinishSaving(false)
        }
    }

    const noSelection = selectedPlayerIds.length === 0

    // Shared button style helpers
    function penaltyBtnStyle(isFlashing: boolean) {
        return {
            background: isFlashing ? 'rgba(34,197,94,0.15)' : 'var(--kce-surface2)',
            borderColor: isFlashing ? '#16a34a' : 'var(--kce-border)',
            color: isFlashing ? '#86efac' : 'var(--kce-cream)',
        }
    }

    function drinkBtnStyle(isFlashing: boolean) {
        return {
            background: isFlashing ? 'rgba(34,197,94,0.15)' : 'var(--kce-surface2)',
            borderColor: isFlashing ? '#16a34a' : 'var(--kce-border)',
            color: isFlashing ? '#86efac' : 'var(--kce-cream)',
        }
    }

    const lastThrow = liveThrows.length > 0 ? liveThrows[liveThrows.length - 1] : null

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'var(--kce-bg)',
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* ── Header — respects top + side safe areas ── */}
            <div
                className="flex items-center gap-2 flex-shrink-0"
                style={{
                    background: 'var(--kce-surface)',
                    borderBottom: '1px solid var(--kce-border)',
                    paddingTop: 'max(env(safe-area-inset-top), 8px)',
                    paddingBottom: '8px',
                    paddingLeft: 'max(env(safe-area-inset-left), 12px)',
                    paddingRight: 'max(env(safe-area-inset-right), 12px)',
                }}
            >
                <span className="font-bold text-kce-amber text-sm">⚡ {t('quickEntry.title')}</span>
                <span className="text-xs text-kce-muted flex-1 truncate">
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

            {/* ── Teams required warning ── */}
            {teams.length === 0 && (
                <div style={{
                    flexShrink: 0, padding: '8px 12px',
                    background: 'rgba(239,68,68,0.1)',
                    borderBottom: '1px solid rgba(239,68,68,0.3)',
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <span style={{fontSize: 12}}>⚠️</span>
                    <span style={{fontSize: 11, color: '#fca5a5'}}>{t('game.teamsRequired')}</span>
                </div>
            )}

            {/* ── Camera throw strip + turn order (for any active game) ── */}
            {activeGame && (
                <div style={{
                    flexShrink: 0,
                    background: 'color-mix(in srgb, var(--kce-primary) 8%, var(--kce-surface))',
                    borderBottom: '1px solid var(--kce-border)',
                    paddingLeft: 'max(env(safe-area-inset-left), 10px)',
                    paddingRight: 'max(env(safe-area-inset-right), 10px)',
                    paddingTop: 6,
                    paddingBottom: 6,
                }}>
                    {/* Row 1: Turn order indicator */}
                    <div style={{display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5}}>
                        <span style={{
                            fontSize: 10, fontWeight: 'bold',
                            color: 'var(--kce-primary)', flexShrink: 0,
                        }}>
                            🎳 {activeGame.name}
                            {activeGame.status === 'open' && (
                                <span style={{fontSize: 9, color: 'var(--kce-muted)', fontWeight: 'normal', marginLeft: 4}}>
                                    (offen)
                                </span>
                            )}
                        </span>

                        {/* Turn mode badge — read-only, set on the game */}
                        {activeGame.turn_mode && (
                            <span style={{
                                fontSize: 9, padding: '1px 6px',
                                borderRadius: 6, border: '1px solid var(--kce-border)',
                                color: 'var(--kce-muted)', background: 'var(--kce-surface2)',
                                flexShrink: 0,
                            }}>
                                {t(`game.turnMode.${activeGame.turn_mode}` as any)}
                            </span>
                        )}

                        <div style={{flex: 1}}/>

                        {/* Start game button — open games only */}
                        {activeGame.status === 'open' && isAdmin(user) && (
                            <button
                                type="button"
                                className="btn-primary btn-xs"
                                style={{flexShrink: 0, fontSize: 10}}
                                onClick={handleStartGame}
                            >
                                ▶ {t('game.start')}
                            </button>
                        )}

                        {/* Finish game button (admin only, running games only) */}
                        {activeGame.status === 'running' && isAdmin(user) && (
                            <button
                                type="button"
                                className="btn-secondary btn-xs"
                                style={{flexShrink: 0, fontSize: 10}}
                                onClick={() => setFinishGameOpen(f => !f)}
                            >
                                🏁 {t('quickEntry.finishGame')}
                            </button>
                        )}
                    </div>

                    {/* Row 2: Current player + next queue + score */}
                    {turnOrder.length > 0 && (
                        <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
                            {/* Current player */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                background: 'var(--kce-primary)',
                                borderRadius: 8, padding: '3px 8px', flexShrink: 0,
                            }}>
                                <span style={{fontSize: 9, color: 'rgba(255,255,255,0.7)'}}>{t('quickEntry.currentPlayer')}</span>
                                <span style={{fontSize: 12, fontWeight: 'bold', color: '#fff'}}>
                                    {currentPlayer?.name ?? '—'}
                                </span>
                            </div>

                            {/* Next 3 in queue — always show 3 slots using modulo so cycle is visible */}
                            {turnOrder.length > 1 && Array.from({length: 3}, (_, i) => {
                                const p = turnOrder[(currentTurnIdx + i + 1) % turnOrder.length]
                                return (
                                    <span key={i} style={{
                                        fontSize: 10, color: 'var(--kce-muted)',
                                        background: 'var(--kce-surface2)',
                                        borderRadius: 6, padding: '2px 6px', flexShrink: 0,
                                        border: '1px solid var(--kce-border)',
                                    }}>
                                        {p.name}
                                    </span>
                                )
                            })}

                            <div style={{flex: 1}}/>

                            {/* Block mode: switch team button */}
                            {gameTurnMode === 'block' && teams.length >= 1 && (
                                <button
                                    type="button"
                                    className="btn-primary btn-xs"
                                    style={{fontSize: 10, flexShrink: 0}}
                                    onClick={switchTeam}
                                >
                                    ⇄ {t('quickEntry.switchTeam')}
                                    {teams.length > 1 && (
                                        <span style={{opacity: 0.75, marginLeft: 4}}>
                                            → {teams[(blockTeamIdx + 1) % teams.length]?.name ?? ''}
                                        </span>
                                    )}
                                </button>
                            )}

                            {/* Manual advance button */}
                            <button
                                type="button"
                                className="btn-secondary btn-xs"
                                style={{flexShrink: 0, fontSize: 10}}
                                onClick={advanceTurn}
                            >
                                {t('quickEntry.advanceTurn')} ▶
                            </button>
                        </div>
                    )}

                    {/* Row 3: Throw history strip + heatmap toggle */}
                    {liveThrows.length > 0 && (
                        <>
                        <div style={{display: 'flex', gap: 4, overflowX: 'auto', marginTop: 5, paddingBottom: 2, alignItems: 'center'}} className="no-scrollbar">
                            {[...liveThrows].reverse().map(th => {
                                const throwerName = th.player_id
                                ? (players.find(p => p.id === th.player_id)?.name ?? null)
                                : null
                                const isEditing = editingThrowId === th.id
                                if (isEditing) {
                                    return (
                                        <div key={th.id} style={{
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            background: 'color-mix(in srgb, var(--kce-primary) 12%, var(--kce-surface2))',
                                            borderRadius: 6, padding: '3px 6px',
                                            flexShrink: 0,
                                            border: '1px solid var(--kce-primary)',
                                        }}>
                                            <span style={{fontSize: 9, color: 'var(--kce-muted)'}}>#{th.throw_num}</span>
                                            <input
                                                type="number" min="0" max="9"
                                                value={editPins}
                                                onChange={e => setEditPins(Math.min(9, Math.max(0, parseInt(e.target.value) || 0)))}
                                                style={{
                                                    width: 36, fontSize: 13, fontFamily: 'monospace', fontWeight: 'bold',
                                                    padding: '1px 4px', borderRadius: 4,
                                                    background: 'var(--kce-surface)', border: '1px solid var(--kce-primary)',
                                                    color: 'var(--kce-amber)', textAlign: 'center',
                                                }}
                                            />
                                            <span style={{fontSize: 9, color: 'var(--kce-muted)'}}>Σ</span>
                                            <input
                                                type="number" min="0"
                                                value={editCumulative ?? ''}
                                                placeholder="—"
                                                onChange={e => setEditCumulative(e.target.value ? parseInt(e.target.value) : null)}
                                                style={{
                                                    width: 44, fontSize: 11, fontFamily: 'monospace',
                                                    padding: '1px 4px', borderRadius: 4,
                                                    background: 'var(--kce-surface)', border: '1px solid var(--kce-border)',
                                                    color: 'var(--kce-cream)', textAlign: 'center',
                                                }}
                                            />
                                            <button
                                                type="button"
                                                disabled={savingEditId === th.id}
                                                style={{fontSize: 11, color: '#4ade80', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px'}}
                                                onClick={() => handleSaveEdit(activeGame.id)}
                                            >✓</button>
                                            <button
                                                type="button"
                                                style={{fontSize: 10, color: 'var(--kce-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px'}}
                                                onClick={cancelEdit}
                                            >✕</button>
                                        </div>
                                    )
                                }
                                return (
                                    <div key={th.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 3,
                                        background: 'var(--kce-surface2)',
                                        borderRadius: 6, padding: '2px 4px 2px 6px',
                                        flexShrink: 0,
                                        border: '1px solid var(--kce-border)',
                                    }}>
                                        <span style={{fontSize: 9, color: 'var(--kce-muted)'}}>#{th.throw_num}</span>
                                        {throwerName && (
                                            <span style={{fontSize: 9, color: 'var(--kce-primary)', fontWeight: 'bold'}}>
                                                {throwerName}
                                            </span>
                                        )}
                                        <span style={{
                                            fontSize: 13, fontFamily: 'monospace',
                                            fontWeight: 'bold', color: 'var(--kce-amber)',
                                        }}>
                                            {th.pins}
                                        </span>
                                        {th.cumulative !== null && (
                                            <span style={{fontSize: 9, color: 'var(--kce-muted)'}}>
                                                Σ{th.cumulative}
                                            </span>
                                        )}
                                        {isAdmin(user) && (
                                            <button
                                                type="button"
                                                style={{fontSize: 9, color: 'var(--kce-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px'}}
                                                title={t('quickEntry.editThrow')}
                                                onClick={() => startEdit(th)}
                                            >✎</button>
                                        )}
                                        <button
                                            type="button"
                                            disabled={voidingThrowId === th.id}
                                            style={{
                                                fontSize: 10, color: '#f87171',
                                                background: 'none', border: 'none',
                                                cursor: 'pointer', padding: '0 2px',
                                                opacity: voidingThrowId === th.id ? 0.4 : 1,
                                            }}
                                            title={t('quickEntry.voidThrow')}
                                            onClick={() => handleVoidThrow(activeGame.id, th.id)}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                )
                            })}
                            {/* Heatmap toggle */}
                            {liveThrows.some(th => th.pin_states && th.pin_states.length === 9) && (
                                <button
                                    type="button"
                                    className="btn-secondary btn-xs"
                                    style={{flexShrink: 0, fontSize: 9, marginLeft: 2}}
                                    onClick={() => setShowHeatmap(h => !h)}
                                >
                                    🎯
                                </button>
                            )}
                        </div>
                        {/* Pin heatmap */}
                        {showHeatmap && (() => {
                            const throwsWithPins = liveThrows.filter(th => th.pin_states && th.pin_states.length === 9)
                            const counts = Array(9).fill(0)
                            for (const th of throwsWithPins) {
                                for (let i = 0; i < 9; i++) {
                                    if (th.pin_states[i]) counts[i]++
                                }
                            }
                            const maxCount = Math.max(...counts, 1)
                            // True 1-2-3-2-1 diamond positions (same as cameraEngine PIN_POSITIONS)
                            const PIN_POS: [number, number][] = [
                                [0.50, 0.10],
                                [0.30, 0.30], [0.70, 0.30],
                                [0.10, 0.50], [0.50, 0.50], [0.90, 0.50],
                                [0.30, 0.70], [0.70, 0.70],
                                [0.50, 0.90],
                            ]
                            return (
                                <div style={{marginTop: 6, display: 'flex', alignItems: 'center', gap: 10}}>
                                    <div style={{position: 'relative', width: 80, height: 70, flexShrink: 0}}>
                                        {PIN_POS.map(([px, py], i) => {
                                            const ratio = counts[i] / maxCount
                                            const bg = ratio === 0
                                                ? 'transparent'
                                                : `color-mix(in srgb, var(--kce-amber) ${Math.round(ratio * 100)}%, var(--kce-surface2))`
                                            return (
                                                <div key={i} style={{
                                                    position: 'absolute',
                                                    left: `${px * 100}%`, top: `${py * 100}%`,
                                                    transform: 'translate(-50%, -50%)',
                                                    width: 18, height: 18, borderRadius: '50%',
                                                    background: bg,
                                                    border: `2px solid ${ratio > 0 ? 'var(--kce-amber)' : '#555'}`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    {counts[i] > 0 && (
                                                        <span style={{fontSize: 7, fontWeight: 'bold', color: ratio > 0.5 ? '#000' : 'var(--kce-amber)'}}>
                                                            {counts[i]}
                                                        </span>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div style={{fontSize: 9, color: 'var(--kce-muted)'}}>
                                        {t('quickEntry.heatmapHint').replace('{n}', String(throwsWithPins.length))}
                                    </div>
                                </div>
                            )
                        })()}
                        </>
                    )}

                    {/* Finish game panel (expanded) */}
                    {finishGameOpen && isAdmin(user) && (
                        <div style={{
                            marginTop: 8,
                            padding: '10px 12px',
                            background: 'var(--kce-surface)',
                            borderRadius: 10,
                            border: '1px solid var(--kce-border)',
                        }}>
                            <div style={{
                                fontSize: 11, fontWeight: 'bold',
                                color: 'var(--kce-cream)', marginBottom: 8,
                            }}>
                                🏁 {activeGame.name} — {t('quickEntry.selectWinner')}
                                {lastThrow?.cumulative != null && (
                                    <span style={{color: 'var(--kce-muted)', fontWeight: 'normal', marginLeft: 8}}>
                                        {t('quickEntry.gameScore')}: <strong style={{color: 'var(--kce-cream)'}}>{lastThrow.cumulative}</strong>
                                    </span>
                                )}
                            </div>
                            <div style={{display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8}}>
                                {activeGame.winner_type === 'team' && evening!.teams.map(team => (
                                    <button key={team.id} type="button"
                                            className={`chip ${finishWinnerRef === `t:${team.id}` ? 'active' : ''}`}
                                            onClick={() => setFinishWinnerRef(`t:${team.id}`)}>
                                        {team.name}
                                    </button>
                                ))}
                                {activeGame.winner_type === 'individual' && evening!.players.map(p => (
                                    <button key={p.id} type="button"
                                            className={`chip ${finishWinnerRef === `p:${p.id}` ? 'active' : ''}`}
                                            onClick={() => setFinishWinnerRef(`p:${p.id}`)}>
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                            <div style={{display: 'flex', gap: 6}}>
                                <button className="btn-secondary btn-sm" style={{flex: 1}}
                                        onClick={() => { setFinishGameOpen(false); setFinishWinnerRef('') }}>
                                    {t('action.cancel')}
                                </button>
                                <button className="btn-primary btn-sm" style={{flex: 1}}
                                        disabled={!finishWinnerRef || finishSaving}
                                        onClick={handleFinishGame}>
                                    ✓ {t('game.finish')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Three-column body — respects side safe areas ── */}
            <div style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                paddingLeft: 'env(safe-area-inset-left)',
                paddingRight: 'env(safe-area-inset-right)',
            }}>

                {/* Column 1: Players */}
                <div
                    className="overflow-y-auto p-2 flex flex-col gap-1"
                    style={{width: '30%', borderRight: '1px solid var(--kce-border)', flexShrink: 0}}
                >
                    <div className="field-label px-1 mb-0.5">{t('penalty.who')}</div>
                    {sortedPlayers.map(p => {
                        const isMe = user?.regular_member_id !== null &&
                            p.regular_member_id === user?.regular_member_id
                        const isSelected = selectedPlayerIds.includes(p.id)
                        const isCurrent = currentPlayer?.id === p.id
                        return (
                            <button
                                key={p.id}
                                type="button"
                                className={`w-full text-left px-2 py-2 rounded-xl border font-bold text-xs
                                    transition-all active:scale-95 flex items-center gap-1
                                    ${isSelected
                                        ? 'border-kce-amber text-kce-amber'
                                        : isCurrent
                                            ? 'border-kce-primary text-kce-primary'
                                            : 'border-kce-border text-kce-cream'}
                                `}
                                style={{
                                    background: isSelected
                                        ? 'rgba(232,160,32,0.12)'
                                        : isCurrent
                                            ? 'color-mix(in srgb, var(--kce-primary) 12%, transparent)'
                                            : 'var(--kce-surface2)',
                                }}
                                onClick={() => togglePlayer(p.id)}
                            >
                                {isCurrent && <span style={{fontSize: 11}}>🎳</span>}
                                {p.is_king && <span className="text-sm">👑</span>}
                                <span className="flex-1 truncate">{p.name}</span>
                                {isMe && (
                                    <span className="text-[9px] font-bold text-kce-amber flex-shrink-0">Ich</span>
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* Column 2: Penalties */}
                <div className="flex-1 overflow-y-auto p-3" style={{borderRight: '1px solid var(--kce-border)'}}>
                    {penaltyGroups.map(([amount, types]) => (
                        <div key={amount} className="mb-4">
                            <div className="field-label mb-2">{fe(amount)}</div>
                            <div className="flex flex-wrap gap-2">
                                {types.map(pt => {
                                    const isFlashing = flashingPenaltyId === pt.id
                                    const isLoading = loadingPenaltyId === pt.id
                                    return (
                                        <button
                                            key={pt.id}
                                            type="button"
                                            disabled={noSelection || isLoading}
                                            className={`px-4 py-3 rounded-xl border font-bold text-sm
                                                transition-all active:scale-95
                                                disabled:opacity-40 disabled:cursor-not-allowed
                                            `}
                                            style={penaltyBtnStyle(isFlashing)}
                                            onClick={() => logPenalty(pt)}
                                        >
                                            {isFlashing ? '✓ ' : ''}{pt.icon} {pt.name}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Column 3: Drinks — compact icon-only buttons */}
                <div
                    className="overflow-y-auto p-2 flex flex-col gap-2 items-center"
                    style={{width: '13%', flexShrink: 0}}
                >
                    <div className="field-label mb-0.5 text-center w-full">{t('drinks.title')}</div>
                    {(['beer', 'shots'] as const).map(dt => {
                        const isFlashing = flashingDrink === dt
                        const isLoading = loadingDrink === dt
                        return (
                            <button
                                key={dt}
                                type="button"
                                disabled={noSelection || isLoading}
                                className={`w-full px-1 py-3 rounded-xl border font-bold
                                    transition-all active:scale-95 flex flex-col items-center gap-0.5
                                    disabled:opacity-40 disabled:cursor-not-allowed
                                `}
                                style={drinkBtnStyle(isFlashing)}
                                onClick={() => logDrink(dt)}
                                title={dt === 'beer' ? t('drinks.beer') : t('drinks.shots')}
                            >
                                <span className="text-2xl leading-none">
                                    {isFlashing ? '✓' : dt === 'beer' ? '🍺' : '🥃'}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* ── Recent entries bar — respects bottom + side safe areas ── */}
            {recentEvents.length > 0 && (
                <div
                    className="flex-shrink-0 px-3 pt-2"
                    style={{
                        borderTop: '1px solid var(--kce-border)',
                        background: 'var(--kce-surface)',
                        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
                        paddingLeft: 'max(env(safe-area-inset-left), 12px)',
                        paddingRight: 'max(env(safe-area-inset-right), 12px)',
                    }}
                >
                    <div className="field-label mb-1">{t('quickEntry.recent')}</div>
                    <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{scrollbarWidth: 'none'}}>
                        {recentEvents.map(ev => {
                            const isConfirming = confirmingKey === ev.key
                            const isDeleting = deletingKey === ev.key
                            return (
                                <button
                                    key={ev.key}
                                    type="button"
                                    disabled={isDeleting}
                                    className="flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-40"
                                    style={{
                                        background: isConfirming ? 'rgba(239,68,68,0.15)' : 'var(--kce-surface2)',
                                        border: `1px solid ${isConfirming ? '#dc2626' : 'var(--kce-border)'}`,
                                    }}
                                    onClick={() => deleteRecentEvent(ev.key, ev.id, ev.type)}
                                    onBlur={() => { if (confirmingKey === ev.key) setConfirmingKey(null) }}
                                >
                                    <span className="text-sm leading-none">{isConfirming ? '🗑' : ev.icon}</span>
                                    <span className={`text-[10px] font-bold whitespace-nowrap ${isConfirming ? 'text-red-400' : 'text-kce-cream'}`}>
                                        {isConfirming ? '✕ löschen?' : ev.label}
                                    </span>
                                    <span className="text-[9px] text-kce-muted">{fTime(ev.time)}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
