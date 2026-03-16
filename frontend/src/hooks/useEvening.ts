import {useEffect, useRef} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {api, authState} from '@/api/client.ts'
import {useAppStore} from '@/store/app.ts'

export function useActiveEvening() {
    const activeEveningId = useAppStore(s => s.activeEveningId)
    const setActiveEveningId = useAppStore(s => s.setActiveEveningId)
    const qc = useQueryClient()
    const esRef = useRef<EventSource | null>(null)

    const {data: evening, isLoading} = useQuery({
        queryKey: ['evening', activeEveningId],
        queryFn: () => activeEveningId ? api.getEvening(activeEveningId) : null,
        enabled: !!activeEveningId,
        staleTime: 1000 * 15,
        // 30s polling as fallback when SSE is unavailable
        refetchInterval: 1000 * 30,
    })

    // SSE subscription — invalidates query instantly when server signals a change
    useEffect(() => {
        if (!activeEveningId) return
        const token = authState.getToken()
        if (!token) return

        const es = new EventSource(`/api/v1/evening/${activeEveningId}/events?token=${encodeURIComponent(token)}`)
        esRef.current = es

        es.onmessage = (e) => {
            if (e.data === 'updated') {
                qc.invalidateQueries({queryKey: ['evening', activeEveningId]})
            }
        }
        es.onerror = () => {
            // Connection dropped — polling fallback handles recovery
            es.close()
        }

        return () => {
            es.close()
            esRef.current = null
        }
    }, [activeEveningId])

    // Clear stale activeEveningId when the evening has been closed
    useEffect(() => {
        if (evening?.is_closed) setActiveEveningId(null)
    }, [evening?.is_closed])

    const invalidate = () => qc.invalidateQueries({queryKey: ['evening', activeEveningId]})

    return {evening, isLoading, invalidate, activeEveningId}
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
