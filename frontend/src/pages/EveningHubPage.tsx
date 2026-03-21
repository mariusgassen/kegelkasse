/**
 * Evening hub — sub-tab wrapper for Protokoll | Spiele.
 * Evening configuration is accessed separately via the AKTIV header button.
 */
import {useState} from 'react'
import {useT} from '@/i18n'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {useHashTab} from '@/hooks/usePage.ts'
import {api} from '@/api/client.ts'
import {toastError} from '@/utils/error.ts'
import {Empty} from '@/components/ui/Empty.tsx'
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
    const [addingHighlight, setAddingHighlight] = useState(false)

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

    return (
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column'}}>
            {/* Sub-tab strip + end button */}
            <div className="flex items-center gap-1 px-2 pt-2 pb-1.5 flex-shrink-0"
                 style={{background: 'var(--kce-bg)', borderBottom: '1px solid var(--kce-border)'}}>
                {TABS.map(tb => (
                    <button key={tb.id} type="button"
                            className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${subTab === tb.id ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                            onClick={() => setSubTab(tb.id)}>
                        {tb.label}
                    </button>
                ))}
            </div>

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
                <div style={{position: 'absolute', inset: 0, display: subTab === 'highlights' ? 'block' : 'none', overflowY: 'auto'}}
                     className="px-3 py-3 pb-24">
                    {evening && (
                        <>
                            {evening.highlights.length === 0
                                ? <Empty icon="✨" text={t('highlight.none')}/>
                                : <div className="flex flex-col gap-1.5 mb-2">
                                    {evening.highlights.map(h => (
                                        <div key={h.id} className="kce-card p-3 flex items-start gap-2">
                                            <span className="text-base flex-shrink-0">✨</span>
                                            <div className="flex-1 text-sm">{h.text}</div>
                                            {!evening.is_closed && (
                                                <button className="btn-danger btn-xs flex-shrink-0" onClick={async () => {
                                                    try {
                                                        await api.deleteHighlight(evening.id, h.id)
                                                        invalidate()
                                                    } catch (e) { toastError(e) }
                                                }}>✕</button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            }
                            {!evening.is_closed && (
                                <div className="flex gap-2">
                                    <input
                                        className="kce-input flex-1"
                                        value={highlightText}
                                        onChange={e => setHighlightText(e.target.value)}
                                        placeholder={t('highlight.placeholder')}
                                        onKeyDown={async e => {
                                            if (e.key === 'Enter' && highlightText.trim()) {
                                                e.preventDefault()
                                                setAddingHighlight(true)
                                                try {
                                                    await api.addHighlight(evening.id, {text: highlightText.trim()})
                                                    setHighlightText('')
                                                    invalidate()
                                                } catch (err) { toastError(err) } finally { setAddingHighlight(false) }
                                            }
                                        }}
                                    />
                                    <button className="btn-primary btn-sm flex-shrink-0"
                                            disabled={!highlightText.trim() || addingHighlight}
                                            onClick={async () => {
                                                if (!highlightText.trim()) return
                                                setAddingHighlight(true)
                                                try {
                                                    await api.addHighlight(evening.id, {text: highlightText.trim()})
                                                    setHighlightText('')
                                                    invalidate()
                                                } catch (err) { toastError(err) } finally { setAddingHighlight(false) }
                                            }}>+</button>
                                </div>
                            )}

                            {/* End / reopen evening */}
                            <div className="mt-4 pt-4 border-t border-kce-surface2 flex flex-col gap-2">
                                {!evening.is_closed ? (
                                    <>
                                        {!closeConfirm ? (
                                            <button className="btn-danger w-full"
                                                    onClick={() => setCloseConfirm(true)}>
                                                {t('evening.end')}
                                            </button>
                                        ) : (
                                            <>
                                                <p className="text-xs text-kce-muted text-center">{t('evening.endConfirm')}</p>
                                                <div className="flex gap-2">
                                                    <button className="btn-secondary flex-1"
                                                            onClick={() => setCloseConfirm(false)}>
                                                        {t('action.cancel')}
                                                    </button>
                                                    <button className="btn-danger flex-1" onClick={async () => {
                                                        try {
                                                            await api.updateEvening(evening.id, {is_closed: true})
                                                            setCloseConfirm(false)
                                                            invalidate()
                                                            qc.invalidateQueries({queryKey: ['evenings']})
                                                        } catch (e: unknown) { toastError(e) }
                                                    }}>{t('action.done')}</button>
                                                </div>
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex gap-2">
                                        <button className="btn-secondary flex-1" onClick={async () => {
                                            try {
                                                await api.updateEvening(evening.id, {is_closed: false})
                                                invalidate()
                                            } catch (e: unknown) { toastError(e) }
                                        }}>{t('evening.reopen')}</button>
                                        {onHistory && (
                                            <button className="btn-secondary flex-1"
                                                    onClick={onHistory}>
                                                📚 {t('evening.toHistory')}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
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
