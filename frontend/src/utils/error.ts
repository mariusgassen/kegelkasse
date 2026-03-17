import {UnauthorizedError, OfflineQueuedError} from '@/api/client'
import {showToast} from '@/components/ui/Toast'
import {t} from '@/i18n'

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
