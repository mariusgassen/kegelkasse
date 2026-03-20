/**
 * Club admin page — settings, members, penalty types, game templates, invites.
 * Write operations guarded by AdminGuard (admin/superadmin only).
 */
import {useEffect, useState} from 'react'
import {useHashTab} from '@/hooks/usePage.ts'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {api, authState} from '@/api/client.ts'
import type {ReminderSettings, ReminderTypeSettings} from '@/types.ts'
import {shareOrCopy} from '@/utils/share.ts'
import {parseAmount} from '@/utils/parse.ts'
import {applyClubTheme} from '@/App.tsx'
import {useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {AdminGuard} from '@/components/ui/AdminGuard.tsx'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {EmojiPickerButton} from '@/components/ui/EmojiPickerButton.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import type {ClubPin, GameTemplate, PenaltyType, RegularMember as RegularMemberType} from '@/types.ts'
import {MembersPage} from './MembersPage'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

export function ClubAdminPage() {
    const t = useT()
    const user = useAppStore(s => s.user)
    const {setPenaltyTypes, setRegularMembers, setGameTemplates} = useAppStore()
    const [tab, setTab] = useHashTab<'settings' | 'penalties' | 'templates' | 'teams' | 'clubs' | 'members' | 'pins'>('settings', ['settings', 'penalties', 'templates', 'teams', 'clubs', 'members', 'pins'])

    const qc = useQueryClient()
    const {data: club} = useQuery({queryKey: ['club'], queryFn: api.getClub, staleTime: 60000})
    const {data: penaltyTypes = [], refetch: refetchPT} = useQuery({
        queryKey: ['penalty-types'], queryFn: async () => {
            const d = await api.listPenaltyTypes();
            setPenaltyTypes(d);
            return d
        }
    })
    const {data: gameTemplates = [], refetch: refetchGT} = useQuery({
        queryKey: ['game-templates'], queryFn: async () => {
            const d = await api.listGameTemplates();
            setGameTemplates(d);
            return d
        }
    })
    const {data: regularMembers = [], refetch: refetchRM} = useQuery({
        queryKey: ['regular-members'], queryFn: async () => {
            const d = await api.listRegularMembers();
            setRegularMembers(d);
            return d
        }
    })

    const TABS = [
        {id: 'settings', label: t('club.tab.settings')},
        {id: 'members', label: t('club.tab.members')},
        {id: 'penalties', label: t('club.tab.penalties')},
        {id: 'templates', label: t('club.tab.templates')},
        {id: 'teams', label: t('club.tab.teams')},
        {id: 'pins', label: t('club.tab.pins')},
        ...(user?.role === 'superadmin' ? [{id: 'clubs', label: t('club.tab.clubs')}] : []),
    ]

    return (
        <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column'}}>
            {/* Header: title + tab strip */}
            <div className="flex-shrink-0 px-3 pt-3 pb-0">
                <div className="sec-heading">{t('club.title')}</div>
                <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
                    {TABS.map(tb => (
                        <button key={tb.id} type="button"
                                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === tb.id ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                                onClick={() => setTab(tb.id as any)}>{tb.label}</button>
                    ))}
                </div>
            </div>

            {/* Members tab: full-height mounted sub-page */}
            {tab === 'members' && (
                <div style={{flex: 1, overflow: 'hidden', position: 'relative'}}>
                    <MembersPage/>
                </div>
            )}

            {/* All other tabs: scrollable inline content */}
            {tab !== 'members' && (
                <div className="page-scroll px-3 pb-24">
                    {tab === 'settings' && (
                        <AdminGuard>
                            <ClubSettingsTab club={club} onSaved={async () => {
                                await qc.invalidateQueries({queryKey: ['club']})
                                showToast(t('club.savedOk'))
                            }}/>
                        </AdminGuard>
                    )}
                    {tab === 'penalties' && (
                        <AdminGuard>
                            <PenaltyTypesTab penaltyTypes={penaltyTypes} onChanged={refetchPT}/>
                        </AdminGuard>
                    )}
                    {tab === 'templates' && (
                        <AdminGuard>
                            <GameTemplatesTab templates={gameTemplates} onChanged={refetchGT}/>
                        </AdminGuard>
                    )}
                    {tab === 'teams' && (
                        <AdminGuard>
                            <ClubTeamsTab/>
                        </AdminGuard>
                    )}
                    {tab === 'pins' && (
                        <AdminGuard>
                            <PinsTab regularMembers={regularMembers}/>
                        </AdminGuard>
                    )}
                    {tab === 'clubs' && user?.role === 'superadmin' && (
                        <SuperadminClubsTab qc={qc}/>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Club Settings ──
function ClubSettingsTab({club, onSaved}: { club: any; onSaved: () => void }) {
    const t = useT()
    const setGuestPenaltyCap = useAppStore(s => s.setGuestPenaltyCap)
    const [clubName, setClubName] = useState(club?.name || '')
    const [venue, setVenue] = useState(club?.settings?.home_venue || '')
    const [color1, setColor1] = useState(club?.settings?.primary_color || '#e8a020')
    const [color2, setColor2] = useState(club?.settings?.secondary_color || '#6b7c5a')
    const [bgColor, setBgColor] = useState(club?.settings?.bg_color || '#1a1410')
    const [guestCap, setGuestCap] = useState(club?.settings?.guest_penalty_cap != null ? String(club.settings.guest_penalty_cap) : '')
    const [paypalMe, setPaypalMe] = useState(club?.settings?.paypal_me || '')
    const [noRsvpExtra, setNoRsvpExtra] = useState(club?.settings?.no_cancel_fee != null ? String(club.settings.no_cancel_fee) : '')
    const [pinPenalty, setPinPenalty] = useState(club?.settings?.pin_penalty != null ? String(club.settings.pin_penalty) : '')
    const [defaultEveningTime, setDefaultEveningTime] = useState(club?.settings?.default_evening_time || '20:00')

    useEffect(() => {
        if (!club) return
        setClubName(club.name || '')
        setVenue(club.settings?.home_venue || '')
        setColor1(club.settings?.primary_color || '#e8a020')
        setColor2(club.settings?.secondary_color || '#6b7c5a')
        setBgColor(club.settings?.bg_color || '#1a1410')
        setGuestCap(club.settings?.guest_penalty_cap != null ? String(club.settings.guest_penalty_cap) : '')
        setPaypalMe(club.settings?.paypal_me || '')
        setNoRsvpExtra(club.settings?.no_cancel_fee != null ? String(club.settings.no_cancel_fee) : '')
        setPinPenalty(club.settings?.pin_penalty != null ? String(club.settings.pin_penalty) : '')
        setDefaultEveningTime(club.settings?.default_evening_time || '20:00')
    }, [club])

    async function handleSave() {
        const cap = guestCap.trim() ? parseAmount(guestCap) : null
        const noRsvp = noRsvpExtra.trim() ? parseAmount(noRsvpExtra) : null
        const pinP = pinPenalty.trim() ? parseAmount(pinPenalty) : null
        await api.updateClubSettings({
            name: clubName || undefined,
            home_venue: venue,
            primary_color: color1,
            secondary_color: color2,
            bg_color: bgColor,
            guest_penalty_cap: cap,
            paypal_me: paypalMe.trim() || null,
            no_cancel_fee: noRsvp,
            pin_penalty: pinP,
            default_evening_time: defaultEveningTime || undefined,
        })
        applyClubTheme({settings: {primary_color: color1, secondary_color: color2, bg_color: bgColor}})
        setGuestPenaltyCap(cap)
        onSaved()
    }

    return (
        <div className="flex flex-col gap-4">

            {/* ── Allgemein ── */}
            <div className="kce-card p-4">
                <div className="sec-heading mb-3">{t('club.settings.general')}</div>
                <div className="mb-3">
                    <label className="field-label">{t('club.name.label')}</label>
                    <input className="kce-input" value={clubName} onChange={e => setClubName(e.target.value)}
                           placeholder="Vereinsname"/>
                </div>
                <div className="mt-3">
                    <label className="field-label">{t('club.defaultVenue')}</label>
                    <input className="kce-input" value={venue} onChange={e => setVenue(e.target.value)}
                           placeholder={t('club.defaultVenuePlaceholder')}/>
                </div>
                <div className="mt-3">
                    <label className="field-label">{t('schedule.defaultTime')}</label>
                    <input type="time" className="kce-input" style={{width: 'auto'}} value={defaultEveningTime}
                           onChange={e => setDefaultEveningTime(e.target.value)}/>
                    <p className="text-xs text-kce-muted mt-1">{t('schedule.defaultTimeHint')}</p>
                </div>
            </div>

            {/* ── Erscheinungsbild ── */}
            <div className="kce-card p-4">
                <div className="sec-heading mb-3">{t('club.settings.appearance')}</div>
                <div className="flex gap-3">
                    <div className="flex-1">
                        <label className="field-label">{t('club.color.primary')}</label>
                        <div className="flex gap-2 items-center">
                            <input type="color" value={color1} onChange={e => setColor1(e.target.value)}
                                   className="w-10 h-9 rounded cursor-pointer border-0 bg-transparent"/>
                            <span className="text-kce-muted text-xs font-mono">{color1}</span>
                        </div>
                    </div>
                    <div className="flex-1">
                        <label className="field-label">{t('club.color.secondary')}</label>
                        <div className="flex gap-2 items-center">
                            <input type="color" value={color2} onChange={e => setColor2(e.target.value)}
                                   className="w-10 h-9 rounded cursor-pointer border-0 bg-transparent"/>
                            <span className="text-kce-muted text-xs font-mono">{color2}</span>
                        </div>
                    </div>
                    <div className="flex-1">
                        <label className="field-label">{t('club.color.bg')}</label>
                        <div className="flex gap-2 items-center">
                            <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                                   className="w-10 h-9 rounded cursor-pointer border-0 bg-transparent"/>
                            <span className="text-kce-muted text-xs font-mono">{bgColor}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Sonderstrafen ── */}
            <div className="kce-card p-4">
                <div className="sec-heading mb-3">{t('club.settings.specialPenalties')}</div>
                <div className="mb-3">
                    <label className="field-label">{t('club.penalty.guestCap')}</label>
                    <div className="flex items-center gap-2">
                        <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
                        <input className="kce-input flex-1" type="text" inputMode="decimal"
                               value={guestCap} placeholder={t('club.penalty.guestCapPlaceholder')}
                               onChange={e => setGuestCap(e.target.value)}/>
                    </div>
                    <p className="text-xs text-kce-muted mt-1">{t('club.penalty.guestCapHint')}</p>
                </div>
                <div className="mb-3">
                    <label className="field-label">{t('club.noRsvpExtra')}</label>
                    <div className="flex items-center gap-2">
                        <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
                        <input className="kce-input flex-1" type="text" inputMode="decimal"
                               value={noRsvpExtra} placeholder={t('club.noRsvpExtraPlaceholder')}
                               onChange={e => setNoRsvpExtra(e.target.value)}/>
                    </div>
                    <p className="text-xs text-kce-muted mt-1">{t('club.noRsvpExtraHint')}</p>
                </div>
                <div>
                    <label className="field-label">{t('club.pinPenalty')}</label>
                    <div className="flex items-center gap-2">
                        <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
                        <input className="kce-input flex-1" type="text" inputMode="decimal"
                               value={pinPenalty} placeholder={t('club.pinPenaltyPlaceholder')}
                               onChange={e => setPinPenalty(e.target.value)}/>
                    </div>
                    <p className="text-xs text-kce-muted mt-1">{t('club.pinPenaltyHint')}</p>
                </div>
            </div>

            {/* ── Zahlungen ── */}
            <div className="kce-card p-4">
                <div className="sec-heading mb-3">{t('club.settings.payments')}</div>
                <div>
                    <label className="field-label">{t('club.paypalMe')}</label>
                    <div className="flex items-center gap-2">
                        <span className="text-kce-muted text-xs flex-shrink-0">paypal.me/</span>
                        <input className="kce-input flex-1" type="text"
                               value={paypalMe} placeholder={t('club.paypalMePlaceholder')}
                               onChange={e => setPaypalMe(e.target.value.replace(/^https?:\/\/paypal\.me\//i, '').trim())}/>
                    </div>
                    <p className="text-xs text-kce-muted mt-1">{t('club.paypalMeHint')}</p>
                </div>
            </div>

            <button className="btn-primary w-full" onClick={handleSave}>{t('action.save')}</button>

            <ReminderSettingsCard />
            <BroadcastPushCard />
        </div>
    )
}


function ReminderToggle({value, onChange}: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!value)}
            className={['relative w-9 h-5 rounded-full transition-colors flex-shrink-0', value ? 'bg-kce-amber' : 'bg-kce-surface2'].join(' ')}
            aria-pressed={value}
        >
            <span className={['absolute top-0.5 left-0 w-4 h-4 rounded-full bg-white shadow transition-transform', value ? 'translate-x-4' : 'translate-x-0.5'].join(' ')} />
        </button>
    )
}

function ReminderSettingsCard() {
    const t = useT()
    const {data: saved, isLoading} = useQuery<ReminderSettings>({
        queryKey: ['reminder-settings'],
        queryFn: api.getReminderSettings,
        staleTime: 60000,
    })

    const [debtWeekly, setDebtWeekly] = useState<ReminderTypeSettings>({enabled: false, weekday: 1, min_debt: 5})
    const [upcoming, setUpcoming] = useState<ReminderTypeSettings>({enabled: false, days_before: 5})
    const [rsvp, setRsvp] = useState<ReminderTypeSettings>({enabled: false, days_before: 3})
    const [dayOf, setDayOf] = useState<ReminderTypeSettings>({enabled: false})
    const [payNudge, setPayNudge] = useState<ReminderTypeSettings>({enabled: false, days_pending: 3})

    useEffect(() => {
        if (!saved) return
        setDebtWeekly(s => ({...s, ...saved.debt_weekly}))
        setUpcoming(s => ({...s, ...saved.upcoming_evening}))
        setRsvp(s => ({...s, ...saved.rsvp_reminder}))
        setDayOf(s => ({...s, ...saved.debt_day_of}))
        setPayNudge(s => ({...s, ...saved.payment_request_nudge}))
    }, [saved])

    async function handleSave() {
        await api.updateReminderSettings({
            debt_weekly: debtWeekly,
            upcoming_evening: upcoming,
            rsvp_reminder: rsvp,
            debt_day_of: dayOf,
            payment_request_nudge: payNudge,
        })
        showToast(t('reminders.saved'))
    }

    if (isLoading) return null

    const WEEKDAYS = [
        {v: 0, label: t('reminders.weekday.mon')},
        {v: 1, label: t('reminders.weekday.tue')},
        {v: 2, label: t('reminders.weekday.wed')},
        {v: 3, label: t('reminders.weekday.thu')},
        {v: 4, label: t('reminders.weekday.fri')},
        {v: 5, label: t('reminders.weekday.sat')},
        {v: 6, label: t('reminders.weekday.sun')},
    ]

    return (
        <div className="kce-card p-4">
            <div className="sec-heading mb-4">{t('reminders.title')}</div>

            {/* debt_weekly */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-kce-cream">{t('reminders.debt_weekly')}</span>
                    <ReminderToggle value={!!debtWeekly.enabled} onChange={v => setDebtWeekly(s => ({...s, enabled: v}))} />
                </div>
                <p className="text-xs text-kce-muted mb-2">{t('reminders.debt_weekly.hint')}</p>
                {debtWeekly.enabled && (
                    <div className="flex gap-3 mt-2">
                        <div className="flex-1">
                            <label className="field-label">{t('reminders.weekday')}</label>
                            <select className="kce-input" value={debtWeekly.weekday ?? 1}
                                    onChange={e => setDebtWeekly(s => ({...s, weekday: Number(e.target.value)}))}>
                                {WEEKDAYS.map(d => <option key={d.v} value={d.v}>{d.label}</option>)}
                            </select>
                        </div>
                        <div className="w-28">
                            <label className="field-label">{t('reminders.min_debt')}</label>
                            <input type="number" min={0} step={0.5} className="kce-input"
                                   value={debtWeekly.min_debt ?? 5}
                                   onChange={e => setDebtWeekly(s => ({...s, min_debt: Number(e.target.value)}))} />
                        </div>
                    </div>
                )}
            </div>

            {/* upcoming_evening */}
            <div className="mb-4 border-t border-kce-surface2 pt-4">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-kce-cream">{t('reminders.upcoming_evening')}</span>
                    <ReminderToggle value={!!upcoming.enabled} onChange={v => setUpcoming(s => ({...s, enabled: v}))} />
                </div>
                <p className="text-xs text-kce-muted mb-2">{t('reminders.upcoming_evening.hint')}</p>
                {upcoming.enabled && (
                    <div className="mt-2 w-28">
                        <label className="field-label">{t('reminders.days_before')}</label>
                        <input type="number" min={1} max={30} className="kce-input"
                               value={upcoming.days_before ?? 5}
                               onChange={e => setUpcoming(s => ({...s, days_before: Number(e.target.value)}))} />
                    </div>
                )}
            </div>

            {/* rsvp_reminder */}
            <div className="mb-4 border-t border-kce-surface2 pt-4">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-kce-cream">{t('reminders.rsvp_reminder')}</span>
                    <ReminderToggle value={!!rsvp.enabled} onChange={v => setRsvp(s => ({...s, enabled: v}))} />
                </div>
                <p className="text-xs text-kce-muted mb-2">{t('reminders.rsvp_reminder.hint')}</p>
                {rsvp.enabled && (
                    <div className="mt-2 w-28">
                        <label className="field-label">{t('reminders.days_before')}</label>
                        <input type="number" min={1} max={14} className="kce-input"
                               value={rsvp.days_before ?? 3}
                               onChange={e => setRsvp(s => ({...s, days_before: Number(e.target.value)}))} />
                    </div>
                )}
            </div>

            {/* debt_day_of */}
            <div className="mb-4 border-t border-kce-surface2 pt-4">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-kce-cream">{t('reminders.debt_day_of')}</span>
                    <ReminderToggle value={!!dayOf.enabled} onChange={v => setDayOf(s => ({...s, enabled: v}))} />
                </div>
                <p className="text-xs text-kce-muted">{t('reminders.debt_day_of.hint')}</p>
            </div>

            {/* payment_request_nudge */}
            <div className="mb-4 border-t border-kce-surface2 pt-4">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-kce-cream">{t('reminders.payment_nudge')}</span>
                    <ReminderToggle value={!!payNudge.enabled} onChange={v => setPayNudge(s => ({...s, enabled: v}))} />
                </div>
                <p className="text-xs text-kce-muted mb-2">{t('reminders.payment_nudge.hint')}</p>
                {payNudge.enabled && (
                    <div className="mt-2 w-28">
                        <label className="field-label">{t('reminders.days_pending')}</label>
                        <input type="number" min={1} max={30} className="kce-input"
                               value={payNudge.days_pending ?? 3}
                               onChange={e => setPayNudge(s => ({...s, days_pending: Number(e.target.value)}))} />
                    </div>
                )}
            </div>

            <div className="flex gap-2 mt-0">
                <button className="btn-primary flex-1" onClick={handleSave}>{t('action.save')}</button>
                <button className="btn-secondary flex-shrink-0" onClick={async () => {
                    try {
                        await api.triggerReminders()
                        showToast(t('reminders.triggered'))
                    } catch (e) { toastError(e) }
                }}>{t('reminders.triggerNow')}</button>
            </div>
        </div>
    )
}


function BroadcastPushCard() {
    const t = useT()
    const [bTitle, setBTitle] = useState('')
    const [bBody, setBBody] = useState('')
    const [bUrl, setBUrl] = useState('/')
    const [sending, setSending] = useState(false)

    async function handleBroadcast() {
        if (!bTitle.trim() || !bBody.trim()) return
        setSending(true)
        try {
            await api.broadcastPush({title: bTitle.trim(), body: bBody.trim(), url: bUrl.trim() || '/'})
            showToast(t('broadcast.sent'))
            setBTitle('')
            setBBody('')
            setBUrl('/')
        } catch {
            showToast('Fehler beim Senden')
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="kce-card p-4">
            <div className="sec-heading mb-3">{t('broadcast.title')}</div>
            <div className="mb-3">
                <label className="field-label">{t('broadcast.label')}</label>
                <input className="kce-input" value={bTitle} onChange={e => setBTitle(e.target.value)} placeholder={t('broadcast.label')}/>
            </div>
            <div className="mb-3">
                <label className="field-label">{t('broadcast.body')}</label>
                <textarea className="kce-input" rows={2} value={bBody} onChange={e => setBBody(e.target.value)} placeholder={t('broadcast.body')}/>
            </div>
            <div className="mb-3">
                <label className="field-label">{t('broadcast.url')}</label>
                <input className="kce-input" value={bUrl} onChange={e => setBUrl(e.target.value)} placeholder="/"/>
            </div>
            <button className="btn-primary w-full" onClick={handleBroadcast} disabled={sending || !bTitle.trim() || !bBody.trim()}>
                {sending ? '…' : t('broadcast.send')}
            </button>
        </div>
    )
}


// ── Penalty Types ──
function PenaltyTypesTab({penaltyTypes, onChanged}: { penaltyTypes: PenaltyType[]; onChanged: () => void }) {
    const t = useT()
    const [icon, setIcon] = useState('⚠️')
    const [name, setName] = useState('')
    const [amount, setAmount] = useState('0.50')

    // edit sheet
    const [editPt, setEditPt] = useState<PenaltyType | null>(null)
    const [editIcon, setEditIcon] = useState('')
    const [editName, setEditName] = useState('')
    const [editAmount, setEditAmount] = useState('')

    function openEdit(pt: PenaltyType) {
        setEditPt(pt)
        setEditIcon(pt.icon)
        setEditName(pt.name)
        setEditAmount(String(pt.default_amount))
    }

    return (
        <div>
            {penaltyTypes.map(pt => (
                <div key={pt.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                    <span className="text-xl">{pt.icon}</span>
                    <div className="flex-1">
                        <div className="text-sm font-bold">{pt.name}</div>
                        <div className="text-xs text-kce-muted">{fe(pt.default_amount)}</div>
                    </div>
                    <button className="btn-ghost btn-xs text-kce-muted"
                            onClick={() => openEdit(pt)}>✏️
                    </button>
                    <button className="btn-danger btn-xs"
                            onClick={() => api.deletePenaltyType(pt.id).then(onChanged)}>✕
                    </button>
                </div>
            ))}
            <form className="kce-card p-3 mt-2" onSubmit={async e => {
                e.preventDefault()
                if (!name.trim()) return
                await api.createPenaltyType({icon, name, default_amount: parseAmount(amount), sort_order: 99})
                setIcon('⚠️');
                setName('');
                setAmount('0.50');
                onChanged()
            }}>
                <div className="field-label">{t('club.penalty.newLabel')}</div>
                <div className="flex gap-2 mb-2">
                    <EmojiPickerButton value={icon} onChange={setIcon}/>
                    <input className="kce-input flex-1" value={name} onChange={e => setName(e.target.value)}
                           placeholder="Name"/>
                    <input className="kce-input w-20" type="text" inputMode="decimal" value={amount}
                           onChange={e => setAmount(e.target.value)}/>
                </div>
                <button type="submit" className="btn-primary w-full btn-sm">+ {t('action.add')}</button>
            </form>

            <Sheet open={!!editPt} onClose={() => setEditPt(null)} title={t('club.penalty.editLabel')}
                   onSubmit={async () => {
                       if (!editPt || !editName.trim()) return
                       await api.updatePenaltyType(editPt.id, {
                           icon: editIcon,
                           name: editName,
                           default_amount: parseAmount(editAmount),
                           sort_order: editPt.sort_order,
                       })
                       setEditPt(null)
                       onChanged()
                   }}>
                <div className="flex flex-col gap-3">
                    <p className="text-xs text-kce-muted">{t('club.penalty.editHint')}</p>
                    <div className="flex gap-2">
                        <div>
                            <label className="field-label">Icon</label>
                            <EmojiPickerButton value={editIcon} onChange={setEditIcon}/>
                        </div>
                        <div className="flex-1">
                            <label className="field-label">Name</label>
                            <input className="kce-input" value={editName}
                                   onChange={e => setEditName(e.target.value)}/>
                        </div>
                    </div>
                    <div>
                        <label className="field-label">{t('club.penalty.defaultAmount')}</label>
                        <div className="flex items-center gap-2">
                            <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={editAmount} onChange={e => setEditAmount(e.target.value)}/>
                        </div>
                    </div>
                    <button type="submit" className="btn-primary w-full mt-1"
                            disabled={!editName.trim()}>{t('action.save')}</button>
                </div>
            </Sheet>
        </div>
    )
}

// ── Game Templates ──
function GameTemplatesTab({templates, onChanged}: { templates: GameTemplate[]; onChanged: () => void }) {
    const t = useT()
    const [sheet, setSheet] = useState(false)
    const [editing, setEditing] = useState<GameTemplate | null>(null)
    const [name, setName] = useState('')
    const [desc, setDesc] = useState('')
    const [wtype, setWtype] = useState('either')
    const [isOpener, setIsOpener] = useState(false)
    const [penalty, setPenalty] = useState('0')
    const [perPoint, setPerPoint] = useState('0')

    const openNew = () => {
        setEditing(null);
        setName('');
        setDesc('');
        setWtype('either');
        setIsOpener(false);
        setPenalty('0');
        setPerPoint('0');
        setSheet(true)
    }
    const openEdit = (gt: GameTemplate) => {
        setEditing(gt);
        setName(gt.name);
        setDesc(gt.description || '');
        setWtype(gt.winner_type);
        setIsOpener(gt.is_opener);
        setPenalty(String(gt.default_loser_penalty));
        setPerPoint(String(gt.per_point_penalty ?? 0));
        setSheet(true)
    }

    async function saveTemplate() {
        if (!name.trim()) return
        const d = {
            name, description: desc || undefined, winner_type: wtype,
            is_opener: isOpener,
            default_loser_penalty: parseAmount(penalty),
            per_point_penalty: parseAmount(perPoint), sort_order: 0
        }
        if (editing) await api.updateGameTemplate(editing.id, d)
        else await api.createGameTemplate(d)
        onChanged();
        setSheet(false)
    }

    return (
        <div>
            <button className="btn-primary btn-sm mb-3" onClick={openNew}>+ {t('club.template.add')}</button>
            {!templates.length && <Empty icon="🏆" text={t('club.template.none')}/>}
            {templates.map((gt, i) => (
                <div key={gt.id} className="kce-card p-3 mb-2 flex items-start gap-3">
                    <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                            {gt.is_opener && <span className="text-base">👑</span>}
                            <span className="text-sm font-bold">{gt.name}</span>
                        </div>
                        {gt.description && <div className="text-xs text-kce-muted mt-0.5">{gt.description}</div>}
                        <div className="flex gap-2 mt-1">
                            <span className="text-[10px] text-kce-muted">{gt.winner_type}</span>
                            {gt.default_loser_penalty > 0 &&
                                <span className="text-[10px] text-red-400">{fe(gt.default_loser_penalty)}</span>}
                            {(gt.per_point_penalty ?? 0) > 0 &&
                                <span className="text-[10px] text-orange-400">+{fe(gt.per_point_penalty)}/P</span>}
                        </div>
                    </div>
                    <div className="flex gap-1">
                        <button className="btn-secondary btn-xs" onClick={() => openEdit(gt)}>✏️</button>
                        <button className="btn-danger btn-xs"
                                onClick={() => api.deleteGameTemplate(gt.id).then(onChanged)}>✕
                        </button>
                    </div>
                </div>
            ))}

            <Sheet open={sheet} onClose={() => setSheet(false)}
                   title={editing ? t('club.template.edit') : t('club.template.new')} onSubmit={saveTemplate}>
                <div className="flex flex-col gap-3">
                    <div><label className="field-label">{t('game.name')}</label>
                        <div className="flex gap-2">
                            <input className="kce-input flex-1" value={name} onChange={e => setName(e.target.value)}/>
                            <EmojiPickerButton mode="insert" value={name} onChange={setName}/>
                        </div>
                    </div>
                    <div><label className="field-label">{t('club.template.description')}</label>
                        <input className="kce-input" value={desc} onChange={e => setDesc(e.target.value)}/></div>
                    <div><label className="field-label">{t('club.template.winnerType')}</label>
                        <select className="kce-input" value={wtype} onChange={e => setWtype(e.target.value)}>
                            <option value="either">{t('club.template.winnerType.either')}</option>
                            <option value="team">{t('club.template.winnerType.team')}</option>
                            <option value="individual">{t('club.template.winnerType.individual')}</option>
                        </select></div>
                    <div className="flex items-center gap-3">
                        <input type="checkbox" id="is-opener" checked={isOpener}
                               onChange={e => setIsOpener(e.target.checked)}/>
                        <label htmlFor="is-opener" className="text-sm font-bold cursor-pointer">
                            {t('club.template.isOpener')}
                        </label>
                    </div>
                    <div><label className="field-label">{t('club.template.loserPenalty')}</label>
                        <input className="kce-input" type="text" inputMode="decimal" value={penalty}
                               onChange={e => setPenalty(e.target.value)}/></div>
                    <div><label className="field-label">{t('game.perPointPenalty')}</label>
                        <input className="kce-input" type="text" inputMode="decimal" value={perPoint}
                               onChange={e => setPerPoint(e.target.value)}/>
                        <p className="text-xs text-kce-muted mt-1">{t('game.perPointNote')}</p>
                    </div>
                    <button type="submit" className="btn-primary w-full mt-1">{t('action.save')}</button>
                </div>
            </Sheet>
        </div>
    )
}

// ── Superadmin: All Clubs ──
function SuperadminClubsTab({qc}: { qc: ReturnType<typeof useQueryClient> }) {
    const t = useT()
    const {setUser} = useAppStore()
    const [newName, setNewName] = useState('')
    const {data: clubs = [], refetch} = useQuery({
        queryKey: ['superadmin-clubs'],
        queryFn: api.listAllClubs,
    })

    const handleSwitch = async (clubId: number) => {
        const res = await api.switchClub(clubId)
        authState.setToken(res.access_token)
        setUser(res.user)
        await qc.invalidateQueries()
        window.location.reload()
    }

    const handleCreate = async () => {
        if (!newName.trim()) return
        await api.createClub(newName.trim())
        setNewName('')
        refetch()
        showToast(t('superadmin.clubs.created'))
    }

    return (
        <div className="flex flex-col gap-3">
            {clubs.map(c => (
                <div key={c.id} className="kce-card p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate">{c.name}</div>
                        <div className="text-[10px] text-kce-muted font-mono">{c.slug} · {c.member_count} Mitglieder
                        </div>
                    </div>
                    {c.is_active ? (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded"
                              style={{background: 'rgba(232,160,32,.15)', color: '#e8a020'}}>
                            {t('superadmin.clubs.active')}
                        </span>
                    ) : (
                        <button className="btn-secondary btn-xs" onClick={() => handleSwitch(c.id)}>
                            {t('superadmin.clubs.switch')}
                        </button>
                    )}
                </div>
            ))}

            <div className="kce-card p-3 mt-1">
                <div className="field-label">{t('superadmin.clubs.create')}</div>
                <div className="flex gap-2">
                    <input className="kce-input flex-1" value={newName} onChange={e => setNewName(e.target.value)}
                           placeholder={t('superadmin.clubs.namePlaceholder')}
                           onKeyDown={e => e.key === 'Enter' && handleCreate()}/>
                    <button className="btn-primary btn-sm flex-shrink-0" onClick={handleCreate}>+</button>
                </div>
            </div>
        </div>
    )
}

// ── Club Teams ──
function ClubTeamsTab() {
    const t = useT()
    const {data: teams = [], refetch} = useQuery({
        queryKey: ['club-teams'],
        queryFn: api.listClubTeams,
    })
    const [sheet, setSheet] = useState(false)
    const [editing, setEditing] = useState<{ id: number; name: string; sort_order: number } | null>(null)
    const [name, setName] = useState('')
    const [sortOrder, setSortOrder] = useState('0')

    function openNew() {
        setEditing(null);
        setName('');
        setSortOrder(String(teams.length));
        setSheet(true)
    }

    function openEdit(t: { id: number; name: string; sort_order: number }) {
        setEditing(t);
        setName(t.name);
        setSortOrder(String(t.sort_order));
        setSheet(true)
    }

    async function save() {
        if (!name.trim()) return
        const d = {name: name.trim(), sort_order: parseInt(sortOrder) || 0}
        if (editing) await api.updateClubTeam(editing.id, d)
        else await api.createClubTeam(d)
        refetch()
        setSheet(false)
    }

    return (
        <div>
            <p className="text-xs text-kce-muted mb-3">{t('club.teams.description')}</p>
            <button className="btn-primary btn-sm mb-3" onClick={openNew}>+ {t('club.teams.add')}</button>
            {teams.length === 0 && <Empty icon="🤝" text={t('club.teams.none')}/>}
            {teams.map(team => (
                <div key={team.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                    <div
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-kce-bg text-sm flex-shrink-0"
                        style={{background: 'linear-gradient(135deg,var(--kce-secondary),var(--kce-primary))'}}>
                        {team.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 font-bold text-sm">{team.name}</div>
                    <button className="btn-secondary btn-xs" onClick={() => openEdit(team)}>✏️</button>
                    <button className="btn-danger btn-xs"
                            onClick={() => api.deleteClubTeam(team.id).then(() => refetch())}>✕
                    </button>
                </div>
            ))}

            <Sheet open={sheet} onClose={() => setSheet(false)}
                   title={editing ? t('club.teams.edit') : t('club.teams.new')} onSubmit={save}>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="field-label">{t('club.teams.name')}</label>
                        <div className="flex gap-2">
                            <input className="kce-input flex-1" value={name} onChange={e => setName(e.target.value)}
                                   placeholder="z.B. Team A, Die Adler…"/>
                            <EmojiPickerButton mode="insert" value={name} onChange={setName}/>
                        </div>
                    </div>
                    <div>
                        <label className="field-label">{t('club.teams.sortOrder')}</label>
                        <input className="kce-input w-20" type="number" value={sortOrder}
                               onChange={e => setSortOrder(e.target.value)} min="0"/>
                    </div>
                    <button type="submit" className="btn-primary w-full"
                            disabled={!name.trim()}>{t('action.save')}</button>
                </div>
            </Sheet>
        </div>
    )
}

// ── Pins ──
function PinsTab({regularMembers}: { regularMembers: RegularMemberType[] }) {
    const t = useT()
    const {data: pins = [], refetch} = useQuery({queryKey: ['pins'], queryFn: api.listPins})
    const [sheet, setSheet] = useState(false)
    const [editing, setEditing] = useState<ClubPin | null>(null)
    const [pinName, setPinName] = useState('')
    const [pinIcon, setPinIcon] = useState('📌')
    const [holderId, setHolderId] = useState<number | null>(null)
    const [pinDate, setPinDate] = useState('')

    function openNew() {
        setEditing(null); setPinName(''); setPinIcon('📌'); setHolderId(null);
        setPinDate(new Date().toISOString().slice(0, 10)); setSheet(true)
    }

    function openEdit(p: ClubPin) {
        setEditing(p);
        setPinName(p.name);
        setPinIcon(p.icon);
        setHolderId(p.holder_regular_member_id);
        setPinDate(p.assigned_at ? new Date(p.assigned_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
        setSheet(true)
    }

    async function save() {
        if (!pinName.trim()) return
        const d = {name: pinName.trim(), icon: pinIcon}
        if (editing) {
            await api.updatePin(editing.id, {...d, holder_regular_member_id: holderId, assigned_at: holderId ? pinDate || null : null})
        } else {
            const created = await api.createPin(d)
            if (holderId !== null) await api.updatePin(created.id, {holder_regular_member_id: holderId, assigned_at: pinDate || null})
        }
        await refetch()
        setSheet(false)
    }

    return (
        <div>
            <button className="btn-primary btn-sm mb-3" onClick={openNew}>+ {t('pin.add')}</button>
            {pins.length === 0 && <Empty icon="📌" text={t('pin.none')}/>}
            {pins.map(p => {
                const holderMember = p.holder_regular_member_id
                    ? regularMembers.find(m => m.id === p.holder_regular_member_id)
                    : null
                const holderDisplayName = holderMember
                    ? (holderMember.nickname || holderMember.name)
                    : p.holder_name
                return (
                <div key={p.id} className="kce-card p-3 mb-2 flex items-start gap-3">
                    <div className="text-2xl flex-shrink-0">{p.icon}</div>
                    <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">{p.name}</div>
                        <div className="text-xs mt-0.5">
                            {holderDisplayName
                                ? <span className="text-kce-amber font-bold">📌 {holderDisplayName}</span>
                                : <span className="text-kce-muted">{t('pin.noHolder')}</span>
                            }
                            {p.assigned_at && (
                                <span className="text-[10px] text-kce-muted ml-1">
                                    {t('pin.holderSince')} {new Date(p.assigned_at).toLocaleDateString('de-DE')}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                        <button className="btn-secondary btn-xs" onClick={() => openEdit(p)}>✏️</button>
                        <button className="btn-danger btn-xs"
                                onClick={() => api.deletePin(p.id).then(() => refetch())}>✕</button>
                    </div>
                </div>
                )
            })}

            <Sheet open={sheet} onClose={() => setSheet(false)}
                   title={editing ? t('pin.edit') : t('pin.new')} onSubmit={save}>
                <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                        <div>
                            <label className="field-label">{t('pin.icon')}</label>
                            <EmojiPickerButton value={pinIcon} onChange={setPinIcon}/>
                        </div>
                        <div className="flex-1">
                            <label className="field-label">{t('pin.name')}</label>
                            <input className="kce-input" value={pinName} onChange={e => setPinName(e.target.value)}
                                   placeholder="z.B. Vereinsnadel"/>
                        </div>
                    </div>
                    <div>
                        <label className="field-label">{t('pin.assignHolder')}</label>
                        <select className="kce-input" value={holderId ?? ''} onChange={e => setHolderId(e.target.value ? Number(e.target.value) : null)}>
                            <option value="">{t('pin.noHolder')}</option>
                            {regularMembers.filter(m => !m.is_guest).map(m => (
                                <option key={m.id} value={m.id}>{m.nickname || m.name}</option>
                            ))}
                        </select>
                    </div>
                    {holderId && (
                        <div>
                            <label className="field-label">{t('pin.assignedAt')}</label>
                            <input type="date" className="kce-input" value={pinDate}
                                   onChange={e => setPinDate(e.target.value)} style={{width: 'auto'}}/>
                        </div>
                    )}
                    <button type="submit" className="btn-primary w-full">{t('action.save')}</button>
                </div>
            </Sheet>
        </div>
    )
}

// ── Invites ──
