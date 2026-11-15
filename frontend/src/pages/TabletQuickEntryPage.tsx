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
import {useIslandFullscreenStore} from '@/store/idleIsland.ts'
import {useAppStore, isAdmin} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {toastError} from '@/utils/error.ts'
import {showToast} from '@/components/ui/Toast'
import {celebrate} from '@/lib/celebrate'
import {playSound} from '@/lib/soundboard'
import {sortPenaltyTypes} from '@/lib/penaltyTypes'
import {PenaltyPickButton} from '@/components/evening/PenaltyPickButton'
import {useThrowTracking, useAudioCallouts} from '@/hooks/useClub.ts'
import {buildTurnOrder} from '@/lib/turnOrder.ts'
import type {EveningPlayer, Game, GameTemplate, PenaltyLogEntry, PenaltyType, Team} from '@/types.ts'
import {MeBadge} from '@/components/ui/MemberBadges.tsx'
import {Button} from '@/components/ui/Button.tsx'
import {ProportionBar} from '@/components/ui/ProportionBar.tsx'
import {CountUp} from '@/components/ui/CountUp.tsx'
import {drinkTimeline} from '@/lib/quickEntryVisuals.ts'
import {announceQuickEntryEvent} from '@/lib/quickEntryEvents.ts'

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
    const regularMembers = useAppStore(s => s.regularMembers)
    const setIslandFullscreen = useIslandFullscreenStore(s => s.setFullscreen)
    useEffect(() => {
        setIslandFullscreen(true)
        return () => setIslandFullscreen(false)
    }, [setIslandFullscreen])
    // Kegelname: evening-player nickname, else the roster member's nickname, else the full name
    const dn = (p: {nickname?: string | null; name: string; regular_member_id?: number | null} | null | undefined): string => {
        if (!p) return ''
        const rm = p.regular_member_id != null
            ? regularMembers.find(m => m.id === p.regular_member_id)
            : regularMembers.find(m => m.name === p.name)
        return p.nickname || rm?.nickname || p.name
    }
    const gameTemplates: GameTemplate[] = useAppStore(s => s.gameTemplates) ?? []
    const user = useAppStore(s => s.user)
    const throwTracking = useThrowTracking()
    const audioCallouts = useAudioCallouts()

    // Mobile phone pane switcher ('book' = players + drinks/penalties, 'overview' = standings)
    const [mobilePane, setMobilePane] = useState<'book' | 'overview'>('book')

    // Penalty / drink state
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([])
    const [flashingPenaltyId, setFlashingPenaltyId] = useState<number | null>(null)
    const [flashingDrink, setFlashingDrink] = useState<'beer' | 'shots' | null>(null)
    const [loadingPenaltyId, setLoadingPenaltyId] = useState<number | null>(null)
    const [loadingDrink, setLoadingDrink] = useState<'beer' | 'shots' | null>(null)
    const [confirmingKey, setConfirmingKey] = useState<string | null>(null)
    const [deletingKey, setDeletingKey] = useState<string | null>(null)

    // Tap/click anywhere outside the recent event buttons (or press Escape) cancels delete confirmation.
    // Relying on onBlur alone fails on touch devices (iOS/iPadOS Safari does not focus buttons on tap,
    // and tapping a non-focusable area does not blur).
    useEffect(() => {
        if (!confirmingKey) return
        function cancelConfirm(e: Event) {
            const el = e.target instanceof Element
                ? e.target
                : e.target instanceof Node ? e.target.parentElement : null
            if (el?.closest('[data-recent-event]')) return
            setConfirmingKey(null)
        }
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') setConfirmingKey(null)
        }
        document.addEventListener('pointerdown', cancelConfirm, true)
        document.addEventListener('click', cancelConfirm, true)
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('pointerdown', cancelConfirm, true)
            document.removeEventListener('click', cancelConfirm, true)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [confirmingKey])

    // Rows that just received a booking light up with a "+0,50 €" chip, so a mistap shows at once.
    const [booked, setBooked] = useState<{ids: number[]; label: string; key: number} | null>(null)
    const bookedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const flashingPenaltyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const flashingDrinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    function flashBooked(ids: number[], label: string) {
        if (bookedTimer.current) clearTimeout(bookedTimer.current)
        setBooked({ids, label, key: Date.now()})
        bookedTimer.current = setTimeout(() => setBooked(null), 1800)
    }
    useEffect(() => () => {
        if (bookedTimer.current) clearTimeout(bookedTimer.current)
        if (flashingPenaltyTimer.current) clearTimeout(flashingPenaltyTimer.current)
        if (flashingDrinkTimer.current) clearTimeout(flashingDrinkTimer.current)
    }, [])

    function playerNamesLabel(ids: number[]): string {
        const names = ids
            .map(id => players.find(p => p.id === id))
            .filter((p): p is EveningPlayer => Boolean(p))
            .map(p => dn(p))
        if (names.length <= 2) return names.join(', ')
        return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
    }

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

    // Group penalty types by default_amount, sort groups ascending by amount; skip 0€ groups.
    // Within a group, alphabetical — the same order the API returns (price, then name).
    const penaltyGroups = useMemo(() => {
        const map = new Map<number, PenaltyType[]>()
        const sorted = sortPenaltyTypes(penaltyTypes)
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
                label: `${dn(players.find(pl => pl.id === p.player_id)) || p.player_name}${count}`,
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
    }, [evening, players, regularMembers])

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

    // Shared scale for the per-player bars: the evening's highest total is a full bar.
    const overviewMaxEuro = useMemo(() => {
        let m = 0
        for (const v of playerOverview.values()) m = Math.max(m, v.penaltyEuro)
        return m
    }, [playerOverview])

    // Drink rounds on a time axis (first round → now) instead of only a total.
    const drinksTimeline = useMemo(() => drinkTimeline(evening?.drink_rounds ?? [], Date.now()), [evening])

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
    // Players without a team assignment — a game can't start until every player is on a team
    const unassignedPlayers = teams.length > 0 ? players.filter(p => p.team_id === null) : []
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
            setCurrentTurnIdx(prevIdx => prevIdx + (len - prev))
            const newThrows = liveThrows.slice(prev, len)
            if (throwTracking && newThrows.some(th => th.pins >= 9)) {
                celebrate('allnine', `🎯 ${t('celebration.allnine')}`)
            }
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
        if (teams.length === 0) {
            showToast(t('game.teamsRequired'), 'error')
            return
        }
        if (unassignedPlayers.length > 0) {
            showToast(t('team.cannotStartUnassigned'), 'error')
            return
        }
        try {
            await api.startGame(evening.id, activeGame.id)
            invalidate()
            announceQuickEntryEvent({
                kind: 'game',
                icon: '🎳',
                title: activeGame.name,
                subtitle: t('game.start'),
                badge: '▶',
            })
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
                penalty_only: tmpl.penalty_only || undefined,
                client_timestamp: Date.now(),
            })
            if (teams.length === 0) {
                showToast(t('game.teamsRequired'), 'error')
            } else if (unassignedPlayers.length > 0) {
                showToast(t('team.cannotStartUnassigned'), 'error')
            } else {
                await api.startGame(eveningId, game.id)
            }
            invalidate()
            setShowNewGame(false)
            announceQuickEntryEvent({
                kind: 'game',
                icon: '🎳',
                title: tmpl.name,
                subtitle: t('game.start'),
                badge: '▶',
            })
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
        const ev = recentEvents.find(e => e.key === key)
        // Pending item (id < 0) — cancel the queued operation directly (no server call)
        if (id < 0) {
            await cancelPendingItem(id, type)
            announceQuickEntryEvent({
                kind: 'undo',
                icon: '↩️',
                title: ev?.label ?? t('action.delete'),
                subtitle: t('action.delete'),
                badge: '✕',
            })
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
            announceQuickEntryEvent({
                kind: 'undo',
                icon: '↩️',
                title: ev?.label ?? t('action.delete'),
                subtitle: t('action.delete'),
                badge: '✕',
            })
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setDeletingKey(null)
        }
    }

    async function logPenalty(pt: PenaltyType) {
        if (selectedPlayerIds.length === 0 || loadingPenaltyId !== null) return
        const bookedIds = [...selectedPlayerIds]
        setLoadingPenaltyId(pt.id)
        try {
            await api.addPenalty(eveningId, {
                player_ids: bookedIds,
                penalty_type_name: pt.name,
                icon: pt.icon,
                amount: 1,
                mode: 'count',
                unit_amount: pt.default_amount,
                client_timestamp: Date.now(),
            })
            if (audioCallouts) playSound(pt.sound_key)
            invalidate()
            qc.invalidateQueries({queryKey: ['member-balances']})
            qc.invalidateQueries({queryKey: ['guest-balances']})
            flashBooked(bookedIds, `+${fe(pt.default_amount)}`)
            announceQuickEntryEvent({
                kind: 'penalty',
                icon: pt.icon,
                title: pt.name,
                subtitle: playerNamesLabel(bookedIds),
                badge: `+${fe(pt.default_amount * bookedIds.length)}`,
            })
            setSelectedPlayerIds([])
            setFlashingPenaltyId(pt.id)
            if (flashingPenaltyTimer.current) clearTimeout(flashingPenaltyTimer.current)
            flashingPenaltyTimer.current = setTimeout(() => setFlashingPenaltyId(null), 800)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setLoadingPenaltyId(null)
        }
    }

    // Log a drink round for the currently selected players — same selection flow as penalties.
    async function logDrink(type: 'beer' | 'shots') {
        if (selectedPlayerIds.length === 0 || loadingDrink !== null) return
        const bookedIds = [...selectedPlayerIds]
        setLoadingDrink(type)
        try {
            await api.addDrinkRound(eveningId, {
                drink_type: type,
                participant_ids: bookedIds,
                client_timestamp: Date.now(),
            })
            invalidate()
            qc.invalidateQueries({queryKey: ['member-balances']})
            qc.invalidateQueries({queryKey: ['guest-balances']})
            flashBooked(bookedIds, `+${type === 'beer' ? '🍺' : '🥃'}`)
            announceQuickEntryEvent({
                kind: 'drink',
                icon: type === 'beer' ? '🍺' : '🥃',
                title: type === 'beer' ? t('drinks.beer') : t('drinks.shots'),
                subtitle: playerNamesLabel(bookedIds),
                badge: `${bookedIds.length}×`,
            })
            setSelectedPlayerIds([])
            setFlashingDrink(type)
            if (flashingDrinkTimer.current) clearTimeout(flashingDrinkTimer.current)
            flashingDrinkTimer.current = setTimeout(() => setFlashingDrink(null), 800)
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
                winnerName = wp ? dn(wp) : finishWinnerRef
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
            if (runningGame.is_opener && finishWinnerRef.startsWith('p:')) {
                celebrate('king', `👑 ${t('celebration.king')}`)
            }
            invalidate()
            qc.invalidateQueries({queryKey: ['member-balances']})
            qc.invalidateQueries({queryKey: ['guest-balances']})
            announceQuickEntryEvent({
                kind: 'game',
                icon: '🏁',
                title: runningGame.name,
                subtitle: winnerName,
                badge: '✓',
            })
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
            background: isFlashing ? 'var(--positive-tint)' : 'var(--surface-2)',
            borderColor: isFlashing ? 'var(--positive)' : 'var(--line)',
            color: isFlashing ? 'var(--positive-fg)' : 'var(--ink)',
        }
    }

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 30,
            background: 'var(--canvas)',
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* Safe-area spacer matching RootLayout so the 56px island row aligns 1:1 with <header> */}
            <div className="safe-top flex-shrink-0" style={{background: 'var(--surface)'}}/>

            {/* ── Header — 2-Tier Island-Safe Sticky Zone ── */}
            <header
                className="flex-shrink-0"
                style={{
                    background: 'var(--surface)',
                    borderBottom: '1px solid var(--line)',
                    paddingBottom: '8px',
                    paddingLeft: 'max(env(safe-area-inset-left), 12px)',
                    paddingRight: 'max(env(safe-area-inset-right), 12px)',
                }}
            >
                {/* Tier 1 (56px island bar): [✕] on the far left; center + right left clear for Dynamic Island */}
                <div className="h-14 flex items-center justify-between gap-2">
                    <Button type="button" variant="secondary" size="xs" onClick={onClose} aria-label={t('action.close')}>
                        ✕
                    </Button>
                </div>

                {/* Tier 2: Unified Game Cockpit & Mode Strip (sits cleanly below the 56px island band) */}
                {activeGame ? (
                    <div
                        className="mt-1 rounded-xl border border-line px-3 py-2 flex flex-col gap-2"
                        style={{background: 'var(--surface-2)'}}
                    >
                        {/* Game identity, mode & primary CTA row */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <span className="text-xs font-extrabold text-accent truncate">
                                    🎳 {activeGame.name}
                                    {activeGame.status === 'open' && (
                                        <span className="text-xs font-normal text-muted ml-1">
                                            (offen)
                                        </span>
                                    )}
                                </span>
                                {activeGame.turn_mode && (
                                    <span
                                        className="text-xs px-2 py-0.5 rounded-md border border-line text-muted font-medium"
                                        style={{background: 'var(--surface)'}}
                                    >
                                        {t(`game.turnMode.${activeGame.turn_mode}` as any)}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center flex-shrink-0">
                                {activeGame.status === 'open' && (
                                    <Button type="button" variant="primary" size="xs" onClick={handleStartGame}>
                                        ▶ {t('game.start')}
                                    </Button>
                                )}
                                {activeGame.status === 'running' && (
                                    <Button
                                        type="button"
                                        variant={finishGameOpen ? 'primary' : 'secondary'}
                                        size="xs"
                                        onClick={() => setFinishGameOpen(f => !f)}
                                    >
                                        🏁 {t('quickEntry.finishGame')}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Teams required warning — every game needs teams set up on the evening first */}
                        {teams.length === 0 && (
                            <div
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                                style={{
                                    background: 'var(--danger-tint)',
                                    border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)',
                                    color: 'var(--danger-fg)',
                                }}
                            >
                                <span>⚠️</span>
                                <span>{t('game.teamsRequired')}</span>
                            </div>
                        )}

                        {/* Unassigned-players warning — teams exist but not all players are on one */}
                        {teams.length > 0 && unassignedPlayers.length > 0 && (
                            <div
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                                style={{
                                    background: 'var(--accent-tint)',
                                    border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
                                    color: 'var(--accent-fg)',
                                }}
                            >
                                <span>⚠️</span>
                                <span>
                                    {unassignedPlayers.length} {t('team.playersUnassigned')}
                                </span>
                            </div>
                        )}

                        {/* Turn order — current + queue + switch/advance (camera/throw-tracking feature) */}
                        {throwTracking && turnOrder.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-line">
                                {/* Current player badge */}
                                <div
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                                    style={{background: 'var(--accent)', color: 'var(--on-accent)'}}
                                >
                                    <span className="text-xs opacity-80">{t('quickEntry.currentPlayer')}</span>
                                    <span className="text-xs font-extrabold">
                                        {dn(currentPlayer) || '—'}
                                    </span>
                                </div>
                                {/* Next 3 in queue */}
                                {turnOrder.length > 1 && Array.from({length: 3}, (_, i) => {
                                    const p = turnOrder[(currentTurnIdx + i + 1) % turnOrder.length]
                                    return (
                                        <span
                                            key={i}
                                            className="text-xs text-muted px-2 py-0.5 rounded-md border border-line"
                                            style={{background: 'var(--surface)'}}
                                        >
                                            {dn(p)}
                                        </span>
                                    )
                                })}
                                <div className="flex-1 min-w-0"/>
                                {/* Block mode: switch team */}
                                {gameTurnMode === 'block' && teams.length >= 1 && (
                                    <Button type="button" variant="primary" size="xs" onClick={switchTeam}>
                                        ⇄ {t('quickEntry.switchTeam')}
                                        {teams.length > 1 && (
                                            <span className="opacity-75 ml-1">
                                                → {teams[(blockTeamIdx + 1) % teams.length]?.name ?? ''}
                                            </span>
                                        )}
                                    </Button>
                                )}
                                {/* Manual advance */}
                                <Button type="button" variant="secondary" size="xs" onClick={advanceTurn}>
                                    {t('quickEntry.advanceTurn')} ▶
                                </Button>
                            </div>
                        )}

                        {/* Throw history strip + heatmap toggle */}
                        {throwTracking && liveThrows.length > 0 && (
                            <div className="pt-1.5 border-t border-line">
                                <div className="flex gap-1.5 overflow-x-auto pb-0.5 items-center no-scrollbar">
                                    {[...liveThrows].reverse().map(th => {
                                        const throwerPlayer = th.player_id ? players.find(p => p.id === th.player_id) : null
                                        const throwerName = throwerPlayer ? dn(throwerPlayer) : null
                                        const isEditing = editingThrowId === th.id
                                        if (isEditing) {
                                            return (
                                                <div
                                                    key={th.id}
                                                    className="flex items-center gap-1 px-2 py-1 rounded-lg flex-shrink-0"
                                                    style={{
                                                        background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))',
                                                        border: '1px solid var(--accent)',
                                                    }}
                                                >
                                                    <span className="text-xs text-muted">#{th.throw_num}</span>
                                                    <input
                                                        type="number" min="0" max="9"
                                                        value={editPins}
                                                        onChange={e => setEditPins(Math.min(9, Math.max(0, parseInt(e.target.value) || 0)))}
                                                        className="w-9 text-xs font-mono font-bold px-1 py-0.5 rounded text-center"
                                                        style={{
                                                            background: 'var(--surface)',
                                                            border: '1px solid var(--accent)',
                                                            color: 'var(--accent)',
                                                        }}
                                                    />
                                                    <span className="text-xs text-muted">Σ</span>
                                                    <input
                                                        type="number" min="0"
                                                        value={editCumulative ?? ''}
                                                        placeholder="—"
                                                        onChange={e => setEditCumulative(e.target.value ? parseInt(e.target.value) : null)}
                                                        className="w-11 text-xs font-mono px-1 py-0.5 rounded text-center"
                                                        style={{
                                                            background: 'var(--surface)',
                                                            border: '1px solid var(--line)',
                                                            color: 'var(--ink)',
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        disabled={savingEditId === th.id}
                                                        aria-label={t('action.save')}
                                                        style={{
                                                            fontSize: 14,
                                                            color: 'var(--positive-fg)',
                                                            background: 'none',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            padding: 8,
                                                            minWidth: 32,
                                                            minHeight: 32,
                                                        }}
                                                        onClick={() => activeGame && handleSaveEdit(activeGame.id)}
                                                    >✓</button>
                                                    <button
                                                        type="button"
                                                        aria-label={t('action.cancel')}
                                                        style={{
                                                            fontSize: 13,
                                                            color: 'var(--muted)',
                                                            background: 'none',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            padding: 8,
                                                            minWidth: 32,
                                                            minHeight: 32,
                                                        }}
                                                        onClick={cancelEdit}
                                                    >✕</button>
                                                </div>
                                            )
                                        }
                                        return (
                                            <div
                                                key={th.id}
                                                className="flex items-center gap-1 px-2 py-0.5 rounded-lg flex-shrink-0 border border-line"
                                                style={{background: 'var(--surface)'}}
                                            >
                                                <span className="text-xs text-muted">#{th.throw_num}</span>
                                                {throwerName && (
                                                    <span className="text-xs font-bold text-accent">
                                                        {throwerName}
                                                    </span>
                                                )}
                                                <span className="text-xs font-mono font-bold text-accent">
                                                    {th.pins}
                                                </span>
                                                {th.cumulative !== null && (
                                                    <span className="text-xs text-muted">
                                                        Σ{th.cumulative}
                                                    </span>
                                                )}
                                                {isAdmin(user) && (
                                                    <button
                                                        type="button"
                                                        style={{
                                                            fontSize: 12,
                                                            color: 'var(--muted)',
                                                            background: 'none',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            padding: 8,
                                                            minWidth: 32,
                                                            minHeight: 32,
                                                        }}
                                                        aria-label={t('quickEntry.editThrow')}
                                                        onClick={() => startEdit(th)}
                                                    >✎</button>
                                                )}
                                                <button
                                                    type="button"
                                                    disabled={voidingThrowId === th.id}
                                                    style={{
                                                        fontSize: 13,
                                                        color: 'var(--danger-fg)',
                                                        background: 'none',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        padding: 8,
                                                        minWidth: 32,
                                                        minHeight: 32,
                                                        opacity: voidingThrowId === th.id ? 0.4 : 1,
                                                    }}
                                                    aria-label={t('quickEntry.voidThrow')}
                                                    onClick={() => activeGame && handleVoidThrow(activeGame.id, th.id)}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        )
                                    })}
                                    {/* Heatmap toggle */}
                                    {liveThrows.some(th => th.pin_states && th.pin_states.length === 9) && (
                                        <Button
                                            type="button"
                                            variant="secondary" size="xs"
                                            aria-label={t('quickEntry.heatmap')}
                                            aria-pressed={showHeatmap}
                                            style={{flexShrink: 0, fontSize: 12, marginLeft: 2}}
                                            onClick={() => setShowHeatmap(h => !h)}
                                        >
                                            🎯
                                        </Button>
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
                                        <div className="mt-2 flex items-center gap-3">
                                            <div style={{position: 'relative', width: 80, height: 70, flexShrink: 0}}>
                                                {PIN_POS.map(([px, py], i) => {
                                                    const ratio = counts[i] / maxCount
                                                    const bg = ratio === 0
                                                        ? 'transparent'
                                                        : `color-mix(in srgb, var(--accent) ${Math.round(ratio * 100)}%, var(--surface-2))`
                                                    return (
                                                        <div key={i} style={{
                                                            position: 'absolute',
                                                            left: `${px * 100}%`, top: `${py * 100}%`,
                                                            transform: 'translate(-50%, -50%)',
                                                            width: 18, height: 18, borderRadius: '50%',
                                                            background: bg,
                                                            border: `2px solid ${ratio > 0 ? 'var(--accent)' : 'var(--line)'}`,
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        }}>
                                                            {counts[i] > 0 && (
                                                                <span style={{
                                                                    fontSize: 12,
                                                                    fontWeight: 'bold',
                                                                    color: ratio > 0.5 ? 'var(--on-accent)' : 'var(--accent)',
                                                                }}>
                                                                    {counts[i]}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                            <div className="text-xs text-muted">
                                                {t('quickEntry.heatmapHint').replace('{n}', String(throwsWithPins.length))}
                                            </div>
                                        </div>
                                    )
                                })()}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="mt-1 flex items-center justify-between gap-2 pb-1">
                        <span className="font-bold text-accent-fg text-xs sm:text-sm">⚡ {t('quickEntry.title')}</span>
                        {!showNewGame && (
                            <Button
                                type="button"
                                variant="secondary"
                                size="xs"
                                onClick={() => setShowNewGame(true)}
                            >
                                ＋ {t('quickEntry.newGame')}
                            </Button>
                        )}
                    </div>
                )}

                {/* Drawer: finish game panel */}
                {finishGameOpen && activeGame && (
                    <div
                        className="mt-2 p-3 rounded-xl border border-line"
                        style={{background: 'var(--surface-2)'}}
                    >
                        <div className="text-xs font-bold text-ink mb-2">
                            🏁 {activeGame.name} — {t('quickEntry.selectWinner')}
                            {lastThrow?.cumulative != null && (
                                <span className="text-muted font-normal ml-2">
                                    {t('quickEntry.gameScore')}: <strong className="text-ink">{lastThrow.cumulative}</strong>
                                </span>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-2">
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
                                    {dn(p)}
                                </button>
                            ))}
                        </div>
                        {/* Score inputs */}
                        <div className="mb-2">
                            <div className="text-xs text-muted mb-1">
                                {t('game.scores')}
                            </div>
                            <div className="flex flex-col gap-1">
                                {activeGame.winner_type === 'team'
                                    ? evening!.teams.map(team => (
                                        <div key={`t:${team.id}`} className="flex items-center gap-2">
                                            <span className="text-xs text-ink flex-1">{team.name}</span>
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
                                        <div key={`p:${p.id}`} className="flex items-center gap-2">
                                            <span className="text-xs text-ink flex-1">{dn(p)}</span>
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
                        {/* Loser penalty preview */}
                        {finishWinnerRef && (
                            <div
                                className="mb-2 px-2.5 py-2 rounded-lg border border-line"
                                style={{background: 'var(--surface)'}}
                            >
                                <div className="text-xs font-bold text-muted mb-1">
                                    {t('game.perPointPreview')}
                                    {(activeGame.per_point_penalty ?? 0) > 0
                                        ? ` (+${fe(activeGame.per_point_penalty)}/${t('game.perPointUnit')})`
                                        : ''}
                                </div>
                                {(() => {
                                    const base = activeGame.loser_penalty
                                    const ppp = activeGame.per_point_penalty ?? 0
                                    const wScore = parseFloat(finishScores[finishWinnerRef] ?? '') || 0
                                    const isTeamGame = finishWinnerRef.startsWith('t:')
                                    const losers = evening!.players.filter(p =>
                                        `p:${p.id}` !== finishWinnerRef &&
                                        (!p.team_id || `t:${p.team_id}` !== finishWinnerRef)
                                    )
                                    const seen = new Set<string>()
                                    return losers.map(p => {
                                        const ref = isTeamGame && p.team_id ? `t:${p.team_id}` : `p:${p.id}`
                                        if (seen.has(ref)) return null
                                        seen.add(ref)
                                        const lScore = parseFloat(finishScores[ref] ?? '') || 0
                                        const diff = Math.abs(wScore - lScore)
                                        const total = base + diff * ppp
                                        const label = isTeamGame && p.team_id
                                            ? evening!.teams.find(t => t.id === p.team_id)?.name ?? p.name
                                            : dn(p)
                                        return (
                                            <div key={ref} className="flex justify-between text-xs py-0.5">
                                                <span className="text-ink">{label}</span>
                                                <span className="font-bold text-danger-fg">{fe(total)}</span>
                                            </div>
                                        )
                                    })
                                })()}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Button variant="secondary" size="sm" style={{flex: 1}}
                                    onClick={() => { setFinishGameOpen(false); setFinishWinnerRef(''); setFinishScores({}) }}>
                                {t('action.cancel')}
                            </Button>
                            <Button variant="primary" size="sm" style={{flex: 1}}
                                    disabled={!finishWinnerRef || finishSaving}
                                    onClick={handleFinishGame}>
                                ✓ {t('game.finish')}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Drawer: new-game template picker */}
                {showNewGame && !activeGame && (
                    <div
                        className="mt-2 p-2.5 rounded-xl border border-line"
                        style={{background: 'var(--surface-2)'}}
                    >
                        <div className="field-label mb-1.5">{t('club.gameTemplates')}</div>
                        <div className="flex flex-wrap gap-1.5 mb-2">
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
                        <Button
                            type="button"
                            variant="secondary" size="xs"
                            onClick={() => setShowNewGame(false)}
                        >
                            {t('action.cancel')}
                        </Button>
                    </div>
                )}

                {/* Mobile phone mode switcher (< lg): sleek segmented pill control inside the header */}
                <div
                    className="lg:hidden mt-2 p-0.5 rounded-xl border border-line flex items-center gap-1"
                    style={{background: 'var(--surface-2)'}}
                >
                    <button
                        type="button"
                        data-testid="quick-entry-tab-book"
                        aria-pressed={mobilePane === 'book'}
                        onClick={() => setMobilePane('book')}
                        className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 border"
                        style={{
                            background: mobilePane === 'book' ? 'var(--accent-tint)' : 'transparent',
                            borderColor: mobilePane === 'book' ? 'var(--accent)' : 'transparent',
                            color: mobilePane === 'book' ? 'var(--accent-fg)' : 'var(--muted)',
                        }}
                    >
                        <span>⚡ {t('quickEntry.mobileBook')}</span>
                        {selectedPlayerIds.length > 0 && (
                            <span
                                className="px-1.5 rounded-full text-xs font-extrabold"
                                style={{background: 'var(--accent)', color: 'var(--on-accent)'}}
                            >
                                {selectedPlayerIds.length}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        data-testid="quick-entry-tab-overview"
                        aria-pressed={mobilePane === 'overview'}
                        onClick={() => setMobilePane('overview')}
                        className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 border"
                        style={{
                            background: mobilePane === 'overview' ? 'var(--accent-tint)' : 'transparent',
                            borderColor: mobilePane === 'overview' ? 'var(--accent)' : 'transparent',
                            color: mobilePane === 'overview' ? 'var(--accent-fg)' : 'var(--muted)',
                        }}
                    >
                        <span>📊 {t('quickEntry.mobileOverview')}</span>
                    </button>
                </div>
            </header>

            {/* ── Three-column body on wide landscape tablets (`lg`), dedicated mobile phone layout below `lg` — respects side safe areas ── */}
            <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden" style={{
                paddingLeft: 'env(safe-area-inset-left)',
                paddingRight: 'env(safe-area-inset-right)',
            }}>

                {/* Column 1: Players — FIRST on mobile (`order-1`) in a 2-col thumb grid so you pick players before tapping penalties */}
                <div
                    className={`${mobilePane === 'overview' ? 'hidden lg:flex' : 'flex'} flex-col flex-shrink-0 min-h-0 w-full lg:w-[22%] border-b lg:border-b-0 lg:border-r border-line max-h-[32vh] lg:max-h-none order-1 lg:order-none`}
                >
                    {/* Header row: label + selection status + All/None */}
                    <div className="flex items-center gap-1 px-2.5 pt-2 pb-1.5 flex-shrink-0">
                        <span className="field-label">{t('penalty.who')}</span>
                        <span className="flex-1 text-xs text-muted text-center font-medium">
                            {noSelection
                                ? t('quickEntry.selectPlayer')
                                : `${selectedPlayerIds.length} ${t('quickEntry.selected')}`}
                        </span>
                        <Button
                            type="button"
                            variant="secondary" size="xs"
                            onClick={() => setSelectedPlayerIds(sortedPlayers.map(p => p.id))}
                        >
                            {t('action.all')}
                        </Button>
                        <Button
                            type="button"
                            variant="secondary" size="xs"
                            onClick={() => setSelectedPlayerIds([])}
                        >
                            {t('action.none')}
                        </Button>
                    </div>

                    {/* ── Player list: 2-col grid on phones, 3-col on small tablets, 1-col vertical stack on lg tablets ── */}
                    <div className="flex-1 overflow-y-auto px-2.5 pb-2 grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-col gap-1.5 content-start">
                        {sortedPlayers.map(p => {
                            const isMe = user?.regular_member_id !== null &&
                                p.regular_member_id === user?.regular_member_id
                            const isSelected = selectedPlayerIds.includes(p.id)
                            const isCurrent = throwTracking && currentPlayer?.id === p.id
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    className={`w-full text-left px-2.5 py-2 rounded-xl border font-bold text-xs
                                        transition-all active:scale-95 flex items-center gap-1
                                        ${isSelected
                                            ? 'border-accent text-accent-fg'
                                            : isCurrent
                                                ? 'border-accent text-accent'
                                                : 'border-line text-ink'}
                                    `}
                                    style={{
                                        background: isSelected
                                            ? 'var(--accent-tint)'
                                            : isCurrent
                                                ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                                                : 'var(--surface-2)',
                                    }}
                                    onClick={() => togglePlayer(p.id)}
                                >
                                    {isCurrent && <span className="text-xs">🎳</span>}
                                    {p.is_king && <span className="text-sm">👑</span>}
                                    <span className="flex-1 truncate">{dn(p)}</span>
                                    {isMe && (
                                        <MeBadge/>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Column 2: Drinks + Penalties — SECOND on mobile (`order-2`), directly below the player grid */}
                <div className={`${mobilePane === 'overview' ? 'hidden lg:block' : 'block'} flex-1 min-h-0 overflow-y-auto p-3 border-b lg:border-b-0 lg:border-r border-line order-2 lg:order-none`}>
                    {/* Drinks — same multi-select flow as penalties (no separate sheet) */}
                    <div className="mb-4">
                        <div className="field-label mb-2">{t('drinks.title')}</div>
                        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
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
                        {drinksTimeline && (
                            <div className="mt-2" data-testid="drink-timeline">
                                <div
                                    role="img"
                                    aria-label={t('quickEntry.drinkTimeline')
                                        .replace('{beer}', String(drinksTimeline.points.filter(p => p.type === 'beer').length))
                                        .replace('{shots}', String(drinksTimeline.points.filter(p => p.type === 'shots').length))}
                                    className="relative rounded-md"
                                    style={{height: 28, background: 'var(--surface-2)', border: '1px solid var(--line)'}}
                                >
                                    {drinksTimeline.points.map(pt => (
                                        <span
                                            key={pt.id}
                                            data-drink={pt.type}
                                            className="absolute bottom-0.5 rounded-sm"
                                            style={{
                                                left: `clamp(2px, calc(${pt.left}% - 2px), calc(100% - 6px))`,
                                                width: 4,
                                                height: `${Math.max(25, (pt.size / drinksTimeline.maxSize) * 85)}%`,
                                                background: pt.type === 'beer' ? 'var(--accent)' : 'var(--accent-2)',
                                            }}
                                        />
                                    ))}
                                </div>
                                <div className="flex justify-between text-xs text-muted mt-0.5">
                                    <span>{fTime(drinksTimeline.start)}</span>
                                    <span className="flex gap-2">
                                        <span className="flex items-center gap-1"><span aria-hidden className="inline-block w-2 h-2 rounded-full" style={{background: 'var(--accent)'}}/>{t('drinks.beer')}</span>
                                        <span className="flex items-center gap-1"><span aria-hidden className="inline-block w-2 h-2 rounded-full" style={{background: 'var(--accent-2)'}}/>{t('drinks.shots')}</span>
                                    </span>
                                    <span>{fTime(drinksTimeline.end)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    {penaltyGroups.map(([amount, types]) => (
                        <div key={amount} className="mb-4">
                            <div className="field-label mb-2">{fe(amount)}</div>
                            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                                {types.map(pt => {
                                    const isFlashing = flashingPenaltyId === pt.id
                                    const isLoading = loadingPenaltyId === pt.id
                                    return (
                                        <PenaltyPickButton
                                            key={pt.id}
                                            type={pt}
                                            disabled={noSelection || isLoading}
                                            className={`px-4 py-3 rounded-xl border font-bold text-sm
                                                transition-all active:scale-95
                                                disabled:opacity-40 disabled:cursor-not-allowed
                                            `}
                                            style={penaltyBtnStyle(isFlashing)}
                                            onSelect={() => logPenalty(pt)}
                                        >
                                            {isFlashing ? '✓ ' : ''}{pt.icon} {pt.name}
                                        </PenaltyPickButton>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Column 3: Per-player overview — full-height when `Stand` tab is active on mobile, right column on `lg` tablets */}
                <div
                    className={`${mobilePane === 'overview' ? 'flex flex-1' : 'hidden lg:flex'} flex-col flex-shrink-0 min-h-0 p-2.5 w-full lg:w-[22%] lg:max-h-none order-3 lg:order-none`}
                >
                    <div className="field-label mb-1.5 flex-shrink-0">{t('quickEntry.overview')}</div>
                    <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto">
                        {overviewSortedPlayers.map(p => {
                            const ov = playerOverview.get(p.id) ?? {penaltyEuro: 0, gameScore: null, beerCount: 0, shotsCount: 0}
                            const isMe = user?.regular_member_id !== null &&
                                p.regular_member_id === user?.regular_member_id
                            const justBooked = booked?.ids.includes(p.id) ?? false
                            return (
                                <div
                                    key={p.id}
                                    data-testid={`overview-row-${p.id}`}
                                    data-booked={justBooked || undefined}
                                    className={justBooked ? 'kce-booked-flash' : undefined}
                                    ref={el => {
                                        if (el) overviewRowRefs.current.set(p.id, el)
                                        else overviewRowRefs.current.delete(p.id)
                                    }}
                                    style={{
                                        position: 'relative',
                                        background: 'var(--surface-2)',
                                        border: `1px solid ${justBooked ? 'var(--accent)' : 'var(--line)'}`,
                                        borderRadius: 10,
                                        padding: '6px 8px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 2,
                                    }}
                                >
                                    <div className="flex items-center gap-1 min-w-0">
                                        {p.is_king && <span className="text-xs">👑</span>}
                                        <span className="text-xs font-bold text-ink flex-1 truncate">{dn(p)}</span>
                                        {isMe && (
                                            <MeBadge/>
                                        )}
                                        {justBooked && booked && (
                                            <span
                                                key={booked.key}
                                                className="kce-booked-chip text-xs font-bold px-1.5 rounded-full whitespace-nowrap"
                                                style={{background: 'var(--accent)', color: 'var(--on-accent)'}}
                                            >
                                                {booked.label}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs font-mono text-muted">
                                        <span
                                            className="font-bold"
                                            style={{color: ov.penaltyEuro > 0 ? 'var(--accent)' : 'var(--muted)'}}
                                        >
                                            <CountUp value={ov.penaltyEuro} format={fe}/>
                                        </span>
                                        {ov.gameScore != null && (
                                            <span role="img" aria-label={t('quickEntry.gameScore')}>
                                                🎳 {ov.gameScore}
                                            </span>
                                        )}
                                    </div>
                                    <ProportionBar
                                        segments={[{key: 'penalty', value: ov.penaltyEuro, color: 'var(--accent)'}]}
                                        total={overviewMaxEuro}
                                        height={4}
                                        ariaLabel=""
                                        data-testid={`overview-bar-${p.id}`}
                                    />
                                    {(ov.beerCount > 0 || ov.shotsCount > 0) && (
                                        <div className="flex gap-1.5 text-xs text-muted">
                                            {ov.beerCount > 0 && <span>🍺 {ov.beerCount}</span>}
                                            {ov.shotsCount > 0 && <span>🥃 {ov.shotsCount}</span>}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                    {/* Footer: grand total + average per player (pinned, never overlaps list) */}
                    <div className="mt-2 pt-2 border-t border-line text-xs text-muted flex flex-col gap-1 flex-shrink-0">
                        <div className="flex justify-between items-center">
                            <span>{t('quickEntry.totalPenalty')}</span>
                            <span className="font-mono font-bold text-accent">
                                <CountUp value={overviewTotalEuro} format={fe} data-testid="overview-total"/>
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span>{t('quickEntry.averagePenalty')}</span>
                            <span className="font-mono font-bold text-ink">
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
                        borderTop: '1px solid var(--line)',
                        background: 'var(--surface)',
                        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
                        paddingLeft: 'max(env(safe-area-inset-left), 12px)',
                        paddingRight: 'max(env(safe-area-inset-right), 12px)',
                    }}
                >
                    <div className="field-label mb-1">{t('quickEntry.recent')}</div>
                    <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                        {recentEvents.map(ev => {
                            const isPendingItem = ev.id < 0
                            const isConfirming = !isPendingItem && confirmingKey === ev.key
                            const isDeleting = deletingKey === ev.key
                            return (
                                <button
                                    key={ev.key}
                                    type="button"
                                    data-recent-event={ev.key}
                                    disabled={isDeleting}
                                    className="flex-shrink-0 flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-40"
                                    style={{
                                        background: isConfirming ? 'var(--danger-tint)' : 'var(--surface-2)',
                                        border: `1px solid ${isConfirming ? 'var(--danger)' : isPendingItem ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--line)'}`,
                                    }}
                                    onClick={() => deleteRecentEvent(ev.key, ev.id, ev.type)}
                                    onBlur={() => { if (confirmingKey === ev.key) setConfirmingKey(null) }}
                                >
                                    <span className="text-sm leading-none">{isConfirming ? '🗑' : ev.icon}</span>
                                    <span className={`text-xs font-bold whitespace-nowrap ${isConfirming ? 'text-danger-fg' : 'text-ink'}`}>
                                        {isConfirming ? '✕ löschen?' : ev.label}
                                    </span>
                                    <span className="text-xs text-muted">{fTime(ev.time)}</span>
                                    {isPendingItem && !isConfirming && (
                                        <span className="text-xs px-1 py-0.5 rounded font-bold"
                                              style={{background: 'var(--accent-tint)', color: 'var(--accent)'}}>
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
