/**
 * Tests for error classes and authState in api/client.ts.
 *
 * The module-level `request` function uses navigator.onLine and fetch, so we
 * test error classes and authState directly — the HTTP dispatch behaviour is
 * already covered by push.test.ts and club.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { UnauthorizedError, NetworkError, OfflineQueuedError, authState, api } from '../client'

// ── helpers ──────────────────────────────────────────────────────────────────

function jsonOk(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

function errorResponse(status: number, detail: string): Response {
    return new Response(JSON.stringify({ detail }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

// ── Error class tests ─────────────────────────────────────────────────────────

describe('UnauthorizedError', () => {
    it('has name UnauthorizedError', () => {
        const err = new UnauthorizedError()
        expect(err.name).toBe('UnauthorizedError')
    })

    it('is instanceof Error', () => {
        expect(new UnauthorizedError()).toBeInstanceOf(Error)
    })
})

describe('NetworkError', () => {
    it('has name NetworkError', () => {
        expect(new NetworkError().name).toBe('NetworkError')
    })

    it('is instanceof Error', () => {
        expect(new NetworkError()).toBeInstanceOf(Error)
    })
})

describe('OfflineQueuedError', () => {
    it('has name OfflineQueuedError', () => {
        expect(new OfflineQueuedError().name).toBe('OfflineQueuedError')
    })

    it('is instanceof Error', () => {
        expect(new OfflineQueuedError()).toBeInstanceOf(Error)
    })
})

// ── authState tests ───────────────────────────────────────────────────────────

describe('authState', () => {
    beforeEach(() => {
        authState.setToken(null)
        localStorage.clear()
    })

    it('isLoggedIn returns false when no token', () => {
        expect(authState.isLoggedIn()).toBe(false)
    })

    it('isLoggedIn returns true after setToken', () => {
        authState.setToken('my-jwt-token')
        expect(authState.isLoggedIn()).toBe(true)
    })

    it('getToken returns the set token', () => {
        authState.setToken('abc123')
        expect(authState.getToken()).toBe('abc123')
    })

    it('setToken(null) clears the token', () => {
        authState.setToken('some-token')
        authState.setToken(null)
        expect(authState.getToken()).toBeNull()
        expect(authState.isLoggedIn()).toBe(false)
    })

    it('setToken persists to localStorage', () => {
        authState.setToken('persisted-token')
        expect(localStorage.getItem('kegelkasse_token')).toBe('persisted-token')
    })

    it('setToken(null) removes from localStorage', () => {
        authState.setToken('to-remove')
        authState.setToken(null)
        expect(localStorage.getItem('kegelkasse_token')).toBeNull()
    })

    it('onUnauthorized registers a callback', () => {
        const cb = vi.fn()
        const unsub = authState.onUnauthorized(cb)
        authState._fireUnauthorized()
        expect(cb).toHaveBeenCalledOnce()
        unsub()
    })

    it('unsubscribing stops the callback from firing', () => {
        const cb = vi.fn()
        const unsub = authState.onUnauthorized(cb)
        unsub()
        authState._fireUnauthorized()
        expect(cb).not.toHaveBeenCalled()
    })

    it('multiple callbacks all fire', () => {
        const cb1 = vi.fn()
        const cb2 = vi.fn()
        const u1 = authState.onUnauthorized(cb1)
        const u2 = authState.onUnauthorized(cb2)
        authState._fireUnauthorized()
        expect(cb1).toHaveBeenCalledOnce()
        expect(cb2).toHaveBeenCalledOnce()
        u1(); u2()
    })
})

// ── HTTP-level behaviour ──────────────────────────────────────────────────────

describe('api — 401 triggers UnauthorizedError', () => {
    beforeEach(() => {
        authState.setToken('test-token')
        vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        authState.setToken(null)
    })

    it('throws UnauthorizedError on 401 response', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(errorResponse(401, 'Not authenticated'))
        await expect(api.me()).rejects.toBeInstanceOf(UnauthorizedError)
    })

    it('fires _fireUnauthorized on 401', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(errorResponse(401, 'Not authenticated'))
        const cb = vi.fn()
        const unsub = authState.onUnauthorized(cb)
        await expect(api.me()).rejects.toBeInstanceOf(UnauthorizedError)
        expect(cb).toHaveBeenCalledOnce()
        unsub()
    })

    it('throws Error with detail message on other HTTP errors', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(errorResponse(400, 'Bad request detail'))
        await expect(api.me()).rejects.toThrow('Bad request detail')
    })

    it('returns data on success', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(jsonOk({
            id: 1, email: 'a@b.de', name: 'A', username: null, role: 'member',
            club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: null,
        }))
        const user = await api.me()
        expect(user.email).toBe('a@b.de')
    })
})

describe('api — NetworkError on fetch failure', () => {
    beforeEach(() => {
        authState.setToken('test-token')
        vi.stubGlobal('navigator', { onLine: true })
        vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        authState.setToken(null)
    })

    it('throws NetworkError when fetch rejects for non-queuable path', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
        await expect(api.login('a@b.de', 'pw')).rejects.toBeInstanceOf(NetworkError)
    })
})

// ── Season API methods ────────────────────────────────────────────────────────

describe('api — season methods', () => {
    beforeEach(() => {
        authState.setToken('test-token')
        vi.stubGlobal('navigator', { onLine: true })
        vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        authState.setToken(null)
    })

    it('listSeasonSnapshots calls GET /season/snapshots', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(jsonOk([]))
        await api.listSeasonSnapshots()
        expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            expect.stringContaining('/season/snapshots'),
            expect.objectContaining({ method: 'GET' }),
        )
    })

    it('getSeasonSnapshot calls GET /season/snapshots/{year}', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(jsonOk({ id: 1, year: 2024 }))
        await api.getSeasonSnapshot(2024)
        expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            expect.stringContaining('/season/snapshots/2024'),
            expect.objectContaining({ method: 'GET' }),
        )
    })

    it('closeSeason calls POST /season/close with year in body', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(jsonOk({ id: 1, year: 2024 }))
        await api.closeSeason(2024)
        const call = vi.mocked(fetch).mock.calls[0]
        expect(call[0]).toContain('/season/close')
        expect(call[1]?.method).toBe('POST')
        expect(JSON.parse(call[1]?.body as string)).toMatchObject({ year: 2024 })
    })

    it('closeSeason includes notes when provided', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(jsonOk({ id: 1, year: 2024 }))
        await api.closeSeason(2024, 'some notes')
        const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
        expect(body.notes).toBe('some notes')
    })
})
