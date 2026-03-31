/**
 * Additional api.* method tests covering routes not in apiMethods.test.ts.
 * Pattern: stub fetch, call the method, verify URL + HTTP method + body.
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

// ── Club members (roster) ──────────────────────────────────────────────────────

describe('api.mergeRegularMembers', () => {
    it('POSTs to /club/regular-members/{discard}/merge-into/{keep}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.mergeRegularMembers(5, 10)
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/club/regular-members/5/merge-into/10')
        expect(opts.method).toBe('POST')
    })
})

describe('api.createMemberInvite', () => {
    it('POSTs to /club/regular-members/{mid}/invite', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ token: 'tok', invite_url: 'url', member_name: 'Hans' }))
        const { api } = await import('../client')
        await api.createMemberInvite(7)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/regular-members/7/invite')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.linkUserToRoster', () => {
    it('PATCHes /club/members/{userId}/link', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.linkUserToRoster(3, 8)
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/club/members/3/link')
        expect(opts.method).toBe('PATCH')
        expect(JSON.parse(opts.body)).toMatchObject({ regular_member_id: 8 })
    })
})

// ── Superadmin ─────────────────────────────────────────────────────────────────

describe('api.listAllClubs', () => {
    it('GETs /superadmin/clubs', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.listAllClubs()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/superadmin/clubs')
        expect(mockFetch.mock.calls[0][1].method).toBe('GET')
    })
})

describe('api.createClub', () => {
    it('POSTs to /superadmin/clubs', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, name: 'New', slug: 'new', member_count: 0, is_active: true }))
        const { api } = await import('../client')
        await api.createClub('New Club')
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/superadmin/clubs')
        expect(opts.method).toBe('POST')
        expect(JSON.parse(opts.body)).toMatchObject({ name: 'New Club' })
    })
})

describe('api.updateClub', () => {
    it('PATCHes /superadmin/clubs/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, name: 'Renamed', slug: 'renamed', member_count: 0, is_active: true }))
        const { api } = await import('../client')
        await api.updateClub(1, { name: 'Renamed' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/superadmin/clubs/1')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.deleteClub', () => {
    it('DELETEs /superadmin/clubs/{id}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteClub(2)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/superadmin/clubs/2')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.switchClub', () => {
    it('POSTs to /superadmin/switch-club/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ access_token: 'tok', user: {} }))
        const { api } = await import('../client')
        await api.switchClub(3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/superadmin/switch-club/3')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

// ── Penalty types ──────────────────────────────────────────────────────────────

describe('api.updatePenaltyType', () => {
    it('PUTs /club/penalty-types/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, icon: '🍺', name: 'Bier', default_amount: 1, sort_order: 0 }))
        const { api } = await import('../client')
        await api.updatePenaltyType(1, { icon: '🍺', name: 'Bier', default_amount: 1, sort_order: 0 })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/penalty-types/1')
        expect(mockFetch.mock.calls[0][1].method).toBe('PUT')
    })
})

// ── Club teams ─────────────────────────────────────────────────────────────────

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
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, name: 'A', sort_order: 0 }))
        const { api } = await import('../client')
        await api.createClubTeam({ name: 'A', sort_order: 0 })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/teams')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.updateClubTeam', () => {
    it('PUTs /club/teams/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 2, name: 'B', sort_order: 1 }))
        const { api } = await import('../client')
        await api.updateClubTeam(2, { name: 'B', sort_order: 1 })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/teams/2')
        expect(mockFetch.mock.calls[0][1].method).toBe('PUT')
    })
})

describe('api.deleteClubTeam', () => {
    it('DELETEs /club/teams/{id}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteClubTeam(3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/teams/3')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.applyClubTeamsToEvening', () => {
    it('POSTs to /evening/{eid}/teams/from-templates', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.applyClubTeamsToEvening(10)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/10/teams/from-templates')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })

    it('appends ?shuffle=true when shuffle=true', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.applyClubTeamsToEvening(10, true)
        expect(mockFetch.mock.calls[0][0]).toContain('shuffle=true')
    })
})

// ── Game templates ─────────────────────────────────────────────────────────────

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
            name: 'Kegelspiel', winner_type: 'high', is_opener: false,
            default_loser_penalty: 0.5, per_point_penalty: 0, sort_order: 0,
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
            name: 'Updated', winner_type: 'low', is_opener: true,
            default_loser_penalty: 1, per_point_penalty: 0.1, sort_order: 1,
        })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/game-templates/1')
        expect(mockFetch.mock.calls[0][1].method).toBe('PUT')
    })
})

describe('api.deleteGameTemplate', () => {
    it('DELETEs /club/game-templates/{id}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteGameTemplate(5)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/game-templates/5')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Evening ────────────────────────────────────────────────────────────────────

describe('api.createEvening', () => {
    it('POSTs to /evening/', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 99 }))
        const { api } = await import('../client')
        await api.createEvening({ date: '2025-01-01', venue: 'Halle' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

// ── Evening players ────────────────────────────────────────────────────────────

describe('api.updatePlayer', () => {
    it('PATCHes /evening/{eid}/players/{pid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.updatePlayer(1, 2, { name: 'Hans' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/1/players/2')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.removePlayer', () => {
    it('DELETEs /evening/{eid}/players/{pid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.removePlayer(1, 3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/1/players/3')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Teams ──────────────────────────────────────────────────────────────────────

describe('api.createTeam', () => {
    it('POSTs to /evening/{eid}/teams', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.createTeam(10, { name: 'Red', player_ids: [1, 2] })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/10/teams')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.updateTeam', () => {
    it('PATCHes /evening/{eid}/teams/{tid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.updateTeam(10, 1, { name: 'Blue' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/10/teams/1')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.deleteTeam', () => {
    it('DELETEs /evening/{eid}/teams/{tid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteTeam(10, 1)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/10/teams/1')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Penalties ─────────────────────────────────────────────────────────────────

describe('api.addPenalty', () => {
    it('POSTs to /evening/{eid}/penalties', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([{ id: 1 }]))
        const { api } = await import('../client')
        await api.addPenalty(5, {
            player_ids: [1], penalty_type_name: 'Bier', icon: '🍺',
            amount: 1, mode: 'euro', client_timestamp: 0,
        })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/penalties')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.updatePenalty', () => {
    it('PATCHes /evening/{eid}/penalties/{lid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.updatePenalty(5, 2, { amount: 2 })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/penalties/2')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.deletePenalty', () => {
    it('DELETEs /evening/{eid}/penalties/{lid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deletePenalty(5, 3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/penalties/3')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.calculateAbsencePenalties', () => {
    it('POSTs to /evening/{eid}/absence-penalties', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ avg: 5, absent_count: 3 }))
        const { api } = await import('../client')
        await api.calculateAbsencePenalties(5)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/absence-penalties')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.markCancelled', () => {
    it('POSTs to /evening/{eid}/mark-cancelled', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true, count: 2 }))
        const { api } = await import('../client')
        await api.markCancelled(5, [1, 2])
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/evening/5/mark-cancelled')
        expect(opts.method).toBe('POST')
        expect(JSON.parse(opts.body)).toMatchObject({ member_ids: [1, 2] })
    })
})

// ── Games ──────────────────────────────────────────────────────────────────────

describe('api.addGame', () => {
    it('POSTs to /evening/{eid}/games', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, name: 'Spiel 1' }))
        const { api } = await import('../client')
        await api.addGame(5, { name: 'Spiel 1', client_timestamp: 0 })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.startGame', () => {
    it('POSTs to /evening/{eid}/games/{gid}/start', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.startGame(5, 1)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games/1/start')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.finishGame', () => {
    it('POSTs to /evening/{eid}/games/{gid}/finish', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.finishGame(5, 1, { winner_ref: 'player:2', winner_name: 'Hans' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games/1/finish')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.updateGame', () => {
    it('PATCHes /evening/{eid}/games/{gid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.updateGame(5, 1, { name: 'Renamed' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games/1')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
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

describe('api.addCameraThrow', () => {
    it('POSTs to /evening/{eid}/games/{gid}/throws', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }))
        const { api } = await import('../client')
        await api.addCameraThrow(5, 1, { throw_num: 1, pins: 7, pin_states: [] })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games/1/throws')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.clearCameraThrows', () => {
    it('DELETEs /evening/{eid}/games/{gid}/throws', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }))
        const { api } = await import('../client')
        await api.clearCameraThrows(5, 1)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games/1/throws')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.deleteCameraThrow', () => {
    it('DELETEs /evening/{eid}/games/{gid}/throws/{tid}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }))
        const { api } = await import('../client')
        await api.deleteCameraThrow(5, 1, 42)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games/1/throws/42')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.updateCameraThrow', () => {
    it('PATCHes /evening/{eid}/games/{gid}/throws/{tid}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }))
        const { api } = await import('../client')
        await api.updateCameraThrow(5, 1, 42, { pins: 9 })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/games/1/throws/42')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.setActivePlayer', () => {
    it('PATCHes /evening/{eid}/games/{gid}/active-player', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ ok: true }))
        const { api } = await import('../client')
        await api.setActivePlayer(5, 1, 3)
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/evening/5/games/1/active-player')
        expect(opts.method).toBe('PATCH')
        expect(JSON.parse(opts.body)).toMatchObject({ player_id: 3 })
    })
})

// ── Drinks ─────────────────────────────────────────────────────────────────────

describe('api.addDrinkRound', () => {
    it('POSTs to /evening/{eid}/drinks', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.addDrinkRound(5, { drink_type: 'beer', participant_ids: [1, 2], client_timestamp: 0 })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/drinks')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.updateDrinkRound', () => {
    it('PATCHes /evening/{eid}/drinks/{rid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.updateDrinkRound(5, 1, { participant_ids: [1] })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/drinks/1')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

describe('api.deleteDrinkRound', () => {
    it('DELETEs /evening/{eid}/drinks/{rid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteDrinkRound(5, 2)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/drinks/2')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Treasury ───────────────────────────────────────────────────────────────────

describe('api.getMemberBalances', () => {
    it('GETs /club/member-balances', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.getMemberBalances()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/member-balances')
    })
})

describe('api.getGuestBalances', () => {
    it('GETs /club/guest-balances', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.getGuestBalances()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/guest-balances')
    })
})

describe('api.createMemberPayment', () => {
    it('POSTs to /club/member-payments', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, amount: 10, note: null, created_at: null }))
        const { api } = await import('../client')
        await api.createMemberPayment({ regular_member_id: 1, amount: 10 })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/member-payments')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.deleteMemberPayment', () => {
    it('DELETEs /club/member-payments/{pid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteMemberPayment(5)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/member-payments/5')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.getMyBalance', () => {
    it('GETs /club/my-balance', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ regular_member_id: 1, penalty_total: 0, payments_total: 0, balance: 0 }))
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
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1, status: 'confirmed' }))
        const { api } = await import('../client')
        await api.confirmPaymentRequest(1)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/payment-requests/1/confirm')
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
    })
})

// ── Schedule ───────────────────────────────────────────────────────────────────

describe('api.listScheduledEvenings', () => {
    it('GETs /schedule/', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.listScheduledEvenings()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/schedule/')
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

describe('api.setRsvp', () => {
    it('POSTs to /schedule/{sid}/rsvp', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ status: 'yes' }))
        const { api } = await import('../client')
        await api.setRsvp(3, 'attending')
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/schedule/3/rsvp')
        expect(opts.method).toBe('POST')
        expect(JSON.parse(opts.body)).toMatchObject({ status: 'attending' })
    })
})

// ── Pins ───────────────────────────────────────────────────────────────────────

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
        await api.deletePin(7)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/pins/7')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Highlights ─────────────────────────────────────────────────────────────────

describe('api.addHighlight', () => {
    it('POSTs to /evening/{eid}/highlights', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.addHighlight(5, { text: '🎉 Toller Abend' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/highlights')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.deleteHighlight', () => {
    it('DELETEs /evening/{eid}/highlights/{hid}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteHighlight(5, 2)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/evening/5/highlights/2')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

// ── Comments ───────────────────────────────────────────────────────────────────

describe('api.listComments', () => {
    it('GETs /comments/{type}/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk([]))
        const { api } = await import('../client')
        await api.listComments('highlight', 3)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/comments/highlight/3')
    })
})

describe('api.addComment', () => {
    it('POSTs to /comments/{type}/{id}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ id: 1 }))
        const { api } = await import('../client')
        await api.addComment('announcement', 1, 'Hallo!')
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/comments/announcement/1')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

describe('api.deleteComment', () => {
    it('DELETEs /comments/{commentId}', async () => {
        mockFetch.mockResolvedValueOnce(noContent())
        const { api } = await import('../client')
        await api.deleteComment(9)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/comments/9')
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })
})

describe('api.toggleReaction', () => {
    it('POSTs to /comments/{commentId}/reactions', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ action: 'added' }))
        const { api } = await import('../client')
        await api.toggleReaction(9, '❤️')
        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/comments/9/reactions')
        expect(opts.method).toBe('POST')
        expect(JSON.parse(opts.body)).toMatchObject({ emoji: '❤️' })
    })
})

// ── Stats ──────────────────────────────────────────────────────────────────────

describe('api.getYearStats', () => {
    it('GETs /stats/year/{year}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ year: 2025, players: [] }))
        const { api } = await import('../client')
        await api.getYearStats(2025)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/stats/year/2025')
    })
})

describe('api.getMyStats', () => {
    it('GETs /stats/me/{year}', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ year: 2025 }))
        const { api } = await import('../client')
        await api.getMyStats(2025)
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/stats/me/2025')
    })
})

// ── Push ───────────────────────────────────────────────────────────────────────

describe('api.getPushStatus', () => {
    it('GETs /push/status', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ subscribed: false, configured: true }))
        const { api } = await import('../client')
        await api.getPushStatus()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/push/status')
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

describe('api.remindDebtors', () => {
    it('POSTs to /club/remind-debtors', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ reminded_count: 3 }))
        const { api } = await import('../client')
        await api.remindDebtors()
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/club/remind-debtors')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
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
        await api.createTrip({ date: '2025-06-01', destination: 'Köln' })
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/committee/trips')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })
})

// ── Backups ────────────────────────────────────────────────────────────────────

describe('api.listBackups', () => {
    it('GETs /backups', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ info: [], config: { schedule: '', retain_full: 7, mgmt_url: '' } }))
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

// ── uploadMedia ────────────────────────────────────────────────────────────────

describe('uploadMedia', () => {
    it('POSTs multipart form to /uploads/media and returns url', async () => {
        mockFetch.mockResolvedValueOnce(
            new Response(JSON.stringify({ url: '/uploads/media/abc.jpg' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        )
        const { uploadMedia } = await import('../client')
        const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' })
        const result = await uploadMedia(file)
        expect(result).toBe('/uploads/media/abc.jpg')
        expect(mockFetch.mock.calls[0][0]).toBe('/api/v1/uploads/media')
        expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })

    it('throws UnauthorizedError on 401', async () => {
        mockFetch.mockResolvedValueOnce(new Response('', { status: 401 }))
        const { uploadMedia, UnauthorizedError } = await import('../client')
        const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' })
        await expect(uploadMedia(file)).rejects.toBeInstanceOf(UnauthorizedError)
    })

    it('throws Error with detail on non-ok response', async () => {
        mockFetch.mockResolvedValueOnce(
            new Response(JSON.stringify({ detail: 'File too large' }), {
                status: 413,
                headers: { 'Content-Type': 'application/json' },
            }),
        )
        const { uploadMedia } = await import('../client')
        const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' })
        await expect(uploadMedia(file)).rejects.toThrow('File too large')
    })
})

// ── downloadReport ─────────────────────────────────────────────────────────────

describe('api.downloadReport', () => {
    it('fetches /reports/export and triggers file download', async () => {
        // Stub fetch with a mock Response that has a working .blob() method
        const fakeBlob = new Blob(['data'])
        const mockResponse = {
            status: 200,
            ok: true,
            blob: vi.fn().mockResolvedValue(fakeBlob),
        }
        mockFetch.mockResolvedValueOnce(mockResponse)

        // Stub browser download helpers
        vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() })
        const anchor = document.createElement('a')
        const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {})
        vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor)

        const { api } = await import('../client')
        await api.downloadReport(2025, 'xlsx')

        expect(mockFetch.mock.calls[0][0]).toContain('/api/v1/reports/export')
        expect(mockFetch.mock.calls[0][0]).toContain('year=2025')
        expect(clickSpy).toHaveBeenCalled()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

})
