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
    downloadClubDocument: vi.fn(),
    acknowledgeClubDocument: vi.fn(),
    withdrawClubDocumentAcknowledgement: vi.fn(),
    deleteClubDocument: vi.fn(),
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
    apiMock.acknowledgeClubDocument.mockResolvedValue(DOC)
    apiMock.downloadClubDocument.mockResolvedValue(undefined)
    apiMock.deleteClubDocument.mockResolvedValue(undefined)
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

    it('records an acknowledgement', async () => {
        renderPage()
        fireEvent.click(await screen.findByTestId('document-agree'))
        await waitFor(() => expect(api.acknowledgeClubDocument).toHaveBeenCalledWith(7, 'agreed'))
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
})
