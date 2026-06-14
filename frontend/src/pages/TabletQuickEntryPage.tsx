/**
 * Quick Entry overlay — fullscreen panel for fast penalty logging.
 * Sticky header carries the full game zone (identity, turn order, throw strip,
 * finish/new-game drawers).
 * Body below is three columns: players (selection) | penalties + drinks | per-player overview.
 * Drink rounds live as 🍺/🥃 buttons in the middle panel and reuse the same
 * player multi-selection as penalties (no separate sheet / hidden CTA).
 * Fully respects iOS safe-area insets (notch, home indicator, rounded corners).
 */
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {useAppStore, isAdmin} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {toastError} from '@/utils/error.ts'
import {buildTurnOrder} from '@/lib/turnOrder.ts'
import type {EveningPlayer, Game, GameTemplate, PenaltyLogEntry, PenaltyType, Team} from '@/types.ts'

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
    const {evening, invalidate, cancelPendingItem} = useActiveEvening()
    const penaltyTypes = useAppStore(s => s.penaltyTypes)
    const gameTemplates: GameTemplate[] = useAppStore(s => s.gameTemplates) ?? []
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
    const [finishScores, setFinishScores] = useState<Record<string, string>>({})
    const [finishSaving, setFinishSaving] = useState(false)
    const [voidingThrowId, setVoidingThrowId] = useState<number | null>(null)

    // Throw correction
    const [editingThrowId, setEditingThrowId] = useState<number | null>(null)
    const [editPins, setEditPins] = useState(0)
    const [editCumulative, setEditCumulative] = useState<number | null>(null)
    const [savingEditId, setSavingEditId] = useState<number | null>(null)

    // New-game creation (admin-only, shown when no active game)
    const [showNewGame, setShowNewGame] = useState(false)
    const [creatingGame, setCreatingGame] = useState(false)

    // Auto-advance refs — track game + throw count to detect new arrivals without false-positives
    const autoGameIdRef = useRef<number | undefined>(undefined)   // undefined = uninitialized
    const autoThrowsLenRef = useRef<number>(0)
    // Ref to turn order — avoids stale closure in init effect without adding turnOrder to deps
    const turnOrderRef = useRef<EveningPlayer[]>([])
    // Track which game we already did the active_player_id correction for (handles late-loading turnOrder)
    const correctedForGameRef = useRef<number | undefined>(undefined)

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

    // Per-entry euro value (matches ProtocolPage logic so totals stay consistent across views)
    const entryEuroValue = (l: PenaltyLogEntry): number => {
        if (l.mode === 'euro') return l.amount
        if (l.unit_amount != null) return l.amount * l.unit_amount
        const pt = penaltyTypes.find(pt => pt.name === l.penalty_type_name)
        return pt ? l.amount * pt.default_amount : 0
    }

    // Last 8 events mixed (manual penalties + drinks), newest first.
    // Exclude absence entries (player_id === null) and auto-created game loser penalties (game_id !== null).
    const recentEvents = useMemo(() => {
        if (!evening) return []
        type Event = {key: string; icon: string; label: string; time: number; id: number; type: 'penalty' | 'drink'}
        const events: Event[] = []
        for (const p of evening.penalty_log.filter(p => p.player_id !== null && p.game_id === null)) {
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
        return events.sort((a, b) => b.time - a.time).slice(0, 30)
    }, [evening])

    // Active game for the strip: show for any open or running game (turn order is useful pre-start too)
    const activeGame: Game | undefined = useMemo(() =>
        evening?.games.find(g => (g.status === 'running' || g.status === 'open') && !(g as any).is_deleted),
        [evening])

    // Per-player overview for the right column (penalty € total, current game score, drink counts).
    // NO guest cap here: the cap is a treasury-only settlement rule. This preliminary overview shows
    // the penalties each player *actually* incurred (a guest with 70 € shows 70 €), so the displayed
    // rows, the Σ total and the Ø average all reflect real amounts.
    const playerOverview = useMemo(() => {
        type Agg = {penaltyEuro: number; gameScore: number | null; beerCount: number; shotsCount: number}
        if (!evening) return new Map<number, Agg>()
        const map = new Map<number, Agg>()
        for (const p of players) {
            map.set(p.id, {penaltyEuro: 0, gameScore: null, beerCount: 0, shotsCount: 0})
        }
        // Actual penalty totals per present player (uncapped)
        for (const l of evening.penalty_log) {
            if (l.player_id == null) continue
            const cur = map.get(l.player_id)
            if (!cur) continue
            cur.penaltyEuro += entryEuroValue(l)
        }
        // Drink rounds
        for (const r of evening.drink_rounds) {
            for (const pid of r.participant_ids) {
                const cur = map.get(pid)
                if (!cur) continue
                if (r.drink_type === 'beer') cur.beerCount += 1
                else cur.shotsCount += 1
            }
        }
        // Current game score per player (last cumulative on their throws, fallback to sum of pins)
        const game = evening.games.find(g => (g.status === 'running' || g.status === 'open') && !(g as any).is_deleted)
        if (game?.status === 'running') {
            for (const p of players) {
                const myThrows = game.throws.filter(th => th.player_id === p.id)
                if (myThrows.length === 0) continue
                const last = myThrows[myThrows.length - 1]
                const cur = map.get(p.id)!
                cur.gameScore = last.cumulative ?? myThrows.reduce((s, th) => s + th.pins, 0)
            }
        }
        return map
        // entryEuroValue is closure over penaltyTypes so penaltyTypes covers it
    }, [evening, players, penaltyTypes])

    // Σ Strafen — sum of the actual penalties of the present players only (uncapped).
    // Absence / retroactive entries (player_id === null) are deliberately excluded: they belong to
    // members who aren't at the table and would distort this preliminary present-players overview.
    const overviewTotalEuro = useMemo(() => {
        let s = 0
        for (const v of playerOverview.values()) s += v.penaltyEuro
        return s
    }, [playerOverview])
    // Ø Strafen — average of the actual penalties incurred per present player (uncapped).
    const overviewAvgEuro = useMemo(() => {
        const n = playerOverview.size
        if (n === 0) return 0
        let s = 0
        for (const v of playerOverview.values()) s += v.penaltyEuro
        return s / n
    }, [playerOverview])

    // Overview column: sort by penalty € descending, alphabetical tiebreak.
    const overviewSortedPlayers = useMemo(() =>
        [...players].sort((a, b) => {
            const pa = playerOverview.get(a.id)?.penaltyEuro ?? 0
            const pb = playerOverview.get(b.id)?.penaltyEuro ?? 0
            if (pb !== pa) return pb - pa
            return a.name.localeCompare(b.name)
        }), [players, playerOverview])

    // FLIP animation refs for the overview column.
    const overviewRowRefs = useRef<Map<number, HTMLDivElement>>(new Map())
    const overviewPrevTopRef = useRef<Map<number, number>>(new Map())
    useLayoutEffect(() => {
        const prev = overviewPrevTopRef.current
        const next = new Map<number, number>()
        overviewRowRefs.current.forEach((el, id) => {
            next.set(id, el.getBoundingClientRect().top)
        })
        next.forEach((top, id) => {
            const old = prev.get(id)
            if (old != null && old !== top) {
                const el = overviewRowRefs.current.get(id)
                if (el) {
                    el.animate(
                        [{transform: `translateY(${old - top}px)`}, {transform: 'translateY(0)'}],
                        {duration: 350, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)'},
                    )
                }
            }
        })
        overviewPrevTopRef.current = next
    }, [overviewSortedPlayers])
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

    // Keep turnOrderRef in sync so the init effect can look up active_player_id without stale closure
    useEffect(() => { turnOrderRef.current = turnOrder }, [turnOrder])

    // Correction effect: if turnOrder was empty when the init effect ran (players still loading),
    // re-sync currentTurnIdx from active_player_id once turnOrder becomes available.
    // Only fires once per game (correctedForGameRef tracks this).
    useEffect(() => {
        const gid = activeGame?.id
        if (correctedForGameRef.current === gid) return  // already corrected for this game
        if (turnOrder.length === 0) return               // not ready yet — wait
        correctedForGameRef.current = gid
        const activePid = activeGame?.active_player_id ?? null
        if (activePid !== null) {
            const idx = turnOrder.findIndex(p => p.id === activePid)
            if (idx >= 0) setCurrentTurnIdx(idx)
        }
    }, [turnOrder, activeGame?.id, activeGame?.active_player_id])

    // Sync active player to backend whenever currentPlayer or activeGame changes
    // so the kiosk knows who is throwing without manual selection.
    // Guard: skip if turnOrder is empty (players still loading) to avoid overwriting server state.
    useEffect(() => {
        if (!activeGame || activeGame.status !== 'running' || !eveningId) return
        if (turnOrder.length === 0) return  // players not yet loaded — don't overwrite server value
        const pid = currentPlayer?.id ?? null
        api.setActivePlayer(eveningId, activeGame.id, pid).catch(() => {})
    }, [currentPlayer?.id, activeGame?.id, activeGame?.status, eveningId, turnOrder.length])

    // Auto-advance turn when a new throw arrives via SSE.
    const liveThrows = activeGame?.throws ?? []
    useEffect(() => {
        const gid = activeGame?.id
        const len = liveThrows.length

        // Uninitialized or game changed → align turn index to active_player_id (set by kiosk/camera)
        if (autoGameIdRef.current === undefined || autoGameIdRef.current !== gid) {
            autoGameIdRef.current = gid
            autoThrowsLenRef.current = len
            const activePid = activeGame?.active_player_id ?? null
            if (activePid !== null && turnOrderRef.current.length > 0) {
                const idxInOrder = turnOrderRef.current.findIndex(p => p.id === activePid)
                setCurrentTurnIdx(idxInOrder >= 0 ? idxInOrder : len)
            } else {
                setCurrentTurnIdx(len)
            }
            return
        }

        const prev = autoThrowsLenRef.current
        autoThrowsLenRef.current = len  // always update baseline (handles resets too)

        if (len > prev) {
            // One or more new throws — advance by delta
            setCurrentTurnIdx(t => t + (len - prev))
        }
    }, [liveThrows.length, activeGame?.id, activeGame?.active_player_id])

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

    async function handleCreateGame(tmpl: GameTemplate) {
        setCreatingGame(true)
        try {
            const game = await api.addGame(eveningId, {
                name: tmpl.name,
                template_id: tmpl.id,
                is_opener: tmpl.is_opener,
                winner_type: tmpl.winner_type,
                turn_mode: tmpl.turn_mode,
                loser_penalty: tmpl.default_loser_penalty,
                per_point_penalty: tmpl.per_point_penalty,
                client_timestamp: Date.now(),
            })
            await api.startGame(eveningId, game.id)
            invalidate()
            setShowNewGame(false)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setCreatingGame(false)
        }
    }

    function togglePlayer(id: number) {
        setSelectedPlayerIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        )
    }

    async function deleteRecentEvent(key: string, id: number, type: 'penalty' | 'drink') {
        // Pending item (id < 0) — cancel the queued operation directly (no server call)
        if (id < 0) {
            await cancelPendingItem(id, type)
            return
        }
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
                client_timestamp: Date.now(),
            })
            invalidate()
            qc.invalidateQueries({queryKey: ['member-balances']})
            qc.invalidateQueries({queryKey: ['guest-balances']})
            setSelectedPlayerIds([])
            setFlashingPenaltyId(pt.id)
            setTimeout(() => setFlashingPenaltyId(null), 800)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setLoadingPenaltyId(null)
        }
    }

    // Log a drink round for the currently selected players — same selection flow as penalties.
    async function logDrink(type: 'beer' | 'shots') {
        if (selectedPlayerIds.length === 0 || loadingDrink !== null) return
        setLoadingDrink(type)
        try {
            await api.addDrinkRound(eveningId, {
                drink_type: type,
                participant_ids: selectedPlayerIds,
                client_timestamp: Date.now(),
            })
            invalidate()
            setSelectedPlayerIds([])
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
            const scores: Record<string, number> = {}
            for (const [ref, val] of Object.entries(finishScores)) {
                const n = parseFloat(val)
                if (!isNaN(n)) scores[ref] = n
            }
            // Fall back to last camera-throw cumulative for winner if no manual score entered
            const lastThrow = liveThrows.slice(-1)[0]
            if (!(finishWinnerRef in scores) && lastThrow?.cumulative != null) {
                scores[finishWinnerRef] = lastThrow.cumulative
            }
            let winnerName = finishWinnerRef
            if (finishWinnerRef.startsWith('p:')) {
                const pid = parseInt(finishWinnerRef.slice(2))
                const wp = evening.players.find(p => p.id === pid)
                winnerName = wp ? (wp.nickname || wp.name) : finishWinnerRef
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
            setFinishScores({})
            resetTurn()
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setFinishSaving(false)
        }
    }

    const noSelection = selectedPlayerIds.length === 0
    const lastThrow = liveThrows.length > 0 ? liveThrows[liveThrows.length - 1] : null

    // Shared button style helpers
    function penaltyBtnStyle(isFlashing: boolean) {
        return {
            background: isFlashing ? 'rgba(34,197,94,0.15)' : 'var(--kce-surface2)',
            borderColor: isFlashing ? '#16a34a' : 'var(--kce-border)',
            color: isFlashing ? '#86efac' : 'var(--kce-cream)',
        }
    }

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'var(--kce-bg)',
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* ── Header — full-width sticky game zone ── */}
            <div
                className="flex-shrink-0"
                style={{
                    background: 'var(--kce-surface)',
                    borderBottom: '1px solid var(--kce-border)',
                    paddingTop: 'max(env(safe-area-inset-top), 8px)',
                    paddingBottom: '6px',
                    paddingLeft: 'max(env(safe-area-inset-left), 12px)',
                    paddingRight: 'max(env(safe-area-inset-right), 12px)',
                }}
            >
                {/* Row 1: close + game identity + primary actions */}
                <div style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                    <button type="button" className="btn-secondary btn-xs" onClick={onClose} aria-label="Close">
                        ✕
                    </button>
                    {activeGame ? (
                        <>
                            <span style={{fontSize: 12, fontWeight: 'bold', color: 'var(--kce-primary)'}}>
                                🎳 {activeGame.name}
                                {activeGame.status === 'open' && (
                                    <span style={{fontSize: 10, color: 'var(--kce-muted)', fontWeight: 'normal', marginLeft: 4}}>
                                        (offen)
                                    </span>
                                )}
                            </span>
                            {activeGame.turn_mode && (
                                <span style={{
                                    fontSize: 9, padding: '1px 6px',
                                    borderRadius: 6, border: '1px solid var(--kce-border)',
                                    color: 'var(--kce-muted)', background: 'var(--kce-surface2)',
                                }}>
                                    {t(`game.turnMode.${activeGame.turn_mode}` as any)}
                                </span>
                            )}
                            <div style={{flex: 1, minWidth: 0}}/>
                            {activeGame.status === 'open' && isAdmin(user) && (
                                <button type="button" className="btn-primary btn-xs" onClick={handleStartGame}>
                                    ▶ {t('game.start')}
                                </button>
                            )}
                            {activeGame.status === 'running' && isAdmin(user) && (
                                <button type="button" className="btn-secondary btn-xs"
                                        onClick={() => setFinishGameOpen(f => !f)}>
                                    🏁 {t('quickEntry.finishGame')}
                                </button>
                            )}
                        </>
                    ) : isAdmin(user) ? (
                        <>
                            <span className="font-bold text-kce-amber text-sm">⚡ {t('quickEntry.title')}</span>
                            <div style={{flex: 1, minWidth: 0}}/>
                            {!showNewGame && (
                                <button type="button" className="btn-secondary btn-xs"
                                        onClick={() => setShowNewGame(true)}>
                                    ＋ {t('quickEntry.newGame')}
                                </button>
                            )}
                        </>
                    ) : (
                        <span className="font-bold text-kce-amber text-sm flex-1">⚡ {t('quickEntry.title')}</span>
                    )}
                </div>

                {/* Teams required warning — block mode without teams */}
                {activeGame?.turn_mode === 'block' && teams.length === 0 && (
                    <div style={{
                        marginTop: 6, padding: '4px 8px',
                        background: 'rgba(239,68,68,0.1)',
                        borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)',
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                        <span style={{fontSize: 11}}>⚠️</span>
                        <span style={{fontSize: 10, color: '#fca5a5'}}>{t('game.teamsRequired')}</span>
                    </div>
                )}

                {/* Row 2: turn order — current + queue + switch/advance */}
                {activeGame && turnOrder.length > 0 && (
                    <div style={{
                        marginTop: 6,
                        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                    }}>
                        {/* Current player badge */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            background: 'var(--kce-primary)',
                            borderRadius: 8, padding: '3px 8px',
                        }}>
                            <span style={{fontSize: 9, color: 'rgba(255,255,255,0.7)'}}>{t('quickEntry.currentPlayer')}</span>
                            <span style={{fontSize: 12, fontWeight: 'bold', color: '#fff'}}>
                                {currentPlayer?.name ?? '—'}
                            </span>
                        </div>
                        {/* Next 3 in queue */}
                        {turnOrder.length > 1 && Array.from({length: 3}, (_, i) => {
                            const p = turnOrder[(currentTurnIdx + i + 1) % turnOrder.length]
                            return (
                                <span key={i} style={{
                                    fontSize: 10, color: 'var(--kce-muted)',
                                    background: 'var(--kce-surface2)',
                                    borderRadius: 6, padding: '2px 6px',
                                    border: '1px solid var(--kce-border)',
                                }}>
                                    {p.name}
                                </span>
                            )
                        })}
                        <div style={{flex: 1, minWidth: 0}}/>
                        {/* Block mode: switch team */}
                        {gameTurnMode === 'block' && teams.length >= 1 && (
                            <button type="button" className="btn-primary btn-xs" onClick={switchTeam}>
                                ⇄ {t('quickEntry.switchTeam')}
                                {teams.length > 1 && (
                                    <span style={{opacity: 0.75, marginLeft: 4}}>
                                        → {teams[(blockTeamIdx + 1) % teams.length]?.name ?? ''}
                                    </span>
                                )}
                            </button>
                        )}
                        {/* Manual advance */}
                        <button type="button" className="btn-secondary btn-xs" onClick={advanceTurn}>
                            {t('quickEntry.advanceTurn')} ▶
                        </button>
                    </div>
                )}

                {/* Row 3: throw history strip + heatmap toggle */}
                {activeGame && liveThrows.length > 0 && (
                    <div style={{marginTop: 6}}>
                        <div style={{display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2, alignItems: 'center'}} className="no-scrollbar">
                            {[...liveThrows].reverse().map(th => {
                                const throwerPlayer = th.player_id ? players.find(p => p.id === th.player_id) : null
                                const throwerName = throwerPlayer ? (throwerPlayer.nickname || throwerPlayer.name) : null
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
                                                onClick={() => activeGame && handleSaveEdit(activeGame.id)}
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
                                            onClick={() => activeGame && handleVoidThrow(activeGame.id, th.id)}
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
                    </div>
                )}

                {/* Drawer: finish game panel */}
                {finishGameOpen && isAdmin(user) && activeGame && (
                    <div style={{
                        marginTop: 6,
                        padding: '10px 12px',
                        background: 'var(--kce-surface2)',
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
                                    {p.nickname || p.name}
                                </button>
                            ))}
                        </div>
                        {/* Score inputs */}
                        <div style={{marginBottom: 8}}>
                            <div style={{fontSize: 10, color: 'var(--kce-muted)', marginBottom: 4}}>
                                {t('game.scores')}
                            </div>
                            <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                                {activeGame.winner_type === 'team'
                                    ? evening!.teams.map(team => (
                                        <div key={`t:${team.id}`} style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                            <span style={{fontSize: 11, color: 'var(--kce-cream)', flex: 1}}>{team.name}</span>
                                            <input
                                                className="kce-input"
                                                type="number" min="0"
                                                style={{width: 64}}
                                                value={finishScores[`t:${team.id}`] ?? ''}
                                                onChange={e => setFinishScores(prev => ({...prev, [`t:${team.id}`]: e.target.value}))}
                                                placeholder="0"
                                            />
                                        </div>
                                    ))
                                    : evening!.players.map(p => (
                                        <div key={`p:${p.id}`} style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                            <span style={{fontSize: 11, color: 'var(--kce-cream)', flex: 1}}>{p.nickname || p.name}</span>
                                            <input
                                                className="kce-input"
                                                type="number" min="0"
                                                style={{width: 64}}
                                                value={finishScores[`p:${p.id}`] ?? ''}
                                                onChange={e => setFinishScores(prev => ({...prev, [`p:${p.id}`]: e.target.value}))}
                                                placeholder="0"
                                            />
                                        </div>
                                    ))
                                }
                            </div>
                        </div>
                        <div style={{display: 'flex', gap: 6}}>
                            <button className="btn-secondary btn-sm" style={{flex: 1}}
                                    onClick={() => { setFinishGameOpen(false); setFinishWinnerRef(''); setFinishScores({}) }}>
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

                {/* Drawer: new-game template picker */}
                {showNewGame && isAdmin(user) && !activeGame && (
                    <div style={{marginTop: 6}}>
                        <div className="field-label mb-1">{t('club.gameTemplates')}</div>
                        <div style={{display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6}}>
                            {gameTemplates.map(tmpl => (
                                <button
                                    key={tmpl.id}
                                    type="button"
                                    className="chip"
                                    disabled={creatingGame}
                                    onClick={() => handleCreateGame(tmpl)}
                                >
                                    {tmpl.name}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            className="btn-secondary btn-xs"
                            onClick={() => setShowNewGame(false)}
                        >
                            {t('action.cancel')}
                        </button>
                    </div>
                )}
            </div>

            {/* ── Three-column body — respects side safe areas ── */}
            <div style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                paddingLeft: 'env(safe-area-inset-left)',
                paddingRight: 'env(safe-area-inset-right)',
            }}>

                {/* Column 1: Players (game zone now lives in the header) */}
                <div style={{
                    width: '22%',
                    borderRight: '1px solid var(--kce-border)',
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                }}>

                    {/* ── Player list ── */}
                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                    }}>
                        {/* Header row: label + selection status + All/None */}
                        <div style={{display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2}}>
                            <span className="field-label">{t('penalty.who')}</span>
                            <span style={{flex: 1, fontSize: 10, color: 'var(--kce-muted)', textAlign: 'center'}}>
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
                        </div>

                        {/* Player buttons */}
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
                </div>

                {/* Column 2: Drinks + Penalties — both driven by the column-1 player selection */}
                <div className="flex-1 overflow-y-auto p-3" style={{borderRight: '1px solid var(--kce-border)'}}>
                    {/* Drinks — same multi-select flow as penalties (no separate sheet) */}
                    <div className="mb-4">
                        <div className="field-label mb-2">{t('drinks.title')}</div>
                        <div className="flex flex-wrap gap-2">
                            {(['beer', 'shots'] as const).map(dt => {
                                const isFlashing = flashingDrink === dt
                                const isLoading = loadingDrink === dt
                                return (
                                    <button
                                        key={dt}
                                        type="button"
                                        disabled={noSelection || isLoading}
                                        className={`px-4 py-3 rounded-xl border font-bold text-sm
                                            transition-all active:scale-95
                                            disabled:opacity-40 disabled:cursor-not-allowed
                                        `}
                                        style={penaltyBtnStyle(isFlashing)}
                                        onClick={() => logDrink(dt)}
                                    >
                                        {isFlashing ? '✓ ' : ''}{dt === 'beer' ? '🍺' : '🥃'} {dt === 'beer' ? t('drinks.beer') : t('drinks.shots')}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
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

                {/* Column 3: Per-player overview — read-only stats for plausibility check */}
                <div
                    style={{
                        width: '22%',
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 0,
                        padding: '8px',
                    }}
                >
                    <div className="field-label mb-1 flex-shrink-0">{t('quickEntry.overview')}</div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minHeight: 0, overflowY: 'auto'}}>
                        {overviewSortedPlayers.map(p => {
                            const ov = playerOverview.get(p.id) ?? {penaltyEuro: 0, gameScore: null, beerCount: 0, shotsCount: 0}
                            const isMe = user?.regular_member_id !== null &&
                                p.regular_member_id === user?.regular_member_id
                            return (
                                <div
                                    key={p.id}
                                    ref={el => {
                                        if (el) overviewRowRefs.current.set(p.id, el)
                                        else overviewRowRefs.current.delete(p.id)
                                    }}
                                    style={{
                                        background: 'var(--kce-surface2)',
                                        border: '1px solid var(--kce-border)',
                                        borderRadius: 10,
                                        padding: '6px 8px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 2,
                                    }}
                                >
                                    <div style={{display: 'flex', alignItems: 'center', gap: 4, minWidth: 0}}>
                                        {p.is_king && <span style={{fontSize: 11}}>👑</span>}
                                        <span style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: 'var(--kce-cream)',
                                            flex: 1,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>{p.name}</span>
                                        {isMe && (
                                            <span className="text-[9px] font-bold text-kce-amber flex-shrink-0">Ich</span>
                                        )}
                                    </div>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        fontSize: 10,
                                        fontFamily: 'monospace',
                                        color: 'var(--kce-muted)',
                                    }}>
                                        <span style={{
                                            color: ov.penaltyEuro > 0 ? 'var(--kce-amber)' : 'var(--kce-muted)',
                                            fontWeight: 700,
                                        }}>
                                            {fe(ov.penaltyEuro)}
                                        </span>
                                        {ov.gameScore != null && (
                                            <span title={t('quickEntry.gameScore')}>
                                                🎳 {ov.gameScore}
                                            </span>
                                        )}
                                    </div>
                                    {(ov.beerCount > 0 || ov.shotsCount > 0) && (
                                        <div style={{
                                            display: 'flex', gap: 6,
                                            fontSize: 9, color: 'var(--kce-muted)',
                                        }}>
                                            {ov.beerCount > 0 && <span>🍺 {ov.beerCount}</span>}
                                            {ov.shotsCount > 0 && <span>🥃 {ov.shotsCount}</span>}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                    {/* Footer: grand total + average per player (pinned, never overlaps list) */}
                    <div style={{
                        marginTop: 6,
                        paddingTop: 6,
                        borderTop: '1px solid var(--kce-border)',
                        fontSize: 10,
                        color: 'var(--kce-muted)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        flexShrink: 0,
                    }}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                            <span>{t('quickEntry.totalPenalty')}</span>
                            <span style={{fontFamily: 'monospace', fontWeight: 700, color: 'var(--kce-amber)'}}>
                                {fe(overviewTotalEuro)}
                            </span>
                        </div>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                            <span>{t('quickEntry.averagePenalty')}</span>
                            <span style={{fontFamily: 'monospace', fontWeight: 700, color: 'var(--kce-cream)'}}>
                                {fe(overviewAvgEuro)}
                            </span>
                        </div>
                    </div>
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
                            const isPendingItem = ev.id < 0
                            const isConfirming = !isPendingItem && confirmingKey === ev.key
                            const isDeleting = deletingKey === ev.key
                            return (
                                <button
                                    key={ev.key}
                                    type="button"
                                    disabled={isDeleting}
                                    className="flex-shrink-0 flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-40"
                                    style={{
                                        background: isConfirming ? 'rgba(239,68,68,0.15)' : 'var(--kce-surface2)',
                                        border: `1px solid ${isConfirming ? '#dc2626' : isPendingItem ? 'rgba(251,191,36,0.4)' : 'var(--kce-border)'}`,
                                    }}
                                    onClick={() => deleteRecentEvent(ev.key, ev.id, ev.type)}
                                    onBlur={() => { if (confirmingKey === ev.key) setConfirmingKey(null) }}
                                >
                                    <span className="text-sm leading-none">{isConfirming ? '🗑' : ev.icon}</span>
                                    <span className={`text-[10px] font-bold whitespace-nowrap ${isConfirming ? 'text-red-400' : 'text-kce-cream'}`}>
                                        {isConfirming ? '✕ löschen?' : ev.label}
                                    </span>
                                    <span className="text-[9px] text-kce-muted">{fTime(ev.time)}</span>
                                    {isPendingItem && !isConfirming && (
                                        <span className="text-[9px] px-1 py-0.5 rounded font-bold"
                                              style={{background: 'rgba(251,191,36,0.12)', color: 'var(--kce-amber)'}}>
                                            ⏳ {t('sync.pendingBadge')}
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
