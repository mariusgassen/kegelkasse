/**
 * Unit tests for push notification API client functions.
 *
 * The global `fetch` is replaced with a vi.fn() spy before each test so no
 * real HTTP requests are made.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authState } from '../client'

// We re-import the module-under-test after setting the token so the
// module-level `_token` variable is initialised correctly.
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Stub localStorage (jsdom provides one, but let's be explicit)
beforeEach(() => {
    mockFetch.mockReset()
    // Provide a token so all requests include the Authorization header
    authState.setToken('test-jwt-token')
})

function jsonOk(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

function noContent(): Response {
    return new Response(null, { status: 204 })
}

function errorResponse(status: number, detail: string): Response {
    return new Response(JSON.stringify({ detail }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

// ---------------------------------------------------------------------------
// getVapidPublicKey
// ---------------------------------------------------------------------------

describe('api.getVapidPublicKey', () => {
    it('returns the public key from the server', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ public_key: 'BFakeVapidPublicKey==' }))

        const { api } = await import('../client')
        const result = await api.getVapidPublicKey()

        expect(result.public_key).toBe('BFakeVapidPublicKey==')
        expect(mockFetch).toHaveBeenCalledWith(
            '/api/v1/push/vapid-key',
            expect.objectContaining({ method: 'GET' }),
        )
    })

    it('throws when server returns 503', async () => {
        mockFetch.mockResolvedValueOnce(errorResponse(503, 'Push notifications not configured'))

        const { api } = await import('../client')
        await expect(api.getVapidPublicKey()).rejects.toThrow('Push notifications not configured')
    })
})

// ---------------------------------------------------------------------------
// getPushStatus
// ---------------------------------------------------------------------------

describe('api.getPushStatus', () => {
    it('returns subscribed=false, configured=false when neither is set', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ subscribed: false, configured: false }))

        const { api } = await import('../client')
        const result = await api.getPushStatus()

        expect(result.subscribed).toBe(false)
        expect(result.configured).toBe(false)
    })

    it('returns subscribed=true, configured=true when both are set', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ subscribed: true, configured: true }))

        const { api } = await import('../client')
        const result = await api.getPushStatus()

        expect(result.subscribed).toBe(true)
        expect(result.configured).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// subscribeToPush
// ---------------------------------------------------------------------------

describe('api.subscribeToPush', () => {
    const payload = {
        endpoint: 'https://push.example.com/endpoint-abc',
        p256dh: 'p256dh-key',
        auth: 'auth-key',
    }

    it('posts subscription data and returns ok=true', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }, 201))

        const { api } = await import('../client')
        const result = await api.subscribeToPush(payload)

        expect(result.ok).toBe(true)
        expect(mockFetch).toHaveBeenCalledWith(
            '/api/v1/push/subscribe',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify(payload),
            }),
        )
    })

    it('includes Authorization header', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }, 201))

        const { api } = await import('../client')
        await api.subscribeToPush(payload)

        const [, options] = mockFetch.mock.calls[0]
        expect((options as RequestInit).headers).toMatchObject({
            Authorization: 'Bearer test-jwt-token',
        })
    })
})

// ---------------------------------------------------------------------------
// unsubscribeFromPush
// ---------------------------------------------------------------------------

describe('api.unsubscribeFromPush', () => {
    it('sends DELETE without endpoint param when none provided', async () => {
        mockFetch.mockResolvedValueOnce(noContent())

        const { api } = await import('../client')
        await api.unsubscribeFromPush()

        expect(mockFetch).toHaveBeenCalledWith(
            '/api/v1/push/unsubscribe',
            expect.objectContaining({ method: 'DELETE' }),
        )
    })

    it('appends encoded endpoint as query param when provided', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const endpoint = 'https://push.example.com/my endpoint'

        const { api } = await import('../client')
        await api.unsubscribeFromPush(endpoint)

        const [url] = mockFetch.mock.calls[0]
        expect(url).toContain('endpoint=')
        expect(url).toContain(encodeURIComponent(endpoint))
    })
})

// ---------------------------------------------------------------------------
// testPush
// ---------------------------------------------------------------------------

describe('api.testPush', () => {
    it('posts to /push/test and returns sent count', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ sent: 1 }))

        const { api } = await import('../client')
        const result = await api.testPush()

        expect(result.sent).toBe(1)
        expect(mockFetch).toHaveBeenCalledWith(
            '/api/v1/push/test',
            expect.objectContaining({ method: 'POST' }),
        )
    })

    it('throws when no subscription exists (404)', async () => {
        mockFetch.mockResolvedValueOnce(errorResponse(404, 'No push subscription found for this device'))

        const { api } = await import('../client')
        await expect(api.testPush()).rejects.toThrow('No push subscription found')
    })

    it('throws when VAPID not configured (503)', async () => {
        mockFetch.mockResolvedValueOnce(errorResponse(503, 'Push notifications not configured'))

        const { api } = await import('../client')
        await expect(api.testPush()).rejects.toThrow('Push notifications not configured')
    })

    it('throws NetworkError when fetch fails', async () => {
        mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

        const { api } = await import('../client')
        await expect(api.testPush()).rejects.toThrow('Server nicht erreichbar')
    })
})
