import {useEffect, useState} from 'react'
import {useT} from '@/i18n'
import {offlineQueue, SYNC_FLUSHED_EVENT} from '@/offlineQueue'
import {flushOfflineQueue} from '@/api/client'
import {showToast} from '@/components/ui/Toast'
import {t} from '@/i18n'

export function OfflineBanner() {
    const [offline, setOffline] = useState(!navigator.onLine)
    const [pendingCount, setPendingCount] = useState(0)
    const tl = useT()

    async function refreshCount() {
        try {
            setPendingCount(await offlineQueue.count())
        } catch {
            // IndexedDB unavailable — ignore
        }
    }

    useEffect(() => {
        refreshCount()

        async function handleOnline() {
            setOffline(false)
            const {applied, errors} = await flushOfflineQueue()
            if (applied > 0) showToast(t('sync.flushed'))
            if (errors > 0) showToast(t('sync.flushErrors'), 'error')
            refreshCount()
        }

        const handleOffline = () => setOffline(true)
        const handleQueueChanged = () => refreshCount()

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        window.addEventListener('kegelkasse:queue-changed', handleQueueChanged)
        window.addEventListener(SYNC_FLUSHED_EVENT, handleQueueChanged)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            window.removeEventListener('kegelkasse:queue-changed', handleQueueChanged)
            window.removeEventListener(SYNC_FLUSHED_EVENT, handleQueueChanged)
        }
    }, [])

    if (!offline && pendingCount === 0) return null

    return (
        <div className="offline-banner">
            {offline ? (
                <>📵 {tl('sync.offline')}</>
            ) : (
                <>⏳ {tl('sync.pending')}: {pendingCount}</>
            )}
        </div>
    )
}
