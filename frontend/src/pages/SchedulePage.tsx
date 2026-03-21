import {useEffect, useRef, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {getHashParams, clearHashParams} from '@/utils/hashParams.ts'
import {useEveningList} from '@/hooks/useEvening.ts'
import {ClubPin, RegularMember, RsvpEntry, RsvpStatus, ScheduledEvening, ScheduledEveningGuest} from '@/types.ts'
import {UnplannedAttendanceSheet} from '@/pages/EveningPage.tsx'

const TODAY = new Date().toISOString().slice(0, 10)

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fDateLong(date: string) {
    return new Date(date + 'T00:00:00').toLocaleDateString('de-DE', {
        weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    })
}

function fDateTimeLong(scheduledAt: string) {
    const date = scheduledAt.slice(0, 10)
    const time = scheduledAt.slice(11, 16)
    return `${fDateLong(date)} · ${time}`
}

function fDate(date: string) {
    const dateOnly = date.length > 10 ? date.slice(0, 10) : date
    return new Date(dateOnly + 'T00:00:00').toLocaleDateString('de-DE', {
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
    onAdded: (guest: ScheduledEveningGuest) => void
    onCancel: () => void
}) {
    const t = useT()
    const regularMembers = useAppStore(s => s.regularMembers)
    const knownGuests = regularMembers.filter(m => m.is_guest)
    // Filter out guests already in the scheduled evening
    const alreadyAdded = new Set(se.guests.map(g => g.regular_member_id).filter(Boolean))
    const availableKnownGuests = knownGuests.filter(m => !alreadyAdded.has(m.id))

    const [name, setName] = useState('')
    const [matchedId, setMatchedId] = useState<number | null>(null)
    const [saving, setSaving] = useState(false)

    function pickKnown(m: RegularMember) {
        setName(m.nickname || m.name)
        setMatchedId(m.id)
    }

    async function submit() {
        if (!name.trim()) return
        setSaving(true)
        try {
            const guest = await api.addScheduledGuest(se.id, {
                name: name.trim(),
                regular_member_id: matchedId ?? undefined,
            })
            onAdded(guest)
        } catch (e) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="mt-2 p-2.5 rounded-lg bg-kce-bg border border-kce-border space-y-2">
            {/* Known guest chips */}
            {availableKnownGuests.length > 0 && (
                <div>
                    <div className="text-[10px] text-kce-muted font-bold uppercase tracking-wider mb-1">
                        {t('player.knownGuests')}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {availableKnownGuests.map(m => (
                            <button
                                key={m.id}
                                type="button"
                                className={`chip ${matchedId === m.id ? 'active' : ''}`}
                                onClick={() => pickKnown(m)}
                            >
                                {m.nickname || m.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {/* New guest name input */}
            <div>
                {availableKnownGuests.length > 0 && (
                    <div className="text-[10px] text-kce-muted font-bold uppercase tracking-wider mb-1">
                        {t('player.newGuest')}
                    </div>
                )}
                <input
                    className="kce-input"
                    placeholder={t('schedule.guestName')}
                    value={name}
                    onChange={e => { setName(e.target.value); setMatchedId(null) }}
                    autoFocus={availableKnownGuests.length === 0}
                />
                {matchedId && (
                    <p className="text-[10px] text-green-400 mt-1">✓ {t('schedule.guestKnown')}</p>
                )}
            </div>
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
export function StartEveningSheet({se, onClose, onStarted}: {
    se: ScheduledEvening
    onClose: () => void
    onStarted: (eveningId: number) => void
}) {
    const t = useT()
    const qc = useQueryClient()
    const regularMembers = useAppStore(s => s.regularMembers)
    const user = useAppStore(s => s.user)

    const {data: rsvps = [], isLoading: rsvpsLoading} = useQuery<RsvpEntry[]>({
        queryKey: ['rsvps', se.id],
        queryFn: () => api.listRsvps(se.id),
        staleTime: 0,
    })
    const {data: pins = []} = useQuery<ClubPin[]>({
        queryKey: ['pins'],
        queryFn: api.listPins,
        staleTime: 60000,
    })
    const {data: club} = useQuery({queryKey: ['club'], queryFn: api.getClub, staleTime: 60000})
    const pinPenalty = club?.settings?.pin_penalty ?? 0

    const activeMembers = regularMembers.filter(
        (m: RegularMember) => !m.is_guest && m.is_active,
    )
    const absentIds = new Set(rsvps.filter(r => r.status === 'absent').map(r => r.regular_member_id))

    const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set())
    const [initialized, setInitialized] = useState(false)
    const [guests, setGuests] = useState<ScheduledEveningGuest[]>([...se.guests])
    const [addingGuest, setAddingGuest] = useState(false)
    const [missingPinIds, setMissingPinIds] = useState<Set<number>>(new Set())
    const [starting, setStarting] = useState(false)

    // Initialize attendance from RSVPs once loaded
    useEffect(() => {
        if (!rsvpsLoading && !initialized) {
            setCheckedIds(new Set(activeMembers.filter((m: RegularMember) => !absentIds.has(m.id)).map((m: RegularMember) => m.id)))
            setInitialized(true)
        }
    }, [rsvpsLoading, initialized])  // eslint-disable-line react-hooks/exhaustive-deps

    function toggleMember(id: number) {
        setCheckedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    function toggleMissingPin(pinId: number) {
        setMissingPinIds(prev => {
            const next = new Set(prev)
            if (next.has(pinId)) next.delete(pinId)
            else next.add(pinId)
            return next
        })
    }

    async function doStart() {
        setStarting(true)
        try {
            const ev = await api.startEveningFromSchedule(se.id, {
                member_ids: Array.from(checkedIds),
            })
            if (missingPinIds.size > 0 && pinPenalty > 0) {
                const eveningData = await api.getEvening(ev.id)
                for (const pinId of missingPinIds) {
                    const pin = pins.find(p => p.id === pinId)
                    if (!pin || !pin.holder_regular_member_id) continue
                    const player = eveningData.players.find(p => p.regular_member_id === pin.holder_regular_member_id)
                    if (!player) continue
                    await api.addPenalty(ev.id, {
                        player_ids: [player.id],
                        penalty_type_name: `${pin.icon} ${pin.name} ${t('pin.missingPenalty')}`,
                        icon: pin.icon,
                        amount: pinPenalty,
                        mode: 'euro',
                        client_timestamp: Date.now(),
                    })
                }
            }
            showToast(t('schedule.started'))
            onStarted(ev.id)
        } catch (e) {
            toastError(e)
        } finally {
            setStarting(false)
        }
    }

    const myId = user?.regular_member_id
    const sortedMembers = [...activeMembers].sort((a: RegularMember, b: RegularMember) => {
        if (a.id === myId) return -1
        if (b.id === myId) return 1
        return 0
    })

    return (
        <Sheet open onClose={onClose} title={t('schedule.startConfirm')}>
            <div className="space-y-4">
                <div className="text-sm text-kce-muted">
                    {fDateTimeLong(se.scheduled_at)}{se.venue ? ` · ${se.venue}` : ''}
                </div>

                {rsvpsLoading ? (
                    <p className="text-sm text-kce-muted text-center py-4">{t('action.loading')}</p>
                ) : (
                    <>
                        {/* Attendance checklist */}
                        <div>
                            <div className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-2">
                                👥 {t('schedule.attendance')} ({checkedIds.size}/{activeMembers.length})
                            </div>
                            <div className="max-h-60 overflow-y-auto space-y-0.5 pr-1">
                                {sortedMembers.map((m: RegularMember) => {
                                    const isChecked = checkedIds.has(m.id)
                                    const wasAbsent = absentIds.has(m.id)
                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => toggleMember(m.id)}
                                            className={[
                                                'w-full p-2 rounded-lg flex items-center gap-2.5 transition-colors text-left',
                                                isChecked ? 'bg-green-500/10' : 'bg-kce-surface2/40',
                                            ].join(' ')}
                                        >
                                            <span className={isChecked ? 'text-green-400' : 'text-kce-muted'}>
                                                {isChecked ? '☑' : '☐'}
                                            </span>
                                            <span className={[
                                                'text-sm flex-1',
                                                isChecked ? 'text-kce-cream' : 'text-kce-muted line-through',
                                            ].join(' ')}>
                                                {m.nickname || m.name}
                                                {m.id === myId && (
                                                    <span className="text-[9px] text-kce-amber font-bold ml-1.5">Ich</span>
                                                )}
                                            </span>
                                            {wasAbsent && isChecked && (
                                                <span className="text-[10px] text-yellow-400 font-bold flex-shrink-0">
                                                    {t('schedule.showedUpAnyway')}
                                                </span>
                                            )}
                                            {wasAbsent && !isChecked && (
                                                <span className="text-[10px] text-red-400 flex-shrink-0">
                                                    {t('schedule.absent')}
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Guests */}
                        <div className="pt-2 border-t border-kce-surface2">
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider">
                                    🧑‍🤝‍🧑 {t('schedule.guests')}{guests.length > 0 ? ` (${guests.length})` : ''}
                                </div>
                                {!addingGuest && (
                                    <button className="btn-secondary btn-xs" onClick={() => setAddingGuest(true)}>
                                        + {t('schedule.addGuest')}
                                    </button>
                                )}
                            </div>
                            {guests.map(g => (
                                <div key={g.id} className="flex items-center gap-2 text-sm text-kce-cream mb-1 px-1">
                                    <span className="flex-1">🧑‍🤝‍🧑 {g.name}</span>
                                    <button
                                        className="text-kce-muted active:text-red-400 text-xs"
                                        onClick={async () => {
                                            try {
                                                await api.removeScheduledGuest(se.id, g.id)
                                                setGuests(prev => prev.filter(x => x.id !== g.id))
                                                qc.invalidateQueries({queryKey: ['schedule']})
                                            } catch (e) {
                                                toastError(e)
                                            }
                                        }}
                                    >✕</button>
                                </div>
                            ))}
                            {addingGuest && (
                                <AddGuestForm
                                    se={se}
                                    onAdded={(guest) => {
                                        setGuests(prev => [...prev, guest])
                                        setAddingGuest(false)
                                        qc.invalidateQueries({queryKey: ['schedule']})
                                    }}
                                    onCancel={() => setAddingGuest(false)}
                                />
                            )}
                        </div>

                        {/* Pins check — only for pins whose holder is present */}
                        {pins.some(p => p.holder_regular_member_id && checkedIds.has(p.holder_regular_member_id)) && (
                            <div className="pt-2 border-t border-kce-surface2">
                                <div className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-2">
                                    📌 {t('pin.title')}
                                </div>
                                {pins.filter((p: ClubPin) => p.holder_regular_member_id && checkedIds.has(p.holder_regular_member_id)).map((pin: ClubPin) => {
                                    const brought = !missingPinIds.has(pin.id)
                                    return (
                                        <button
                                            key={pin.id}
                                            onClick={() => toggleMissingPin(pin.id)}
                                            className={[
                                                'w-full flex items-center gap-2.5 p-2 rounded-lg mb-1 text-left transition-colors',
                                                brought ? 'bg-green-500/10' : 'bg-red-500/10',
                                            ].join(' ')}
                                        >
                                            <span className="text-base flex-shrink-0">{pin.icon}</span>
                                            <span className="flex-1 text-sm text-kce-cream">{pin.name}</span>
                                            <span className="text-xs text-kce-muted flex-shrink-0">{pin.holder_name}</span>
                                            <span className={[
                                                'text-xs font-bold flex-shrink-0',
                                                brought ? 'text-green-400' : 'text-red-400',
                                            ].join(' ')}>
                                                {brought ? `✓ ${t('pin.brought')}` : `✕ ${t('pin.forgotten')}`}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        )}

                        <div className="pt-1">
                            <button className="btn-primary w-full" disabled={starting} onClick={doStart}>
                                {starting ? t('action.loading') : t('schedule.start')}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Sheet>
    )
}

// ── Upcoming scheduled evening card ──────────────────────────────────────────
function UpcomingCard({se, isAdminUser, activeEveningId, onEdit, onDelete, onViewRsvps, onRsvpUpdate, onStarted, onNavigate}: {
    se: ScheduledEvening
    isAdminUser: boolean
    activeEveningId: number | null
    onEdit: () => void
    onDelete: () => void
    onViewRsvps: () => void
    onRsvpUpdate: () => void
    onStarted: (eveningId: number) => void
    onNavigate?: () => void
}) {
    const t = useT()
    const qc = useQueryClient()
    const [showGuests, setShowGuests] = useState(false)
    const [addingGuest, setAddingGuest] = useState(false)
    const [startSheet, setStartSheet] = useState(false)

    const isAlreadyStarted = se.evening_id !== null
    const canStart = se.scheduled_at.slice(0, 10) <= TODAY && !isAlreadyStarted

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
                    <div className="text-sm font-bold text-kce-cream">{fDateTimeLong(se.scheduled_at)}</div>
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
                    {isAlreadyStarted ? (
                        <button
                            className="btn-primary w-full text-sm"
                            onClick={() => onNavigate?.()}>
                            🎳 {t('evening.active')}
                        </button>
                    ) : activeEveningId !== null ? (
                        <button
                            className="btn-secondary w-full text-sm opacity-60 cursor-not-allowed"
                            disabled title={t('evening.alreadyActive')}>
                            {t('schedule.start')}
                        </button>
                    ) : (
                        <>
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
                        </>
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
function ScheduleEditSheet({initial, defaultVenue, defaultTime, onClose, onSaved}: {
    initial?: ScheduledEvening
    defaultVenue: string
    defaultTime: string
    onClose: () => void
    onSaved: () => void
}) {
    const t = useT()
    const initialDatetime = initial?.scheduled_at?.slice(0, 16) ?? `${TODAY}T${defaultTime}`
    const [datetime, setDatetime] = useState(initialDatetime)
    const [venue, setVenue] = useState(initial?.venue ?? defaultVenue)
    const [note, setNote] = useState(initial?.note ?? '')
    const [saving, setSaving] = useState(false)

    async function handleSubmit() {
        if (!datetime) return
        setSaving(true)
        try {
            const payload = {date: datetime, venue: venue || undefined, note: note || undefined}
            if (initial) await api.updateScheduledEvening(initial.id, payload)
            else await api.createScheduledEvening(payload)
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
                    <input type="datetime-local" className="kce-input" value={datetime}
                           min={!initial ? new Date().toISOString().slice(0, 16) : undefined}
                           onChange={e => setDatetime(e.target.value)} required/>
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
                <button type="submit" className="btn-primary w-full" disabled={saving || !datetime}>{t('action.save')}</button>
            </div>
        </Sheet>
    )
}


// ── iCal subscribe sheet ───────────────────────────────────────────────────────
function IcalSheet({icalToken, clubName, onClose}: { icalToken: string; clubName: string; onClose: () => void }) {
    const t = useT()
    const [copied, setCopied] = useState(false)
    const url = `webcal://${window.location.host}/api/v1/schedule/ical/${icalToken}.ics`

    async function copy() {
        try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            showToast(url)
        }
    }

    return (
        <Sheet open onClose={onClose} title={t('schedule.subscribeCalendar')}>
            <div className="space-y-3">
                <p className="text-xs text-kce-muted">{t('schedule.icalHint')}</p>
                <div className="bg-kce-surface2 rounded-lg p-2.5 text-[11px] font-mono text-kce-cream break-all select-all">
                    {url}
                </div>
                <div className="flex gap-2">
                    <a href={url} className="flex-1 btn-primary text-center text-sm">
                        {t('schedule.openInCalendar')}
                    </a>
                    <button className="btn-secondary btn-sm flex-shrink-0" onClick={copy}>
                        {copied ? '✓' : t('schedule.icalCopy')}
                    </button>
                </div>
                <p className="text-[10px] text-kce-muted text-center">{t('schedule.icalFor')} {clubName}</p>
            </div>
        </Sheet>
    )
}


// ── RSVP quick sheet (opened from push notification deep link) ────────────────
function RsvpQuickSheet({se, onClose, onUpdate}: { se: ScheduledEvening; onClose: () => void; onUpdate: () => void }) {
    const t = useT()
    const [busy, setBusy] = useState(false)

    async function toggle(status: RsvpStatus) {
        setBusy(true)
        try {
            if (se.my_rsvp === status) await api.removeRsvp(se.id)
            else await api.setRsvp(se.id, status)
            onUpdate()
            onClose()
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    return (
        <Sheet open onClose={onClose} title={t('schedule.rsvpQuickTitle')}>
            <div className="space-y-3">
                <div className="kce-card p-3">
                    <div className="text-sm font-bold text-kce-cream">{fDateTimeLong(se.scheduled_at)}</div>
                    {se.venue && <div className="text-xs text-kce-muted mt-0.5">🏠 {se.venue}</div>}
                    {se.note && <div className="text-xs text-kce-muted mt-0.5 italic">{se.note}</div>}
                </div>
                <p className="text-sm text-kce-muted text-center">{t('schedule.rsvpQuickHint')}</p>
                <div className="flex gap-3">
                    <button
                        disabled={busy}
                        onClick={() => toggle('attending')}
                        className={['flex-1 py-3 rounded-xl text-sm font-bold border transition-all active:scale-95',
                            se.my_rsvp === 'attending'
                                ? 'bg-green-500/20 text-green-400 border-green-500/40'
                                : 'bg-kce-surface2 text-kce-muted border-kce-border',
                        ].join(' ')}>
                        ✅ {t('rsvp.attending.short')}
                    </button>
                    <button
                        disabled={busy}
                        onClick={() => toggle('absent')}
                        className={['flex-1 py-3 rounded-xl text-sm font-bold border transition-all active:scale-95',
                            se.my_rsvp === 'absent'
                                ? 'bg-red-500/20 text-red-400 border-red-500/40'
                                : 'bg-kce-surface2 text-kce-muted border-kce-border',
                        ].join(' ')}>
                        ❌ {t('rsvp.absent.short')}
                    </button>
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
    async function setFor(mid: number, status: RsvpStatus) {
        try {
            await api.setRsvpForMember(se.id, mid, status)
            qc.invalidateQueries({queryKey: ['rsvps', se.id]})
            qc.invalidateQueries({queryKey: ['schedule']})
        } catch (e) {
            toastError(e)
        }
    }

    // Treat null (no response) and explicit 'attending' the same — default is attending
    const attending = rsvps?.filter(r => r.status !== 'absent') ?? []
    const absent = rsvps?.filter(r => r.status === 'absent') ?? []

    return (
        <Sheet open onClose={onClose} title={`${t('schedule.rsvpTitle')} · ${fDateTimeLong(se.scheduled_at)}`}>
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
                                            {r.nickname || r.name}
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
                                        <span className="flex-1 text-sm text-kce-muted truncate">
                                            {r.nickname || r.name}
                                        </span>
                                        <button className="btn-secondary btn-xs" onClick={() => setFor(r.regular_member_id, 'attending')}>
                                            → {t('rsvp.attending.short')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </Sheet>
    )
}

// ── History section (closed actual evenings) ──────────────────────────────────
function HistorySection({onNavigate, defaultVenue = ''}: { onNavigate?: () => void; defaultVenue?: string }) {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const setActiveEveningId = useAppStore(s => s.setActiveEveningId)
    const activeEveningId = useAppStore(s => s.activeEveningId)
    const {data: evenings, isLoading} = useEveningList()

    const [search, setSearch] = useState('')
    const [expandedId, setExpandedId] = useState<number | null>(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
    const [backlogSheet, setBacklogSheet] = useState(false)
    const [backlogDate, setBacklogDate] = useState(TODAY)
    const [backlogVenue, setBacklogVenue] = useState('')
    const [saving, setSaving] = useState(false)
    const [attendanceEveningId, setAttendanceEveningId] = useState<number | null>(null)

    const {data: expandedEvening} = useQuery({
        queryKey: ['evening', expandedId],
        queryFn: () => expandedId ? api.getEvening(expandedId) : null,
        enabled: !!expandedId,
        staleTime: 60000,
    })

    const q = search.trim().toLowerCase()
    const allEvenings = evenings ?? []
    const activeEvening = allEvenings.find(e => !e.is_closed && e.id === activeEveningId)
    const closed = allEvenings
        .filter(e => e.is_closed)
        .sort((a, b) => b.date.localeCompare(a.date))
        .filter(e => !q || e.date.includes(q) || (e.venue ?? '').toLowerCase().includes(q))

    async function doReopen(id: number) {
        if (activeEveningId !== null && activeEveningId !== id) {
            showToast(t('evening.alreadyActive'), 'error')
            return
        }
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
            setBacklogSheet(false)
            setAttendanceEveningId(ev.id)
        } catch (e) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    return (
        <>
            <div className="sec-heading mt-5">📚 {t('nav.history')}</div>

            <div className="flex gap-2 mb-3">
                <input className="kce-input flex-1" value={search} onChange={e => setSearch(e.target.value)}
                       placeholder={t('history.search')}/>
                {isAdmin(user) && (
                    <button className="btn-secondary btn-sm whitespace-nowrap flex-shrink-0"
                            onClick={() => {
                                setBacklogDate(TODAY)
                                setBacklogVenue(defaultVenue)
                                setBacklogSheet(true)
                            }}>
                        + {t('history.backlog')}
                    </button>
                )}
            </div>

            {/* Active evening at top */}
            {activeEvening && (
                <div className="kce-card mb-2 overflow-hidden border border-kce-amber/40">
                    <button className="w-full p-3 flex items-center gap-3 text-left"
                            onClick={() => onNavigate?.()}>
                        <span className="text-base">🎳</span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                                <div className="text-sm font-bold">{fDate(activeEvening.date)}</div>
                                <span className="text-[10px] font-extrabold tracking-widest text-kce-amber border border-kce-amber rounded px-1 py-0.5">
                                    {t('evening.active')}
                                </span>
                            </div>
                            <div className="text-xs text-kce-muted">
                                {activeEvening.venue ?? '–'} · {activeEvening.player_count} {t('history.players')}
                            </div>
                        </div>
                    </button>
                </div>
            )}

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
                                                            {fe(detail.penalty_log.reduce((s, l) => s + (l.mode === 'euro' ? l.amount : (l.unit_amount != null ? l.amount * l.unit_amount : 0)), 0))}
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
                                                        totals.set(l.player_name, {...cur, amount: cur.amount + (l.mode === 'euro' ? l.amount : (l.unit_amount != null ? l.amount * l.unit_amount : 0))})
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
                    <button type="submit" className="btn-primary w-full"
                            disabled={saving || !backlogDate}>{t('evening.startButton')}</button>
                </div>
            </Sheet>

            {attendanceEveningId !== null && (
                <UnplannedAttendanceSheet
                    eveningId={attendanceEveningId}
                    onDone={() => {
                        setActiveEveningId(attendanceEveningId)
                        qc.invalidateQueries({queryKey: ['evenings']})
                        setAttendanceEveningId(null)
                        onNavigate?.()
                    }}
                    onCancel={() => {
                        setActiveEveningId(attendanceEveningId)
                        qc.invalidateQueries({queryKey: ['evenings']})
                        setAttendanceEveningId(null)
                        onNavigate?.()
                    }}
                />
            )}
        </>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function SchedulePage({onNavigate}: { onNavigate?: () => void } = {}) {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const setActiveEveningId = useAppStore(s => s.setActiveEveningId)
    const activeEveningId = useAppStore(s => s.activeEveningId)
    const isAdminUser = isAdmin(user)

    // Fetch club for home_venue and ical token
    const {data: club} = useQuery({queryKey: ['club'], queryFn: api.getClub, staleTime: 60000})
    const defaultVenue = club?.settings?.home_venue ?? ''
    const defaultTime = club?.settings?.default_evening_time ?? '20:00'
    const icalToken = club?.settings?.ical_token ?? null

    const {data: schedules, isLoading} = useQuery<ScheduledEvening[]>({
        queryKey: ['schedule'],
        queryFn: api.listScheduledEvenings,
        staleTime: 30000,
    })

    const [editSheet, setEditSheet] = useState<ScheduledEvening | null | 'new'>(null)
    const [rsvpSheet, setRsvpSheet] = useState<ScheduledEvening | null>(null)
    const [rsvpQuickSheet, setRsvpQuickSheet] = useState<ScheduledEvening | null>(null)
    const [icalSheet, setIcalSheet] = useState(false)
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

    // Deep link: ?event=ID → auto-open RSVP quick sheet (member) or RSVP sheet (admin)
    // Use a state counter so the effect re-runs on hash changes (e.g. from push notification click)
    const [hashVersion, setHashVersion] = useState(0)
    useEffect(() => {
        const handler = () => setHashVersion(v => v + 1)
        window.addEventListener('hashchange', handler)
        return () => window.removeEventListener('hashchange', handler)
    }, [])
    useEffect(() => {
        if (!schedules) return
        const params = getHashParams()
        const eventId = params.get('event')
        if (!eventId) return
        clearHashParams()
        const se = schedules.find(s => s.id === parseInt(eventId, 10))
        if (!se) return
        if (isAdminUser) setRsvpSheet(se)
        else setRsvpQuickSheet(se)
    }, [schedules, isAdminUser, hashVersion])

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

    const upcoming = (schedules ?? []).filter(s =>
        s.scheduled_at.slice(0, 10) >= TODAY &&
        (s.evening_id === null || s.evening_id === activeEveningId)
    )
    const VISIBLE = 2
    const [showAllUpcoming, setShowAllUpcoming] = useState(false)
    const visibleUpcoming = showAllUpcoming ? upcoming : upcoming.slice(0, VISIBLE)
    const hiddenCount = upcoming.length - VISIBLE

    return (
        <div className="page-scroll px-3 py-3 pb-24">

            {/* ── Upcoming ── */}
            <div className="flex items-center justify-between mb-0">
                <div className="sec-heading flex-1">📅 {t('schedule.upcoming')}</div>
                <div className="flex items-center gap-1.5 ml-2 mb-3 flex-shrink-0">
                    {icalToken && (
                        <button className="btn-secondary btn-xs" title={t('schedule.subscribeCalendar')}
                                onClick={() => setIcalSheet(true)}>
                            📆
                        </button>
                    )}
                    {isAdminUser && (
                        <button className="btn-secondary btn-xs"
                                onClick={() => setEditSheet('new')}>
                            + {t('schedule.add')}
                        </button>
                    )}
                </div>
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
                                activeEveningId={activeEveningId}
                                onEdit={() => setEditSheet(se)}
                                onDelete={() => setConfirmDeleteId(se.id)}
                                onViewRsvps={() => setRsvpSheet(se)}
                                onRsvpUpdate={invalidate}
                                onStarted={handleStarted}
                                onNavigate={onNavigate}
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
            <HistorySection onNavigate={onNavigate} defaultVenue={defaultVenue}/>

            {/* ── Sheets ── */}
            {editSheet !== null && (
                <ScheduleEditSheet
                    initial={editSheet === 'new' ? undefined : editSheet}
                    defaultVenue={defaultVenue}
                    defaultTime={defaultTime}
                    onClose={() => setEditSheet(null)}
                    onSaved={invalidate}
                />
            )}
            {rsvpSheet && <RsvpSheet se={rsvpSheet} onClose={() => setRsvpSheet(null)}/>}
            {rsvpQuickSheet && (
                <RsvpQuickSheet
                    se={rsvpQuickSheet}
                    onClose={() => setRsvpQuickSheet(null)}
                    onUpdate={invalidate}
                />
            )}
            {icalSheet && club && icalToken && (
                <IcalSheet icalToken={icalToken} clubName={club.name} onClose={() => setIcalSheet(false)}/>
            )}
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
