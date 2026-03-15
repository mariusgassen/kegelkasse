import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAppStore } from '../store/app'

export function useActiveEvening() {
  const activeEveningId = useAppStore(s => s.activeEveningId)
  const qc = useQueryClient()

  const { data: evening, isLoading } = useQuery({
    queryKey: ['evening', activeEveningId],
    queryFn: () => activeEveningId ? api.getEvening(activeEveningId) : null,
    enabled: !!activeEveningId,
    staleTime: 1000 * 15,
    // Poll every 30s for live updates (other users editing same evening)
    refetchInterval: 1000 * 30,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['evening', activeEveningId] })

  return { evening, isLoading, invalidate, activeEveningId }
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
