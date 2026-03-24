import {useT} from '@/i18n'
import {useOnline} from '@/hooks/useOnline'

/**
 * Amber banner shown when offline. Renders nothing when online.
 * Drop this at the top of any page or section whose write operations
 * require a network connection.
 */
export function OfflineNotice({message}: {message?: string}) {
    const t = useT()
    const isOnline = useOnline()
    if (isOnline) return null
    return (
        <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
            <span className="flex-shrink-0">📵</span>
            <span>{message ?? t('offline.noticeWrite')}</span>
        </div>
    )
}
