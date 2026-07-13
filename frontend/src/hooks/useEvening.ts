import {useEffect, useRef, useMemo, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {api, authState, NetworkError, flushOfflineQueue} from '@/api/client.ts'
import {useAppStore} from '@/store/app.ts'
import {pendingStore} from '@/pendingStore.ts'
import {offlineQueue, SYNC_FLUSHED_EVENT, type QueuedRequest} from '@/offlineQueue.ts'
import type {
    DrinkRound,
    Evening,
    Game,
    GameStatus,
    PenaltyLogEntry,
    TurnMode,
    WinnerType,
} from '@/types.ts'

export function useActiveEvening() {
    const activeEveningId = useAppStore(s => s.activeEveningId)
    const setActiveEveningId = useAppStore(s => s.setActiveEveningId)
    const qc = useQueryClient()
    const esRef = useRef<EventSource | null>(null)

    // When a temp evening is resolved to a real ID, update the store so the
    // evening page reloads against the real server resource.
    useEffect(() => {
        function onResolved(e: Event) {
            const {tempId, realId} = (e as CustomEvent<{tempId: number; realId: number}>).detail
            if (activeEveningId === tempId) {
                setActiveEveningId(realId)
                qc.invalidateQueries({queryKey: ['evening', realId]})
            }
        }
        window.addEventListener('kegelkasse:temp-id-resolved', onResolved)
        return () => window.removeEventListener('kegelkasse:temp-id-resolved', onResolved)
    }, [activeEveningId, setActiveEveningId, qc])

    // ── Offline queue items — reloaded whenever the queue changes ──────────────
    // These are used to overlay pending mutations over the server-fetched data so
    // that penalties, drinks, and games added while offline appear immediately.
    const [queueItems, setQueueItems] = useState<QueuedRequest[]>([])

    useEffect(() => {
        let cancelled = false
        async function reloadQueue() {
            try {
                const items = await offlineQueue.getAll()
                if (!cancelled) setQueueItems(items)
            } catch { /* IndexedDB unavailable */ }
        }
        reloadQueue()
        window.addEventListener('kegelkasse:queue-changed', reloadQueue)
        window.addEventListener(SYNC_FLUSHED_EVENT, reloadQueue)
        return () => {
            cancelled = true
            window.removeEventListener('kegelkasse:queue-changed', reloadQueue)
            window.removeEventListener(SYNC_FLUSHED_EVENT, reloadQueue)
        }
    }, [])

    // After a successful sync flush, invalidate the evening query so the real
    // server data replaces the pending overlay.
    useEffect(() => {
        function onFlushed() {
            if (activeEveningId && activeEveningId > 0) {
                qc.invalidateQueries({queryKey: ['evening', activeEveningId]})
            }
        }
        window.addEventListener(SYNC_FLUSHED_EVENT, onFlushed)
        return () => window.removeEventListener(SYNC_FLUSHED_EVENT, onFlushed)
    }, [activeEveningId, qc])

    const isPending = !!activeEveningId && activeEveningId < 0

    const {data: serverEvening, isLoading, isError, error} = useQuery({
        queryKey: ['evening', activeEveningId],
        queryFn: async (): Promise<Evening | null> => {
            if (!activeEveningId) return null
            // Negative ID = offline-created temp evening; load from pendingStore
            if (activeEveningId < 0) {
                const pending = await pendingStore.get(activeEveningId)
                if (!pending) return null
                return {
                    id: activeEveningId,
                    date: pending.date,
                    venue: pending.venue,
                    note: null,
                    is_closed: false,
                    ended_at: null,
                    season_closed: false,
                    players: [],
                    teams: [],
                    penalty_log: [],
                    games: [],
                    drink_rounds: [],
                    highlights: [],
                }
            }
            return api.getEvening(activeEveningId)
        },
        enabled: !!activeEveningId,
        staleTime: isPending ? Infinity : 1000 * 15,
        // No polling / no SSE for temp evenings — they live only in IndexedDB
        refetchInterval: isPending ? false : 1000 * 30,
        // Retry network errors (e.g. backend restart) but not data errors (e.g. 404)
        retry: (failureCount, err) => err instanceof NetworkError && failureCount < 4,
    })

    // ── Merge pending queue mutations into the server-fetched evening ──────────
    // This makes offline-added items (penalties, drinks, games) visible in the UI
    // immediately while they wait to be flushed to the server.
    const evening = useMemo((): Evening | null | undefined => {
        if (!serverEvening || !activeEveningId) return serverEvening
        if (queueItems.length === 0) return serverEvening

        // Only consider items belonging to this specific evening
        const eidStr = String(activeEveningId)
        const prefix = `/evening/${eidStr}/`
        const relevant = queueItems.filter(item => item.path.startsWith(prefix))
        if (relevant.length === 0) return serverEvening

        const deletedPenaltyIds = new Set<number>()
        const deletedDrinkIds = new Set<number>()
        const deletedGameIds = new Set<number>()
        const pendingPenalties: PenaltyLogEntry[] = []
        const pendingDrinks: DrinkRound[] = []
        const pendingGames: Game[] = []
        // Status overrides for pending games that have start/finish also queued
        const gameStatusOverride: Partial<Record<number, GameStatus>> = {}
        // Field patches for games from queued PATCH or finish bodies
        const gamePatch: Partial<Record<number, Partial<Game>>> = {}

        for (const item of relevant) {
            const {method, path, body} = item

            // ── DELETE operations — track which items were removed offline ──
            if (method === 'DELETE') {
                const penMatch = path.match(/\/penalties\/(-?\d+)$/)
                if (penMatch) { deletedPenaltyIds.add(Number(penMatch[1])); continue }
                const drinkMatch = path.match(/\/drinks\/(-?\d+)$/)
                if (drinkMatch) { deletedDrinkIds.add(Number(drinkMatch[1])); continue }
                const gameMatch = path.match(/\/games\/(-?\d+)$/)
                if (gameMatch) { deletedGameIds.add(Number(gameMatch[1])); continue }
            }

            // ── POST operations — construct fake items from the queued body ──
            if (method === 'POST') {
                // Penalties
                if (/\/penalties$/.test(path)) {
                    const b = body as {
                        player_ids?: number[]
                        penalty_type_name?: string
                        icon?: string
                        amount?: number
                        mode?: string
                        unit_amount?: number
                        client_timestamp?: number
                    }
                    for (let i = 0; i < (b.player_ids ?? []).length; i++) {
                        const pid = b.player_ids![i]
                        const player = serverEvening.players.find(p => p.id === pid)
                        pendingPenalties.push({
                            id: -((item.id ?? 0) * 100 + i),
                            player_id: pid,
                            team_id: null,
                            player_name: player?.nickname || player?.name || '?',
                            penalty_type_name: b.penalty_type_name ?? '',
                            icon: b.icon ?? '',
                            amount: b.amount ?? 1,
                            mode: (b.mode ?? 'count') as 'euro' | 'count',
                            unit_amount: b.unit_amount ?? null,
                            regular_member_id: player?.regular_member_id ?? null,
                            game_id: null,
                            client_timestamp: b.client_timestamp ?? Date.now(),
                        })
                    }
                    continue
                }

                // Drink rounds
                if (/\/drinks$/.test(path)) {
                    const b = body as {
                        drink_type?: string
                        variety?: string
                        participant_ids?: number[]
                        client_timestamp?: number
                    }
                    pendingDrinks.push({
                        id: -(item.id ?? 0),
                        drink_type: (b.drink_type ?? 'beer') as 'beer' | 'shots',
                        variety: b.variety ?? null,
                        participant_ids: b.participant_ids ?? [],
                        client_timestamp: b.client_timestamp ?? Date.now(),
                    })
                    continue
                }

                // Games (only items that carried a tempId — addGame creates these)
                if (/\/games$/.test(path) && item.tempId !== undefined) {
                    const b = body as {
                        name?: string
                        template_id?: number
                        is_opener?: boolean
                        winner_type?: string
                        turn_mode?: string | null
                        loser_penalty?: number
                        per_point_penalty?: number
                        note?: string
                        sort_order?: number
                        client_timestamp?: number
                    }
                    pendingGames.push({
                        id: item.tempId,
                        name: b.name ?? '',
                        template_id: b.template_id ?? null,
                        is_opener: b.is_opener ?? false,
                        winner_type: (
                            b.winner_type === 'team' || b.winner_type === 'individual'
                                ? b.winner_type
                                : 'individual'
                        ) as WinnerType,
                        turn_mode: (b.turn_mode ?? null) as TurnMode | null,
                        winner_ref: null,
                        winner_name: null,
                        scores: {},
                        loser_penalty: b.loser_penalty ?? 0,
                        per_point_penalty: b.per_point_penalty ?? 0,
                        note: b.note ?? null,
                        sort_order: b.sort_order ?? serverEvening.games.length,
                        status: 'open',
                        started_at: null,
                        finished_at: null,
                        client_timestamp: b.client_timestamp ?? Date.now(),
                        active_player_id: null,
                        throws: [],
                    })
                    continue
                }

                // Game start — update status of a pending game if also queued
                const startMatch = path.match(/\/games\/(-?\d+)\/start$/)
                if (startMatch) {
                    const gid = Number(startMatch[1])
                    const b = body as {client_timestamp?: number}
                    gameStatusOverride[gid] = 'running'
                    gamePatch[gid] = {
                        ...gamePatch[gid],
                        started_at: new Date(b.client_timestamp ?? item.timestamp).toISOString(),
                        _pendingStart: true,
                    }
                    continue
                }

                // Game finish — update status and merge winner/scores
                const finishMatch = path.match(/\/games\/(-?\d+)\/finish$/)
                if (finishMatch) {
                    const gid = Number(finishMatch[1])
                    gameStatusOverride[gid] = 'finished'
                    const b = body as {winner_ref?: string; winner_name?: string; scores?: Record<string, number>; loser_penalty?: number; client_timestamp?: number}
                    gamePatch[gid] = {
                        ...gamePatch[gid],
                        winner_ref: b.winner_ref ?? null,
                        winner_name: b.winner_name ?? null,
                        scores: b.scores ?? {},
                        ...(b.loser_penalty !== undefined ? {loser_penalty: b.loser_penalty} : {}),
                        finished_at: new Date(b.client_timestamp ?? item.timestamp).toISOString(),
                        _pendingFinish: true,
                    }
                    continue
                }
            }

            // PATCH on a game — merge updated metadata fields
            if (method === 'PATCH') {
                const patchMatch = path.match(/\/games\/(-?\d+)$/)
                if (patchMatch) {
                    const gid = Number(patchMatch[1])
                    const b = body as Partial<Game>
                    gamePatch[gid] = {...gamePatch[gid], ...b}
                    continue
                }
            }
        }

        // Fast-exit if nothing actually changed
        if (
            !deletedPenaltyIds.size && !deletedDrinkIds.size && !deletedGameIds.size &&
            !pendingPenalties.length && !pendingDrinks.length && !pendingGames.length &&
            !Object.keys(gameStatusOverride).length && !Object.keys(gamePatch).length
        ) return serverEvening

        const applyGameOverrides = (g: Game): Game => {
            const status = gameStatusOverride[g.id] ? {status: gameStatusOverride[g.id]!} : {}
            const patch = gamePatch[g.id] ?? {}
            return Object.keys(status).length || Object.keys(patch).length
                ? {...g, ...patch, ...status}
                : g
        }

        return {
            ...serverEvening,
            penalty_log: [
                ...serverEvening.penalty_log.filter(p => !deletedPenaltyIds.has(p.id)),
                ...pendingPenalties,
            ],
            drink_rounds: [
                ...serverEvening.drink_rounds.filter(d => !deletedDrinkIds.has(d.id)),
                ...pendingDrinks,
            ],
            games: [
                ...serverEvening.games
                    .filter(g => !deletedGameIds.has(g.id))
                    .map(applyGameOverrides),
                ...pendingGames
                    .filter(g => !deletedGameIds.has(g.id))
                    .map(applyGameOverrides),
            ],
        }
    }, [serverEvening, queueItems, activeEveningId])

    // SSE subscription — invalidates query instantly when server signals a change.
    // Auto-reconnects with exponential backoff (1s → 2s → 4s … max 30s) so users
    // don't need to manually reload after network hiccups or server restarts.
    useEffect(() => {
        if (!activeEveningId) return
        if (isPending) return  // temp evening has no server-side SSE stream
        const token = authState.getToken()
        if (!token) return

        let closed = false
        let backoff = 1000
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null

        function connect() {
            if (closed) return
            const es = new EventSource(`/api/v1/evening/${activeEveningId}/events?token=${encodeURIComponent(token!)}`)
            esRef.current = es

            es.onopen = () => {
                backoff = 1000 // reset on successful connection
            }
            es.onmessage = (e) => {
                if (e.data === 'updated') {
                    qc.invalidateQueries({queryKey: ['evening', activeEveningId]})
                }
            }
            es.onerror = () => {
                es.close()
                if (!closed) {
                    reconnectTimer = setTimeout(() => {
                        backoff = Math.min(backoff * 2, 30_000)
                        connect()
                    }, backoff)
                }
            }
        }

        connect()

        return () => {
            closed = true
            if (reconnectTimer) clearTimeout(reconnectTimer)
            esRef.current?.close()
            esRef.current = null
        }
    }, [activeEveningId])

    // Clear stale activeEveningId when the evening has been closed or is no longer reachable (e.g. deleted).
    // Also invalidate the evenings list so SchedulePage doesn't show a stale "active evening" card,
    // and flush the offline queue so any queued mutations for the now-closed evening are replayed
    // (they'll get 400 from the server and be discarded cleanly, hiding the OfflineBanner).
    useEffect(() => {
        if (evening?.is_closed) {
            setActiveEveningId(null)
            qc.invalidateQueries({queryKey: ['evenings']})
            flushOfflineQueue().catch(() => {})
        }
    }, [evening?.is_closed])

    // Only clear activeEveningId for real data errors (e.g. 404 evening gone).
    // Network errors (backend restart, temporary outage) are transient — preserving
    // the ID lets the app recover automatically once the server is back.
    // Pending temp evenings (id < 0) must never be cleared by error — they only
    // exist in IndexedDB and will be resolved when the queue is flushed.
    useEffect(() => {
        if (isError && !(error instanceof NetworkError) && !isPending) setActiveEveningId(null)
    }, [isError, error, isPending])

    const invalidate = () => qc.invalidateQueries({queryKey: ['evening', activeEveningId]})

    /**
     * Cancel a pending (not-yet-synced) queue item by removing it from the offline
     * queue rather than sending a DELETE to the server (which would 404 since the
     * resource was never created).
     *
     * Fake ID encoding used by the pending-merge logic:
     *   penalty  → -(queueItemId * 1000 + playerIndex)
     *   drink    → -(queueItemId)
     *   game     → item.tempId  (large negative timestamp, e.g. -1745678901234)
     *
     * For game cancellation all related operations (start, finish, etc.) whose path
     * contains the temp game ID string are also removed.
     */
    async function cancelPendingItem(fakeId: number, type: 'penalty' | 'drink' | 'game') {
        try {
            if (type === 'penalty') {
                // Recover the queue item ID from the encoded fake penalty ID
                const queueItemId = Math.floor(Math.abs(fakeId) / 1000)
                if (queueItemId > 0) await offlineQueue.remove(queueItemId)
            } else if (type === 'drink') {
                const queueItemId = Math.abs(fakeId)
                if (queueItemId > 0) await offlineQueue.remove(queueItemId)
            } else {
                // Game: remove the creation item and all subsequent operations that
                // reference this temp ID in their path (start, finish, etc.)
                const all = await offlineQueue.getAll()
                const tempIdStr = String(fakeId)
                for (const item of all) {
                    const isCreation = item.tempId === fakeId
                    const isRelated = item.path.includes(tempIdStr)
                    if ((isCreation || isRelated) && item.id !== undefined) {
                        await offlineQueue.remove(item.id)
                    }
                }
            }
        } catch { /* IndexedDB unavailable */ }
        window.dispatchEvent(new CustomEvent('kegelkasse:queue-changed'))
    }

    return {evening, isLoading, invalidate, activeEveningId, isPending, cancelPendingItem}
}

export function useEveningList() {
    return useQuery({
        queryKey: ['evenings'],
        queryFn: api.listEvenings,
        staleTime: 1000 * 60,
    })
}

// Computed helpers
export function penaltyTotal(evening: ReturnType<typeof useActiveEvening>["evening"], playerId: number): number {
    if (!evening) return 0
    return evening.penalty_log
        .filter(l => l.player_id === playerId && l.mode === "euro")
        .reduce((sum, l) => sum + l.amount, 0)
}

export function playerBeerCount(evening: ReturnType<typeof useActiveEvening>["evening"], playerId: number): number {
    if (!evening) return 0
    return evening.drink_rounds.filter(r => r.drink_type === "beer" && r.participant_ids.includes(playerId)).length
}

export function playerShotsCount(evening: ReturnType<typeof useActiveEvening>["evening"], playerId: number): number {
    if (!evening) return 0
    return evening.drink_rounds.filter(r => r.drink_type === "shots" && r.participant_ids.includes(playerId)).length
}
