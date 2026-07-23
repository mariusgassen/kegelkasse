/**
 * Shared club-settings hooks.
 *
 * The `['club']` query is fetched all over the app with the same options; these hooks centralise it
 * and expose the derived flags the UI actually gates on.
 */
import {useQuery} from '@tanstack/react-query'
import {api} from '@/api/client'
import {throwTrackingEnabled} from '@/lib/clubSettings'
import type {Club} from '@/types'

export function useClub() {
    return useQuery<Club>({queryKey: ['club'], queryFn: api.getClub, staleTime: 60000})
}

/**
 * Whether camera-based pin/throw tracking is enabled for the current club (#33). Defaults to `true`
 * while the club is still loading and for clubs that predate the setting.
 */
export function useThrowTracking(): boolean {
    const {data: club} = useClub()
    return throwTrackingEnabled(club?.settings)
}
