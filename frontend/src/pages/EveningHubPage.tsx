/**
 * Evening hub — sub-tab wrapper for Protokoll | Spiele | Highlights.
 * Evening configuration is accessed separately via the AKTIV header button.
 */
import {useEffect, useRef, useState} from 'react'
import {useT} from '@/i18n'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {useHashTab} from '@/hooks/usePage.ts'
import {api} from '@/api/client.ts'
import {toastError} from '@/utils/error.ts'
import {getHashParams, clearHashParams} from '@/utils/hashParams.ts'
import {Empty} from '@/components/ui/Empty.tsx'
import {CommentThread} from '@/components/ui/CommentThread.tsx'
import {ItemReactionBar} from '@/components/ui/ItemReactionBar.tsx'
import {MediaUploadButton} from '@/components/ui/MediaUploadButton.tsx'
import {ProtocolPage} from './ProtocolPage'
import {GamesPage} from './GamesPage'
import {TabletQuickEntryPage} from './TabletQuickEntryPage'
import {useQueryClient} from '@tanstack/react-query'

type SubTab = 'penalties' | 'games' | 'highlights'

interface Props {
    onNavigate: () => void
    onHistory?: () => void
}

export function EveningHubPage({onNavigate, onHistory}: Props) {
    const t = useT()
    const {evening, invalidate, activeEveningId} = useActiveEvening()
    const qc = useQueryClient()
    const [subTab, setSubTab] = useHashTab<SubTab>('penalties', ['penalties', 'games', 'highlights'])
    const [closeConfirm, setCloseConfirm] = useState(false)
    const [quickEntryOpen, setQuickEntryOpen] = useState(false)
    const [highlightText, setHighlightText] = useState('')
    const [highlightMediaUrl, setHighlightMediaUrl] = useState<string | null>(null)
    const [addingHighlight, setAddingHighlight] = useState(false)
    const [openCommentHighlightId, setOpenCommentHighlightId] = useState<number | null>(null)

    // Deep link state for highlight items
    const [deepLinkItemId, setDeepLinkItemId] = useState<number | null>(null)
    const [deepLinkCommentId, setDeepLinkCommentId] = useState<number | null>(null)
    const [hashVersion, setHashVersion] = useState(0)
    const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Listen for hash changes triggered by notification-panel clicks
    useEffect(() => {
        const handler = () => setHashVersion(v => v + 1)
        window.addEventListener('hashchange', handler)
        return () => window.removeEventListener('hashchange', handler)
    }, [])

    // Parse deep-link params (on mount and on hash changes)
    useEffect(() => {
        const params = getHashParams()
        const itemId = params.get('item')
        if (!itemId) return
        const commentId = params.get('comment')
        setDeepLinkItemId(parseInt(itemId, 10))
        setDeepLinkCommentId(commentId ? parseInt(commentId, 10) : null)
        clearHashParams()
        // Ensure we're on the highlights tab
        setSubTab('highlights')
    }, [hashVersion]) // eslint-disable-line react-hooks/exhaustive-deps

    // Execute scroll + highlight once subTab is 'highlights' and evening data is available
    useEffect(() => {
        if (!deepLinkItemId || subTab !== 'highlights' || !evening) return
        const target = evening.highlights.find(h => h.id === deepLinkItemId)
        if (!target) return

        // Always open the comment thread; deepLinkCommentId is passed to CommentThread and cleared there
        setOpenCommentHighlightId(target.id)

        // Clear any pending flash timer
        if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current)

        setDeepLinkItemId(null)
        // Note: deepLinkCommentId is NOT cleared here — CommentThread calls onHighlightHandled() once it flashes

        flashTimerRef.current = setTimeout(() => {
            const el = document.getElementById(`item-${target.id}`)
            el?.scrollIntoView({behavior: 'smooth', block: 'center'})
            el?.classList.add('kce-deeplink-flash')
            flashTimerRef.current = setTimeout(() => {
                el?.classList.remove('kce-deeplink-flash')
            }, 2500)
        }, 120)
    }, [deepLinkItemId, subTab, evening]) // eslint-disable-line react-hooks/exhaustive-deps

    // No active evening — prompt to configure one
    if (!activeEveningId) {
        return (
            <div className="page-scroll px-3 py-3 pb-24">
                <div className="sec-heading">🎳 {t('nav.evening')}</div>
                <div className="kce-card p-5 text-center">
                    <div className="text-2xl mb-3">🎳</div>
                    <div className="text-sm font-bold text-kce-cream mb-1">{t('evening.noActive')}</div>
                    <button className="btn-primary mt-4" onClick={onNavigate}>
                        {t('evening.startButton')}
                    </button>
                </div>
            </div>
        )
    }

    const TABS: { id: SubTab; label: string }[] = [
        {id: 'penalties', label: `📋 ${t('evening.tab.log')}`},
        {id: 'games', label: `🏆 ${t('nav.games')}`},
        {id: 'highlights', label: `✨ ${t('evening.tab.highlights')}`},
    ]

    const isClosed = evening?.is_closed ?? false

    async function addHighlight() {
        if (!evening || (!highlightText.trim() && !highlightMediaUrl)) return
        setAddingHighlight(true)
        try {
            await api.addHighlight(evening.id, {
                text: highlightText.trim() || undefined,
                media_url: highlightMediaUrl || undefined,
            })
            setHighlightText('')
            setHighlightMediaUrl(null)
            invalidate()
        } catch (err) {
            toastError(err)
        } finally {
            setAddingHighlight(false)
        }
    }

    return (
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column'}}>
            {/* Sub-tab strip */}
            <div className="flex items-center gap-1 px-2 pt-2 pb-1.5 flex-shrink-0"
                 style={{background: 'var(--kce-bg)', borderBottom: '1px solid var(--kce-border)'}}>
                {TABS.map(tb => (
                    <button key={tb.id} type="button"
                            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${subTab === tb.id ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                            onClick={() => setSubTab(tb.id)}>
                        {tb.label}
                    </button>
                ))}
                {/* End / reopen evening — always accessible in the tab bar */}
                {!isClosed ? (
                    <button
                        className="btn-danger btn-xs flex-shrink-0 ml-1"
                        onClick={() => setCloseConfirm(true)}
                        title={t('evening.end')}>
                        ■
                    </button>
                ) : (
                    <button
                        className="btn-secondary btn-xs flex-shrink-0 ml-1"
                        onClick={async () => {
                            try {
                                await api.updateEvening(evening!.id, {is_closed: false})
                                invalidate()
                            } catch (e) { toastError(e) }
                        }}
                        title={t('evening.reopen')}>
                        ↺
                    </button>
                )}
            </div>

            {/* Close-confirm bar — slides in below tabs when active */}
            {closeConfirm && (
                <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
                     style={{background: 'rgba(192,57,43,0.12)', borderBottom: '1px solid rgba(192,57,43,0.3)'}}>
                    <p className="text-xs text-kce-muted flex-1">{t('evening.endConfirm')}</p>
                    <button className="btn-secondary btn-xs" onClick={() => setCloseConfirm(false)}>
                        {t('action.cancel')}
                    </button>
                    <button className="btn-danger btn-xs" onClick={async () => {
                        try {
                            await api.updateEvening(evening!.id, {is_closed: true})
                            setCloseConfirm(false)
                            invalidate()
                            qc.invalidateQueries({queryKey: ['evenings']})
                        } catch (e) { toastError(e) }
                    }}>
                        {t('action.done')}
                    </button>
                    {onHistory && (
                        <button className="btn-secondary btn-xs" onClick={onHistory}>
                            📚
                        </button>
                    )}
                </div>
            )}

            {/* Sub-pages — always mounted, toggled via display */}
            <div style={{flex: 1, overflow: 'hidden', position: 'relative'}}>
                <div style={{position: 'absolute', inset: 0, display: subTab === 'penalties' ? 'block' : 'none'}}>
                    <ProtocolPage
                        onQuickEntry={!isClosed && (evening?.players.length ?? 0) > 0
                            ? () => setQuickEntryOpen(true)
                            : undefined}
                    />
                </div>
                <div style={{position: 'absolute', inset: 0, display: subTab === 'games' ? 'block' : 'none'}}>
                    <GamesPage/>
                </div>

                {/* Highlights tab */}
                <div style={{position: 'absolute', inset: 0, display: subTab === 'highlights' ? 'block' : 'none', overflowY: 'auto'}}
                     className="px-3 py-3 pb-24">
                    {evening && (
                        <>
                            {/* New highlight input — at top so new entries appear above list */}
                            {!isClosed && (
                                <div className="flex flex-col gap-1.5 mb-4">
                                    <div className="flex gap-2">
                                        <input
                                            className="kce-input flex-1"
                                            value={highlightText}
                                            onChange={e => setHighlightText(e.target.value)}
                                            placeholder={t('highlight.placeholder')}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault()
                                                    addHighlight()
                                                }
                                            }}
                                        />
                                        <MediaUploadButton
                                            value={highlightMediaUrl}
                                            onUploaded={setHighlightMediaUrl}
                                            onRemove={() => setHighlightMediaUrl(null)}
                                        />
                                        <button className="btn-primary btn-sm flex-shrink-0"
                                                disabled={(!highlightText.trim() && !highlightMediaUrl) || addingHighlight}
                                                onClick={addHighlight}>
                                            +
                                        </button>
                                    </div>
                                    {highlightMediaUrl && (
                                        <img src={highlightMediaUrl} alt=""
                                             className="rounded max-h-32 max-w-full object-contain border border-kce-border/40"/>
                                    )}
                                </div>
                            )}

                            {/* Highlight list — newest first */}
                            {evening.highlights.length === 0
                                ? <Empty icon="✨" text={t('highlight.none')}/>
                                : <div className="flex flex-col gap-2">
                                    {[...evening.highlights].reverse().map(h => (
                                        <div key={h.id} id={`item-${h.id}`} className="kce-card p-3">
                                            <div className="flex items-start gap-2">
                                                <span className="text-base flex-shrink-0">✨</span>
                                                <div className="flex-1 min-w-0">
                                                    {h.media_url && (
                                                        <img src={h.media_url} alt=""
                                                             className="mt-1 rounded max-h-64 max-w-full object-contain border border-kce-border/40"/>
                                                    )}
                                                    {h.text && <div className="text-sm mt-1">{h.text}</div>}
                                                </div>
                                                {!isClosed && (
                                                    <button className="btn-danger btn-xs flex-shrink-0"
                                                            onClick={async () => {
                                                                try {
                                                                    await api.deleteHighlight(evening.id, h.id)
                                                                    invalidate()
                                                                } catch (e) { toastError(e) }
                                                            }}>✕</button>
                                                )}
                                            </div>
                                            <ItemReactionBar
                                                parentType="highlight" parentId={h.id}
                                                commentOpen={openCommentHighlightId === h.id}
                                                onCommentToggle={() => setOpenCommentHighlightId(openCommentHighlightId === h.id ? null : h.id)}
                                            />
                                            <CommentThread
                                                parentType="highlight" parentId={h.id}
                                                open={openCommentHighlightId === h.id}
                                                onOpenChange={v => setOpenCommentHighlightId(v ? h.id : null)}
                                                highlightCommentId={openCommentHighlightId === h.id ? (deepLinkCommentId ?? undefined) : undefined}
                                                onHighlightHandled={() => setDeepLinkCommentId(null)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            }
                        </>
                    )}
                </div>
            </div>

            {/* Tablet quick-entry overlay */}
            {quickEntryOpen && evening && !evening.is_closed && (
                <TabletQuickEntryPage
                    eveningId={evening.id}
                    players={evening.players}
                    onClose={() => setQuickEntryOpen(false)}
                />
            )}
        </div>
    )
}
