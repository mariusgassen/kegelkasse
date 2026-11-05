import {useState} from 'react'
import {useT} from '@/i18n'
import {hasUnseen, latestVersion, type Release} from '@/lib/changelog'
import {useWhatsNewStore} from '@/store/whatsNew'
import {ALL_RELEASES, WhatsNewSheet} from './WhatsNewSheet'

/**
 * One-time banner announcing a freshly published release. It disappears for good once the
 * member opens "Was ist neu" or dismisses it (both record the newest version as seen), and
 * returns only when an even newer release ships.
 */
export function WhatsNewNotice({releases = ALL_RELEASES}: {releases?: Release[]}) {
    const t = useT()
    const lastSeen = useWhatsNewStore(s => s.lastSeen)
    const markSeen = useWhatsNewStore(s => s.markSeen)
    const [open, setOpen] = useState(false)
    const latest = latestVersion(releases)

    return (
        <>
            {latest && hasUnseen(releases, lastSeen) && (
                <div
                    role="status"
                    className="flex items-center justify-center gap-2 px-3 py-1.5 flex-shrink-0"
                    style={{
                        background: 'color-mix(in srgb, var(--accent) 18%, var(--canvas))',
                        borderBottom: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                        color: 'var(--ink)',
                    }}>
                    <span className="text-xs font-bold flex-1 min-w-0 truncate">
                        🆕 {t('whatsNew.banner.body').replace('{v}', latest)}
                    </span>
                    <button
                        onClick={() => setOpen(true)}
                        className="text-sm font-bold px-3 py-1 rounded-full flex-shrink-0 active:opacity-70"
                        style={{background: 'var(--accent)', color: 'var(--on-accent)', border: 'none'}}>
                        {t('whatsNew.banner.button')}
                    </button>
                    <button
                        onClick={() => markSeen(latest)}
                        aria-label={t('whatsNew.banner.dismiss')}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-muted active:opacity-60 flex-shrink-0"
                        style={{fontSize: 13, lineHeight: 1}}>
                        ✕
                    </button>
                </div>
            )}
            <WhatsNewSheet open={open} onClose={() => setOpen(false)} releases={releases}/>
        </>
    )
}
