import {create} from 'zustand'

export interface PdfViewerFile {
    blob: Blob
    name: string
}

interface PdfViewerState {
    file: PdfViewerFile | null
    open: (file: PdfViewerFile) => void
    close: () => void
}

/** The PDF currently shown in the in-app viewer (`<PdfViewerSheet/>`); not persisted. */
export const usePdfViewer = create<PdfViewerState>(set => ({
    file: null,
    open: file => set({file}),
    close: () => set({file: null}),
}))
