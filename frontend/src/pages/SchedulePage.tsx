import {useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {useEveningList} from '@/hooks/useEvening.ts'
import {RsvpEntry, RsvpStatus, ScheduledEvening} from '@/types.ts'

const TODAY = new Date().toISOString().slice(0, 10)

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function formatDate(date: string): string {
    return new Date(date + 'T00:00:00').toLocaleDateString('de-DE', {
        weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    })
}

function formatDateShort(date: string): string {
    return new Date(date + 'T00:00:00').toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
    })
}

// ── RSVP Buttons ──
function RsvpButtons({se, onUpdate}: { se: ScheduledEvening; onUpdate: () => void }) {
    const t = useT()
    const [busy, setBusy] = useState(false)

    async function set(status: RsvpStatus) {
        setBusy(true)
        try {
            await api.setRsvp(se.id, status)
            onUpdate()
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    async function remove() {
        setBusy(true)
        try {
            await api.removeRsvp(se.id)
            onUpdate()
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    const current = se.my_rsvp
    return (
        <div className="flex gap-2 mt-2">
            <button
                disabled={busy}
                onClick={() => current === 'attending' ? remove() : set('attending')}
                className="flex-1 text-xs py-1.5 px-2 rounded-lg font-semibold transition-all"
                style={{
                    background: current === 'attending' ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.07)',
                    color: current === 'attending' ? '#4ade80' : 'var(--kce-muted)',
                    border: current === 'attending' ? '1px solid rgba(74,222,128,0.4)' : '1px solid transparent',
                }}>
                {t('rsvp.attending.short')}
            </button>
            <button
                disabled={busy}
                onClick={() => current === 'absent' ? remove() : set('absent')}
                className="flex-1 text-xs py-1.5 px-2 rounded-lg font-semibold transition-all"
                style={{
                    background: current === 'absent' ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.07)',
                    color: current === 'absent' ? '#f87171' : 'var(--kce-muted)',
                    border: current === 'absent' ? '1px solid rgba(248,113,113,0.4)' : '1px solid transparent',
                }}>
                {t('rsvp.absent.short')}
            </button>
        </div>
    )
}

// ── RSVP Detail Sheet (admin) ──
function RsvpSheet({se, onClose}: { se: ScheduledEvening; onClose: () => void }) {
    const t = useT()
    const qc = useQueryClient()
    const {data: rsvps, isLoading} = useQuery<RsvpEntry[]>({
        queryKey: ['rsvps', se.id],
        queryFn: () => api.listRsvps(se.id),
        staleTime: 10000,
    })
    const [sendingReminder, setSendingReminder] = useState(false)

    async function handleRemind() {
        setSendingReminder(true)
        try {
            const res = await api.sendReminder(se.id)
            showToast(`${t('schedule.reminded')} (${res.reminded_count})`)
        } catch (e) {
            toastError(e)
        } finally {
            setSendingReminder(false)
        }
    }

    async function handleSetRsvpForMember(mid: number, status: RsvpStatus) {
        try {
            await api.setRsvpForMember(se.id, mid, status)
            qc.invalidateQueries({queryKey: ['rsvps', se.id]})
            qc.invalidateQueries({queryKey: ['schedule']})
        } catch (e) {
            toastError(e)
        }
    }

    const attending = rsvps?.filter(r => r.status === 'attending') ?? []
    const absent = rsvps?.filter(r => r.status === 'absent') ?? []
    const noResponse = rsvps?.filter(r => r.status === null) ?? []

    return (
        <Sheet open onClose={onClose} title={`${t('schedule.rsvpTitle')} · ${formatDate(se.date)}`}>
            <div className="space-y-4">
                {isLoading && <p className="text-kce-muted text-sm text-center py-4">{t('action.loading')}</p>}
                {!isLoading && rsvps && (
                    <>
                        {attending.length > 0 && (
                            <div>
                                <div className="text-xs font-semibold text-kce-muted mb-2 uppercase tracking-wider">
                                    ✅ {t('schedule.attending')} ({attending.length})
                                </div>
                                <div className="space-y-1">
                                    {attending.map(r => (
                                        <div key={r.regular_member_id}
                                             className="flex items-center justify-between text-sm px-3 py-2 rounded-lg"
                                             style={{background: 'rgba(74,222,128,0.08)'}}>
                                            <span className="text-kce-cream">
                                                {r.name}{r.nickname ? ` · ${r.nickname}` : ''}
                                            </span>
                                            <button className="text-xs text-kce-muted active:opacity-60"
                                                    onClick={() => handleSetRsvpForMember(r.regular_member_id, 'absent')}>
                                                → {t('rsvp.absent.short')}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {absent.length > 0 && (
                            <div>
                                <div className="text-xs font-semibold text-kce-muted mb-2 uppercase tracking-wider">
                                    ❌ {t('schedule.absent')} ({absent.length})
                                </div>
                                <div className="space-y-1">
                                    {absent.map(r => (
                                        <div key={r.regular_member_id}
                                             className="flex items-center justify-between text-sm px-3 py-2 rounded-lg"
                                             style={{background: 'rgba(248,113,113,0.08)'}}>
                                            <span className="text-kce-cream">
                                                {r.name}{r.nickname ? ` · ${r.nickname}` : ''}
                                            </span>
                                            <button className="text-xs text-kce-muted active:opacity-60"
                                                    onClick={() => handleSetRsvpForMember(r.regular_member_id, 'attending')}>
                                                → {t('rsvp.attending.short')}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {noResponse.length > 0 && (
                            <div>
                                <div className="text-xs font-semibold text-kce-muted mb-2 uppercase tracking-wider">
                                    ⏳ {t('schedule.noResponse')} ({noResponse.length})
                                </div>
                                <div className="space-y-1">
                                    {noResponse.map(r => (
                                        <div key={r.regular_member_id}
                                             className="flex items-center justify-between text-sm px-3 py-2 rounded-lg"
                                             style={{background: 'rgba(255,255,255,0.04)'}}>
                                            <span className="text-kce-muted">
                                                {r.name}{r.nickname ? ` · ${r.nickname}` : ''}
                                            </span>
                                            <div className="flex gap-2">
                                                <button className="text-xs text-kce-muted active:opacity-60"
                                                        onClick={() => handleSetRsvpForMember(r.regular_member_id, 'attending')}>
                                                    {t('rsvp.attending.short')}
                                                </button>
                                                <button className="text-xs text-kce-muted active:opacity-60"
                                                        onClick={() => handleSetRsvpForMember(r.regular_member_id, 'absent')}>
                                                    {t('rsvp.absent.short')}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {noResponse.length > 0 && (
                            <button className="w-full btn-secondary text-sm" disabled={sendingReminder}
                                    onClick={handleRemind}>
                                {sendingReminder ? t('action.loading') : t('schedule.remind')}
                            </button>
                        )}
                    </>
                )}
            </div>
        </Sheet>
    )
}

// ── Scheduled Evening Card (upcoming) ──
function UpcomingCard({
    se, onEdit, onDelete, onViewRsvps, onRsvpUpdate, isAdminUser,
}: {
    se: ScheduledEvening
    onEdit: () => void
    onDelete: () => void
    onViewRsvps: () => void
    onRsvpUpdate: () => void
    isAdminUser: boolean
}) {
    const t = useT()
    return (
        <div className="rounded-xl p-3"
             style={{background: 'var(--kce-surface)', border: '1px solid var(--kce-border)'}}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-kce-cream text-sm leading-tight">
                        📅 {formatDate(se.date)}
                    </div>
                    {se.venue && <div className="text-xs text-kce-muted mt-0.5 truncate">🏠 {se.venue}</div>}
                    {se.note && <div className="text-xs text-kce-muted mt-0.5 truncate italic">{se.note}</div>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {se.attending_count > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                              style={{background: 'rgba(74,222,128,0.15)', color: '#4ade80'}}>
                            ✅ {se.attending_count}
                        </span>
                    )}
                    {se.absent_count > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                              style={{background: 'rgba(248,113,113,0.15)', color: '#f87171'}}>
                            ❌ {se.absent_count}
                        </span>
                    )}
                    {isAdminUser && (
                        <div className="flex gap-1">
                            <button className="w-7 h-7 flex items-center justify-center rounded-full text-kce-muted active:opacity-60 text-xs"
                                    style={{background: 'rgba(255,255,255,0.07)'}}
                                    onClick={onViewRsvps}>👥</button>
                            <button className="w-7 h-7 flex items-center justify-center rounded-full text-kce-muted active:opacity-60 text-xs"
                                    style={{background: 'rgba(255,255,255,0.07)'}}
                                    onClick={onEdit}>✏️</button>
                            <button className="w-7 h-7 flex items-center justify-center rounded-full active:opacity-60 text-xs"
                                    style={{background: 'rgba(239,68,68,0.15)', color: '#ef4444'}}
                                    onClick={onDelete}>✕</button>
                        </div>
                    )}
                </div>
            </div>
            <RsvpButtons se={se} onUpdate={onRsvpUpdate}/>
        </div>
    )
}

// ── Schedule Edit/Create Sheet ──
function ScheduleEditSheet({initial, onClose, onSaved}: {
    initial?: ScheduledEvening
    onClose: () => void
    onSaved: () => void
}) {
    const t = useT()
    const [date, setDate] = useState(initial?.date ?? TODAY)
    const [venue, setVenue] = useState(initial?.venue ?? '')
    const [note, setNote] = useState(initial?.note ?? '')
    const [saving, setSaving] = useState(false)

    async function handleSubmit() {
        if (!date) return
        setSaving(true)
        try {
            if (initial) {
                await api.updateScheduledEvening(initial.id, {date, venue: venue || undefined, note: note || undefined})
            } else {
                await api.createScheduledEvening({date, venue: venue || undefined, note: note || undefined})
            }
            onSaved()
            onClose()
        } catch (e) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Sheet open onClose={onClose} title={initial ? t('schedule.edit') : t('schedule.new')} onSubmit={handleSubmit}>
            <div className="space-y-3">
                <div>
                    <label className="label">{t('schedule.date')}</label>
                    <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} required/>
                </div>
                <div>
                    <label className="label">{t('schedule.venue')}</label>
                    <input type="text" className="input" placeholder={t('evening.venuePlaceholder')}
                           value={venue} onChange={e => setVenue(e.target.value)}/>
                </div>
                <div>
                    <label className="label">{t('schedule.note')}</label>
                    <input type="text" className="input" placeholder={t('common.optional')}
                           value={note} onChange={e => setNote(e.target.value)}/>
                </div>
                <button type="submit" className="btn-primary w-full" disabled={saving || !date}>
                    {saving ? t('action.saving') : t('action.save')}
                </button>
            </div>
        </Sheet>
    )
}

// ── History Section (closed actual evenings) ──
function HistorySection({onNavigate}: { onNavigate?: () => void }) {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const setActiveEveningId = useAppStore(s => s.setActiveEveningId)
    const {data: evenings, isLoading} = useEveningList()

    const [search, setSearch] = useState('')
    const [expandedId, setExpandedId] = useState<number | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
    const [backlogSheet, setBacklogSheet] = useState(false)
    const [backlogDate, setBacklogDate] = useState(() => TODAY)
    const [backlogVenue, setBacklogVenue] = useState('')
    const [saving, setSaving] = useState(false)

    const {data: expandedEvening} = useQuery({
        queryKey: ['evening', expandedId],
        queryFn: () => expandedId ? api.getEvening(expandedId) : null,
        enabled: !!expandedId,
        staleTime: 1000 * 60,
    })

    const q = search.trim().toLowerCase()
    const closed = (evenings ?? [])
        .filter(e => e.is_closed)
        .sort((a, b) => b.date.localeCompare(a.date))
        .filter(e => !q || e.date.includes(q) || (e.venue ?? '').toLowerCase().includes(q))

    async function doReopen(id: number) {
        try {
            await api.updateEvening(id, {is_closed: false})
            qc.setQueryData(['evening', id], (old: any) => old ? {...old, is_closed: false} : old)
            setActiveEveningId(id)
            qc.invalidateQueries({queryKey: ['evenings']})
            qc.invalidateQueries({queryKey: ['evening', id]})
            showToast(t('evening.reopen'))
            onNavigate?.()
        } catch (e) {
            toastError(e)
        }
    }

    async function doDelete(id: number) {
        try {
            await api.deleteEvening(id)
            qc.invalidateQueries({queryKey: ['evenings']})
            setConfirmDeleteId(null)
            if (expandedId === id) setExpandedId(null)
        } catch (e) {
            toastError(e)
        }
    }

    async function submitBacklog() {
        setSaving(true)
        try {
            const ev = await api.createEvening({date: backlogDate, venue: backlogVenue || undefined})
            setActiveEveningId(ev.id)
            qc.invalidateQueries({queryKey: ['evenings']})
            setBacklogSheet(false)
        } catch (e) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    return (
        <>
            <div className="flex items-center justify-between mt-6 mb-3">
                <div className="text-xs font-semibold text-kce-muted uppercase tracking-wider">
                    📚 {t('history.title')}
                </div>
                {isAdmin(user) && (
                    <button className="text-xs text-kce-muted active:opacity-60 font-semibold"
                            onClick={() => {
                                setBacklogDate(TODAY)
                                setBacklogVenue('')
                                setBacklogSheet(true)
                            }}>
                        {t('history.backlog')}
                    </button>
                )}
            </div>

            <input className="kce-input mb-3" value={search} onChange={e => setSearch(e.target.value)}
                   placeholder={t('history.search')}/>

            {isLoading
                ? <p className="text-kce-muted text-sm text-center py-4">{t('action.loading')}</p>
                : closed.length === 0
                    ? <p className="text-kce-muted text-sm text-center py-4">{t('history.none')}</p>
                    : closed.map(ev => {
                        const isExpanded = expandedId === ev.id
                        const detail = isExpanded ? expandedEvening : null
                        return (
                            <div key={ev.id} className="kce-card mb-2 overflow-hidden">
                                <button className="w-full p-3 flex items-center gap-3 text-left"
                                        onClick={() => setExpandedId(isExpanded ? null : ev.id)}>
                                    <span className="text-lg">📅</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold">{formatDateShort(ev.date)}</div>
                                        <div className="text-xs text-kce-muted">
                                            {ev.venue ?? '–'} · {ev.player_count} {t('history.players')}
                                        </div>
                                    </div>
                                    <span className="text-kce-muted text-xs">{isExpanded ? '▲' : '▼'}</span>
                                </button>
                                {isExpanded && (
                                    <div className="border-t border-kce-border px-3 pb-3 pt-2">
                                        {detail ? (
                                            <>
                                                <div className="flex gap-4 mb-3 text-sm">
                                                    <div>
                                                        <div className="text-xs text-kce-muted">{t('history.players')}</div>
                                                        <div className="font-bold">{detail.players.length}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-kce-muted">{t('nav.games')}</div>
                                                        <div className="font-bold">{detail.games.filter(g => g.status === 'finished').length}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-kce-muted">{t('history.total')}</div>
                                                        <div className="font-bold text-kce-amber">
                                                            {fe(detail.penalty_log.reduce((s, l) => s + (l.mode === 'euro' ? l.amount : 0), 0))}
                                                        </div>
                                                    </div>
                                                </div>
                                                {detail.players.length > 0 && (
                                                    <div className="mb-3">
                                                        <div className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-1.5">
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
                                                {detail.games.filter(g => g.status === 'finished').length > 0 && (
                                                    <div className="mb-3">
                                                        <div className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-1.5">
                                                            🏆 {t('nav.games')}
                                                        </div>
                                                        {detail.games.filter(g => g.status === 'finished').map(g => (
                                                            <div key={g.id}
                                                                 className="flex items-center justify-between py-1 border-b border-kce-surface2 last:border-0">
                                                                <span className="text-xs text-kce-cream">{g.is_opener ? '👑 ' : ''}{g.name}</span>
                                                                <span className="text-xs text-kce-muted">{g.winner_name ?? '–'}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {detail.penalty_log.length > 0 && (() => {
                                                    const totals = new Map<string, { name: string; amount: number }>()
                                                    for (const l of detail.penalty_log) {
                                                        const cur = totals.get(l.player_name) ?? {name: l.player_name, amount: 0}
                                                        totals.set(l.player_name, {...cur, amount: cur.amount + (l.mode === 'euro' ? l.amount : 0)})
                                                    }
                                                    const sorted = [...totals.values()].sort((a, b) => b.amount - a.amount)
                                                    return (
                                                        <div className="mb-3">
                                                            <div className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-1.5">
                                                                ⚠️ {t('penalty.title')}
                                                            </div>
                                                            {sorted.map(({name, amount}) => (
                                                                <div key={name} className="flex items-center justify-between py-0.5">
                                                                    <span className="text-xs text-kce-cream">{name}</span>
                                                                    <span className="text-xs text-red-400 font-bold">{fe(amount)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )
                                                })()}
                                                {detail.drink_rounds.length > 0 && (
                                                    <div className="mb-3">
                                                        <div className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-1">
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
                                                                        onClick={() => setConfirmDeleteId(null)}>✕</button>
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
        </>
    )
}

// ── Main Page ──
export function SchedulePage({onNavigate}: { onNavigate?: () => void } = {}) {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const isAdminUser = isAdmin(user)

    const {data: schedules, isLoading: schedulesLoading} = useQuery<ScheduledEvening[]>({
        queryKey: ['schedule'],
        queryFn: api.listScheduledEvenings,
        staleTime: 30000,
    })

    const [editSheet, setEditSheet] = useState<ScheduledEvening | null | 'new'>(null)
    const [rsvpSheet, setRsvpSheet] = useState<ScheduledEvening | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

    async function handleDelete(id: number) {
        try {
            await api.deleteScheduledEvening(id)
            qc.invalidateQueries({queryKey: ['schedule']})
            setConfirmDeleteId(null)
        } catch (e) {
            toastError(e)
        }
    }

    function invalidateSchedule() {
        qc.invalidateQueries({queryKey: ['schedule']})
    }

    const upcoming = (schedules ?? []).filter(s => s.date >= TODAY)

    return (
        <div className="page-scroll px-3 py-3 pb-24">
            {/* ── Upcoming scheduled evenings ── */}
            <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold text-kce-muted uppercase tracking-wider">
                    {t('schedule.upcoming')}
                </div>
                {isAdminUser && (
                    <button className="text-xs text-kce-muted active:opacity-60 font-semibold"
                            onClick={() => setEditSheet('new')}>
                        + {t('schedule.add')}
                    </button>
                )}
            </div>

            {schedulesLoading
                ? <p className="text-kce-muted text-sm text-center py-4">{t('action.loading')}</p>
                : upcoming.length === 0
                    ? <p className="text-kce-muted text-sm text-center py-4">{t('schedule.none')}</p>
                    : <div className="space-y-2">
                        {upcoming.map(se => (
                            <UpcomingCard
                                key={se.id}
                                se={se}
                                isAdminUser={isAdminUser}
                                onEdit={() => setEditSheet(se)}
                                onDelete={() => setConfirmDeleteId(se.id)}
                                onViewRsvps={() => setRsvpSheet(se)}
                                onRsvpUpdate={invalidateSchedule}
                            />
                        ))}
                    </div>
            }

            {/* ── Past actual evenings (history) ── */}
            <HistorySection onNavigate={onNavigate}/>

            {/* Sheets */}
            {editSheet !== null && (
                <ScheduleEditSheet
                    initial={editSheet === 'new' ? undefined : editSheet}
                    onClose={() => setEditSheet(null)}
                    onSaved={invalidateSchedule}
                />
            )}
            {rsvpSheet && <RsvpSheet se={rsvpSheet} onClose={() => setRsvpSheet(null)}/>}
            {confirmDeleteId !== null && (
                <Sheet open onClose={() => setConfirmDeleteId(null)} title={t('schedule.deleteConfirm')}>
                    <div className="flex gap-3">
                        <button className="flex-1 btn-secondary" onClick={() => setConfirmDeleteId(null)}>
                            {t('action.cancel')}
                        </button>
                        <button className="flex-1 btn-danger" onClick={() => handleDelete(confirmDeleteId)}>
                            {t('action.confirmDelete')}
                        </button>
                    </div>
                </Sheet>
            )}
        </div>
    )
}
