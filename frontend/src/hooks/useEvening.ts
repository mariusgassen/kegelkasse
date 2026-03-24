import {useEffect, useRef} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {api, authState, NetworkError} from '@/api/client.ts'
import {useAppStore} from '@/store/app.ts'
import {pendingStore} from '@/pendingStore.ts'
import type {Evening} from '@/types.ts'

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

    const isPending = !!activeEveningId && activeEveningId < 0

    const {data: evening, isLoading, isError, error} = useQuery({
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

    // Clear stale activeEveningId when the evening has been closed or is no longer reachable (e.g. deleted)
    useEffect(() => {
        if (evening?.is_closed) setActiveEveningId(null)
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

    return {evening, isLoading, invalidate, activeEveningId, isPending}
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
