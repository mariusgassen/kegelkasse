import {useEffect, useState} from 'react'
import {useT} from '@/i18n'
import {offlineQueue, groupQueuedRequests, SYNC_FLUSHED_EVENT, type QueueCategory} from '@/offlineQueue'
import {flushOfflineQueue} from '@/api/client'
import {showToast} from '@/components/ui/Toast'
import {t} from '@/i18n'

const CATEGORY_ORDER: QueueCategory[] = [
    'evening', 'game', 'player', 'penalty', 'drink', 'highlight', 'team', 'rsvp', 'member', 'other',
]

export function OfflineBanner() {
    const [offline, setOffline] = useState(!navigator.onLine)
    const [pendingCount, setPendingCount] = useState(0)
    const [groups, setGroups] = useState<Partial<Record<QueueCategory, number>>>({})
    const [syncing, setSyncing] = useState(false)
    const tl = useT()

    async function refreshQueue() {
        try {
            const [count, grouped] = await Promise.all([offlineQueue.count(), groupQueuedRequests()])
            setPendingCount(count)
            setGroups(grouped)
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
            refreshQueue()
        }
    }

    useEffect(() => {
        refreshQueue()

        async function handleOnline() {
            setOffline(false)
            const {applied, errors} = await flushOfflineQueue()
            if (applied > 0) showToast(t('sync.flushed'))
            if (errors > 0) showToast(t('sync.flushErrors'), 'error')
            refreshQueue()
        }

        const handleOffline = () => setOffline(true)
        const handleQueueChanged = () => refreshQueue()

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

    // Build compact group summary: "3 Strafen · 2 Getränke · 1 Spiel"
    const groupSummary = CATEGORY_ORDER
        .filter(cat => (groups[cat] ?? 0) > 0)
        .map(cat => {
            const n = groups[cat]!
            const key = n === 1
                ? `sync.category.${cat}` as Parameters<typeof tl>[0]
                : `sync.category.${cat}.plural` as Parameters<typeof tl>[0]
            return `${n}\u202f${tl(key)}`
        })
        .join(' · ')

    return (
        <div className="offline-banner flex flex-col items-center justify-center gap-0.5 px-3 py-1.5">
            {offline ? (
                <span>📵 {tl('sync.offline')}</span>
            ) : (
                <>
                    <div className="flex items-center gap-2">
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
                    </div>
                    {groupSummary && (
                        <span style={{fontSize: '10px', opacity: 0.85, letterSpacing: '0.01em'}}>
                            {groupSummary}
                        </span>
                    )}
                </>
            )}
        </div>
    )
}
