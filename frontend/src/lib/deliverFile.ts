import {usePdfViewer} from '@/store/pdfViewer'

/** Saves a blob through a temporary `<a download>` click. */
export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

/**
 * Single exit point for generated/fetched files. PDFs open in the in-app viewer (view + share a
 * real File from there, so the OS share sheet never sees a bare `blob:` URL); everything else
 * (xlsx, …) is downloaded.
 */
export function deliverFile(blob: Blob, filename: string) {
    if (blob.type === 'application/pdf') usePdfViewer.getState().open({blob, name: filename})
    else downloadBlob(blob, filename)
}
