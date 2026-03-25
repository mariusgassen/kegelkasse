import {UnauthorizedError, OfflineQueuedError, api} from '@/api/client'
import {showToast} from '@/components/ui/Toast'
import {t} from '@/i18n'
import {useAppStore} from '@/store/app'

/**
 * Show an error toast for unexpected errors.
 * Silently ignores UnauthorizedError (handled globally via onUnauthorized callback).
 * Shows a success toast for OfflineQueuedError (mutation queued for later sync).
 */
export function toastError(e: unknown) {
    if (e instanceof UnauthorizedError) return
    if (e instanceof OfflineQueuedError) {
        showToast(t('sync.queued'), 'success')
        return
    }
    showToast(e instanceof Error ? e.message : t('error.generic'), 'error')
}

/**
 * When the backend rejects evening creation because another evening is already open,
 * fetch the evening list, load the open evening into the store, and show a notice.
 * Returns true if the error was handled (caller should NOT call toastError).
 */
export async function handleAlreadyActive(e: unknown): Promise<boolean> {
    if (!(e instanceof Error) || e.message !== 'Another evening is already active') return false
    try {
        const evenings = await api.listEvenings()
        const open = evenings.find(ev => !ev.is_closed)
        if (open) {
            useAppStore.getState().setActiveEveningId(open.id)
            showToast(t('error.eveningAlreadyActive'), 'info')
        }
    } catch {
        // ignore secondary fetch errors
    }
    return true
}
