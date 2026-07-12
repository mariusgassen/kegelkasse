import {useT} from '@/i18n'
import {useSwUpdate} from '@/hooks/useSwUpdate'

/**
 * Dismissible top banner shown once a new service-worker version is waiting to activate.
 * Reloading is user-initiated (via "Aktualisieren") rather than automatic, so an installed
 * PWA never reloads unannounced mid-evening.
 */
export function UpdatePrompt() {
    const t = useT()
    const {needRefresh, applyUpdate, dismiss} = useSwUpdate()

    if (!needRefresh) return null

    return (
        <div
            className="flex items-center justify-center gap-2 px-3 py-1.5 flex-shrink-0"
            style={{
                background: 'color-mix(in srgb, var(--kce-primary) 18%, var(--kce-bg))',
                borderBottom: '1px solid color-mix(in srgb, var(--kce-primary) 40%, transparent)',
                color: 'var(--kce-cream)',
            }}>
            <span className="text-xs font-bold flex-1 min-w-0 truncate">
                🔄 {t('update.banner.body')}
            </span>
            <button
                onClick={applyUpdate}
                className="text-[11px] font-bold px-3 py-1 rounded-full flex-shrink-0 active:opacity-70"
                style={{background: 'var(--kce-primary)', color: 'var(--kce-bg)', border: 'none'}}>
                {t('update.banner.button')}
            </button>
            <button
                onClick={dismiss}
                aria-label={t('update.banner.dismiss')}
                className="w-6 h-6 rounded-full flex items-center justify-center text-kce-muted active:opacity-60 flex-shrink-0"
                style={{background: 'rgba(255,255,255,0.1)', fontSize: 13, lineHeight: 1}}>
                ✕
            </button>
        </div>
    )
}
