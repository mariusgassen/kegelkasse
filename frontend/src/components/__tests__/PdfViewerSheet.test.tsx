import {afterEach, describe, expect, it, vi} from 'vitest'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import {PdfViewerSheet} from '../PdfViewerSheet'
import {usePdfViewer} from '@/store/pdfViewer'

afterEach(() => {
    usePdfViewer.getState().close()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('PdfViewerSheet', () => {
    it('renders nothing without a file', () => {
        render(<PdfViewerSheet/>)
        expect(screen.queryByTestId('pdf-viewer-frame')).toBeNull()
    })

    it('shows the PDF and shares it as a real File', async () => {
        vi.stubGlobal('URL', {...URL, createObjectURL: vi.fn(() => 'blob:pdf'), revokeObjectURL: vi.fn()})
        const share = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'canShare', {value: () => true, configurable: true})
        Object.defineProperty(navigator, 'share', {value: share, configurable: true})
        usePdfViewer.getState().open({blob: new Blob(['%PDF'], {type: 'application/pdf'}), name: 'x.pdf'})
        render(<PdfViewerSheet/>)
        expect(screen.getByTestId('pdf-viewer-frame').getAttribute('src')).toBe('blob:pdf')
        fireEvent.click(screen.getByText(/Teilen|Share/))
        await waitFor(() => expect(share).toHaveBeenCalled())
        const f = share.mock.calls[0][0].files[0] as File
        expect(f.name).toBe('x.pdf')
        expect(f.type).toBe('application/pdf')
    })
})
