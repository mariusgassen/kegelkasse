/**
 * Tests for the individual api.* method wrappers in client.ts.
 * Each test verifies that the correct HTTP method and URL are used.
 * The global fetch is stubbed so no real requests are made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authState } from '../client'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
vi.stubGlobal('navigator', { onLine: true })

function jsonOk(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

function noContent(): Response {
    return new Response(null, { status: 204 })
}

beforeEach(() => {
    mockFetch.mockReset()
    authState.setToken('test-token')
})

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('api.login', () => {
    it('posts to /auth/login with credentials', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ access_token: 'tok', user: {} }))
        const { api } = await import('../client')
        await api.login('a@b.de', 'pw123')
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/auth/login')
        expect(opts.method).toBe('POST')
        expect(JSON.parse(opts.body)).toMatchObject({ email: 'a@b.de', password: 'pw123' })
    })
})

describe('api.me', () => {
    it('GETs /auth/me', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.me()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/auth/me')
        expect(mockFetch.mock.calls[0][1].method).toBe('GET')
    })
})

describe('api.updateProfile', () => {
    it('PATCHes /auth/profile', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.updateProfile({ name: 'Hans' })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/auth/profile')
        expect(opts.method).toBe('PATCH')
        expect(JSON.parse(opts.body)).toMatchObject({ name: 'Hans' })
    })
})

describe('api.updateAvatar', () => {
    it('PATCHes /auth/avatar', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.updateAvatar('data:image/png;base64,abc')
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/auth/avatar')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.deleteAccount', () => {
    it('DELETEs /auth/me', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteAccount()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/auth/me')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.updateLocale', () => {
    it('PATCHes /auth/locale', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.updateLocale('en')
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/auth/locale')
        expect(opts.method).toBe('PATCH')
        expect(JSON.parse(opts.body)).toMatchObject({ locale: 'en' })
    })
})

describe('api.createInvite', () => {
    it('POSTs to /auth/invite', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ token: 'inv-tok', expires_at: '', invite_url: '' }))
        const { api } = await import('../client')
        await api.createInvite()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/auth/invite')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.getInviteInfo', () => {
    it('GETs /auth/invite-info with token', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ valid: true, member_name: null }))
        const { api } = await import('../client')
        await api.getInviteInfo('abc123')
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/auth/invite-info?token=abc123')
    })
})

describe('api.register', () => {
    it('POSTs to /auth/register', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ access_token: 'tok', user: {} }))
        const { api } = await import('../client')
        await api.register('tok', 'pw', 'hans', 'Hans Müller')
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/auth/register')
        expect(opts.method).toBe('POST')
    })
})

describe('api.resetPassword', () => {
    it('POSTs to /auth/reset-password', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.resetPassword('reset-tok', 'newpass')
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/auth/reset-password')
        expect(opts.method).toBe('POST')
        expect(JSON.parse(opts.body)).toMatchObject({ token: 'reset-tok', new_password: 'newpass' })
    })
})

describe('api.createResetToken', () => {
    it('POSTs to /auth/create-reset-token', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ token: 't', reset_url: '' }))
        const { api } = await import('../client')
        await api.createResetToken(42)
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/auth/create-reset-token')
        expect(JSON.parse(opts.body)).toMatchObject({ user_id: 42 })
    })
})

// ── Club ──────────────────────────────────────────────────────────────────────

describe('api.getClub', () => {
    it('GETs /club/', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, name: 'KC Testclub' }))
        const { api } = await import('../client')
        await api.getClub()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/')
    })
})

describe('api.deleteClubLogo', () => {
    it('DELETEs /club/logo', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteClubLogo()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/logo')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.updateClubSettings', () => {
    it('PATCHes /club/settings', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.updateClubSettings({ name: 'New Name' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/settings')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.getMembers', () => {
    it('GETs /club/members without param by default', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.getMembers()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/members')
    })

    it('GETs /club/members?include_inactive=true when flag set', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.getMembers(true)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/members?include_inactive=true')
    })
})

describe('api.updateMemberRole', () => {
    it('PATCHes /club/members/{id}/role', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.updateMemberRole(5, 'admin')
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/members/5/role?role=admin')
    })
})

describe('api.deactivateMember', () => {
    it('DELETEs /club/members/{id}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deactivateMember(7)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/members/7')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.reactivateMember', () => {
    it('PATCHes /club/members/{id}/reactivate', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.reactivateMember(7)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/members/7/reactivate')
    })
})

// ── Regular Members ───────────────────────────────────────────────────────────

describe('api.listRegularMembers', () => {
    it('GETs /club/regular-members', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.listRegularMembers()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/regular-members')
    })
})

describe('api.createRegularMember', () => {
    it('POSTs to /club/regular-members', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, name: 'Franz' }))
        const { api } = await import('../client')
        await api.createRegularMember({ name: 'Franz', nickname: 'Franzl' })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/club/regular-members')
        expect(opts.method).toBe('POST')
    })
})

describe('api.updateRegularMember', () => {
    it('PUTs /club/regular-members/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, name: 'Franz Updated' }))
        const { api } = await import('../client')
        await api.updateRegularMember(1, { name: 'Franz Updated' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/regular-members/1')
        expect(mockFetch.mock.calls[0][1].method).toBe('PUT')
    })
})

describe('api.deleteRegularMember', () => {
    it('DELETEs /club/regular-members/{id}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteRegularMember(3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/regular-members/3')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Penalty Types ─────────────────────────────────────────────────────────────

describe('api.listPenaltyTypes', () => {
    it('GETs /club/penalty-types', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.listPenaltyTypes()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/penalty-types')
    })
})

describe('api.createPenaltyType', () => {
    it('POSTs to /club/penalty-types', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.createPenaltyType({ icon: '🍺', name: 'Bier', default_amount: 1, sort_order: 1 })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/penalty-types')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.deletePenaltyType', () => {
    it('DELETEs /club/penalty-types/{id}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deletePenaltyType(2)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/penalty-types/2')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Evenings ──────────────────────────────────────────────────────────────────

describe('api.listEvenings', () => {
    it('GETs /evening/', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.listEvenings()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/')
    })
})

describe('api.getEvening', () => {
    it('GETs /evening/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 10 }))
        const { api } = await import('../client')
        await api.getEvening(10)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/10')
    })
})

describe('api.updateEvening', () => {
    it('PATCHes /evening/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 10 }))
        const { api } = await import('../client')
        await api.updateEvening(10, { is_closed: true })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/10')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.deleteEvening', () => {
    it('DELETEs /evening/{id}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteEvening(10)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/10')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Players ───────────────────────────────────────────────────────────────────

describe('api.addPlayer', () => {
    it('POSTs to /evening/{eid}/players', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.addPlayer(5, { name: 'Hans' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/players')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.removePlayer', () => {
    it('DELETEs /evening/{eid}/players/{pid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.removePlayer(5, 3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/players/3')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Games ─────────────────────────────────────────────────────────────────────

describe('api.addGame', () => {
    it('POSTs to /evening/{eid}/games', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, name: 'Eröffnungsspiel' }))
        const { api } = await import('../client')
        await api.addGame(5, { name: 'Eröffnungsspiel', client_timestamp: Date.now() })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.startGame', () => {
    it('POSTs to /evening/{eid}/games/{gid}/start', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.startGame(5, 2)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games/2/start')
    })
})

describe('api.deleteGame', () => {
    it('DELETEs /evening/{eid}/games/{gid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteGame(5, 2)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games/2')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.finishGame', () => {
    it('POSTs to /evening/{eid}/games/{gid}/finish', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.finishGame(5, 2, { winner_ref: 'player:1', winner_name: 'Hans' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games/2/finish')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

// ── Penalties ─────────────────────────────────────────────────────────────────

describe('api.addPenalty', () => {
    it('POSTs to /evening/{eid}/penalties', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([{ id: 1 }]))
        const { api } = await import('../client')
        await api.addPenalty(5, {
            player_ids: [1],
            penalty_type_name: 'Bier',
            icon: '🍺',
            amount: 1.50,
            mode: 'fixed',
            client_timestamp: Date.now(),
        })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/penalties')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.deletePenalty', () => {
    it('DELETEs /evening/{eid}/penalties/{lid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deletePenalty(5, 99)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/penalties/99')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Drinks ────────────────────────────────────────────────────────────────────

describe('api.addDrinkRound', () => {
    it('POSTs to /evening/{eid}/drinks', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.addDrinkRound(5, { drink_type: 'beer', participant_ids: [1, 2], client_timestamp: Date.now() })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/drinks')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.deleteDrinkRound', () => {
    it('DELETEs /evening/{eid}/drinks/{rid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteDrinkRound(5, 3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/drinks/3')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Treasury ──────────────────────────────────────────────────────────────────

describe('api.getMemberBalances', () => {
    it('GETs /club/member-balances', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.getMemberBalances()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/member-balances')
    })
})

describe('api.createMemberPayment', () => {
    it('POSTs to /club/member-payments', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.createMemberPayment({ regular_member_id: 1, amount: 5.00 })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/member-payments')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.deleteMemberPayment', () => {
    it('DELETEs /club/member-payments/{pid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteMemberPayment(7)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/member-payments/7')
    })
})

describe('api.getMyBalance', () => {
    it('GETs /club/my-balance', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ balance: 0 }))
        const { api } = await import('../client')
        await api.getMyBalance()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/my-balance')
    })
})

describe('api.getPaymentRequests', () => {
    it('GETs /club/payment-requests', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.getPaymentRequests()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/payment-requests')
    })
})

describe('api.confirmPaymentRequest', () => {
    it('PATCHes /club/payment-requests/{id}/confirm', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.confirmPaymentRequest(1)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/payment-requests/1/confirm')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

// ── Schedule ──────────────────────────────────────────────────────────────────

describe('api.listScheduledEvenings', () => {
    it('GETs /schedule/', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.listScheduledEvenings()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/schedule/')
    })
})

describe('api.setRsvp', () => {
    it('POSTs to /schedule/{sid}/rsvp', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ status: 'attending' }))
        const { api } = await import('../client')
        await api.setRsvp(3, 'attending')
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/schedule/3/rsvp')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.deleteScheduledEvening', () => {
    it('DELETEs /schedule/{sid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteScheduledEvening(3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/schedule/3')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Stats ─────────────────────────────────────────────────────────────────────

describe('api.getYearStats', () => {
    it('GETs /stats/year/{year}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ year: 2026, players: [] }))
        const { api } = await import('../client')
        await api.getYearStats(2026)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/stats/year/2026')
    })
})

describe('api.getMyStats', () => {
    it('GETs /stats/me/{year}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ year: 2026 }))
        const { api } = await import('../client')
        await api.getMyStats(2026)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/stats/me/2026')
    })
})

// ── Comments ──────────────────────────────────────────────────────────────────

describe('api.listComments', () => {
    it('GETs /comments/{type}/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.listComments('highlight', 5)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/comments/highlight/5')
    })
})

describe('api.addComment', () => {
    it('POSTs to /comments/{type}/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.addComment('highlight', 5, 'Great shot!')
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/comments/highlight/5')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.deleteComment', () => {
    it('DELETEs /comments/{commentId}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteComment(42)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/comments/42')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.toggleReaction', () => {
    it('POSTs to /comments/{id}/reactions', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ action: 'added' }))
        const { api } = await import('../client')
        await api.toggleReaction(42, '❤️')
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/comments/42/reactions')
    })
})

// ── Committee ─────────────────────────────────────────────────────────────────

describe('api.listAnnouncements', () => {
    it('GETs /committee/announcements', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.listAnnouncements()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/committee/announcements')
    })
})

describe('api.listTrips', () => {
    it('GETs /committee/trips', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.listTrips()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/committee/trips')
    })
})

describe('api.createTrip', () => {
    it('POSTs to /committee/trips', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.createTrip({ date: '2026-05-01', destination: 'Hamburg' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/committee/trips')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

// ── Superadmin ────────────────────────────────────────────────────────────────

describe('api.listAllClubs', () => {
    it('GETs /superadmin/clubs', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.listAllClubs()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/superadmin/clubs')
    })
})

describe('api.createClub', () => {
    it('POSTs to /superadmin/clubs', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.createClub('New Club')
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/superadmin/clubs')
        expect(JSON.parse(opts.body)).toMatchObject({ name: 'New Club' })
    })
})

describe('api.deleteClub', () => {
    it('DELETEs /superadmin/clubs/{id}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteClub(3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/superadmin/clubs/3')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Highlights ────────────────────────────────────────────────────────────────

describe('api.addHighlight', () => {
    it('POSTs to /evening/{eid}/highlights', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.addHighlight(5, { text: 'Amazing game!' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/highlights')
    })
})

describe('api.deleteHighlight', () => {
    it('DELETEs /evening/{eid}/highlights/{hid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteHighlight(5, 2)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/highlights/2')
    })
})

// ── Pins ──────────────────────────────────────────────────────────────────────

describe('api.listPins', () => {
    it('GETs /club/pins', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.listPins()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/pins')
    })
})

describe('api.deletePin', () => {
    it('DELETEs /club/pins/{id}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deletePin(4)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/pins/4')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Backups ───────────────────────────────────────────────────────────────────

describe('api.listBackups', () => {
    it('GETs /backups', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ info: [], config: {} }))
        const { api } = await import('../client')
        await api.listBackups()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/backups')
    })
})

describe('api.createBackup', () => {
    it('POSTs to /backups', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true, info: [] }))
        const { api } = await import('../client')
        await api.createBackup()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/backups')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.getPushPreferences', () => {
    it('GETs /push/preferences', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({}))
        const { api } = await import('../client')
        await api.getPushPreferences()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/push/preferences')
    })
})

describe('api.getRecentNotifications', () => {
    it('GETs /push/recent', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.getRecentNotifications()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/push/recent')
    })
})

describe('api.broadcastPush', () => {
    it('POSTs to /club/broadcast-push', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }))
        const { api } = await import('../client')
        await api.broadcastPush({ title: 'Hey', body: 'Test' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/broadcast-push')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.remindDebtors', () => {
    it('POSTs to /club/remind-debtors', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ reminded_count: 0 }))
        const { api } = await import('../client')
        await api.remindDebtors()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/remind-debtors')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})
// ── More Club / Superadmin ────────────────────────────────────────────────────

describe('api.linkUserToRoster', () => {
    it('PATCHes /club/members/{id}/link', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.linkUserToRoster(3, 7)
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/club/members/3/link')
        expect(opts.method).toBe('PATCH')
        expect(JSON.parse(opts.body)).toMatchObject({ regular_member_id: 7 })
    })
})

describe('api.updateClub', () => {
    it('PATCHes /superadmin/clubs/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, name: 'New Name', slug: 'new-name', member_count: 0, is_active: true }))
        const { api } = await import('../client')
        await api.updateClub(1, { name: 'New Name' })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/superadmin/clubs/1')
        expect(opts.method).toBe('PATCH')
    })
})

describe('api.switchClub', () => {
    it('POSTs to /superadmin/switch-club/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ access_token: 'tok', user: {} }))
        const { api } = await import('../client')
        await api.switchClub(2)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/superadmin/switch-club/2')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.mergeRegularMembers', () => {
    it('POSTs to /club/regular-members/{discardId}/merge-into/{keepId}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.mergeRegularMembers(3, 1)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/regular-members/3/merge-into/1')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.createMemberInvite', () => {
    it('POSTs to /club/regular-members/{mid}/invite', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ token: 't', invite_url: 'u', member_name: 'Hans' }))
        const { api } = await import('../client')
        await api.createMemberInvite(5)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/regular-members/5/invite')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.updatePenaltyType', () => {
    it('PUTs /club/penalty-types/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.updatePenaltyType(1, { icon: '🍺', name: 'Bier', default_amount: 2, sort_order: 1 })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/club/penalty-types/1')
        expect(opts.method).toBe('PUT')
    })
})

// ── Club Teams & Game Templates ───────────────────────────────────────────────

describe('api.listClubTeams', () => {
    it('GETs /club/teams', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.listClubTeams()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/teams')
    })
})

describe('api.createClubTeam', () => {
    it('POSTs to /club/teams', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, name: 'Die Adler' }))
        const { api } = await import('../client')
        await api.createClubTeam({ name: 'Die Adler', sort_order: 1 })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/club/teams')
        expect(opts.method).toBe('POST')
    })
})

describe('api.updateClubTeam', () => {
    it('PUTs /club/teams/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.updateClubTeam(1, { name: 'Die Löwen', sort_order: 2 })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/teams/1')
        expect(mockFetch.mock.calls[0][1].method).toBe('PUT')
    })
})

describe('api.deleteClubTeam', () => {
    it('DELETEs /club/teams/{id}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteClubTeam(2)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/teams/2')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.applyClubTeamsToEvening', () => {
    it('POSTs to /evening/{eid}/teams/from-templates', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.applyClubTeamsToEvening(5)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/teams/from-templates')
    })

    it('includes ?shuffle=true when shuffle flag set', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.applyClubTeamsToEvening(5, true)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/teams/from-templates?shuffle=true')
    })
})

describe('api.listGameTemplates', () => {
    it('GETs /club/game-templates', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.listGameTemplates()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/game-templates')
    })
})

describe('api.createGameTemplate', () => {
    it('POSTs to /club/game-templates', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.createGameTemplate({
            name: 'Spiel', description: '', winner_type: 'highest', is_opener: false,
            default_loser_penalty: 1, per_point_penalty: 0, sort_order: 1,
        })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/game-templates')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.updateGameTemplate', () => {
    it('PUTs /club/game-templates/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.updateGameTemplate(1, {
            name: 'Updated', description: '', winner_type: 'highest', is_opener: false,
            default_loser_penalty: 1, per_point_penalty: 0, sort_order: 1,
        })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/game-templates/1')
        expect(mockFetch.mock.calls[0][1].method).toBe('PUT')
    })
})

describe('api.deleteGameTemplate', () => {
    it('DELETEs /club/game-templates/{id}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteGameTemplate(3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/game-templates/3')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Evening Operations ────────────────────────────────────────────────────────

describe('api.createEvening', () => {
    it('POSTs to /evening/', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, date: '2026-01-01' }))
        const { api } = await import('../client')
        await api.createEvening({ date: '2026-01-01', venue: 'Gasthaus Krone' })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/evening/')
        expect(opts.method).toBe('POST')
    })
})

describe('api.updatePlayer', () => {
    it('PATCHes /evening/{eid}/players/{pid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.updatePlayer(5, 2, { team_id: 3 })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/players/2')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.createTeam', () => {
    it('POSTs to /evening/{eid}/teams', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.createTeam(5, { name: 'Team A', player_ids: [1, 2] })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/teams')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.updateTeam', () => {
    it('PATCHes /evening/{eid}/teams/{tid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.updateTeam(5, 1, { name: 'Team B' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/teams/1')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.deleteTeam', () => {
    it('DELETEs /evening/{eid}/teams/{tid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteTeam(5, 1)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/teams/1')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.updatePenalty', () => {
    it('PATCHes /evening/{eid}/penalties/{lid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.updatePenalty(5, 9, { amount: 2.00 })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/penalties/9')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.calculateAbsencePenalties', () => {
    it('POSTs to /evening/{eid}/absence-penalties', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ avg: 1.5, absent_count: 2 }))
        const { api } = await import('../client')
        await api.calculateAbsencePenalties(5)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/absence-penalties')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.markCancelled', () => {
    it('POSTs to /evening/{eid}/mark-cancelled', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true, count: 1 }))
        const { api } = await import('../client')
        await api.markCancelled(5, [1, 2])
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/evening/5/mark-cancelled')
        expect(JSON.parse(opts.body)).toMatchObject({ member_ids: [1, 2] })
    })
})

describe('api.updateGame', () => {
    it('PATCHes /evening/{eid}/games/{gid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.updateGame(5, 2, { name: 'Updated Game' })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/evening/5/games/2')
        expect(opts.method).toBe('PATCH')
    })
})

describe('api.addCameraThrow', () => {
    it('POSTs to /evening/{eid}/games/{gid}/throws', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }))
        const { api } = await import('../client')
        await api.addCameraThrow(5, 2, { throw_num: 1, pins: 7, pin_states: Array(9).fill(false) })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games/2/throws')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.clearCameraThrows', () => {
    it('DELETEs /evening/{eid}/games/{gid}/throws', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }))
        const { api } = await import('../client')
        await api.clearCameraThrows(5, 2)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games/2/throws')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.deleteCameraThrow', () => {
    it('DELETEs /evening/{eid}/games/{gid}/throws/{tid}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }))
        const { api } = await import('../client')
        await api.deleteCameraThrow(5, 2, 10)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games/2/throws/10')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.updateCameraThrow', () => {
    it('PATCHes /evening/{eid}/games/{gid}/throws/{tid}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }))
        const { api } = await import('../client')
        await api.updateCameraThrow(5, 2, 10, { pins: 9 })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games/2/throws/10')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.setActivePlayer', () => {
    it('PATCHes /evening/{eid}/games/{gid}/active-player', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }))
        const { api } = await import('../client')
        await api.setActivePlayer(5, 2, 3)
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/evening/5/games/2/active-player')
        expect(JSON.parse(opts.body)).toMatchObject({ player_id: 3 })
    })
})

describe('api.updateDrinkRound', () => {
    it('PATCHes /evening/{eid}/drinks/{rid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.updateDrinkRound(5, 3, { variety: 'Pils' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/drinks/3')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

// ── Treasury ──────────────────────────────────────────────────────────────────

describe('api.getGuestBalances', () => {
    it('GETs /club/guest-balances', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.getGuestBalances()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/guest-balances')
    })
})

describe('api.getMemberPayments', () => {
    it('GETs /club/member-payments/{mid}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.getMemberPayments(3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/member-payments/3')
    })
})

describe('api.getAllPayments', () => {
    it('GETs /club/member-payments', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.getAllPayments()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/member-payments')
    })
})

describe('api.getExpenses', () => {
    it('GETs /club/expenses', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.getExpenses()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/expenses')
    })
})

describe('api.createExpense', () => {
    it('POSTs to /club/expenses', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.createExpense({ amount: 20.00, description: 'Kegel-Öl' })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/club/expenses')
        expect(opts.method).toBe('POST')
    })
})

describe('api.deleteExpense', () => {
    it('DELETEs /club/expenses/{eid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteExpense(4)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/expenses/4')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.getMyPaymentRequests', () => {
    it('GETs /club/payment-requests/my', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.getMyPaymentRequests()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/payment-requests/my')
    })
})

describe('api.createPaymentRequest', () => {
    it('POSTs to /club/payment-requests', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.createPaymentRequest({ amount: 5.00 })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/club/payment-requests')
        expect(opts.method).toBe('POST')
    })
})

describe('api.rejectPaymentRequest', () => {
    it('PATCHes /club/payment-requests/{id}/reject', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.rejectPaymentRequest(2)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/payment-requests/2/reject')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

// ── Schedule ──────────────────────────────────────────────────────────────────

describe('api.createScheduledEvening', () => {
    it('POSTs to /schedule/', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.createScheduledEvening({ date: '2026-05-15', venue: 'Gasthaus' })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/schedule/')
        expect(opts.method).toBe('POST')
    })
})

describe('api.updateScheduledEvening', () => {
    it('PATCHes /schedule/{sid}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.updateScheduledEvening(3, { venue: 'New Venue' })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/schedule/3')
        expect(opts.method).toBe('PATCH')
    })
})

describe('api.setRsvpForMember', () => {
    it('POSTs to /schedule/{sid}/rsvp/member/{mid}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ status: 'attending' }))
        const { api } = await import('../client')
        await api.setRsvpForMember(3, 5, 'attending')
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/schedule/3/rsvp/member/5')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.removeRsvp', () => {
    it('DELETEs /schedule/{sid}/rsvp', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.removeRsvp(3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/schedule/3/rsvp')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.listRsvps', () => {
    it('GETs /schedule/{sid}/rsvps', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.listRsvps(3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/schedule/3/rsvps')
    })
})

describe('api.sendReminder', () => {
    it('POSTs to /schedule/{sid}/remind', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ reminded_count: 3 }))
        const { api } = await import('../client')
        await api.sendReminder(3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/schedule/3/remind')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.addScheduledGuest', () => {
    it('POSTs to /schedule/{sid}/guests', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.addScheduledGuest(3, { name: 'Gast Hans' })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/schedule/3/guests')
        expect(opts.method).toBe('POST')
    })
})

describe('api.removeScheduledGuest', () => {
    it('DELETEs /schedule/{sid}/guests/{gid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.removeScheduledGuest(3, 7)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/schedule/3/guests/7')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.startEveningFromSchedule', () => {
    it('POSTs to /schedule/{sid}/start', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, date: '2026-01-01', venue: null }))
        const { api } = await import('../client')
        await api.startEveningFromSchedule(3, { member_ids: [1, 2] })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/schedule/3/start')
        expect(JSON.parse(opts.body)).toMatchObject({ member_ids: [1, 2] })
    })
})

// ── Pins ──────────────────────────────────────────────────────────────────────

describe('api.createPin', () => {
    it('POSTs to /club/pins', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.createPin({ name: 'Goldnadel', icon: '📌' })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/club/pins')
        expect(opts.method).toBe('POST')
    })
})

describe('api.updatePin', () => {
    it('PUTs /club/pins/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.updatePin(1, { name: 'Silbernadel', holder_regular_member_id: 3 })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/club/pins/1')
        expect(opts.method).toBe('PUT')
    })
})

// ── Comments ──────────────────────────────────────────────────────────────────

describe('api.editComment', () => {
    it('PATCHes /comments/{commentId}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 42 }))
        const { api } = await import('../client')
        await api.editComment(42, 'Updated text')
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/comments/42')
        expect(opts.method).toBe('PATCH')
    })
})

describe('api.toggleItemReaction', () => {
    it('POSTs to /comments/item-reaction/{type}/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ action: 'added', reactions: [] }))
        const { api } = await import('../client')
        await api.toggleItemReaction('highlight', 5, '❤️')
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/comments/item-reaction/highlight/5')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.getItemReactions', () => {
    it('GETs /comments/item-reactions/{type}/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.getItemReactions('announcement', 3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/comments/item-reactions/announcement/3')
    })
})

// ── Push & Notifications ──────────────────────────────────────────────────────

describe('api.getVapidPublicKey', () => {
    it('GETs /push/vapid-key', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ public_key: 'abc' }))
        const { api } = await import('../client')
        await api.getVapidPublicKey()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/push/vapid-key')
    })
})

describe('api.subscribeToPush', () => {
    it('POSTs to /push/subscribe', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }))
        const { api } = await import('../client')
        await api.subscribeToPush({ endpoint: 'https://fcm.example.com/1', p256dh: 'key', auth: 'auth' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/push/subscribe')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.unsubscribeFromPush', () => {
    it('DELETEs /push/unsubscribe without endpoint', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.unsubscribeFromPush()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/push/unsubscribe')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })

    it('DELETEs /push/unsubscribe?endpoint=... when endpoint provided', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.unsubscribeFromPush('https://example.com/push')
        expect(mockFetch.mock.calls[0][0]).toContain('/api/v1/push/unsubscribe?endpoint=')
    })
})

describe('api.testPush', () => {
    it('POSTs to /push/test', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ sent: 1 }))
        const { api } = await import('../client')
        await api.testPush()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/push/test')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.updatePushPreferences', () => {
    it('PATCHes /push/preferences', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({}))
        const { api } = await import('../client')
        await api.updatePushPreferences({ penalties: false })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/push/preferences')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.markNotificationsRead', () => {
    it('POSTs to /push/notifications/read with ids', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.markNotificationsRead([1, 2, 3])
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/push/notifications/read')
        expect(JSON.parse(opts.body)).toMatchObject({ ids: [1, 2, 3] })
    })

    it('POSTs to /push/notifications/read without ids', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.markNotificationsRead()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/push/notifications/read')
    })
})

describe('api.regenerateIcalToken', () => {
    it('POSTs to /club/settings/regenerate-ical-token', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ical_token: 'new-tok' }))
        const { api } = await import('../client')
        await api.regenerateIcalToken()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/settings/regenerate-ical-token')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.getReminderSettings', () => {
    it('GETs /club/reminder-settings', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({}))
        const { api } = await import('../client')
        await api.getReminderSettings()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/reminder-settings')
    })
})

describe('api.updateReminderSettings', () => {
    it('PATCHes /club/reminder-settings', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }))
        const { api } = await import('../client')
        await api.updateReminderSettings({ debt_weekly: { enabled: true } })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/reminder-settings')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.triggerReminders', () => {
    it('POSTs to /push/trigger-reminders', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }))
        const { api } = await import('../client')
        await api.triggerReminders()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/push/trigger-reminders')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

// ── Committee ─────────────────────────────────────────────────────────────────

describe('api.createAnnouncement', () => {
    it('POSTs to /committee/announcements', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.createAnnouncement({ title: 'Wichtig!', text: 'Bitte lesen' })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/committee/announcements')
        expect(opts.method).toBe('POST')
    })
})

describe('api.deleteAnnouncement', () => {
    it('DELETEs /committee/announcements/{id}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteAnnouncement(3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/committee/announcements/3')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.updateTrip', () => {
    it('PATCHes /committee/trips/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.updateTrip(1, { destination: 'Berlin' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/committee/trips/1')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.deleteTrip', () => {
    it('DELETEs /committee/trips/{id}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteTrip(2)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/committee/trips/2')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.setCommitteeMember', () => {
    it('PATCHes /club/members/{memberId}/committee', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, is_committee: true }))
        const { api } = await import('../client')
        await api.setCommitteeMember(5, true)
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/club/members/5/committee')
        expect(JSON.parse(opts.body)).toMatchObject({ is_committee: true })
    })
})

// ── Backups ───────────────────────────────────────────────────────────────────

describe('api.deleteBackup', () => {
    it('DELETEs /backups/{label} (URL-encoded)', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }))
        const { api } = await import('../client')
        await api.deleteBackup('20260101-120000F')
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/backups/20260101-120000F')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Sync ──────────────────────────────────────────────────────────────────────

describe('api.sync', () => {
    it('POSTs to /sync/', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ applied: 1, errors: [], server_timestamp: 1000 }))
        const { api } = await import('../client')
        await api.sync({ client_id: 'abc', changes: [] })
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/sync/')
        expect(opts.method).toBe('POST')
    })
})
