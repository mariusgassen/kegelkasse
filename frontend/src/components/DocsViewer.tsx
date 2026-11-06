import {Sheet} from '@/components/ui/Sheet'
import {useT} from '@/i18n'
import {useDocsViewer} from '@/store/docsViewer'

/**
 * The user documentation (served same-origin at /docs, outside the SPA) shown inside a sheet. In an
 * installed PWA a plain link to it would hand over to the system browser; the iframe keeps members in
 * the app, and closing the sheet returns them to where they were (e.g. the search with its AI answer).
 */
export function DocsViewer() {
    const t = useT()
    const url = useDocsViewer(s => s.url)
    const close = useDocsViewer(s => s.close)
    return (
        <Sheet open={url !== null} onClose={close} title={t('docs.title')}>
            {url && (
                <iframe
                    src={url}
                    aria-label={t('docs.title')}
                    className="w-full rounded-xl border border-line bg-white"
                    style={{height: 'calc(100dvh - 10rem)'}}
                    data-testid="docs-frame"
                />
            )}
        </Sheet>
    )
}
