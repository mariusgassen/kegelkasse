import {useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useEveningList} from '@/hooks/useEvening.ts'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

export function HistoryPage({onNavigate}: { onNavigate?: () => void } = {}) {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const setActiveEveningId = useAppStore(s => s.setActiveEveningId)
    const {data: evenings, isLoading} = useEveningList()

    const [expandedId, setExpandedId] = useState<number | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
    const [backlogSheet, setBacklogSheet] = useState(false)
    const [backlogDate, setBacklogDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [backlogVenue, setBacklogVenue] = useState('')
    const [saving, setSaving] = useState(false)

    // Fetch expanded evening detail
    const {data: expandedEvening} = useQuery({
        queryKey: ['evening', expandedId],
        queryFn: () => expandedId ? api.getEvening(expandedId) : null,
        enabled: !!expandedId,
        staleTime: 1000 * 60,
    })

    const closed = (evenings ?? []).filter(e => e.is_closed)
        .sort((a, b) => b.date.localeCompare(a.date))

    async function doReopen(id: number) {
        try {
            await api.updateEvening(id, {is_closed: false})
            // Optimistically mark as open so the auto-clear effect in useActiveEvening doesn't fire
            qc.setQueryData(['evening', id], (old: any) => old ? {...old, is_closed: false} : old)
            setActiveEveningId(id)
            qc.invalidateQueries({queryKey: ['evenings']})
            qc.invalidateQueries({queryKey: ['evening', id]})
            showToast(t('evening.reopen'))
            onNavigate?.()
        } catch (e: unknown) {
            toastError(e)
        }
    }

    async function doDelete(id: number) {
        try {
            await api.deleteEvening(id)
            qc.invalidateQueries({queryKey: ['evenings']})
            setConfirmDeleteId(null)
            if (expandedId === id) setExpandedId(null)
        } catch (e: unknown) {
            toastError(e)
        }
    }

    async function submitBacklog() {
        setSaving(true)
        try {
            const ev = await api.createEvening({
                date: backlogDate,
                venue: backlogVenue || undefined,
            })
            setActiveEveningId(ev.id)
            qc.invalidateQueries({queryKey: ['evenings']})
            setBacklogSheet(false)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="page-scroll px-3 py-3 pb-24">
            <div className="sec-heading">📚 {t('history.title')}</div>

            {isAdmin(user) && (
                <button className="btn-secondary w-full mb-4 text-sm"
                        onClick={() => {
                            setBacklogDate(new Date().toISOString().slice(0, 10))
                            setBacklogVenue('')
                            setBacklogSheet(true)
                        }}>
                    {t('history.backlog')}
                </button>
            )}

            {isLoading
                ? <p className="text-kce-muted text-sm text-center py-4">{t('action.loading')}</p>
                : closed.length === 0
                    ? <Empty icon="📚" text={t('history.none')}/>
                    : closed.map(ev => {
                        const isExpanded = expandedId === ev.id
                        const detail = isExpanded ? expandedEvening : null
                        const dateStr = new Date(ev.date).toLocaleDateString('de-DE', {
                            day: '2-digit', month: '2-digit', year: 'numeric'
                        })
                        return (
                            <div key={ev.id} className="kce-card mb-2 overflow-hidden">
                                {/* Header row */}
                                <button className="w-full p-3 flex items-center gap-3 text-left"
                                        onClick={() => setExpandedId(isExpanded ? null : ev.id)}>
                                    <span className="text-lg">📅</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold">{dateStr}</div>
                                        <div className="text-xs text-kce-muted">
                                            {ev.venue ?? '–'} · {ev.player_count} {t('history.players')}
                                        </div>
                                    </div>
                                    <span className="text-kce-muted text-xs">{isExpanded ? '▲' : '▼'}</span>
                                </button>

                                {/* Expanded detail */}
                                {isExpanded && (
                                    <div className="border-t border-kce-border px-3 pb-3 pt-2">
                                        {detail ? (
                                            <>
                                                {/* Summary stats */}
                                                <div className="flex gap-4 mb-3 text-sm">
                                                    <div>
                                                        <div
                                                            className="text-xs text-kce-muted">{t('history.players')}</div>
                                                        <div className="font-bold">{detail.players.length}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-kce-muted">{t('nav.games')}</div>
                                                        <div
                                                            className="font-bold">{detail.games.filter(g => g.status === 'finished').length}</div>
                                                    </div>
                                                    <div>
                                                        <div
                                                            className="text-xs text-kce-muted">{t('history.total')}</div>
                                                        <div className="font-bold text-kce-amber">
                                                            {fe(detail.penalty_log.reduce((s, l) => s + (l.mode === 'euro' ? l.amount : 0), 0))}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Players */}
                                                {detail.players.length > 0 && (
                                                    <div className="mb-3">
                                                        <div
                                                            className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-1.5">
                                                            👤 {t('history.players')}
                                                        </div>
                                                        <div className="flex flex-wrap gap-1">
                                                            {detail.players.map(p => (
                                                                <span key={p.id}
                                                                      className="text-[11px] px-2 py-0.5 rounded-full bg-kce-surface2 text-kce-cream">
                                                                    {p.is_king ? '👑 ' : ''}{p.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Games */}
                                                {detail.games.filter(g => g.status === 'finished').length > 0 && (
                                                    <div className="mb-3">
                                                        <div
                                                            className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-1.5">
                                                            🏆 {t('nav.games')}
                                                        </div>
                                                        {detail.games.filter(g => g.status === 'finished').map(g => (
                                                            <div key={g.id}
                                                                 className="flex items-center justify-between py-1 border-b border-kce-surface2 last:border-0">
                                                                <span
                                                                    className="text-xs text-kce-cream">{g.is_opener ? '👑 ' : ''}{g.name}</span>
                                                                <span
                                                                    className="text-xs text-kce-muted">{g.winner_name ?? '–'}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Penalties per player */}
                                                {detail.penalty_log.length > 0 && (() => {
                                                    const totals = new Map<string, { name: string; amount: number }>()
                                                    for (const l of detail.penalty_log) {
                                                        const key = l.player_name
                                                        const cur = totals.get(key) ?? {name: l.player_name, amount: 0}
                                                        totals.set(key, {
                                                            ...cur,
                                                            amount: cur.amount + (l.mode === 'euro' ? l.amount : 0)
                                                        })
                                                    }
                                                    const sorted = [...totals.values()].sort((a, b) => b.amount - a.amount)
                                                    return (
                                                        <div className="mb-3">
                                                            <div
                                                                className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-1.5">
                                                                ⚠️ {t('penalty.title')}
                                                            </div>
                                                            {sorted.map(({name, amount}) => (
                                                                <div key={name}
                                                                     className="flex items-center justify-between py-0.5">
                                                                    <span
                                                                        className="text-xs text-kce-cream">{name}</span>
                                                                    <span
                                                                        className="text-xs text-red-400 font-bold">{fe(amount)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )
                                                })()}

                                                {/* Drinks */}
                                                {detail.drink_rounds.length > 0 && (
                                                    <div className="mb-3">
                                                        <div
                                                            className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-1">
                                                            🍺 {t('drinks.title')}
                                                        </div>
                                                        <div className="text-xs text-kce-muted">
                                                            {detail.drink_rounds.filter(r => r.drink_type === 'beer').length}× {t('drinks.beer')}
                                                            {detail.drink_rounds.filter(r => r.drink_type === 'shots').length > 0 && (
                                                                <> · {detail.drink_rounds.filter(r => r.drink_type === 'shots').length}× {t('drinks.shots')}</>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Admin actions */}
                                                {isAdmin(user) && (
                                                    <div className="flex gap-2 mt-3 pt-3 border-t border-kce-surface2">
                                                        <button className="btn-secondary btn-sm flex-1"
                                                                onClick={() => doReopen(ev.id)}>
                                                            ↩ {t('history.reopen')}
                                                        </button>
                                                        {confirmDeleteId === ev.id ? (
                                                            <div className="flex gap-1 flex-1">
                                                                <button className="btn-danger btn-sm flex-1"
                                                                        onClick={() => doDelete(ev.id)}>✓ {t('action.delete')}</button>
                                                                <button className="btn-secondary btn-sm"
                                                                        onClick={() => setConfirmDeleteId(null)}>✕
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button className="btn-danger btn-sm flex-1"
                                                                    onClick={() => setConfirmDeleteId(ev.id)}>
                                                                🗑 {t('action.delete')}
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <p className="text-xs text-kce-muted py-2">{t('action.loading')}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })
            }

            {/* Backlog sheet */}
            <Sheet open={backlogSheet} onClose={() => setBacklogSheet(false)}
                   title={t('history.backlog')} onSubmit={submitBacklog}>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="field-label">{t('evening.date')}</label>
                        <input className="kce-input" type="date" value={backlogDate}
                               onChange={e => setBacklogDate(e.target.value)}/>
                    </div>
                    <div>
                        <label className="field-label">{t('evening.venue')}</label>
                        <input className="kce-input" value={backlogVenue}
                               onChange={e => setBacklogVenue(e.target.value)}
                               placeholder={t('evening.venuePlaceholder')}/>
                    </div>
                    <div className="flex gap-2 mt-1">
                        <button type="button" className="btn-secondary flex-1"
                                onClick={() => setBacklogSheet(false)}>{t('action.cancel')}</button>
                        <button type="submit" className="btn-primary flex-[2]"
                                disabled={saving || !backlogDate}>{t('evening.startButton')}</button>
                    </div>
                </div>
            </Sheet>
        </div>
    )
}
