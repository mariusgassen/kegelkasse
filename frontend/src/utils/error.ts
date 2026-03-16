import {UnauthorizedError} from '@/api/client'
import {showToast} from '@/components/ui/Toast'
import {t} from '@/i18n'

/**
 * Show an error toast for unexpected errors.
 * Silently ignores UnauthorizedError (handled globally via onUnauthorized callback).
 */
export function toastError(e: unknown) {
    if (e instanceof UnauthorizedError) return
    showToast(e instanceof Error ? e.message : t('error.generic'), 'error')
}
