import {useNotificationStore, unreadCount} from '../store/notifications'
import {useT} from '../i18n'
import type {NotificationItem} from '../types'

interface Props {
    open: boolean
    onClose: () => void
    onNavigate?: (url: string) => void
}

function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 1) return '< 1 min'
    if (mins < 60) return `${mins} min`
    if (hours < 24) return `${hours} h`
    return `${days} d`
}

function NotificationRow({n, onClose}: { n: NotificationItem; onClose: () => void }) {
    const {dismiss} = useNotificationStore()

    return (
        <div
            className="flex items-start gap-3 px-3 py-3 rounded-xl transition-colors"
            style={{
                background: n.read ? 'rgba(255,255,255,0.03)' : 'rgba(232,160,32,0.08)',
                border: `1px solid ${n.read ? 'var(--kce-border)' : 'rgba(232,160,32,0.2)'}`,
            }}
        >
            {!n.read && (
                <div
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1"
                    style={{background: '#e8a020'}}
                />
            )}
            {n.read && <div className="w-2 flex-shrink-0"/>}
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-kce-cream leading-snug">{n.title}</p>
                <p className="text-[11px] text-kce-muted mt-0.5 leading-snug">{n.body}</p>
                <p className="text-[10px] text-kce-muted opacity-60 mt-1">{relativeTime(n.receivedAt)}</p>
            </div>
            <button
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-60"
                style={{background: 'rgba(255,255,255,0.07)', color: 'var(--kce-muted)', fontSize: 12}}
                onClick={() => dismiss(n.id)}
            >
                ✕
            </button>
        </div>
    )
}

export function NotificationPanel({open, onClose}: Props) {
    const t = useT()
    const {notifications, markAllRead, clearAll} = useNotificationStore()
    const unread = unreadCount(notifications)

    // Mark all read when panel opens
    if (open && unread > 0) markAllRead()

    if (!open) return null

    return (
        <div
            className="bottom-sheet"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div className="sheet-panel safe-bottom" style={{maxHeight: '80%'}}>
                {/* Drag handle */}
                <div className="sheet-handle"/>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="sheet-title mb-0">{t('notifications.title')}</div>
                    <div className="flex items-center gap-2">
                        {notifications.length > 0 && (
                            <button
                                type="button"
                                onClick={clearAll}
                                className="text-[10px] font-bold text-kce-muted active:opacity-60 px-2 py-1 rounded-lg"
                                style={{background: 'rgba(255,255,255,0.07)'}}
                            >
                                {t('notifications.clearAll')}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-kce-muted active:opacity-60"
                            style={{background: 'rgba(255,255,255,0.07)', fontSize: 16, lineHeight: 1}}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Notification list */}
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-kce-muted">
                        <span style={{fontSize: 32}}>🔔</span>
                        <p className="text-xs font-bold">{t('notifications.empty')}</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {notifications.map((n) => (
                            <NotificationRow key={n.id} n={n} onClose={onClose}/>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
