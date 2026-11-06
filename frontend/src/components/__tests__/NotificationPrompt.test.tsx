import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {NotificationPrompt, NOTIFICATION_PROMPT_KEY} from '../NotificationPrompt'
import {useI18n} from '@/i18n'

const {getPushStatus, subscribeThisDevice} = vi.hoisted(() => ({
    getPushStatus: vi.fn(),
    subscribeThisDevice: vi.fn(),
}))
vi.mock('@/api/client', () => ({api: {getPushStatus}}))
vi.mock('@/lib/pushSubscribe', () => ({pushSupported: () => true, subscribeThisDevice}))

function setup() {
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
    return render(<QueryClientProvider client={qc}><NotificationPrompt/></QueryClientProvider>)
}

beforeEach(() => {
    localStorage.clear()
    useI18n.setState({locale: 'de'})
    vi.stubGlobal('Notification', {permission: 'default'})
    getPushStatus.mockResolvedValue({configured: true, subscribed: false})
    subscribeThisDevice.mockResolvedValue('granted')
})
afterEach(() => vi.unstubAllGlobals())

describe('NotificationPrompt', () => {
    it('asks on first launch', async () => {
        setup()
        expect(await screen.findByText('Benachrichtigungen aktivieren')).toBeTruthy()
    })
    it('declining is remembered and does not subscribe', async () => {
        setup()
        fireEvent.click(await screen.findByText('Nicht jetzt'))
        expect(localStorage.getItem(NOTIFICATION_PROMPT_KEY)).toBe('true')
        expect(subscribeThisDevice).not.toHaveBeenCalled()
    })
    it('accepting subscribes and opens the profile settings', async () => {
        const handler = vi.fn()
        window.addEventListener('kegelkasse:open-profile', handler)
        setup()
        fireEvent.click(await screen.findByText('Benachrichtigungen aktivieren'))
        await waitFor(() => expect(handler).toHaveBeenCalled())
        expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({tab: 'settings'})
        expect(localStorage.getItem(NOTIFICATION_PROMPT_KEY)).toBe('true')
        window.removeEventListener('kegelkasse:open-profile', handler)
    })
    it('does not ask again once answered', async () => {
        localStorage.setItem(NOTIFICATION_PROMPT_KEY, 'true')
        setup()
        await new Promise(r => setTimeout(r, 20))
        expect(getPushStatus).not.toHaveBeenCalled()
        expect(screen.queryByText('Nicht jetzt')).toBeNull()
    })
    it('stays silent when the browser already decided', async () => {
        vi.stubGlobal('Notification', {permission: 'denied'})
        setup()
        await waitFor(() => expect(getPushStatus).toHaveBeenCalled())
        expect(screen.queryByText('Nicht jetzt')).toBeNull()
    })
})
