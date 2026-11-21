import {beforeEach, describe, expect, it, vi} from 'vitest'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'

vi.mock('@/i18n', () => ({useT: () => (key: string) => key}))
vi.mock('@/hooks/useOnline.ts', () => ({useOnline: () => true}))
vi.mock('@/hooks/useAiEnabled.ts', () => ({useAiEnabled: () => aiOn.value}))
vi.mock('@/utils/error.ts', () => ({toastError: vi.fn()}))
vi.mock('@/components/ui/Toast.tsx', () => ({showToast: vi.fn()}))
vi.mock('@/components/ui/Empty.tsx', () => ({Empty: ({text}: {text: string}) => <div>{text}</div>}))
vi.mock('@/components/ui/Sheet.tsx', () => ({
    Sheet: ({open, children, title, onClose, onSubmit}: any) => open ? (
        <div data-testid="sheet">
            <div data-testid="sheet-title">{title}</div>
            <button onClick={onClose}>close-sheet</button>
            {onSubmit && <button onClick={onSubmit}>submit-sheet</button>}
            {children}
        </div>
    ) : null,
}))
vi.mock('@/store/app.ts', () => ({
    useAppStore: vi.fn((sel?: any) => {
        const store = {user: {id: 1, role: 'member'}}
        return sel ? sel(store) : store
    }),
    isAdmin: vi.fn(() => false),
}))

const mockHashParams = vi.hoisted(() => ({value: ''}))
vi.mock('@/utils/hashParams.ts', () => ({
    getHashParams: () => new URLSearchParams(mockHashParams.value),
    clearHashParams: vi.fn(),
}))
const flashMock = vi.hoisted(() => vi.fn(() => () => {}))
vi.mock('@/hooks/useDeepLink.ts', () => ({useDeepLinkVersion: () => 'v', flashDeepLinkTarget: flashMock}))
const aiOn = vi.hoisted(() => ({value: false}))
const apiMock = vi.hoisted(() => ({
    analyzeClubDocument: vi.fn(),
    listClubDocuments: vi.fn(),
    getClubDocument: vi.fn(),
    uploadClubDocument: vi.fn(),
    updateClubDocument: vi.fn(),
    downloadClubDocument: vi.fn(),
    acknowledgeClubDocument: vi.fn(),
    withdrawClubDocumentAcknowledgement: vi.fn(),
    deleteClubDocument: vi.fn(),
    listDocumentReviewRequests: vi.fn(),
    listMyDocumentReviewRequests: vi.fn(),
    createDocumentReviewRequest: vi.fn(),
    closeDocumentReviewRequest: vi.fn(),
    remindDocumentReviewRequest: vi.fn(),
    cancelDocumentReviewRequest: vi.fn(),
}))
vi.mock('@/api/client.ts', () => ({api: apiMock}))

import {ClubDocumentsPage} from '../ClubDocumentsPage'
import {api} from '@/api/client'
import {isAdmin} from '@/store/app'

const DOC = {
    id: 7, group_id: 'g1', title: 'Satzung', document_type: 'satzung', version: '2.0',
    decision_date: '2026-11-16', effective_date: '2026-11-17', file_name: 'Satzung_KCE.pdf',
    file_size: 1234, uploaded_by_name: 'Admin', uploaded_at: '2026-11-16T10:00:00Z',
    is_current: true, acknowledged_count: 3, my_response: null, my_confirmed_at: null,
}
const OLD = {...DOC, id: 5, version: '1.0', is_current: false, acknowledged_count: 2}
const REQUEST = {
    id: 11, document_id: 7, document_title: 'Satzung', document_version: '2.0',
    document_url: '/#documents?item=7', title: 'Satzung prüfen', message: 'Bitte lesen',
    deadline: '2026-12-01', reminder_days_before: 2, auto_reminders: true, status: 'open',
    created_at: '2026-11-20T10:00:00Z', closed_at: null, created_by_name: 'Admin',
    recipient_count: 3, responded_count: 1, pending_count: 2, my_response: null,
    is_recipient: true,
}

function renderPage() {
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}})
    return render(<QueryClientProvider client={qc}><ClubDocumentsPage/></QueryClientProvider>)
}

beforeEach(() => {
    vi.clearAllMocks()
    apiMock.listClubDocuments.mockResolvedValue({
        documents: [DOC, OLD], member_count: 5, can_upload: false,
    })
    apiMock.uploadClubDocument.mockResolvedValue(DOC)
    apiMock.updateClubDocument.mockResolvedValue(DOC)
    apiMock.acknowledgeClubDocument.mockResolvedValue(DOC)
    apiMock.downloadClubDocument.mockResolvedValue(undefined)
    apiMock.deleteClubDocument.mockResolvedValue(undefined)
    apiMock.listMyDocumentReviewRequests.mockResolvedValue({requests: []})
    apiMock.listDocumentReviewRequests.mockResolvedValue({requests: []})
    apiMock.createDocumentReviewRequest.mockResolvedValue(REQUEST)
    apiMock.remindDocumentReviewRequest.mockResolvedValue({sent: 1})
    apiMock.closeDocumentReviewRequest.mockResolvedValue(REQUEST)
    apiMock.cancelDocumentReviewRequest.mockResolvedValue(undefined)
    vi.mocked(isAdmin).mockReturnValue(false)
    aiOn.value = false
    mockHashParams.value = ''
})

describe('ClubDocumentsPage', () => {
    it('shows the current document with metadata and acknowledgement progress', async () => {
        renderPage()
        expect(await screen.findByTestId('document-card')).toBeTruthy()
        expect(screen.getByText('Satzung')).toBeTruthy()
        expect(screen.getByTestId('document-progress').textContent).toBe('3/5')
        expect(screen.getAllByTestId('document-card')).toHaveLength(1)
        expect(screen.queryByTestId('document-add-button')).toBeNull()
        expect(screen.getByTestId('document-history')).toBeTruthy()
    })

    it('downloads a document through the protected API', async () => {
        renderPage()
        fireEvent.click(await screen.findByTestId('document-download'))
        await waitFor(() => expect(api.downloadClubDocument).toHaveBeenCalledWith(7, 'Satzung_KCE.pdf'))
    })

    it('offers one confirm button that agrees to a Satzung', async () => {
        renderPage()
        const btn = await screen.findByTestId('document-confirm')
        expect(btn.textContent).toBe('document.action.agree')
        expect(screen.getAllByTestId('document-confirm')).toHaveLength(1)
        fireEvent.click(btn)
        await waitFor(() => expect(api.acknowledgeClubDocument).toHaveBeenCalledWith(7, 'agreed'))
    })

    it('only takes note of minutes and other documents', async () => {
        apiMock.listClubDocuments.mockResolvedValue({
            documents: [{...DOC, document_type: 'protokoll'}], member_count: 5, can_upload: false,
        })
        renderPage()
        const btn = await screen.findByTestId('document-confirm')
        expect(btn.textContent).toBe('document.action.acknowledge')
        fireEvent.click(btn)
        await waitFor(() => expect(api.acknowledgeClubDocument).toHaveBeenCalledWith(7, 'acknowledged'))
    })

    it('can withdraw an existing acknowledgement', async () => {
        apiMock.listClubDocuments.mockResolvedValue({
            documents: [{...DOC, my_response: 'agreed'}], member_count: 5, can_upload: false,
        })
        renderPage()
        fireEvent.click(await screen.findByTestId('document-withdraw'))
        await waitFor(() => expect(api.withdrawClubDocumentAcknowledgement).toHaveBeenCalledWith(7))
    })

    it('lets an admin upload a new version with metadata', async () => {
        vi.mocked(isAdmin).mockReturnValue(true)
        renderPage()
        fireEvent.click(await screen.findByTestId('document-add-button'))
        expect(screen.getByTestId('document-upload-sheet')).toBeTruthy()

        fireEvent.change(screen.getByLabelText('document.upload.title'), {target: {value: 'Geschäftsordnung'}})
        fireEvent.change(screen.getByLabelText('document.upload.decisionDate'), {target: {value: '2026-11-16'}})
        const file = new File(['%PDF'], 'GO.pdf', {type: 'application/pdf'})
        fireEvent.change(screen.getByTestId('document-file-input'), {target: {files: [file]}})
        fireEvent.click(screen.getByText('submit-sheet'))

        await waitFor(() => expect(api.uploadClubDocument).toHaveBeenCalledWith(expect.objectContaining({
            file, title: 'Geschäftsordnung', document_type: 'satzung', decision_date: '2026-11-16',
        })))
    })

    it('lets an admin delete a document after confirmation', async () => {
        vi.mocked(isAdmin).mockReturnValue(true)
        renderPage()
        fireEvent.click(await screen.findByLabelText('action.more'))
        fireEvent.click(await screen.findByText('document.delete'))
        fireEvent.click(await screen.findByText('action.confirmDelete'))
        await waitFor(() => expect(api.deleteClubDocument).toHaveBeenCalledWith(7))
    })

    it('shows summary and change summary on the card', async () => {
        apiMock.listClubDocuments.mockResolvedValue({
            documents: [{...DOC, summary: '- Zweck', change_summary: '- Beitrag erhöht'}],
            member_count: 5, can_upload: false,
        })
        renderPage()
        expect((await screen.findByTestId('document-summary')).textContent).toBe('Zweck')
        expect(screen.getByTestId('document-change-summary').textContent).toContain('Beitrag erhöht')
    })

    it('hides the AI button when AI is off', async () => {
        vi.mocked(isAdmin).mockReturnValue(true)
        renderPage()
        fireEvent.click(await screen.findByTestId('document-add-button'))
        fireEvent.change(screen.getByTestId('document-file-input'),
            {target: {files: [new File(['%PDF'], 'GO.pdf', {type: 'application/pdf'})]}})
        expect(screen.queryByTestId('document-ai-fill')).toBeNull()
    })

    it('fills the form from the AI suggestion and uploads the edited summary', async () => {
        vi.mocked(isAdmin).mockReturnValue(true)
        aiOn.value = true
        apiMock.analyzeClubDocument.mockResolvedValue({
            title: 'Satzung KCE', document_type: 'satzung', version: '3.0', decision_date: '2026-11-16',
            effective_date: null, summary: '- Zweck', change_summary: '- Beitrag erhöht',
        })
        renderPage()
        fireEvent.click(await screen.findByLabelText('action.more'))
        fireEvent.click(await screen.findByText('document.upload.newVersion'))
        const file = new File(['%PDF'], 'S.pdf', {type: 'application/pdf'})
        fireEvent.change(screen.getByTestId('document-file-input'), {target: {files: [file]}})
        fireEvent.click(screen.getByTestId('document-ai-fill'))

        await waitFor(() => expect(api.analyzeClubDocument).toHaveBeenCalledWith(file, 'g1', undefined))
        await waitFor(() => expect((screen.getByLabelText('document.upload.version') as HTMLInputElement).value).toBe('3.0'))
        expect((screen.getByLabelText('document.changeSummary') as HTMLTextAreaElement).value).toBe('- Beitrag erhöht')
        fireEvent.change(screen.getByLabelText('document.summary'), {target: {value: '- Zweck (geprüft)'}})
        fireEvent.click(screen.getByText('submit-sheet'))

        await waitFor(() => expect(api.uploadClubDocument).toHaveBeenCalledWith(expect.objectContaining({
            group_id: 'g1', version: '3.0', summary: '- Zweck (geprüft)', change_summary: '- Beitrag erhöht',
        })))
    })

    it('renders summaries as Markdown on the card', async () => {
        apiMock.listClubDocuments.mockResolvedValue({
            documents: [{...DOC, summary: '- Beitrag **60 €**', change_summary: null}],
            member_count: 5, can_upload: false,
        })
        renderPage()
        const box = await screen.findByTestId('document-summary')
        expect(box.querySelector('strong')?.textContent).toBe('60 €')
        expect(box.querySelector('li')).toBeTruthy()
    })

    it('suggests the next version number for a new version and keeps it editable', async () => {
        vi.mocked(isAdmin).mockReturnValue(true)
        renderPage()
        fireEvent.click(await screen.findByLabelText('action.more'))
        fireEvent.click(await screen.findByText('document.upload.newVersion'))
        const input = screen.getByLabelText('document.upload.version') as HTMLInputElement
        expect(input.value).toBe('2.1')            // DOC.version is 2.0
        fireEvent.change(input, {target: {value: '3.0'}})
        expect(input.value).toBe('3.0')
    })

    it('previews the summary as Markdown and passes the AI hint', async () => {
        vi.mocked(isAdmin).mockReturnValue(true)
        aiOn.value = true
        apiMock.analyzeClubDocument.mockResolvedValue({
            title: null, document_type: null, version: null, decision_date: null,
            effective_date: null, summary: null, change_summary: null,
        })
        renderPage()
        fireEvent.click(await screen.findByTestId('document-add-button'))
        const file = new File(['%PDF'], 'S.pdf', {type: 'application/pdf'})
        fireEvent.change(screen.getByTestId('document-file-input'), {target: {files: [file]}})
        fireEvent.change(screen.getByLabelText('document.summary'), {target: {value: '**wichtig**'}})
        fireEvent.click(screen.getByTestId('doc-summary-preview-tab'))
        expect(screen.getByTestId('doc-summary-preview').querySelector('strong')?.textContent).toBe('wichtig')

        fireEvent.change(screen.getByLabelText('document.ai.hintLabel'), {target: {value: 'Beiträge'}})
        fireEvent.click(screen.getByTestId('document-ai-fill'))
        await waitFor(() => expect(api.analyzeClubDocument).toHaveBeenCalledWith(file, undefined, 'Beiträge'))
    })

    it('closes the upload dialog with the cancel button', async () => {
        vi.mocked(isAdmin).mockReturnValue(true)
        renderPage()
        fireEvent.click(await screen.findByTestId('document-add-button'))
        fireEvent.click(screen.getByTestId('document-cancel'))
        expect(screen.queryByTestId('document-upload-sheet')).toBeNull()
    })

    it('flashes the document a search deep link points to', async () => {
        mockHashParams.value = 'item=7'
        renderPage()
        await screen.findByTestId('document-card')
        await waitFor(() => expect(flashMock).toHaveBeenCalledWith('document-7'))
    })

    it('opens the history first when the deep link points to an older version', async () => {
        mockHashParams.value = 'item=5'
        renderPage()
        await waitFor(() => expect(flashMock).toHaveBeenCalledWith('document-5'))
        expect(document.getElementById('document-5')).toBeTruthy()
    })

    it('shows the chosen PDF as a chip once and lets the admin remove it', async () => {
        vi.mocked(isAdmin).mockReturnValue(true)
        renderPage()
        fireEvent.click(await screen.findByTestId('document-add-button'))
        expect(screen.getByTestId('document-file-pick')).toBeTruthy()
        fireEvent.change(screen.getByTestId('document-file-input'),
            {target: {files: [new File(['%PDF'], 'GO_KCE.pdf', {type: 'application/pdf'})]}})
        expect(screen.queryByTestId('document-file-pick')).toBeNull()
        expect(screen.getAllByText('GO_KCE.pdf')).toHaveLength(1)
        fireEvent.click(screen.getByTestId('document-file-remove'))
        expect(screen.getByTestId('document-file-pick')).toBeTruthy()
        expect(screen.queryByTestId('document-file-chip')).toBeNull()
    })

    it('keeps the action row stable: both buttons share one non-wrapping row', async () => {
        renderPage()
        const download = await screen.findByTestId('document-download')
        const confirm = screen.getByTestId('document-confirm')
        expect(download.parentElement?.className).not.toContain('flex-wrap')
        for (const b of [download, confirm]) {
            expect(b.className).toContain('flex-1')
            expect(b.className).toContain('whitespace-nowrap')
        }
    })

    it('edits only the metadata of a document (no file, no AI) and saves it', async () => {
        vi.mocked(isAdmin).mockReturnValue(true)
        aiOn.value = true
        apiMock.listClubDocuments.mockResolvedValue({
            documents: [{...DOC, summary: '- alt', change_summary: null}], member_count: 5, can_upload: true,
        })
        renderPage()
        fireEvent.click(await screen.findByLabelText('action.more'))
        fireEvent.click(await screen.findByText('document.editAction'))
        expect(screen.getByTestId('sheet-title').textContent).toBe('document.edit.title')
        expect(screen.queryByTestId('document-file-input')).toBeNull()
        expect(screen.queryByTestId('document-ai-fill')).toBeNull()
        expect((screen.getByLabelText('document.upload.title') as HTMLInputElement).value).toBe('Satzung')
        expect((screen.getByLabelText('document.upload.version') as HTMLInputElement).value).toBe('2.0')

        fireEvent.change(screen.getByLabelText('document.upload.version'), {target: {value: '2.1'}})
        fireEvent.change(screen.getByLabelText('document.summary'), {target: {value: '- neu'}})
        fireEvent.click(screen.getByText('submit-sheet'))

        await waitFor(() => expect(api.updateClubDocument).toHaveBeenCalledWith(7, expect.objectContaining({
            title: 'Satzung', document_type: 'satzung', version: '2.1',
            decision_date: '2026-11-16', effective_date: '2026-11-17', summary: '- neu', change_summary: null,
        })))
        expect(api.uploadClubDocument).not.toHaveBeenCalled()
    })

    it('shows a member their open request with Frist and lets them agree', async () => {
        apiMock.listMyDocumentReviewRequests.mockResolvedValue({requests: [REQUEST]})
        renderPage()
        expect(await screen.findByTestId('document-review-card')).toBeTruthy()
        expect(screen.getByTestId('document-review-progress').textContent).toBe('1/3')
        expect(screen.getByTestId('document-review-card').textContent).toContain('document.review.dueIn')
        fireEvent.click(screen.getByTestId('document-review-agree'))
        await waitFor(() => expect(api.acknowledgeClubDocument).toHaveBeenCalledWith(7, 'agreed'))
    })

    it('lets an admin create a review request with a Frist', async () => {
        vi.mocked(isAdmin).mockReturnValue(true)
        renderPage()
        fireEvent.click(await screen.findByLabelText('action.more'))
        fireEvent.click(await screen.findByText('document.review.new'))
        expect(screen.getByTestId('document-review-sheet')).toBeTruthy()
        fireEvent.change(screen.getByLabelText('document.review.deadline'), {target: {value: '2026-12-10'}})
        fireEvent.click(screen.getByText('submit-sheet'))
        await waitFor(() => expect(api.createDocumentReviewRequest).toHaveBeenCalledWith(
            expect.objectContaining({document_id: 7, deadline: '2026-12-10', auto_reminders: true}),
        ))
    })

    it('highlights the linked request from a review notification deep link', async () => {
        mockHashParams.value = 'item=7'
        apiMock.listMyDocumentReviewRequests.mockResolvedValue({requests: [REQUEST]})
        renderPage()
        await screen.findByTestId('document-review-card')
        await waitFor(() => expect(flashMock).toHaveBeenCalledWith('document-7'))
        expect(screen.getByTestId('document-review-card').className).toContain('border-accent')
    })

    it('lets an admin remind, close and delete a review request', async () => {
        vi.mocked(isAdmin).mockReturnValue(true)
        apiMock.listDocumentReviewRequests.mockResolvedValue({requests: [REQUEST]})
        renderPage()
        fireEvent.click(await screen.findByTestId('document-review-remind'))
        await waitFor(() => expect(api.remindDocumentReviewRequest).toHaveBeenCalledWith(11))
        fireEvent.click(screen.getByTestId('document-review-close'))
        await waitFor(() => expect(api.closeDocumentReviewRequest).toHaveBeenCalledWith(11))
        fireEvent.click(screen.getByTestId('document-review-cancel'))
        fireEvent.click(await screen.findByText('action.confirmDelete'))
        await waitFor(() => expect(api.cancelDocumentReviewRequest).toHaveBeenCalledWith(11))
    })
})
