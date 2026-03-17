import {useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {RsvpEntry, RsvpStatus, ScheduledEvening} from '@/types.ts'

const TODAY = new Date().toISOString().slice(0, 10)

function formatDate(date: string): string {
    return new Date(date + 'T00:00:00').toLocaleDateString('de-DE', {
        weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    })
}

// ── RSVP Button Group ──
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
                }}
            >
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
                }}
            >
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
                {isLoading && (
                    <p className="text-kce-muted text-sm text-center py-4">{t('action.loading')}</p>
                )}

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
                                            <button
                                                className="text-xs text-kce-muted active:opacity-60"
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
                                            <button
                                                className="text-xs text-kce-muted active:opacity-60"
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
                                                <button
                                                    className="text-xs text-kce-muted active:opacity-60"
                                                    onClick={() => handleSetRsvpForMember(r.regular_member_id, 'attending')}>
                                                    {t('rsvp.attending.short')}
                                                </button>
                                                <button
                                                    className="text-xs text-kce-muted active:opacity-60"
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
                            <button
                                className="w-full btn-secondary text-sm"
                                disabled={sendingReminder}
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

// ── Scheduled Evening Card ──
function ScheduledEveningCard({
    se,
    isPast,
    onEdit,
    onDelete,
    onViewRsvps,
    onRsvpUpdate,
    isAdminUser,
}: {
    se: ScheduledEvening
    isPast: boolean
    onEdit: () => void
    onDelete: () => void
    onViewRsvps: () => void
    onRsvpUpdate: () => void
    isAdminUser: boolean
}) {
    const t = useT()

    return (
        <div
            className="rounded-xl p-3"
            style={{
                background: isPast ? 'rgba(255,255,255,0.03)' : 'var(--kce-surface)',
                border: '1px solid var(--kce-border)',
                opacity: isPast ? 0.65 : 1,
            }}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-kce-cream text-sm leading-tight">
                        📅 {formatDate(se.date)}
                    </div>
                    {se.venue && (
                        <div className="text-xs text-kce-muted mt-0.5 truncate">🏠 {se.venue}</div>
                    )}
                    {se.note && (
                        <div className="text-xs text-kce-muted mt-0.5 truncate italic">{se.note}</div>
                    )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* RSVP summary chips */}
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
                            <button
                                className="w-7 h-7 flex items-center justify-center rounded-full text-kce-muted active:opacity-60 text-xs"
                                style={{background: 'rgba(255,255,255,0.07)'}}
                                onClick={onViewRsvps}
                                title={t('schedule.rsvpTitle')}>
                                👥
                            </button>
                            <button
                                className="w-7 h-7 flex items-center justify-center rounded-full text-kce-muted active:opacity-60 text-xs"
                                style={{background: 'rgba(255,255,255,0.07)'}}
                                onClick={onEdit}
                                title={t('action.edit')}>
                                ✏️
                            </button>
                            <button
                                className="w-7 h-7 flex items-center justify-center rounded-full active:opacity-60 text-xs"
                                style={{background: 'rgba(239,68,68,0.15)', color: '#ef4444'}}
                                onClick={onDelete}
                                title={t('action.delete')}>
                                ✕
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* RSVP buttons for upcoming evenings */}
            {!isPast && (
                <RsvpButtons se={se} onUpdate={onRsvpUpdate}/>
            )}
        </div>
    )
}

// ── Edit/Create Sheet ──
function ScheduleEditSheet({
    initial,
    onClose,
    onSaved,
}: {
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
                await api.updateScheduledEvening(initial.id, {
                    date,
                    venue: venue || undefined,
                    note: note || undefined,
                })
            } else {
                await api.createScheduledEvening({
                    date,
                    venue: venue || undefined,
                    note: note || undefined,
                })
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
        <Sheet
            open
            onClose={onClose}
            title={initial ? t('schedule.edit') : t('schedule.new')}
            onSubmit={handleSubmit}>
            <div className="space-y-3">
                <div>
                    <label className="label">{t('schedule.date')}</label>
                    <input
                        type="date"
                        className="input"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        required
                    />
                </div>
                <div>
                    <label className="label">{t('schedule.venue')}</label>
                    <input
                        type="text"
                        className="input"
                        placeholder={t('evening.venuePlaceholder')}
                        value={venue}
                        onChange={e => setVenue(e.target.value)}
                    />
                </div>
                <div>
                    <label className="label">{t('schedule.note')}</label>
                    <input
                        type="text"
                        className="input"
                        placeholder={t('common.optional')}
                        value={note}
                        onChange={e => setNote(e.target.value)}
                    />
                </div>
                <button type="submit" className="btn-primary w-full" disabled={saving || !date}>
                    {saving ? t('action.saving') : t('action.save')}
                </button>
            </div>
        </Sheet>
    )
}

// ── Main Page ──
export function SchedulePage() {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const isAdminUser = isAdmin(user)

    const {data: schedules, isLoading} = useQuery<ScheduledEvening[]>({
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
    const past = (schedules ?? []).filter(s => s.date < TODAY)

    return (
        <div className="page-scroll">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="section-title mb-0">{t('schedule.title')}</h2>
                {isAdminUser && (
                    <button
                        className="btn-primary text-xs px-3 py-1.5"
                        onClick={() => setEditSheet('new')}>
                        + {t('schedule.add')}
                    </button>
                )}
            </div>

            {isLoading && (
                <p className="text-kce-muted text-sm text-center py-8">{t('action.loading')}</p>
            )}

            {/* Upcoming */}
            {!isLoading && (
                <div className="space-y-2">
                    {upcoming.length === 0 && past.length === 0 && (
                        <p className="text-kce-muted text-sm text-center py-8">{t('schedule.none')}</p>
                    )}

                    {upcoming.length > 0 && (
                        <>
                            <div className="text-xs font-semibold text-kce-muted uppercase tracking-wider mb-2">
                                {t('schedule.upcoming')}
                            </div>
                            {upcoming.map(se => (
                                <ScheduledEveningCard
                                    key={se.id}
                                    se={se}
                                    isPast={false}
                                    isAdminUser={isAdminUser}
                                    onEdit={() => setEditSheet(se)}
                                    onDelete={() => setConfirmDeleteId(se.id)}
                                    onViewRsvps={() => setRsvpSheet(se)}
                                    onRsvpUpdate={invalidateSchedule}
                                />
                            ))}
                        </>
                    )}

                    {past.length > 0 && (
                        <>
                            <div className="text-xs font-semibold text-kce-muted uppercase tracking-wider mt-4 mb-2">
                                {t('schedule.past')}
                            </div>
                            {past.map(se => (
                                <ScheduledEveningCard
                                    key={se.id}
                                    se={se}
                                    isPast={true}
                                    isAdminUser={isAdminUser}
                                    onEdit={() => setEditSheet(se)}
                                    onDelete={() => setConfirmDeleteId(se.id)}
                                    onViewRsvps={() => setRsvpSheet(se)}
                                    onRsvpUpdate={invalidateSchedule}
                                />
                            ))}
                        </>
                    )}
                </div>
            )}

            {/* Create / Edit Sheet */}
            {editSheet !== null && (
                <ScheduleEditSheet
                    initial={editSheet === 'new' ? undefined : editSheet}
                    onClose={() => setEditSheet(null)}
                    onSaved={invalidateSchedule}
                />
            )}

            {/* RSVP detail sheet (admin) */}
            {rsvpSheet && (
                <RsvpSheet se={rsvpSheet} onClose={() => setRsvpSheet(null)}/>
            )}

            {/* Confirm delete */}
            {confirmDeleteId !== null && (
                <Sheet open onClose={() => setConfirmDeleteId(null)} title={t('schedule.deleteConfirm')}>
                    <div className="flex gap-3">
                        <button className="flex-1 btn-secondary" onClick={() => setConfirmDeleteId(null)}>
                            {t('action.cancel')}
                        </button>
                        <button
                            className="flex-1 btn-danger"
                            onClick={() => handleDelete(confirmDeleteId)}>
                            {t('action.confirmDelete')}
                        </button>
                    </div>
                </Sheet>
            )}
        </div>
    )
}
