import {useEffect, useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ChipSelect} from '@/components/ui/ChipSelect.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import type {ClubPin, EveningPlayer, RegularMember, Team} from '@/types.ts'

export function EveningPage() {
    const t = useT()
    const {evening, invalidate, activeEveningId} = useActiveEvening()
    const {setActiveEveningId, regularMembers, user} = useAppStore()
    const {data: club} = useQuery({queryKey: ['club'], queryFn: api.getClub, staleTime: 60000})

    // ── Start evening form ──
    const [startDate, setStartDate] = useState(today())
    const [startVenue, setStartVenue] = useState('')
    useEffect(() => {
        if (club?.settings?.home_venue && !startVenue) setStartVenue(club.settings.home_venue)
    }, [club?.settings?.home_venue])
    const [startNote, setStartNote] = useState('')
    const [starting, setStarting] = useState(false)
    // attendance sheet shown after evening is created
    const [attendanceEveningId, setAttendanceEveningId] = useState<number | null>(null)

    // ── Edit evening sheet ──
    const [editSheet, setEditSheet] = useState(false)
    const [editDate, setEditDate] = useState('')
    const [editVenue, setEditVenue] = useState('')
    const [editNote, setEditNote] = useState('')

    // ── Add player sheet ──
    const [playerSheet, setPlayerSheet] = useState(false)
    const [guestName, setGuestName] = useState('')
    const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(new Set())
    const [addPlayerTeamId, setAddPlayerTeamId] = useState<number | null>(null)

    // ── Edit player sheet ──
    const [editPlayerSheet, setEditPlayerSheet] = useState(false)
    const [editingPlayer, setEditingPlayer] = useState<EveningPlayer | null>(null)
    const [editPlayerTeam, setEditPlayerTeam] = useState<number | null>(null)

    // ── Team sheet ──
    const [teamSheet, setTeamSheet] = useState(false)
    const [editingTeam, setEditingTeam] = useState<Team | null>(null)
    const [teamName, setTeamName] = useState('')
    const [teamPlayerIds, setTeamPlayerIds] = useState<(number | string)[]>([])

    const [closeConfirm, setCloseConfirm] = useState(false)
    const [confirmRemovePlayerId, setConfirmRemovePlayerId] = useState<number | null>(null)

    // ── Pins ──
    const {data: pins = []} = useQuery({queryKey: ['pins'], queryFn: api.listPins, staleTime: 60000})

    // ── Current president ──
    const {data: currentPresident} = useQuery({queryKey: ['president-current'], queryFn: api.getCurrentPresident, staleTime: 60000})

    // ── No active evening ──
    if (!activeEveningId && !evening) {
        return (
            <>
            <div className="page-scroll px-3 py-3 pb-24">
                <div className="sec-heading">🎳 {t('nav.evening')}</div>
                <div className="kce-card p-5">
                    <div className="text-sm font-bold text-kce-cream mb-4">{t('evening.start')}</div>
                    <div className="flex flex-col gap-3">
                        <div>
                            <label className="field-label">{t('evening.date')}</label>
                            <input className="kce-input" type="date" value={startDate}
                                   style={{width: 'auto'}}
                                   onChange={e => setStartDate(e.target.value)}/>
                        </div>
                        <div>
                            <label className="field-label">{t('evening.venue')}</label>
                            <input className="kce-input" value={startVenue}
                                   onChange={e => setStartVenue(e.target.value)}
                                   placeholder={t('evening.venuePlaceholder')}/>
                        </div>
                        <div>
                            <label className="field-label">{t('evening.note')}</label>
                            <input className="kce-input" value={startNote}
                                   onChange={e => setStartNote(e.target.value)}
                                   placeholder={t('common.optional')}/>
                        </div>
                        <button className="btn-primary mt-1" disabled={starting} onClick={async () => {
                            setStarting(true)
                            try {
                                const ev = await api.createEvening({
                                    date: startDate,
                                    venue: startVenue || undefined,
                                    note: startNote || undefined,
                                })
                                setAttendanceEveningId(ev.id)
                            } catch (e: unknown) {
                                toastError(e)
                            } finally {
                                setStarting(false)
                            }
                        }}>{t('evening.startButton')}</button>
                    </div>
                </div>
            </div>
            {attendanceEveningId !== null && (
                <UnplannedAttendanceSheet
                    eveningId={attendanceEveningId}
                    pins={pins}
                    pinPenalty={club?.settings?.pin_penalty ?? 0}
                    regularMembers={regularMembers}
                    user={user}
                    onDone={() => {
                        setActiveEveningId(attendanceEveningId)
                        setAttendanceEveningId(null)
                        invalidate()
                    }}
                    onCancel={() => {
                        // Evening already created — open it without players
                        setActiveEveningId(attendanceEveningId)
                        setAttendanceEveningId(null)
                        invalidate()
                    }}
                />
            )}
            </>
        )
    }

    if (!evening) return null

    const players = evening.players
    const teams = evening.teams
    const playerOptions = players.map(p => ({id: p.id, label: p.name}))

    function openEditSheet() {
        setEditDate(evening!.date)
        setEditVenue(evening!.venue ?? '')
        setEditNote(evening!.note ?? '')
        setEditSheet(true)
    }

    function openEditPlayer(p: EveningPlayer) {
        setEditingPlayer(p)
        setEditPlayerTeam(p.team_id)
        setEditPlayerSheet(true)
    }

    function openNewTeam() {
        setEditingTeam(null)
        setTeamName('')
        setTeamPlayerIds([])
        setTeamSheet(true)
    }

    async function saveEvening() {
        await api.updateEvening(evening!.id, {
            date: editDate, venue: editVenue || undefined, note: editNote || undefined,
        })
        invalidate();
        setEditSheet(false)
    }

    async function saveEditPlayer() {
        if (!editingPlayer) return
        await api.updatePlayer(evening!.id, editingPlayer.id, {team_id: editPlayerTeam})
        invalidate();
        setEditPlayerSheet(false)
    }

    async function saveTeam() {
        if (!teamName.trim()) return
        if (editingTeam) {
            await api.updateTeam(evening!.id, editingTeam.id, {name: teamName, player_ids: teamPlayerIds as number[]})
        } else {
            await api.createTeam(evening!.id, {name: teamName, player_ids: teamPlayerIds as number[]})
        }
        invalidate();
        setTeamSheet(false)
    }

    async function addPlayers() {
        if (selectedMemberIds.size === 0 && !guestName.trim()) return
        const adds: Promise<unknown>[] = []
        const teamPayload = addPlayerTeamId ? {team_id: addPlayerTeamId} : {}
        for (const id of selectedMemberIds) {
            const rm = regularMembers.find(r => r.id === id)!
            adds.push(api.addPlayer(evening!.id, {name: rm.nickname || rm.name, regular_member_id: rm.id, ...teamPayload}))
        }
        if (guestName.trim()) {
            const saved = await api.createRegularMember({name: guestName.trim(), is_guest: true})
            adds.push(api.addPlayer(evening!.id, {name: saved.name, regular_member_id: saved.id, ...teamPayload}))
            api.listRegularMembers().then(d => useAppStore.getState().setRegularMembers(d))
        }
        await Promise.all(adds)
        invalidate();
        setPlayerSheet(false)
    }

    function openEditTeam(team: Team) {
        setEditingTeam(team)
        setTeamName(team.name)
        setTeamPlayerIds(players.filter(p => p.team_id === team.id).map(p => p.id))
        setTeamSheet(true)
    }

    return (
        <div className="page-scroll px-3 py-3 pb-24">
            <div className="flex items-center justify-between mb-3">
                <div className="sec-heading mb-0">🎳 {t('nav.evening')}</div>
                {!evening.is_closed && (
                    <span
                        className="text-[10px] font-extrabold tracking-widest text-kce-amber border border-kce-amber rounded px-1.5 py-0.5">
                        {t('evening.active')}
                    </span>
                )}
            </div>

            {/* Evening info card */}
            <div className="kce-card p-4 mb-3">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <div className="text-sm font-bold">{formatDate(evening.date)}</div>
                        {evening.venue && <div className="text-xs text-kce-muted mt-0.5">📍 {evening.venue}</div>}
                        {evening.note && <div className="text-xs text-kce-muted mt-0.5 italic">{evening.note}</div>}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                        <button className="btn-secondary btn-xs" onClick={openEditSheet}>✏️</button>
                        {!evening.is_closed ? (
                            <button className="btn-danger btn-xs" onClick={() => setCloseConfirm(true)}>
                                {t('evening.end')}
                            </button>
                        ) : (
                            <button className="btn-secondary btn-xs" onClick={async () => {
                                await api.updateEvening(evening.id, {is_closed: false})
                                invalidate()
                            }}>{t('evening.reopen')}</button>
                        )}
                    </div>
                </div>
                {closeConfirm && (
                    <div className="mt-3 pt-3 border-t border-kce-surface2">
                        <p className="text-xs text-kce-muted mb-2">{t('evening.endConfirm')}</p>
                        <div className="flex gap-2">
                            <button className="btn-secondary btn-sm flex-1" onClick={() => setCloseConfirm(false)}>
                                {t('action.cancel')}
                            </button>
                            <button className="btn-danger btn-sm flex-1" onClick={async () => {
                                await api.updateEvening(evening.id, {is_closed: true})
                                setCloseConfirm(false)
                                invalidate()
                            }}>{t('action.done')}</button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Pins alert (holders present as players) ── */}
            {players.length > 0 && pins.length > 0 && !evening.is_closed && (
                <PinsAlert pins={pins} evening={evening} players={players}
                           regularMembers={regularMembers}
                           pinPenalty={club?.settings?.pin_penalty ?? 0} onPenaltyLogged={invalidate}/>
            )}

            {/* ── Players ── */}
            <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-extrabold text-kce-muted uppercase tracking-wider">
                    👤 {t('team.members')} ({players.length})
                </div>
                {!evening.is_closed && (
                    <button className="btn-secondary btn-xs" onClick={() => {
                        setGuestName('')
                        setSelectedMemberIds(new Set())
                        setAddPlayerTeamId(teams.length > 0 ? teams[0].id : null)
                        setPlayerSheet(true)
                    }}>+ {t('player.add')}</button>
                )}
            </div>

            {players.length === 0
                ? <Empty icon="👤" text={t('player.noPlayers')}/>
                : [...players].sort((a, b) => {
                    if (a.regular_member_id === user?.regular_member_id) return -1
                    if (b.regular_member_id === user?.regular_member_id) return 1
                    return 0
                }).map(p => {
                    const team = teams.find(t => t.id === p.team_id)
                    const rm = regularMembers.find(r => r.id === p.regular_member_id)
                    return (
                        <div key={p.id} className="kce-card mb-2">
                            <div className="p-3 flex items-center gap-3">
                                <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-kce-bg text-xs flex-shrink-0 overflow-hidden"
                                    style={{background: 'linear-gradient(135deg,#c4701a,#e8a020)'}}>
                                    {rm?.avatar
                                        ? <img src={rm.avatar} alt="" className="w-full h-full object-cover"/>
                                        : p.name[0].toUpperCase()
                                    }
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                        {p.is_king ? '👑 ' : ''}
                                        {currentPresident?.regular_member_id != null && p.regular_member_id === currentPresident.regular_member_id ? '🎯 ' : ''}
                                        {p.name}
                                        {p.regular_member_id === user?.regular_member_id && <span className="text-[9px] text-kce-amber font-bold flex-shrink-0">Ich</span>}
                                    </div>
                                    <div
                                        className="text-xs text-kce-muted">{team ? team.name : t('player.noTeam')}</div>
                                </div>
                                {!evening.is_closed && (
                                    <div className="flex gap-1">
                                        <button className="btn-secondary btn-xs" onClick={() => openEditPlayer(p)}>✏️
                                        </button>
                                        {confirmRemovePlayerId === p.id ? (
                                            <>
                                                <button className="btn-danger btn-xs" onClick={async () => {
                                                    await api.removePlayer(evening.id, p.id)
                                                    setConfirmRemovePlayerId(null)
                                                    invalidate()
                                                }}>✓
                                                </button>
                                                <button className="btn-secondary btn-xs"
                                                        onClick={() => setConfirmRemovePlayerId(null)}>✕
                                                </button>
                                            </>
                                        ) : (
                                            <button className="btn-danger btn-xs"
                                                    onClick={() => setConfirmRemovePlayerId(p.id)}>✕</button>
                                        )}
                                    </div>
                                )}
                            </div>
                            {confirmRemovePlayerId === p.id && (
                                <div className="text-xs text-red-400 px-3 pb-2">
                                    ⚠️ {t('player.removeWarning')}
                                </div>
                            )}
                        </div>
                    )
                })
            }

            {/* ── Teams ── */}
            <div className="flex items-center justify-between mb-2 mt-4">
                <div className="text-xs font-extrabold text-kce-muted uppercase tracking-wider">
                    🤝 Teams ({teams.length})
                </div>
                {!evening.is_closed && (
                    <div className="flex gap-1">
                        <button className="btn-secondary btn-xs" title={t('team.fromTemplate')}
                                onClick={async () => {
                                    try {
                                        await api.applyClubTeamsToEvening(evening.id, false);
                                        invalidate()
                                    } catch (e: unknown) {
                                        toastError(e)
                                    }
                                }}>
                            {t('team.fromTemplateBadge')}
                        </button>
                        <button className="btn-secondary btn-xs" title={t('team.randomize')}
                                onClick={async () => {
                                    if (players.length === 0) {
                                        showToast(t('team.noPlayers'));
                                        return
                                    }
                                    try {
                                        await api.applyClubTeamsToEvening(evening.id, true);
                                        invalidate()
                                    } catch (e: unknown) {
                                        toastError(e)
                                    }
                                }}>
                            🎲
                        </button>
                        <button className="btn-secondary btn-xs" onClick={openNewTeam}>+</button>
                    </div>
                )}
            </div>

            {teams.length === 0
                ? <Empty icon="🤝" text={t('club.teams.none')}/>
                : teams.map(team => {
                    const members = players.filter(p => p.team_id === team.id)
                    return (
                        <div key={team.id} className="kce-card p-3 mb-2">
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-bold">{team.name}</div>
                                {!evening.is_closed && (
                                    <div className="flex gap-1">
                                        <button className="btn-secondary btn-xs" onClick={() => openEditTeam(team)}>✏️
                                        </button>
                                        <button className="btn-danger btn-xs" onClick={async () => {
                                            await api.deleteTeam(evening.id, team.id)
                                            invalidate()
                                        }}>✕
                                        </button>
                                    </div>
                                )}
                            </div>
                            {members.length > 0 && (
                                <div className="text-xs text-kce-muted mt-1">
                                    {members.map(p => p.name).join(', ')}
                                </div>
                            )}
                        </div>
                    )
                })
            }

            {/* ── Edit evening sheet ── */}
            <Sheet open={editSheet} onClose={() => setEditSheet(false)} title={t('evening.edit')}
                   onSubmit={saveEvening}>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="field-label">{t('evening.date')}</label>
                        <input className="kce-input" type="date" value={editDate}
                               onChange={e => setEditDate(e.target.value)}/>
                    </div>
                    <div>
                        <label className="field-label">{t('evening.venue')}</label>
                        <input className="kce-input" value={editVenue} onChange={e => setEditVenue(e.target.value)}
                               placeholder={t('evening.venuePlaceholder')}/>
                    </div>
                    <div>
                        <label className="field-label">{t('evening.note')}</label>
                        <input className="kce-input" value={editNote} onChange={e => setEditNote(e.target.value)}/>
                    </div>
                    <button type="submit" className="btn-primary w-full">{t('action.save')}</button>
                </div>
            </Sheet>

            {/* ── Add player sheet ── */}
            <Sheet open={playerSheet} onClose={() => setPlayerSheet(false)} title={t('player.add')}
                   onSubmit={addPlayers}>
                <div className="flex flex-col gap-3">
                    {/* Team selection carousel */}
                    {teams.length > 0 && (
                        <div>
                            <label className="field-label">{t('team.label')}</label>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                <button
                                    type="button"
                                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${addPlayerTeamId === null ? 'bg-kce-amber text-kce-bg border-kce-amber' : 'bg-kce-surface2 text-kce-muted border-kce-border'}`}
                                    onClick={() => setAddPlayerTeamId(null)}>
                                    {t('player.noTeam')}
                                </button>
                                {teams.map(tm => (
                                    <button
                                        key={tm.id}
                                        type="button"
                                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${addPlayerTeamId === tm.id ? 'bg-kce-amber text-kce-bg border-kce-amber' : 'bg-kce-surface2 text-kce-muted border-kce-border'}`}
                                        onClick={() => setAddPlayerTeamId(tm.id)}>
                                        {tm.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {(() => {
                        const stamm = regularMembers.filter(rm => !rm.is_guest && !players.some(p => p.regular_member_id === rm.id))
                        const guests = regularMembers.filter(rm => rm.is_guest && !players.some(p => p.regular_member_id === rm.id))
                        const toggle = (id: number) => setSelectedMemberIds(prev => {
                            const next = new Set(prev);
                            next.has(id) ? next.delete(id) : next.add(id);
                            return next
                        })
                        return (<>
                            {stamm.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="field-label mb-0">{t('member.title')}</span>
                                        <div className="flex gap-1">
                                            <button type="button"
                                                    className="text-[10px] text-kce-muted px-1.5 py-0.5 rounded"
                                                    onClick={() => setSelectedMemberIds(new Set(stamm.map(m => m.id)))}>{t('action.all')}
                                            </button>
                                            <button type="button"
                                                    className="text-[10px] text-kce-muted px-1.5 py-0.5 rounded"
                                                    onClick={() => setSelectedMemberIds(new Set())}>{t('action.none')}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                                        {stamm.map(rm => (
                                            <button key={rm.id} type="button"
                                                    className={`chip ${selectedMemberIds.has(rm.id) ? 'active' : ''}`}
                                                    onClick={() => {
                                                        toggle(rm.id);
                                                        setGuestName('')
                                                    }}>
                                                {rm.nickname || rm.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {guests.length > 0 && (
                                <div>
                                    <span className="field-label">{t('player.knownGuests')}</span>
                                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                                        {guests.map(rm => (
                                            <button key={rm.id} type="button"
                                                    className={`chip ${selectedMemberIds.has(rm.id) ? 'active' : ''}`}
                                                    onClick={() => {
                                                        toggle(rm.id);
                                                        setGuestName('')
                                                    }}>
                                                {rm.nickname || rm.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>)
                    })()}
                    <div>
                        <label className="field-label">{t('player.newGuest')}</label>
                        <input className="kce-input" value={guestName}
                               onChange={e => {
                                   setGuestName(e.target.value);
                                   if (e.target.value) setSelectedMemberIds(new Set())
                               }}
                               placeholder={t('player.guestPlaceholder')}/>
                        {guestName.trim() && (
                            <p className="text-[10px] text-kce-muted mt-1">{t('player.guestSaveHint')}</p>
                        )}
                    </div>
                    <button type="submit" className="btn-primary w-full"
                            disabled={selectedMemberIds.size === 0 && !guestName.trim()}>
                        {selectedMemberIds.size > 1 ? `${selectedMemberIds.size} ${t('player.addMany')}` : t('action.add')}
                    </button>
                </div>
            </Sheet>

            {/* ── Edit player sheet ── */}
            <Sheet open={editPlayerSheet} onClose={() => setEditPlayerSheet(false)} title={t('player.edit')}
                   onSubmit={saveEditPlayer}>
                {editingPlayer && (
                    <div className="flex flex-col gap-3">
                        <div className="text-sm font-bold text-kce-cream">{editingPlayer.name}</div>
                        <div>
                            <label className="field-label">{t('team.label')}</label>
                            <select className="kce-input" value={editPlayerTeam ?? ''}
                                    onChange={e => setEditPlayerTeam(e.target.value ? Number(e.target.value) : null)}>
                                <option value="">{t('player.noTeam')}</option>
                                {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                            </select>
                        </div>
                        <button type="submit" className="btn-primary w-full">{t('action.save')}</button>
                    </div>
                )}
            </Sheet>

            {/* ── Team sheet ── */}
            <Sheet open={teamSheet} onClose={() => setTeamSheet(false)}
                   title={editingTeam ? t('team.edit') : t('team.create')} onSubmit={saveTeam}>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="field-label">{t('team.name')}</label>
                        <input className="kce-input" value={teamName} onChange={e => setTeamName(e.target.value)}
                               placeholder={t('team.namePlaceholder')}/>
                    </div>
                    <ChipSelect
                        label={t('team.members')}
                        options={playerOptions}
                        selected={teamPlayerIds}
                        onChange={setTeamPlayerIds}
                        onSelectAll={() => setTeamPlayerIds(players.map(p => p.id))}
                        onSelectNone={() => setTeamPlayerIds([])}/>
                    <button type="submit" className="btn-primary w-full"
                            disabled={!teamName.trim()}>{t('action.save')}</button>
                </div>
            </Sheet>

        </div>
    )
}

// ── Attendance + pin check for unplanned evenings ─────────────────────────────
function UnplannedAttendanceSheet({eveningId, pins, pinPenalty, regularMembers, user, onDone, onCancel}: {
    eveningId: number
    pins: ClubPin[]
    pinPenalty: number
    regularMembers: RegularMember[]
    user: { regular_member_id: number | null } | null
    onDone: () => void
    onCancel: () => void
}) {
    const t = useT()
    const activeMembers = regularMembers.filter((m: RegularMember) => !m.is_guest && m.is_active)
    const myId = user?.regular_member_id

    const [checkedIds, setCheckedIds] = useState<Set<number>>(
        () => new Set(activeMembers.map((m: RegularMember) => m.id)),
    )
    const [missingPinIds, setMissingPinIds] = useState<Set<number>>(new Set())
    const [guestName, setGuestName] = useState('')
    const [saving, setSaving] = useState(false)

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

    const sortedMembers = [...activeMembers].sort((a: RegularMember, b: RegularMember) => {
        if (a.id === myId) return -1
        if (b.id === myId) return 1
        return 0
    })

    async function handleDone() {
        setSaving(true)
        try {
            const adds: Promise<unknown>[] = []
            for (const id of checkedIds) {
                const rm = regularMembers.find((r: RegularMember) => r.id === id)
                if (rm) adds.push(api.addPlayer(eveningId, {name: rm.nickname || rm.name, regular_member_id: rm.id}))
            }
            if (guestName.trim()) {
                const saved = await api.createRegularMember({name: guestName.trim(), is_guest: true})
                adds.push(api.addPlayer(eveningId, {name: saved.name, regular_member_id: saved.id}))
            }
            await Promise.all(adds)
            if (missingPinIds.size > 0 && pinPenalty > 0) {
                const eveningData = await api.getEvening(eveningId)
                for (const pinId of missingPinIds) {
                    const pin = pins.find(p => p.id === pinId)
                    if (!pin || !pin.holder_regular_member_id) continue
                    const player = eveningData.players.find(p => p.regular_member_id === pin.holder_regular_member_id)
                    if (!player) continue
                    await api.addPenalty(eveningId, {
                        player_ids: [player.id],
                        penalty_type_name: `${pin.icon} ${pin.name} ${t('pin.missingPenalty')}`,
                        icon: pin.icon,
                        amount: pinPenalty,
                        mode: 'euro',
                        client_timestamp: Date.now(),
                    })
                }
            }
            onDone()
        } catch (e) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Sheet open onClose={onCancel} title={t('evening.attendance')}>
            <div className="space-y-4">
                <p className="text-xs text-kce-muted">{t('evening.attendanceHint')}</p>

                {/* Attendance checklist */}
                <div>
                    <div className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-2">
                        👥 {t('team.members')} ({checkedIds.size}/{activeMembers.length})
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-0.5 pr-1">
                        {sortedMembers.map((m: RegularMember) => {
                            const isChecked = checkedIds.has(m.id)
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
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Guest input */}
                <div className="pt-2 border-t border-kce-surface2">
                    <div className="text-[10px] font-extrabold text-kce-muted uppercase tracking-wider mb-1.5">
                        🧑‍🤝‍🧑 {t('player.guest')}
                    </div>
                    <input
                        className="kce-input"
                        placeholder={t('player.guestName')}
                        value={guestName}
                        onChange={e => setGuestName(e.target.value)}
                    />
                </div>

                {/* Pins check — only for pins whose holder is present */}
                {pins.some((p: ClubPin) => p.holder_regular_member_id && checkedIds.has(p.holder_regular_member_id)) && (
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

                <div className="flex gap-2 pt-1">
                    <button className="btn-secondary flex-1" onClick={onCancel} disabled={saving}>
                        {t('action.cancel')}
                    </button>
                    <button className="btn-primary flex-1" onClick={handleDone} disabled={saving}>
                        {saving ? t('action.loading') : t('evening.startButton')}
                    </button>
                </div>
            </div>
        </Sheet>
    )
}

function today() {
    return new Date().toISOString().slice(0, 10)
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('de-DE', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'})
}

// ── Pins alert component ──
function PinsAlert({pins, evening, players, regularMembers, pinPenalty, onPenaltyLogged}: {
    pins: ClubPin[]
    evening: { id: number; penalty_log: { player_name: string; penalty_type_name: string }[] }
    players: EveningPlayer[]
    regularMembers: RegularMember[]
    pinPenalty: number
    onPenaltyLogged: () => void
}) {
    const t = useT()
    // Only show pins that have a holder who is playing tonight
    const activePins = pins.filter(pin =>
        pin.holder_regular_member_id !== null &&
        players.some(p => p.regular_member_id === pin.holder_regular_member_id)
    )
    if (activePins.length === 0) return null

    async function logMissingPins(pin: ClubPin) {
        const player = players.find(p => p.regular_member_id === pin.holder_regular_member_id)
        if (!player) return
        try {
            await api.addPenalty(evening.id, {
                player_ids: [player.id],
                penalty_type_name: `${pin.icon} ${pin.name} ${t('pin.missingPenalty')}`,
                icon: pin.icon,
                amount: pinPenalty,
                mode: 'euro',
                client_timestamp: Date.now(),
            })
            onPenaltyLogged()
            showToast(`${pin.icon} ${t('pin.missingPenalty')} → ${player.name}`)
        } catch (e) {
            toastError(e)
        }
    }

    return (
        <div className="mb-3">
            {activePins.map(pin => {
                const holderMember = pin.holder_regular_member_id
                    ? regularMembers.find(m => m.id === pin.holder_regular_member_id)
                    : null
                const holderDisplayName = holderMember
                    ? (holderMember.nickname || holderMember.name)
                    : pin.holder_name
                return (
                <div key={pin.id}
                     className="flex items-center gap-3 px-3 py-2 rounded-lg mb-1.5 border border-kce-amber/30 bg-kce-amber/5">
                    <span className="text-xl flex-shrink-0">{pin.icon}</span>
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold">{pin.name}</div>
                        <div className="text-[10px] text-kce-muted">
                            {t('pin.holder')}: {holderDisplayName}
                        </div>
                    </div>
                    <button
                        className="btn-danger btn-xs flex-shrink-0"
                        onClick={() => logMissingPins(pin)}>
                        ✕ {t('pin.missingPenalty')}
                    </button>
                </div>
                )
            })}
        </div>
    )
}
