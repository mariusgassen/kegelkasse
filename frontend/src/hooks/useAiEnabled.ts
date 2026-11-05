import {useQuery} from '@tanstack/react-query'
import {api} from '@/api/client.ts'
import type {AiFeature} from '@/types.ts'

/**
 * Whether an AI feature may be shown: the server has a Claude API key and the club has the
 * feature switched on (Verein → Einstellungen → KI). Without a feature, only the key counts.
 * Everything stays hidden while loading and when the request fails, so installs without a
 * key never show a feature that can't work.
 */
export function useAiEnabled(feature?: AiFeature): boolean {
    const {data} = useQuery({
        queryKey: ['ai-status'],
        queryFn: api.getAiStatus,
        staleTime: 5 * 60_000,
        retry: false,
    })
    if (!data?.enabled) return false
    return feature ? data[feature] !== false : true
}
