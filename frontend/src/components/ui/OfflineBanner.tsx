import {useEffect, useState} from 'react'
import {useT} from '@/i18n'
import {offlineQueue, SYNC_FLUSHED_EVENT} from '@/offlineQueue'
import {flushOfflineQueue} from '@/api/client'
import {showToast} from '@/components/ui/Toast'
import {t} from '@/i18n'

export function OfflineBanner() {
    const [offline, setOffline] = useState(!navigator.onLine)
    const [pendingCount, setPendingCount] = useState(0)
    const [syncing, setSyncing] = useState(false)
    const tl = useT()

    async function refreshCount() {
        try {
            setPendingCount(await offlineQueue.count())
        } catch {
            // IndexedDB unavailable — ignore
        }
    }

    async function handleForceSync() {
        if (syncing) return
        setSyncing(true)
        try {
            const {applied, errors} = await flushOfflineQueue()
            if (applied > 0) showToast(t('sync.flushed'))
            if (errors > 0) showToast(t('sync.flushErrors'), 'error')
        } finally {
            setSyncing(false)
            refreshCount()
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
        <div className="offline-banner flex items-center justify-center gap-2 px-3">
            {offline ? (
                <span>📵 {tl('sync.offline')}</span>
            ) : (
                <>
                    <span>⏳ {tl('sync.pending')}: {pendingCount}</span>
                    <button
                        onClick={handleForceSync}
                        disabled={syncing}
                        style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '1px 8px',
                            borderRadius: 999,
                            background: 'rgba(255,255,255,0.25)',
                            color: 'inherit',
                            border: 'none',
                            cursor: 'pointer',
                            opacity: syncing ? 0.6 : 1,
                            flexShrink: 0,
                        }}
                    >
                        {syncing ? '…' : tl('sync.forceSync')}
                    </button>
                </>
            )}
        </div>
    )
}
