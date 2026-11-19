import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {WhatsNewNotice} from '../WhatsNewNotice'
import {useWhatsNewStore} from '@/store/whatsNew'
import {useNotificationStore} from '@/store/notifications'
import {api, authState} from '@/api/client'
import {useI18n} from '@/i18n'
import type {Release} from '@/lib/changelog'

const releases: Release[] = [
    {version: '1.2.0', sections: [{type: 'feat', items: [{key: 'a', text: {en: 'Shiny thing', de: 'Glänzendes Ding'}}]}]},
]

beforeEach(() => {
    useWhatsNewStore.setState({lastSeen: null})
    useNotificationStore.setState({notifications: []})
    useI18n.setState({locale: 'de'})
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('WhatsNewNotice', () => {
    it('announces an unseen release', () => {
        render(<WhatsNewNotice releases={releases}/>)
        expect(screen.getByRole('status').textContent).toContain('1.2.0')
    })
    it('stays hidden when the release was already seen or none exists', () => {
        useWhatsNewStore.setState({lastSeen: '1.2.0'})
        const {unmount} = render(<WhatsNewNotice releases={releases}/>)
        expect(screen.queryByRole('status')).toBeNull()
        unmount()
        useWhatsNewStore.setState({lastSeen: null})
        render(<WhatsNewNotice releases={[]}/>)
        expect(screen.queryByRole('status')).toBeNull()
    })
    it('dismissing records the version and marks update notifications read', () => {
        vi.spyOn(authState, 'isLoggedIn').mockReturnValue(true)
        const markSpy = vi.spyOn(api, 'markNotificationsRead').mockResolvedValue(undefined)
        useNotificationStore.setState({
            notifications: [
                {id: 'u1', title: 'Neue Version 1.2.0', body: 'B', url: '/', category: 'app_updates', receivedAt: new Date().toISOString(), read: false},
                {id: 'o1', title: 'Strafe', body: '5€', url: '/#evening', category: 'penalties', receivedAt: new Date().toISOString(), read: false},
            ],
        })
        render(<WhatsNewNotice releases={releases}/>)
        fireEvent.click(screen.getByLabelText('Schließen'))
        expect(screen.queryByRole('status')).toBeNull()
        expect(useWhatsNewStore.getState().lastSeen).toBe('1.2.0')
        const ns = useNotificationStore.getState().notifications
        expect(ns.find(n => n.id === 'u1')?.read).toBe(true)
        expect(ns.find(n => n.id === 'o1')?.read).toBe(false)
        expect(markSpy).toHaveBeenCalledWith({category: 'app_updates'})
    })
    it('opening the sheet marks it seen, marks update notifications read, and keeps the sheet mounted', () => {
        vi.spyOn(authState, 'isLoggedIn').mockReturnValue(true)
        const markSpy = vi.spyOn(api, 'markNotificationsRead').mockResolvedValue(undefined)
        useNotificationStore.setState({
            notifications: [
                {id: 'u1', title: 'Neue Version 1.2.0', body: 'B', url: '/', category: 'app_updates', receivedAt: new Date().toISOString(), read: false},
            ],
        })
        render(<WhatsNewNotice releases={releases}/>)
        fireEvent.click(screen.getByText('Ansehen'))
        expect(screen.queryByRole('status')).toBeNull()
        expect(screen.getByText('Glänzendes Ding')).toBeTruthy()
        expect(useNotificationStore.getState().notifications[0].read).toBe(true)
        expect(markSpy).toHaveBeenCalledWith({category: 'app_updates'})
    })
})
