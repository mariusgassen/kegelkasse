import {useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {useEveningList} from '@/hooks/useEvening.ts'
import {RsvpEntry, RsvpStatus, ScheduledEvening} from '@/types.ts'

const TODAY = new Date().toISOString().slice(0, 10)

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fDateLong(date: string) {
    return new Date(date + 'T00:00:00').toLocaleDateString('de-DE', {
        weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    })
}

function fDate(date: string) {
    return new Date(date + 'T00:00:00').toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
    })
}

// ── RSVP Chip pair ────────────────────────────────────────────────────────────
function RsvpChips({se, onUpdate}: { se: ScheduledEvening; onUpdate: () => void }) {
    const t = useT()
    const [busy, setBusy] = useState(false)

    async function toggle(status: RsvpStatus) {
        setBusy(true)
        try {
            if (se.my_rsvp === status) await api.removeRsvp(se.id)
            else await api.setRsvp(se.id, status)
            onUpdate()
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    const isAbsent = se.my_rsvp === 'absent'
    return (
        <div className="mt-2.5">
            <button disabled={busy} onClick={() => toggle('absent')}
                    className={['w-full text-xs py-1.5 px-3 rounded-full border font-bold transition-all active:scale-95 select-none',
                        isAbsent
                            ? 'bg-red-500/20 text-red-400 border-red-500/40'
                            : 'bg-kce-surface2 text-kce-muted border-kce-border',
                    ].join(' ')}>
                {isAbsent ? t('rsvp.absent.active') : t('rsvp.absent.short')}
            </button>
        </div>
    )
}

// ── Add-guest inline form ─────────────────────────────────────────────────────
function AddGuestForm({se, onAdded, onCancel}: {
    se: ScheduledEvening
    onAdded: () => void
    onCancel: () => void
}) {
    const t = useT()
    const regularMembers = useAppStore(s => s.regularMembers)
    const knownGuests = regularMembers.filter(m => m.is_guest)

    const [name, setName] = useState('')
    const [matchedId, setMatchedId] = useState<number | null>(null)
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [saving, setSaving] = useState(false)

    const suggestions = name.trim().length > 0
        ? knownGuests.filter(m => {
            const q = name.toLowerCase()
            return (m.nickname ?? '').toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
        })
        : []

    function pickSuggestion(m: typeof knownGuests[0]) {
        setName(m.nickname || m.name)
        setMatchedId(m.id)
        setShowSuggestions(false)
    }

    function handleChange(val: string) {
        setName(val)
        setMatchedId(null)
        setShowSuggestions(true)
    }

    async function submit() {
        if (!name.trim()) return
        setSaving(true)
        try {
            await api.addScheduledGuest(se.id, {
                name: name.trim(),
                regular_member_id: matchedId ?? undefined,
            })
            onAdded()
        } catch (e) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="mt-2 p-2.5 rounded-lg bg-kce-bg border border-kce-border space-y-2">
            <div className="relative">
                <input
                    className="kce-input"
                    placeholder={t('schedule.guestName')}
                    value={name}
                    onChange={e => handleChange(e.target.value)}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
                    autoFocus
                />
                {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 top-full mt-0.5 rounded-lg bg-kce-surface border border-kce-border shadow-lg overflow-hidden">
                        {suggestions.map(m => (
                            <button
                                key={m.id}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-kce-surface2 text-kce-cream flex items-center gap-2"
                                onMouseDown={() => pickSuggestion(m)}
                            >
                                <span className="text-kce-muted text-xs">★</span>
                                {m.nickname || m.name}
                                {m.nickname && <span className="text-kce-muted text-xs">({m.name})</span>}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {matchedId && (
                <p className="text-[10px] text-green-400">✓ {t('schedule.guestKnown')}</p>
            )}
            <div className="flex gap-2">
                <button className="btn-secondary btn-sm flex-1" onClick={onCancel}>{t('action.cancel')}</button>
                <button className="btn-primary btn-sm flex-1" disabled={saving || !name.trim()} onClick={submit}>
                    {t('action.save')}
                </button>
            </div>
        </div>
    )
}

// ── Start evening confirmation sheet ─────────────────────────────────────────
function StartEveningSheet({se, onClose, onStarted}: {
    se: ScheduledEvening
    onClose: () => void
    onStarted: (eveningId: number) => void
}) {
    const t = useT()
    const [importAttending, setImportAttending] = useState(true)
    const [starting, setStarting] = useState(false)

    const guestCount = se.guests.length

    async function doStart() {
        setStarting(true)
        try {
            const ev = await api.startEveningFromSchedule(se.id, {import_attending: importAttending})
            showToast(t('schedule.started'))
            onStarted(ev.id)
        } catch (e) {
            toastError(e)
        } finally {
            setStarting(false)
        }
    }

    return (
        <Sheet open onClose={onClose} title={t('schedule.startConfirm')}>
            <div className="space-y-4">
                <div className="text-sm text-kce-muted">
                    {fDateLong(se.date)}{se.venue ? ` · ${se.venue}` : ''}
                </div>

                {/* Import members toggle */}
                <button
                    onClick={() => setImportAttending(v => !v)}
                    className={['w-full p-3 rounded-xl border text-left transition-all',
                        importAttending
                            ? 'border-green-500/40 bg-green-500/10'
                            : 'border-kce-border bg-kce-surface2'
                    ].join(' ')}>
                    <div className="flex items-center gap-2">
                        <span className="text-base">{importAttending ? '☑' : '☐'}</span>
                        <div>
                            <div className="text-sm font-bold text-kce-cream">{t('schedule.importAttending')}</div>
                            <div className="text-xs text-kce-muted">
                                {t('schedule.importAttendingHint')}
                                {se.absent_count > 0 && ` (${se.absent_count} ${t('schedule.absent')})`}
                            </div>
                        </div>
                    </div>
                </button>

                {/* Pre-planned guests info */}
                {guestCount > 0 && (
                    <div className="p-3 rounded-xl border border-kce-border bg-kce-surface2">
                        <div className="text-xs text-kce-muted mb-1.5 font-bold uppercase tracking-wider">
                            🧑‍🤝‍🧑 {t('schedule.guests')} ({guestCount})
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {se.guests.map(g => (
                                <span key={g.id} className="text-[11px] px-2 py-0.5 rounded-full bg-kce-surface text-kce-cream">
                                    {g.name}
                                </span>
                            ))}
                        </div>
                        <div className="text-[10px] text-kce-muted mt-1.5">Werden automatisch hinzugefügt.</div>
                    </div>
                )}

                <div className="flex gap-3 pt-1">
                    <button className="btn-secondary flex-1" onClick={onClose}>{t('action.cancel')}</button>
                    <button className="btn-primary flex-[2]" disabled={starting} onClick={doStart}>
                        {starting ? t('action.loading') : t('schedule.start')}
                    </button>
                </div>
            </div>
        </Sheet>
    )
}

// ── Upcoming scheduled evening card ──────────────────────────────────────────
function UpcomingCard({se, isAdminUser, onEdit, onDelete, onViewRsvps, onRsvpUpdate, onStarted}: {
    se: ScheduledEvening
    isAdminUser: boolean
    onEdit: () => void
    onDelete: () => void
    onViewRsvps: () => void
    onRsvpUpdate: () => void
    onStarted: (eveningId: number) => void
}) {
    const t = useT()
    const qc = useQueryClient()
    const [showGuests, setShowGuests] = useState(false)
    const [addingGuest, setAddingGuest] = useState(false)
    const [startSheet, setStartSheet] = useState(false)

    const canStart = se.date <= TODAY

    async function removeGuest(gid: number) {
        try {
            await api.removeScheduledGuest(se.id, gid)
            qc.invalidateQueries({queryKey: ['schedule']})
        } catch (e) {
            toastError(e)
        }
    }

    return (
        <div className="kce-card p-3 mb-2">
            {/* Header row */}
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-kce-cream">{fDateLong(se.date)}</div>
                    {se.venue && <div className="text-xs text-kce-muted mt-0.5 truncate">🏠 {se.venue}</div>}
                    {se.note && <div className="text-xs text-kce-muted mt-0.5 italic truncate">{se.note}</div>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                    {se.absent_count > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">
                            ❌ {se.absent_count}
                        </span>
                    )}
                    {isAdminUser && (
                        <>
                            <button className="btn-secondary btn-xs" title={t('schedule.rsvpTitle')} onClick={onViewRsvps}>👥</button>
                            <button className="btn-secondary btn-xs" onClick={onEdit}>✏️</button>
                            <button className="btn-danger btn-xs" onClick={onDelete}>✕</button>
                        </>
                    )}
                </div>
            </div>

            {/* RSVP chips */}
            <RsvpChips se={se} onUpdate={onRsvpUpdate}/>

            {/* Guests section (admin only) */}
            {isAdminUser && (
                <div className="mt-2.5 pt-2.5 border-t border-kce-surface2">
                    <div className="flex items-center justify-between mb-1.5">
                        <button
                            onClick={() => setShowGuests(v => !v)}
                            className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider flex items-center gap-1">
                            🧑‍🤝‍🧑 {t('schedule.guests')}
                            {se.guests.length > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full bg-kce-surface2 font-bold">
                                    {se.guests.length}
                                </span>
                            )}
                            <span className="ml-0.5">{showGuests ? '▲' : '▼'}</span>
                        </button>
                        {!addingGuest && (
                            <button className="btn-secondary btn-xs" onClick={() => {
                                setShowGuests(true)
                                setAddingGuest(true)
                            }}>
                                + {t('schedule.addGuest')}
                            </button>
                        )}
                    </div>

                    {showGuests && (
                        <>
                            {se.guests.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                    {se.guests.map(g => (
                                        <div key={g.id}
                                             className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-kce-surface2 text-kce-cream">
                                            <span>{g.name}</span>
                                            <button className="text-kce-muted active:text-red-400 ml-0.5"
                                                    onClick={() => removeGuest(g.id)}>✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {addingGuest && (
                                <AddGuestForm
                                    se={se}
                                    onAdded={() => {
                                        setAddingGuest(false)
                                        qc.invalidateQueries({queryKey: ['schedule']})
                                    }}
                                    onCancel={() => setAddingGuest(false)}
                                />
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Start button (admin, only on/after date) */}
            {isAdminUser && (
                <div className="mt-2.5 pt-2.5 border-t border-kce-surface2">
                    <button
                        className={canStart ? 'btn-primary w-full text-sm' : 'btn-secondary w-full text-sm opacity-40 cursor-not-allowed'}
                        disabled={!canStart}
                        title={!canStart ? t('schedule.startNotToday') : undefined}
                        onClick={() => canStart && setStartSheet(true)}>
                        {t('schedule.start')}
                    </button>
                    {!canStart && (
                        <p className="text-[10px] text-kce-muted text-center mt-1">{t('schedule.startNotToday')}</p>
                    )}
                </div>
            )}

            {startSheet && (
                <StartEveningSheet
                    se={se}
                    onClose={() => setStartSheet(false)}
                    onStarted={(id) => {
                        setStartSheet(false)
                        onStarted(id)
                    }}
                />
            )}
        </div>
    )
}

// ── Schedule edit / create sheet ──────────────────────────────────────────────
function ScheduleEditSheet({initial, defaultVenue, onClose, onSaved}: {
    initial?: ScheduledEvening
    defaultVenue: string
    onClose: () => void
    onSaved: () => void
}) {
    const t = useT()
    const [date, setDate] = useState(initial?.date ?? TODAY)
    const [venue, setVenue] = useState(initial?.venue ?? defaultVenue)
    const [note, setNote] = useState(initial?.note ?? '')
    const [saving, setSaving] = useState(false)

    async function handleSubmit() {
        if (!date) return
        setSaving(true)
        try {
            if (initial) await api.updateScheduledEvening(initial.id, {date, venue: venue || undefined, note: note || undefined})
            else await api.createScheduledEvening({date, venue: venue || undefined, note: note || undefined})
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
            <div className="flex flex-col gap-3">
                <div>
                    <label className="field-label">{t('schedule.date')}</label>
                    <input type="date" className="kce-input" value={date} onChange={e => setDate(e.target.value)} required/>
                </div>
                <div>
                    <label className="field-label">{t('schedule.venue')}</label>
                    <input type="text" className="kce-input" placeholder={t('evening.venuePlaceholder')}
                           value={venue} onChange={e => setVenue(e.target.value)}/>
                </div>
                <div>
                    <label className="field-label">{t('schedule.note')}</label>
                    <input type="text" className="kce-input" placeholder={t('common.optional')}
                           value={note} onChange={e => setNote(e.target.value)}/>
                </div>
                <div className="flex gap-2">
                    <button type="button" className="btn-secondary flex-1" onClick={onClose}>{t('action.cancel')}</button>
                    <button type="submit" className="btn-primary flex-[2]" disabled={saving || !date}>{t('action.save')}</button>
                </div>
            </div>
        </Sheet>
    )
}

// ── RSVP admin detail sheet ───────────────────────────────────────────────────
function RsvpSheet({se, onClose}: { se: ScheduledEvening; onClose: () => void }) {
    const t = useT()
    const qc = useQueryClient()
    const {data: rsvps, isLoading} = useQuery<RsvpEntry[]>({
        queryKey: ['rsvps', se.id],
        queryFn: () => api.listRsvps(se.id),
        staleTime: 10000,
    })
    const [sendingReminder, setSendingReminder] = useState(false)

    async function remind() {
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

    async function setFor(mid: number, status: RsvpStatus) {
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
        <Sheet open onClose={onClose} title={`${t('schedule.rsvpTitle')} · ${fDateLong(se.date)}`}>
            <div className="space-y-4">
                {isLoading && <p className="text-kce-muted text-sm text-center py-4">{t('action.loading')}</p>}
                {!isLoading && rsvps && (
                    <>
                        {attending.length > 0 && (
                            <div>
                                <div className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-2">
                                    ✅ {t('schedule.attending')} ({attending.length})
                                </div>
                                {attending.map(r => (
                                    <div key={r.regular_member_id} className="kce-card p-2.5 mb-1.5 flex items-center gap-2">
                                        <span className="flex-1 text-sm text-kce-cream truncate">
                                            {r.name}{r.nickname ? <span className="text-kce-muted"> · {r.nickname}</span> : ''}
                                        </span>
                                        <button className="btn-secondary btn-xs" onClick={() => setFor(r.regular_member_id, 'absent')}>
                                            → {t('rsvp.absent.short')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {absent.length > 0 && (
                            <div>
                                <div className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-2">
                                    ❌ {t('schedule.absent')} ({absent.length})
                                </div>
                                {absent.map(r => (
                                    <div key={r.regular_member_id} className="kce-card p-2.5 mb-1.5 flex items-center gap-2">
                                        <span className="flex-1 text-sm text-kce-cream truncate">
                                            {r.name}{r.nickname ? <span className="text-kce-muted"> · {r.nickname}</span> : ''}
                                        </span>
                                        <button className="btn-secondary btn-xs" onClick={() => setFor(r.regular_member_id, 'attending')}>
                                            → {t('rsvp.attending.short')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {noResponse.length > 0 && (
                            <div>
                                <div className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-2">
                                    ⏳ {t('schedule.noResponse')} ({noResponse.length})
                                </div>
                                {noResponse.map(r => (
                                    <div key={r.regular_member_id} className="kce-card p-2.5 mb-1.5 flex items-center gap-2">
                                        <span className="flex-1 text-sm text-kce-muted truncate">
                                            {r.name}{r.nickname ? ` · ${r.nickname}` : ''}
                                        </span>
                                        <button className="btn-secondary btn-xs" onClick={() => setFor(r.regular_member_id, 'attending')}>
                                            {t('rsvp.attending.short')}
                                        </button>
                                        <button className="btn-secondary btn-xs" onClick={() => setFor(r.regular_member_id, 'absent')}>
                                            {t('rsvp.absent.short')}
                                        </button>
                                    </div>
                                ))}
                                <button className="btn-secondary w-full mt-2 text-sm" disabled={sendingReminder} onClick={remind}>
                                    {sendingReminder ? t('action.loading') : t('schedule.remind')}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Sheet>
    )
}

// ── History section (closed actual evenings) ──────────────────────────────────
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
    const [backlogDate, setBacklogDate] = useState(TODAY)
    const [backlogVenue, setBacklogVenue] = useState('')
    const [saving, setSaving] = useState(false)

    const {data: expandedEvening} = useQuery({
        queryKey: ['evening', expandedId],
        queryFn: () => expandedId ? api.getEvening(expandedId) : null,
        enabled: !!expandedId,
        staleTime: 60000,
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
            <div className="sec-heading mt-5">📚 {t('history.title')}</div>

            <div className="flex gap-2 mb-3">
                <input className="kce-input flex-1" value={search} onChange={e => setSearch(e.target.value)}
                       placeholder={t('history.search')}/>
                {isAdmin(user) && (
                    <button className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0"
                            onClick={() => {
                                setBacklogDate(TODAY)
                                setBacklogVenue('')
                                setBacklogSheet(true)
                            }}>
                        + {t('history.backlog')}
                    </button>
                )}
            </div>

            {isLoading
                ? <p className="text-kce-muted text-sm text-center py-4">{t('action.loading')}</p>
                : closed.length === 0
                    ? <Empty icon="📚" text={t('history.none')}/>
                    : closed.map(ev => {
                        const isExpanded = expandedId === ev.id
                        const detail = isExpanded ? expandedEvening : null
                        return (
                            <div key={ev.id} className="kce-card mb-2 overflow-hidden">
                                <button className="w-full p-3 flex items-center gap-3 text-left"
                                        onClick={() => setExpandedId(isExpanded ? null : ev.id)}>
                                    <span className="text-base">📅</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold">{fDate(ev.date)}</div>
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
                                                    return (
                                                        <div className="mb-3">
                                                            <div className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-1.5">
                                                                ⚠️ {t('penalty.title')}
                                                            </div>
                                                            {[...totals.values()].sort((a, b) => b.amount - a.amount).map(({name, amount}) => (
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
                                                                        onClick={() => doDelete(ev.id)}>
                                                                    ✓ {t('action.delete')}
                                                                </button>
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
                    <div className="flex gap-2">
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

// ── Main page ─────────────────────────────────────────────────────────────────
export function SchedulePage({onNavigate}: { onNavigate?: () => void } = {}) {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const setActiveEveningId = useAppStore(s => s.setActiveEveningId)
    const isAdminUser = isAdmin(user)

    // Fetch club for home_venue default
    const {data: club} = useQuery({queryKey: ['club'], queryFn: api.getClub, staleTime: 60000})
    const defaultVenue = club?.settings?.home_venue ?? ''

    const {data: schedules, isLoading} = useQuery<ScheduledEvening[]>({
        queryKey: ['schedule'],
        queryFn: api.listScheduledEvenings,
        staleTime: 30000,
    })

    const [editSheet, setEditSheet] = useState<ScheduledEvening | null | 'new'>(null)
    const [rsvpSheet, setRsvpSheet] = useState<ScheduledEvening | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

    function invalidate() {
        qc.invalidateQueries({queryKey: ['schedule']})
    }

    async function handleDelete(id: number) {
        try {
            await api.deleteScheduledEvening(id)
            invalidate()
            setConfirmDeleteId(null)
        } catch (e) {
            toastError(e)
        }
    }

    function handleStarted(eveningId: number) {
        setActiveEveningId(eveningId)
        qc.invalidateQueries({queryKey: ['evenings']})
        onNavigate?.()
    }

    const upcoming = (schedules ?? []).filter(s => s.date >= TODAY)
    const VISIBLE = 2
    const [showAllUpcoming, setShowAllUpcoming] = useState(false)
    const visibleUpcoming = showAllUpcoming ? upcoming : upcoming.slice(0, VISIBLE)
    const hiddenCount = upcoming.length - VISIBLE

    return (
        <div className="page-scroll px-3 py-3 pb-24">

            {/* ── Upcoming ── */}
            <div className="flex items-center justify-between mb-0">
                <div className="sec-heading flex-1">📅 {t('schedule.upcoming')}</div>
                {isAdminUser && (
                    <button className="btn-secondary btn-xs ml-2 mb-3 flex-shrink-0"
                            onClick={() => setEditSheet('new')}>
                        + {t('schedule.add')}
                    </button>
                )}
            </div>

            {isLoading
                ? <p className="text-kce-muted text-sm text-center py-4">{t('action.loading')}</p>
                : upcoming.length === 0
                    ? <Empty icon="📅" text={t('schedule.none')}/>
                    : <>
                        {visibleUpcoming.map(se => (
                            <UpcomingCard
                                key={se.id}
                                se={se}
                                isAdminUser={isAdminUser}
                                onEdit={() => setEditSheet(se)}
                                onDelete={() => setConfirmDeleteId(se.id)}
                                onViewRsvps={() => setRsvpSheet(se)}
                                onRsvpUpdate={invalidate}
                                onStarted={handleStarted}
                            />
                        ))}
                        {hiddenCount > 0 && !showAllUpcoming && (
                            <button
                                className="w-full text-xs text-kce-muted py-2 mb-1 border border-dashed border-kce-border rounded-lg hover:text-kce-cream hover:border-kce-cream transition-colors"
                                onClick={() => setShowAllUpcoming(true)}>
                                + {hiddenCount} {t('schedule.moreUpcoming')}
                            </button>
                        )}
                        {showAllUpcoming && hiddenCount > 0 && (
                            <button
                                className="w-full text-xs text-kce-muted py-1.5 mb-1"
                                onClick={() => setShowAllUpcoming(false)}>
                                ▲ {t('schedule.showLess')}
                            </button>
                        )}
                    </>
            }

            {/* ── History ── */}
            <HistorySection onNavigate={onNavigate}/>

            {/* ── Sheets ── */}
            {editSheet !== null && (
                <ScheduleEditSheet
                    initial={editSheet === 'new' ? undefined : editSheet}
                    defaultVenue={defaultVenue}
                    onClose={() => setEditSheet(null)}
                    onSaved={invalidate}
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
