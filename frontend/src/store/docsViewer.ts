import {create} from 'zustand'

/** In-app documentation viewer (a sheet with the docs in an iframe), so docs links never leave the app. */
interface DocsViewerState {
    url: string | null
    open: (url: string) => void
    close: () => void
}

export const useDocsViewer = create<DocsViewerState>()((set) => ({
    url: null,
    open: (url) => set({url}),
    close: () => set({url: null}),
}))
