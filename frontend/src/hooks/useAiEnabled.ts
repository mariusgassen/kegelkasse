import {useQuery} from '@tanstack/react-query'
import {api} from '@/api/client.ts'

/**
 * Whether the server has a Claude API key configured. Every AI button is hidden while this is
 * false (also while it is loading and when the request fails), so installs without a key never
 * show a feature that can't work.
 */
export function useAiEnabled(): boolean {
    const {data} = useQuery({
        queryKey: ['ai-status'],
        queryFn: api.getAiStatus,
        staleTime: 5 * 60_000,
        retry: false,
    })
    return data?.enabled ?? false
}
