/**
 * Unit tests for club-related API client functions.
 *
 * fetch is mocked globally; no real HTTP is made.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authState} from '../client'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
    mockFetch.mockReset()
    authState.setToken('test-jwt-token')
})

function jsonOk(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {'Content-Type': 'application/json'},
    })
}

function noContent(): Response {
    return new Response(null, {status: 204})
}

function errorResponse(status: number, detail: string): Response {
    return new Response(JSON.stringify({detail}), {
        status,
        headers: {'Content-Type': 'application/json'},
    })
}

// ── getClub ──────────────────────────────────────────────────────────────────

describe('api.getClub', () => {
    it('returns club data with settings', async () => {
        const clubData = {
            id: 1,
            name: 'Test Kegelclub',
            slug: 'test-kegelclub',
            settings: {
                home_venue: 'Gasthaus Krone',
                logo_url: null,
                primary_color: '#e8a020',
                secondary_color: '#6b7c5a',
                bg_color: '#1a1410',
                guest_penalty_cap: 15,
                paypal_me: null,
                no_cancel_fee: null,
                pin_penalty: null,
                default_evening_time: '20:00',
                ical_token: 'abc123',
            },
        }
        mockFetch.mockResolvedValueOnce(jsonOk(clubData))

        const {api} = await import('../client')
        const result = await api.getClub()

        expect(result.name).toBe('Test Kegelclub')
        expect(result.settings?.primary_color).toBe('#e8a020')
        expect(mockFetch).toHaveBeenCalledWith(
            '/api/v1/club/',
            expect.objectContaining({method: 'GET'}),
        )
    })

    it('throws on 401', async () => {
        mockFetch.mockResolvedValueOnce(errorResponse(401, 'Unauthorized'))
        const {api} = await import('../client')
        await expect(api.getClub()).rejects.toThrow()
    })
})

// ── updateClubSettings ────────────────────────────────────────────────────────

describe('api.updateClubSettings', () => {
    it('sends PATCH to /club/settings', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ok: true}))

        const {api} = await import('../client')
        await api.updateClubSettings({
            name: 'New Name',
            primary_color: '#ff0000',
            home_venue: 'Neues Lokal',
        })

        expect(mockFetch).toHaveBeenCalledWith(
            '/api/v1/club/settings',
            expect.objectContaining({
                method: 'PATCH',
                body: expect.stringContaining('"primary_color":"#ff0000"'),
            }),
        )
    })

    it('throws on server error with detail message', async () => {
        mockFetch.mockResolvedValueOnce(errorResponse(400, 'Invalid color'))
        const {api} = await import('../client')
        await expect(api.updateClubSettings({primary_color: 'bad'})).rejects.toThrow('Invalid color')
    })
})

// ── uploadClubLogo ────────────────────────────────────────────────────────────

describe('api.uploadClubLogo', () => {
    it('sends POST with FormData to /club/logo', async () => {
        const mockLogoUrl = '/uploads/logos/club_1_abc.png'
        mockFetch.mockResolvedValueOnce(jsonOk({logo_url: mockLogoUrl}))

        const {api} = await import('../client')
        const file = new File(['fake-png-data'], 'logo.png', {type: 'image/png'})
        const result = await api.uploadClubLogo(file)

        expect(result.logo_url).toBe(mockLogoUrl)
        expect(mockFetch).toHaveBeenCalledWith(
            '/api/v1/club/logo',
            expect.objectContaining({
                method: 'POST',
                body: expect.any(FormData),
            }),
        )

        // Verify FormData contains the file
        const callArgs = mockFetch.mock.calls[0]
        const formData: FormData = callArgs[1].body
        expect(formData.get('file')).toBe(file)
    })

    it('throws on unsupported file type (400)', async () => {
        mockFetch.mockResolvedValueOnce(errorResponse(400, 'Unsupported file type. Use JPEG, PNG, WebP, GIF or SVG.'))
        const {api} = await import('../client')
        const file = new File(['data'], 'doc.pdf', {type: 'application/pdf'})
        await expect(api.uploadClubLogo(file)).rejects.toThrow('Unsupported file type')
    })

    it('throws on file too large (413)', async () => {
        mockFetch.mockResolvedValueOnce(errorResponse(413, 'Logo too large. Maximum size is 5 MB.'))
        const {api} = await import('../client')
        const bigFile = new File(['x'.repeat(100)], 'huge.png', {type: 'image/png'})
        await expect(api.uploadClubLogo(bigFile)).rejects.toThrow('Logo too large')
    })

    it('includes Authorization header', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({logo_url: '/uploads/logos/x.png'}))
        const {api} = await import('../client')
        const file = new File(['data'], 'logo.png', {type: 'image/png'})
        await api.uploadClubLogo(file)

        const headers = mockFetch.mock.calls[0][1].headers
        expect(headers['Authorization']).toBe('Bearer test-jwt-token')
    })
})

// ── deleteClubLogo ────────────────────────────────────────────────────────────

describe('api.deleteClubLogo', () => {
    it('sends DELETE to /club/logo', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({ok: true}))
        const {api} = await import('../client')
        await api.deleteClubLogo()

        expect(mockFetch).toHaveBeenCalledWith(
            '/api/v1/club/logo',
            expect.objectContaining({method: 'DELETE'}),
        )
    })
})
