import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen, fireEvent} from '@testing-library/react'
import {useI18n} from '@/i18n'
import {useNotificationStore} from '@/store/notifications'
import {api, authState} from '@/api/client'

const swState = {
    needRefresh: false,
    applyUpdate: vi.fn(() => Promise.resolve()),
    dismiss: vi.fn(),
}

vi.mock('@/hooks/useSwUpdate', () => ({
    useSwUpdate: () => swState,
}))

import {UpdatePrompt} from '../UpdatePrompt'

beforeEach(() => {
    swState.needRefresh = false
    swState.applyUpdate.mockClear()
    swState.dismiss.mockClear()
    useNotificationStore.setState({notifications: []})
    useI18n.setState({locale: 'de'})
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('UpdatePrompt', () => {
    it('stays idle when no update is pending', () => {
        render(<UpdatePrompt/>)
        expect(screen.queryByRole('status')).toBeNull()
    })

    it('announces an available update in the Dynamic Island and wires Update/Later actions', () => {
        vi.spyOn(authState, 'isLoggedIn').mockReturnValue(true)
        const markSpy = vi.spyOn(api, 'markNotificationsRead').mockResolvedValue(undefined)
        useNotificationStore.setState({
            notifications: [
                {id: 'u1', title: 'Neue Version 1.2.0', body: 'B', url: '/', category: 'app_updates', receivedAt: new Date().toISOString(), read: false},
            ],
        })
        swState.needRefresh = true
        render(<UpdatePrompt/>)
        const status = screen.getByRole('status')
        expect(status.textContent).toContain('Eine neue Version ist verfügbar.')
        expect(screen.getByText('Eine neue Version ist verfügbar.').style.webkitLineClamp).toBe('2')
        expect(screen.getAllByText('Update').length).toBeGreaterThan(0)

        fireEvent.click(screen.getByRole('button', {name: 'Aktualisieren'}))
        expect(swState.applyUpdate).toHaveBeenCalledTimes(1)
        expect(useNotificationStore.getState().notifications[0].read).toBe(true)
        expect(markSpy).toHaveBeenCalledWith({category: 'app_updates'})

        fireEvent.click(screen.getByLabelText('Später'))
        expect(swState.dismiss).toHaveBeenCalledTimes(1)
    })
})
