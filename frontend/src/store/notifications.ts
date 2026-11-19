import {create} from 'zustand'
import {persist} from 'zustand/middleware'
import type {NotificationItem} from '../types'

export function isUpdateNotification(
    n: Pick<NotificationItem, 'category' | 'tag' | 'url' | 'title'>,
): boolean {
    if (n.category === 'app_updates' || n.tag === 'kegelkasse-release') return true
    return n.url === '/' && /^(Neue Version |New version )/i.test(n.title)
}

/** Extract the `X.Y.Z` release version from an update notification title, or null. */
export function extractReleaseVersion(title: string): string | null {
    const match = title.match(/\b(\d+\.\d+\.\d+)\b/)
    return match ? match[1] : null
}

interface NotificationState {
    notifications: NotificationItem[]
    addNotification: (item: Omit<NotificationItem, 'id' | 'receivedAt' | 'read'> & {serverCreatedAt?: string}) => void
    markAllRead: () => void
    markUpdateNotificationsRead: () => void
    dismiss: (id: string) => void
    clearAll: () => void
}

export const useNotificationStore = create<NotificationState>()(
    persist(
        (set) => ({
            notifications: [],
            addNotification: ({serverCreatedAt, ...item}) => set((s) => {
                // Deduplicate by serverLogId (server-fetched) or by title+body+url within 60s (SW/live).
                // When a server-fetched item matches a recent SW-delivered item that lacks a serverLogId,
                // attach the serverLogId/category to the existing entry instead of creating a duplicate.
                if (item.serverLogId != null) {
                    if (s.notifications.some(n => n.serverLogId === item.serverLogId)) return s
                    const serverTs = serverCreatedAt ? new Date(serverCreatedAt).getTime() : Date.now()
                    const liveMatch = s.notifications.find(n =>
                        n.serverLogId == null &&
                        n.title === item.title &&
                        n.body === item.body &&
                        n.url === item.url &&
                        Math.abs(new Date(n.receivedAt).getTime() - serverTs) < 5 * 60_000
                    )
                    if (liveMatch) {
                        return {
                            notifications: s.notifications.map(n =>
                                n.id === liveMatch.id
                                    ? {...n, serverLogId: item.serverLogId, category: item.category ?? n.category}
                                    : n
                            ),
                        }
                    }
                } else {
                    const cutoff = Date.now() - 60_000
                    const isDupe = s.notifications.some(n =>
                        n.title === item.title &&
                        n.body === item.body &&
                        n.url === item.url &&
                        new Date(n.receivedAt).getTime() > cutoff
                    )
                    if (isDupe) return s
                }
                return {
                    notifications: [{
                        ...item,
                        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                        receivedAt: serverCreatedAt ?? new Date().toISOString(),
                        read: false,
                    }, ...s.notifications].slice(0, 50),
                }
            }),
            markAllRead: () => set((s) => ({
                notifications: s.notifications.map((n) => ({...n, read: true})),
            })),
            markUpdateNotificationsRead: () => set((s) => {
                if (!s.notifications.some((n) => !n.read && isUpdateNotification(n))) return s
                return {
                    notifications: s.notifications.map((n) =>
                        !n.read && isUpdateNotification(n) ? {...n, read: true} : n
                    ),
                }
            }),
            dismiss: (id) => set((s) => ({
                notifications: s.notifications.filter((n) => n.id !== id),
            })),
            clearAll: () => set({notifications: []}),
        }),
        {
            name: 'kegelkasse-notifications',
        }
    )
)

export const unreadCount = (notifications: NotificationItem[]) =>
    notifications.filter((n) => !n.read).length
