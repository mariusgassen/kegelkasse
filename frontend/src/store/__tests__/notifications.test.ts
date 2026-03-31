import { describe, it, expect, beforeEach } from 'vitest'
import { useNotificationStore, unreadCount } from '../notifications'

function resetStore() {
    useNotificationStore.setState({ notifications: [] })
}

describe('useNotificationStore', () => {
    beforeEach(resetStore)

    // ── addNotification ─────────────────────────────────────────────────────

    it('starts with empty notifications', () => {
        expect(useNotificationStore.getState().notifications).toHaveLength(0)
    })

    it('adds a notification', () => {
        useNotificationStore.getState().addNotification({
            title: 'Test',
            body: 'Hello',
            url: '/app#evening',
        })
        expect(useNotificationStore.getState().notifications).toHaveLength(1)
    })

    it('new notification has read=false', () => {
        useNotificationStore.getState().addNotification({ title: 'T', body: 'B', url: '/' })
        const n = useNotificationStore.getState().notifications[0]
        expect(n.read).toBe(false)
    })

    it('new notification is prepended (newest first)', () => {
        useNotificationStore.getState().addNotification({ title: 'First', body: 'B', url: '/' })
        useNotificationStore.getState().addNotification({ title: 'Second', body: 'B', url: '/' })
        const ns = useNotificationStore.getState().notifications
        expect(ns[0].title).toBe('Second')
        expect(ns[1].title).toBe('First')
    })

    it('generates a unique id for each notification', () => {
        useNotificationStore.getState().addNotification({ title: 'A', body: 'B', url: '/' })
        useNotificationStore.getState().addNotification({ title: 'A', body: 'B', url: '/x' })
        const ns = useNotificationStore.getState().notifications
        expect(ns[0].id).not.toBe(ns[1].id)
    })

    it('uses serverCreatedAt as receivedAt when provided', () => {
        const ts = '2026-01-15T10:00:00Z'
        useNotificationStore.getState().addNotification({ title: 'T', body: 'B', url: '/', serverCreatedAt: ts })
        expect(useNotificationStore.getState().notifications[0].receivedAt).toBe(ts)
    })

    it('deduplicates by serverLogId', () => {
        useNotificationStore.getState().addNotification({ title: 'T', body: 'B', url: '/', serverLogId: 42 })
        useNotificationStore.getState().addNotification({ title: 'T', body: 'B', url: '/', serverLogId: 42 })
        expect(useNotificationStore.getState().notifications).toHaveLength(1)
    })

    it('adds second notification with different serverLogId', () => {
        useNotificationStore.getState().addNotification({ title: 'T', body: 'B', url: '/', serverLogId: 1 })
        useNotificationStore.getState().addNotification({ title: 'T', body: 'B', url: '/', serverLogId: 2 })
        expect(useNotificationStore.getState().notifications).toHaveLength(2)
    })

    it('deduplicates by title+body+url within 60s window', () => {
        useNotificationStore.getState().addNotification({ title: 'T', body: 'B', url: '/x' })
        useNotificationStore.getState().addNotification({ title: 'T', body: 'B', url: '/x' })
        expect(useNotificationStore.getState().notifications).toHaveLength(1)
    })

    it('allows duplicate title+body with different url', () => {
        useNotificationStore.getState().addNotification({ title: 'T', body: 'B', url: '/x' })
        useNotificationStore.getState().addNotification({ title: 'T', body: 'B', url: '/y' })
        expect(useNotificationStore.getState().notifications).toHaveLength(2)
    })

    it('caps notifications at 50', () => {
        for (let i = 0; i < 55; i++) {
            useNotificationStore.getState().addNotification({ title: `N${i}`, body: `B${i}`, url: `/${i}` })
        }
        expect(useNotificationStore.getState().notifications).toHaveLength(50)
    })

    // ── markAllRead ─────────────────────────────────────────────────────────

    it('markAllRead marks all notifications as read', () => {
        useNotificationStore.getState().addNotification({ title: 'A', body: 'B', url: '/1' })
        useNotificationStore.getState().addNotification({ title: 'C', body: 'D', url: '/2' })
        useNotificationStore.getState().markAllRead()
        const ns = useNotificationStore.getState().notifications
        expect(ns.every(n => n.read)).toBe(true)
    })

    it('markAllRead works on empty list', () => {
        useNotificationStore.getState().markAllRead()
        expect(useNotificationStore.getState().notifications).toHaveLength(0)
    })

    // ── dismiss ─────────────────────────────────────────────────────────────

    it('dismiss removes notification by id', () => {
        useNotificationStore.getState().addNotification({ title: 'A', body: 'B', url: '/1' })
        const id = useNotificationStore.getState().notifications[0].id
        useNotificationStore.getState().dismiss(id)
        expect(useNotificationStore.getState().notifications).toHaveLength(0)
    })

    it('dismiss ignores unknown id', () => {
        useNotificationStore.getState().addNotification({ title: 'A', body: 'B', url: '/1' })
        useNotificationStore.getState().dismiss('nonexistent-id')
        expect(useNotificationStore.getState().notifications).toHaveLength(1)
    })

    // ── clearAll ─────────────────────────────────────────────────────────────

    it('clearAll removes all notifications', () => {
        useNotificationStore.getState().addNotification({ title: 'A', body: 'B', url: '/1' })
        useNotificationStore.getState().addNotification({ title: 'C', body: 'D', url: '/2' })
        useNotificationStore.getState().clearAll()
        expect(useNotificationStore.getState().notifications).toHaveLength(0)
    })
})

// ── unreadCount ──────────────────────────────────────────────────────────────

describe('unreadCount', () => {
    it('returns 0 for empty list', () => {
        expect(unreadCount([])).toBe(0)
    })

    it('counts only unread notifications', () => {
        const ns: any[] = [
            { id: '1', read: false, title: 'A', body: 'B', url: '/', receivedAt: '' },
            { id: '2', read: true, title: 'C', body: 'D', url: '/', receivedAt: '' },
            { id: '3', read: false, title: 'E', body: 'F', url: '/', receivedAt: '' },
        ]
        expect(unreadCount(ns)).toBe(2)
    })

    it('returns 0 when all are read', () => {
        const ns: any[] = [
            { id: '1', read: true, title: 'A', body: 'B', url: '/', receivedAt: '' },
        ]
        expect(unreadCount(ns)).toBe(0)
    })
})
