import {create} from 'zustand'
import {persist} from 'zustand/middleware'
import type {NotificationItem} from '../types'

interface NotificationState {
    notifications: NotificationItem[]
    addNotification: (item: Omit<NotificationItem, 'id' | 'receivedAt' | 'read'>) => void
    markAllRead: () => void
    dismiss: (id: string) => void
    clearAll: () => void
}

export const useNotificationStore = create<NotificationState>()(
    persist(
        (set) => ({
            notifications: [],
            addNotification: (item) => set((s) => {
                // Deduplicate: skip if same title+body+url already added within last 60 seconds
                const cutoff = Date.now() - 60_000
                const isDupe = s.notifications.some(n =>
                    n.title === item.title &&
                    n.body === item.body &&
                    n.url === item.url &&
                    new Date(n.receivedAt).getTime() > cutoff
                )
                if (isDupe) return s
                return {
                    notifications: [{
                        ...item,
                        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                        receivedAt: new Date().toISOString(),
                        read: false,
                    }, ...s.notifications].slice(0, 50),
                }
            }),
            markAllRead: () => set((s) => ({
                notifications: s.notifications.map((n) => ({...n, read: true})),
            })),
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
