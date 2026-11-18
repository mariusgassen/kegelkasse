import {afterEach, describe, expect, it, vi} from 'vitest'
import {deliverFile} from '../deliverFile'
import {usePdfViewer} from '@/store/pdfViewer'

afterEach(() => {
    usePdfViewer.getState().close()
    vi.restoreAllMocks()
})

describe('deliverFile', () => {
    it('opens PDFs in the in-app viewer instead of downloading', () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
        const blob = new Blob(['%PDF'], {type: 'application/pdf'})
        deliverFile(blob, 'a.pdf')
        expect(usePdfViewer.getState().file).toEqual({blob, name: 'a.pdf'})
        expect(click).not.toHaveBeenCalled()
    })

    it('downloads non-PDF files', () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
        vi.stubGlobal('URL', {...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn()})
        deliverFile(new Blob(['x']), 'a.xlsx')
        expect(click).toHaveBeenCalledOnce()
        expect(usePdfViewer.getState().file).toBeNull()
        vi.unstubAllGlobals()
    })
})
