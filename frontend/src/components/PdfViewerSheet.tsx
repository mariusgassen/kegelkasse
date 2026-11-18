import {useEffect, useMemo} from 'react'
import {useT} from '@/i18n'
import {Sheet} from '@/components/ui/Sheet'
import {Button} from '@/components/ui/Button'
import {downloadBlob} from '@/lib/deliverFile'
import {showToast} from '@/components/ui/Toast'
import {usePdfViewer} from '@/store/pdfViewer'

/** In-app PDF viewer with Share (Web Share API, real file) and Download. Mounted once in RootLayout. */
export function PdfViewerSheet() {
    const t = useT()
    const file = usePdfViewer(s => s.file)
    const close = usePdfViewer(s => s.close)
    const url = useMemo(() => (file ? URL.createObjectURL(file.blob) : null), [file])
    useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

    if (!file || !url) return null

    async function share() {
        if (!file) return
        const f = new File([file.blob], file.name, {type: 'application/pdf'})
        if (navigator.canShare?.({files: [f]})) {
            try {
                await navigator.share({files: [f], title: file.name})
            } catch (e) {
                if ((e as Error)?.name !== 'AbortError') showToast(t('pdf.shareFailed'), 'error')
            }
            return
        }
        downloadBlob(file.blob, file.name)
    }

    return (
        <Sheet open onClose={close} title={file.name} icon="📄">
            <iframe src={url} aria-label={file.name} className="w-full rounded-lg bg-surface-2"
                    style={{height: '60vh'}} data-testid="pdf-viewer-frame"/>
            <div className="flex gap-2 mt-3">
                <Button variant="primary" className="flex-1" onClick={share}>{t('pdf.share')}</Button>
                <Button className="flex-1" onClick={() => downloadBlob(file.blob, file.name)}>{t('pdf.download')}</Button>
            </div>
        </Sheet>
    )
}
