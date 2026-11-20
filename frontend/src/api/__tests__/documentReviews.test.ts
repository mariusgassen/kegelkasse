/**
 * Unit tests for the club-document review request API client functions.
 * The global fetch is stubbed; no real HTTP requests are made.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {api, authState} from '../client'

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

describe('document review request API', () => {
    it('creates a request with document, Frist and reminder config', async () => {
        mockFetch.mockResolvedValue(jsonOk({id: 11}, 201))
        const payload = {
            document_id: 7,
            deadline: '2026-12-01',
            title: 'Satzung prüfen',
            reminder_days_before: 2,
            auto_reminders: true,
        }
        const res = await api.createDocumentReviewRequest(payload)
        expect(res.id).toBe(11)
        expect(mockFetch).toHaveBeenCalledWith('/api/v1/club/documents/requests', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(payload),
        }))
    })

    it('lists admin requests and member requests separately', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({requests: [{id: 11}]}))
        await api.listDocumentReviewRequests()
        expect(mockFetch).toHaveBeenLastCalledWith(
            '/api/v1/club/documents/requests', expect.objectContaining({method: 'GET'}),
        )
        mockFetch.mockResolvedValueOnce(jsonOk({requests: []}))
        await api.listMyDocumentReviewRequests()
        expect(mockFetch).toHaveBeenLastCalledWith(
            '/api/v1/club/documents/requests/mine', expect.objectContaining({method: 'GET'}),
        )
    })

    it('reminds pending recipients and closes a request', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({sent: 2}))
        const reminded = await api.remindDocumentReviewRequest(11)
        expect(reminded.sent).toBe(2)
        expect(mockFetch).toHaveBeenLastCalledWith(
            '/api/v1/club/documents/requests/11/remind', expect.objectContaining({method: 'POST'}),
        )

        mockFetch.mockResolvedValueOnce(jsonOk({id: 11, status: 'closed'}))
        const closed = await api.closeDocumentReviewRequest(11)
        expect(closed.status).toBe('closed')
        expect(mockFetch).toHaveBeenLastCalledWith(
            '/api/v1/club/documents/requests/11/close', expect.objectContaining({method: 'POST'}),
        )
    })

    it('cancels a request', async () => {
        mockFetch.mockResolvedValue(noContent())
        await api.cancelDocumentReviewRequest(11)
        expect(mockFetch).toHaveBeenLastCalledWith(
            '/api/v1/club/documents/requests/11', expect.objectContaining({method: 'DELETE'}),
        )
    })
})
