import {useEffect, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {api} from '@/api/client'
import {useT} from '@/i18n'
import {Sheet} from '@/components/ui/Sheet'
import {toastError} from '@/utils/error'
import {OPEN_PROFILE_EVENT} from '@/lib/aiLinks'
import {pushSupported, subscribeThisDevice} from '@/lib/pushSubscribe'

/** Set once the member has answered the first-launch prompt (either way) so it never returns. */
export const NOTIFICATION_PROMPT_KEY = 'kce_notification_prompt_done'

/**
 * One-time sheet on the first launch asking whether to stay up to date via push. Agreeing asks
 * the browser for permission (inside the tap, as iOS requires) and then opens the profile
 * settings, where each category can be switched on or off. Declining is final: no re-prompt;
 * the profile settings remain the place to opt in later.
 */
export function NotificationPrompt() {
    const t = useT()
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(false)

    const supported = pushSupported()
    const {data: status} = useQuery({
        queryKey: ['push-status'],
        queryFn: api.getPushStatus,
        enabled: supported && localStorage.getItem(NOTIFICATION_PROMPT_KEY) !== 'true',
    })

    useEffect(() => {
        if (!status || localStorage.getItem(NOTIFICATION_PROMPT_KEY) === 'true') return
        // Nothing to ask when push is unavailable, already decided in the browser, or already on.
        if (!status.configured || status.subscribed || Notification.permission !== 'default') {
            if (Notification.permission !== 'default' || status.subscribed) {
                localStorage.setItem(NOTIFICATION_PROMPT_KEY, 'true')
            }
            return
        }
        setOpen(true)
    }, [status])

    function finish() {
        localStorage.setItem(NOTIFICATION_PROMPT_KEY, 'true')
        setOpen(false)
    }

    async function accept() {
        setBusy(true)
        try {
            const result = await subscribeThisDevice()
            finish()
            if (result === 'granted') {
                window.dispatchEvent(new CustomEvent(OPEN_PROFILE_EVENT, {detail: {tab: 'settings'}}))
            }
        } catch (e) {
            finish()
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    return (
        <Sheet open={open} onClose={finish} title={t('notifPrompt.title')}>
            <p className="text-sm mb-2">{t('notifPrompt.body')}</p>
            <p className="text-sm text-muted mb-4">{t('notifPrompt.hint')}</p>
            <div className="flex flex-col gap-2">
                <button className="btn-primary" onClick={accept} disabled={busy}>
                    {busy ? '…' : t('notifPrompt.accept')}
                </button>
                <button className="btn-secondary" onClick={finish} disabled={busy}>
                    {t('notifPrompt.later')}
                </button>
            </div>
        </Sheet>
    )
}
