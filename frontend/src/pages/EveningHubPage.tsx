/**
 * Evening hub — sub-tab wrapper for Protokoll | Spiele | Highlights | Verwalten.
 * "Verwalten" (players/teams/close) is a sub-tab like the others so the tab
 * strip and hub context never disappear — the AKTIV header button and other
 * shortcuts deep-link here via the #evening:manage hash instead of routing
 * to a separate top-level page.
 */
import {useEffect, useState} from 'react'
import {useT} from '@/i18n'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {useHashTab} from '@/hooks/usePage.ts'
import {useDeepLinkVersion, flashDeepLinkTarget} from '@/hooks/useDeepLink.ts'
import {api} from '@/api/client.ts'
import {toastError} from '@/utils/error.ts'
import {getHashParams, clearHashParams} from '@/utils/hashParams.ts'
import {Empty} from '@/components/ui/Empty.tsx'
import {CommentThread} from '@/components/ui/CommentThread.tsx'
import {ItemReactionBar} from '@/components/ui/ItemReactionBar.tsx'
import {MediaUploadButton} from '@/components/ui/MediaUploadButton.tsx'
import {ProtocolPage} from './ProtocolPage'
import {GamesPage} from './GamesPage'
import {EveningPage} from './EveningPage'
import {TabletQuickEntryPage} from './TabletQuickEntryPage'
import {LiveEveningView} from '@/components/evening/LiveEveningView.tsx'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {useCloseReopenEvening} from '@/hooks/useCloseReopenEvening.ts'

type SubTab = 'live' | 'penalties' | 'games' | 'highlights' | 'manage'

export function EveningHubPage() {
    const t = useT()
    const {evening, invalidate, activeEveningId} = useActiveEvening()
    const [subTab, setSubTab] = useHashTab<SubTab>('live', ['live', 'penalties', 'games', 'highlights', 'manage'])
    const {closeConfirm, setCloseConfirm, closing, closeEndedAt, setCloseEndedAt, openCloseConfirm, confirmClose, reopen} =
        useCloseReopenEvening(evening?.id, invalidate)
    const [quickEntryOpen, setQuickEntryOpen] = useState(false)
    const [highlightText, setHighlightText] = useState('')
    const [highlightMediaUrl, setHighlightMediaUrl] = useState<string | null>(null)
    const [addingHighlight, setAddingHighlight] = useState(false)
    const [openCommentHighlightId, setOpenCommentHighlightId] = useState<number | null>(null)

    // Deep link state for highlight items
    const [deepLinkItemId, setDeepLinkItemId] = useState<number | null>(null)
    const [deepLinkCommentId, setDeepLinkCommentId] = useState<number | null>(null)
    const hashVersion = useDeepLinkVersion()

    // Parse deep-link params (on mount and on router-search changes)
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

        setDeepLinkItemId(null)
        // Note: deepLinkCommentId is NOT cleared here — CommentThread calls onHighlightHandled() once it flashes

        return flashDeepLinkTarget(`item-${target.id}`)
    }, [deepLinkItemId, subTab, evening]) // eslint-disable-line react-hooks/exhaustive-deps

    // No active evening — EveningPage owns the full start-evening flow
    if (!activeEveningId) {
        return <EveningPage/>
    }

    const isClosed = evening?.is_closed ?? false

    // The Live cockpit is only meaningful for a running evening; a closed evening falls back to
    // the protocol as before.
    const TABS: { id: SubTab; label: string }[] = [
        ...(!isClosed ? [{id: 'live' as const, label: `🔴 ${t('live.tab')}`}] : []),
        {id: 'penalties', label: `📋 ${t('evening.tab.log')}`},
        {id: 'games', label: `🏆 ${t('nav.games')}`},
        {id: 'highlights', label: `✨ ${t('evening.tab.highlights')}`},
        {id: 'manage', label: t('evening.manage')},
    ]

    // When the evening is closed the Live tab is gone; render the protocol instead of a blank pane.
    const effectiveTab: SubTab = subTab === 'live' && isClosed ? 'penalties' : subTab

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
            <div className="flex items-center gap-1 px-2 pt-2 pb-1.5 flex-shrink-0 overflow-x-auto"
                 style={{background: 'var(--kce-bg)', borderBottom: '1px solid var(--kce-border)'}}>
                {TABS.map(tb => (
                    <button key={tb.id} type="button"
                            className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${effectiveTab === tb.id ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                            onClick={() => setSubTab(tb.id)}>
                        {tb.label}
                    </button>
                ))}

                {/* End / reopen evening — always accessible in the tab bar */}
                {!isClosed ? (
                    <button
                        className="btn-secondary btn-xs flex-shrink-0 ml-1"
                        onClick={() => openCloseConfirm(evening?.ended_at)}>
                        {t('evening.end')}
                    </button>
                ) : (
                    <button
                        className="btn-secondary btn-xs flex-shrink-0 ml-1"
                        disabled={closing}
                        onClick={reopen}>
                        {t('evening.reopen')}
                    </button>
                )}
            </div>

            {/* Close-confirm sheet */}
            {closeConfirm && (
                <Sheet
                    open
                    title={t('evening.end')}
                    onClose={() => setCloseConfirm(false)}
                >
                    <p className="text-sm text-kce-muted mb-4">{t('evening.endConfirm')}</p>
                    <div className="mb-4">
                        <label className="field-label">{t('evening.endedAt')}</label>
                        <input type="datetime-local" className="kce-input" value={closeEndedAt}
                               onChange={e => setCloseEndedAt(e.target.value)}/>
                        <p className="text-xs text-kce-muted mt-1">{t('evening.endedAtHint')}</p>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" className="btn-secondary btn-sm flex-1" disabled={closing}
                                onClick={() => setCloseConfirm(false)}>
                            {t('action.cancel')}
                        </button>
                        <button type="button" className="btn-primary btn-sm flex-1" disabled={closing}
                                onClick={confirmClose}>
                            {t('action.done')}
                        </button>
                    </div>
                </Sheet>
            )}

            {/* Sub-pages — always mounted, toggled via display */}
            <div style={{flex: 1, overflow: 'hidden', position: 'relative'}}>
                {/* Live cockpit is stateless (pure derivation over the evening), so it is mounted
                    only while its tab is active rather than kept hidden like the stateful panes. */}
                {!isClosed && effectiveTab === 'live' && evening && (
                    <div style={{position: 'absolute', inset: 0, overflowY: 'auto'}}>
                        <LiveEveningView
                            evening={evening}
                            onQuickEntry={(evening.players.length ?? 0) > 0 ? () => setQuickEntryOpen(true) : undefined}
                            onGoHighlights={() => setSubTab('highlights')}
                            onGoGames={() => setSubTab('games')}
                        />
                    </div>
                )}
                <div style={{position: 'absolute', inset: 0, display: effectiveTab === 'penalties' ? 'block' : 'none'}}>
                    <ProtocolPage
                        onQuickEntry={!isClosed && (evening?.players.length ?? 0) > 0
                            ? () => setQuickEntryOpen(true)
                            : undefined}
                    />
                </div>
                <div style={{position: 'absolute', inset: 0, display: effectiveTab === 'games' ? 'block' : 'none'}}>
                    <GamesPage/>
                </div>
                <div style={{position: 'absolute', inset: 0, display: effectiveTab === 'manage' ? 'block' : 'none'}}>
                    <EveningPage/>
                </div>

                {/* Highlights tab */}
                <div style={{position: 'absolute', inset: 0, display: effectiveTab === 'highlights' ? 'block' : 'none', overflowY: 'auto'}}
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
