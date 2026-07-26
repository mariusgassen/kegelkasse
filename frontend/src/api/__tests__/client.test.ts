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

// ── Refresh-token flow ────────────────────────────────────────────────────────

describe('api — refresh token flow', () => {
    const ME = {
        id: 1, email: 'a@b.de', name: 'A', username: null, role: 'member',
        club_id: 1, preferred_locale: 'de', avatar: null, regular_member_id: null,
    }

    beforeEach(() => {
        authState.setSession('stale-access', 'refresh-1')
        vi.stubGlobal('navigator', { onLine: true })
        vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        authState.clearSession()
    })

    it('refreshes and replays the request when the access token is stale', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(errorResponse(401, 'Invalid token'))
            .mockResolvedValueOnce(jsonOk({ access_token: 'fresh', refresh_token: 'refresh-2', user: ME }))
            .mockResolvedValueOnce(jsonOk(ME))

        await expect(api.me()).resolves.toMatchObject({ email: 'a@b.de' })

        const urls = vi.mocked(fetch).mock.calls.map(c => String(c[0]))
        expect(urls[1]).toContain('/auth/refresh')
        // The replay carries the new access token, not the stale one.
        expect((vi.mocked(fetch).mock.calls[2][1]?.headers as Record<string, string>).Authorization)
            .toBe('Bearer fresh')
    })

    it('stores the rotated refresh token', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(errorResponse(401, 'Invalid token'))
            .mockResolvedValueOnce(jsonOk({ access_token: 'fresh', refresh_token: 'refresh-2', user: ME }))
            .mockResolvedValueOnce(jsonOk(ME))

        await api.me()
        expect(authState.getRefreshToken()).toBe('refresh-2')
        expect(authState.getToken()).toBe('fresh')
    })

    it('gives up and fires _fireUnauthorized when the refresh token is rejected', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(errorResponse(401, 'Invalid token'))
            .mockResolvedValueOnce(errorResponse(401, 'Invalid or expired refresh token'))

        const cb = vi.fn()
        const unsub = authState.onUnauthorized(cb)
        await expect(api.me()).rejects.toBeInstanceOf(UnauthorizedError)
        expect(cb).toHaveBeenCalledOnce()
        unsub()
    })

    it('replays only once — a 401 on the retry is not refreshed again', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(errorResponse(401, 'Invalid token'))
            .mockResolvedValueOnce(jsonOk({ access_token: 'fresh', refresh_token: 'refresh-2', user: ME }))
            .mockResolvedValueOnce(errorResponse(401, 'Invalid token'))

        await expect(api.me()).rejects.toBeInstanceOf(UnauthorizedError)
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3)
    })

    it('shares one refresh across concurrent 401s', async () => {
        // Rotation makes a second parallel refresh look like a stolen-token
        // replay, so the client must never fire two.
        vi.mocked(fetch).mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
            const u = String(url)
            if (u.includes('/auth/refresh')) {
                return jsonOk({ access_token: 'fresh', refresh_token: 'refresh-2', user: ME })
            }
            const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
            return auth === 'Bearer fresh' ? jsonOk(ME) : errorResponse(401, 'Invalid token')
        })

        await Promise.all([api.me(), api.me(), api.me()])

        const refreshCalls = vi.mocked(fetch).mock.calls
            .filter(c => String(c[0]).includes('/auth/refresh'))
        expect(refreshCalls).toHaveLength(1)
    })

    it('keeps the session on a network failure during refresh', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(errorResponse(401, 'Invalid token'))
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))

        const cb = vi.fn()
        const unsub = authState.onUnauthorized(cb)
        await expect(api.me()).rejects.toBeInstanceOf(NetworkError)
        expect(cb).not.toHaveBeenCalled()
        expect(authState.getRefreshToken()).toBe('refresh-1')
        unsub()
    })

    it('does not attempt a refresh when no refresh token is held', async () => {
        authState.setToken('only-access')
        authState.setSession('only-access', null)
        vi.mocked(fetch).mockResolvedValueOnce(errorResponse(401, 'Invalid token'))

        await expect(api.me()).rejects.toBeInstanceOf(UnauthorizedError)
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    })
})

describe('api.logout', () => {
    beforeEach(() => {
        authState.setSession('access', 'refresh-1')
        vi.stubGlobal('navigator', { onLine: true })
        vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        authState.clearSession()
    })

    it('revokes the refresh token server-side and clears both halves', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(jsonOk({ ok: true }))
        await api.logout()

        const call = vi.mocked(fetch).mock.calls[0]
        expect(String(call[0])).toContain('/auth/logout')
        expect(JSON.parse(call[1]?.body as string)).toMatchObject({ refresh_token: 'refresh-1' })
        expect(authState.getToken()).toBeNull()
        expect(authState.getRefreshToken()).toBeNull()
    })

    it('still clears locally when the revoke call fails', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
        await expect(api.logout()).resolves.toBeUndefined()
        expect(authState.getToken()).toBeNull()
        expect(authState.getRefreshToken()).toBeNull()
    })

    it('skips the network call when there is nothing to revoke', async () => {
        authState.clearSession()
        await api.logout()
        expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    })
})
