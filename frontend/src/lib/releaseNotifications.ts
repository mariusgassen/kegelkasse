import {api, authState} from '@/api/client'
import {useNotificationStore} from '@/store/notifications'

/**
 * Mark release/update notifications as read locally and on the server when the
 * member views or dismisses the release notes / update activity in the island.
 */
export function markUpdateNotificationsRead(): void {
    useNotificationStore.getState().markUpdateNotificationsRead()
    if (authState.isLoggedIn()) {
        api.markNotificationsRead({category: 'app_updates'}).catch(() => {})
    }
}
