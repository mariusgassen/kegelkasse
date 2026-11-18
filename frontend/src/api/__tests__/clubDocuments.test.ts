/** API client coverage for the club documents endpoints (upload FormData, protected blob download, ack). */
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {authState} from '../client'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
    mockFetch.mockReset()
    authState.setToken('test-jwt-token')
})

function jsonOk(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}})
}

const DOC = {
    id: 7, group_id: 'abc123', title: 'Satzung', document_type: 'satzung', version: '1.0',
    decision_date: '2026-11-16', effective_date: null, file_name: 'Satzung_KCE.pdf', file_size: 1234,
    uploaded_by_name: 'Admin', uploaded_at: '2026-11-16T10:00:00Z', is_current: true,
    acknowledged_count: 0, my_response: null, my_confirmed_at: null,
}

describe('api.listClubDocuments', () => {
    it('returns documents, member count and permission from the server', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({documents: [DOC], member_count: 5, can_upload: true}))
        const {api} = await import('../client')
        const result = await api.listClubDocuments()
        expect(mockFetch).toHaveBeenCalledWith('/api/v1/club/documents/', expect.objectContaining({method: 'GET'}))
        expect(result.member_count).toBe(5)
        expect(result.documents[0].title).toBe('Satzung')
        expect(result.can_upload).toBe(true)
    })
})

describe('api.uploadClubDocument', () => {
    it('posts a multipart body with metadata and the PDF file', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk(DOC, 201))
        const {api} = await import('../client')
        const file = new File(['%PDF-1.4'], 'Satzung_KCE.pdf', {type: 'application/pdf'})
        const result = await api.uploadClubDocument({
            file, title: 'Satzung', document_type: 'satzung', version: '1.0',
            decision_date: '2026-11-16', group_id: 'abc123',
        })
        expect(result.id).toBe(7)
        const [url, init] = mockFetch.mock.calls[0]
        expect(url).toBe('/api/v1/club/documents/')
        expect(init.method).toBe('POST')
        const form = init.body as FormData
        expect(form.get('file')).toBe(file)
        expect(form.get('title')).toBe('Satzung')
        expect(form.get('document_type')).toBe('satzung')
        expect(form.get('decision_date')).toBe('2026-11-16')
        expect(form.get('group_id')).toBe('abc123')
        expect(form.get('effective_date')).toBeNull()
        expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-jwt-token')
    })

    it('surfaces the server error detail', async () => {
        mockFetch.mockResolvedValueOnce(jsonOk({detail: 'Only PDF files are supported'}, 400))
        const {api} = await import('../client')
        const file = new File(['x'], 'x.pdf', {type: 'application/pdf'})
        await expect(api.uploadClubDocument({file, title: 'X', document_type: 'sonstiges'}))
            .rejects.toThrow('Only PDF files are supported')
    })
})

describe('api.downloadClubDocument', () => {
    it('downloads the authenticated blob under the stored file name', async () => {
        const {api} = await import('../client')
        mockFetch.mockResolvedValueOnce(new Response('%PDF-1.4', {status: 200, headers: {'Content-Type': 'application/pdf'}}))

        const click = vi.fn()
        const create = document.createElement.bind(document)
        vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
            const el = create(tag)
            if (tag === 'a') el.click = click
            return el
        })
        const createObjectURL = vi.fn(() => 'blob:doc')
        const revokeObjectURL = vi.fn()
        vi.stubGlobal('URL', {...URL, createObjectURL, revokeObjectURL})

        await api.downloadClubDocument(7, 'Satzung_KCE.pdf')

        expect(mockFetch).toHaveBeenCalledWith('/api/v1/club/documents/7/download', expect.objectContaining({
            headers: expect.objectContaining({Authorization: 'Bearer test-jwt-token'}),
        }))
        expect(createObjectURL).toHaveBeenCalledOnce()
        expect(click).toHaveBeenCalledOnce()
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:doc')
        vi.restoreAllMocks()
    })
})

describe('api acknowledgement methods', () => {
    it('posts the response and uses DELETE for withdraw and delete', async () => {
        const {api} = await import('../client')
        mockFetch.mockResolvedValueOnce(jsonOk(DOC))
        await api.acknowledgeClubDocument(7, 'agreed')
        expect(mockFetch).toHaveBeenCalledWith('/api/v1/club/documents/7/acknowledge',
            expect.objectContaining({method: 'POST', body: JSON.stringify({response: 'agreed'})}))

        mockFetch.mockResolvedValueOnce(new Response(null, {status: 204}))
        await api.withdrawClubDocumentAcknowledgement(7)
        expect(mockFetch).toHaveBeenCalledWith('/api/v1/club/documents/7/acknowledge',
            expect.objectContaining({method: 'DELETE'}))

        mockFetch.mockResolvedValueOnce(new Response(null, {status: 204}))
        await api.deleteClubDocument(7)
        expect(mockFetch).toHaveBeenCalledWith('/api/v1/club/documents/7',
            expect.objectContaining({method: 'DELETE'}))
    })
})
