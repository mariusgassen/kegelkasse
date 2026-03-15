import {useState} from 'react'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ChipSelect} from '@/components/ui/ChipSelect.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import type {EveningPlayer, Team} from '@/types.ts'

export function EveningPage() {
    const t = useT()
    const {evening, invalidate, activeEveningId} = useActiveEvening()
    const {setActiveEveningId, regularMembers} = useAppStore()

    // ── Start evening form ──
    const [startDate, setStartDate] = useState(today())
    const [startVenue, setStartVenue] = useState('')
    const [startNote, setStartNote] = useState('')
    const [starting, setStarting] = useState(false)

    // ── Edit evening sheet ──
    const [editSheet, setEditSheet] = useState(false)
    const [editDate, setEditDate] = useState('')
    const [editVenue, setEditVenue] = useState('')
    const [editNote, setEditNote] = useState('')

    // ── Add player sheet ──
    const [playerSheet, setPlayerSheet] = useState(false)
    const [guestName, setGuestName] = useState('')
    const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null)

    // ── Edit player sheet ──
    const [editPlayerSheet, setEditPlayerSheet] = useState(false)
    const [editingPlayer, setEditingPlayer] = useState<EveningPlayer | null>(null)
    const [editPlayerTeam, setEditPlayerTeam] = useState<number | null>(null)

    // ── Team sheet ──
    const [teamSheet, setTeamSheet] = useState(false)
    const [editingTeam, setEditingTeam] = useState<Team | null>(null)
    const [teamName, setTeamName] = useState('')
    const [teamPlayerIds, setTeamPlayerIds] = useState<(number | string)[]>([])

    // ── Drink sheet ──
    const [drinkSheet, setDrinkSheet] = useState(false)
    const [drinkType, setDrinkType] = useState<'beer' | 'shots'>('beer')
    const [drinkVariety, setDrinkVariety] = useState('')
    const [drinkPlayerIds, setDrinkPlayerIds] = useState<(number | string)[]>([])

    const [closeConfirm, setCloseConfirm] = useState(false)

    // ── No active evening ──
    if (!activeEveningId && !evening) {
        return (
            <div className="page-scroll px-3 py-3 pb-24">
                <div className="sec-heading">🎳 {t('nav.evening')}</div>
                <div className="kce-card p-5">
                    <div className="text-sm font-bold text-kce-cream mb-4">{t('evening.start')}</div>
                    <div className="flex flex-col gap-3">
                        <div>
                            <label className="field-label">{t('evening.date')}</label>
                            <input className="kce-input" type="date" value={startDate}
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
                                   placeholder="Optional…"/>
                        </div>
                        <button className="btn-primary mt-1" disabled={starting} onClick={async () => {
                            setStarting(true)
                            try {
                                const ev = await api.createEvening({
                                    date: startDate,
                                    venue: startVenue || undefined,
                                    note: startNote || undefined,
                                })
                                setActiveEveningId(ev.id)
                                invalidate()
                            } catch (e: unknown) {
                                showToast(e instanceof Error ? e.message : 'Fehler')
                            } finally {
                                setStarting(false)
                            }
                        }}>{t('evening.startButton')}</button>
                    </div>
                </div>
            </div>
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
                    <span className="text-[10px] font-extrabold tracking-widest text-kce-amber border border-kce-amber rounded px-1.5 py-0.5">
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

            {/* ── Players ── */}
            <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-extrabold text-kce-muted uppercase tracking-wider">
                    👤 Spieler ({players.length})
                </div>
                {!evening.is_closed && (
                    <button className="btn-secondary btn-xs" onClick={() => {
                        setGuestName('')
                        setSelectedMemberId(null)
                        setPlayerSheet(true)
                    }}>+ {t('player.add')}</button>
                )}
            </div>

            {players.length === 0
                ? <Empty icon="👤" text={t('player.noPlayers')}/>
                : players.map(p => {
                    const team = teams.find(t => t.id === p.team_id)
                    return (
                        <div key={p.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-kce-bg text-xs flex-shrink-0"
                                 style={{background: 'linear-gradient(135deg,#c4701a,#e8a020)'}}>
                                {p.name[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate">{p.name}</div>
                                <div className="text-xs text-kce-muted">{team ? team.name : t('player.noTeam')}</div>
                            </div>
                            {!evening.is_closed && (
                                <div className="flex gap-1">
                                    <button className="btn-secondary btn-xs" onClick={() => openEditPlayer(p)}>✏️</button>
                                    <button className="btn-danger btn-xs" onClick={async () => {
                                        await api.removePlayer(evening.id, p.id)
                                        invalidate()
                                    }}>✕</button>
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
                    <button className="btn-secondary btn-xs" onClick={openNewTeam}>+ {t('team.create')}</button>
                )}
            </div>

            {teams.length === 0
                ? <Empty icon="🤝" text="Noch keine Teams."/>
                : teams.map(team => {
                    const members = players.filter(p => p.team_id === team.id)
                    return (
                        <div key={team.id} className="kce-card p-3 mb-2">
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-bold">{team.name}</div>
                                {!evening.is_closed && (
                                    <div className="flex gap-1">
                                        <button className="btn-secondary btn-xs" onClick={() => openEditTeam(team)}>✏️</button>
                                        <button className="btn-danger btn-xs" onClick={async () => {
                                            await api.deleteTeam(evening.id, team.id)
                                            invalidate()
                                        }}>✕</button>
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

            {/* ── Drinks ── */}
            <div className="flex items-center justify-between mb-2 mt-4">
                <div className="text-xs font-extrabold text-kce-muted uppercase tracking-wider">
                    🍺 {t('drinks.title')} ({evening.drink_rounds.length})
                </div>
                {!evening.is_closed && (
                    <button className="btn-secondary btn-xs" onClick={() => {
                        setDrinkType('beer')
                        setDrinkVariety('')
                        setDrinkPlayerIds(players.map(p => p.id))
                        setDrinkSheet(true)
                    }}>+ {t('drinks.add')}</button>
                )}
            </div>

            {evening.drink_rounds.length === 0
                ? <Empty icon="🍺" text={t('drinks.noRounds')}/>
                : [...evening.drink_rounds].reverse().map(r => {
                    const count = r.participant_ids.length
                    const icon = r.drink_type === 'beer' ? '🍺' : '🥃'
                    const label = r.drink_type === 'beer' ? t('drinks.beer') : t('drinks.shots')
                    return (
                        <div key={r.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                            <span className="text-xl">{icon}</span>
                            <div className="flex-1">
                                <div className="text-sm font-bold">{label}{r.variety ? ` · ${r.variety}` : ''}</div>
                                <div className="text-xs text-kce-muted">{count} Spieler</div>
                            </div>
                            {!evening.is_closed && (
                                <button className="btn-danger btn-xs" onClick={async () => {
                                    await api.deleteDrinkRound(evening.id, r.id)
                                    invalidate()
                                }}>✕</button>
                            )}
                        </div>
                    )
                })
            }

            {/* ── Edit evening sheet ── */}
            <Sheet open={editSheet} onClose={() => setEditSheet(false)} title={t('evening.edit')}>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="field-label">{t('evening.date')}</label>
                        <input className="kce-input" type="date" value={editDate} onChange={e => setEditDate(e.target.value)}/>
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
                    <div className="flex gap-2">
                        <button className="btn-secondary flex-1" onClick={() => setEditSheet(false)}>{t('action.cancel')}</button>
                        <button className="btn-primary flex-[2]" onClick={async () => {
                            await api.updateEvening(evening.id, {
                                date: editDate,
                                venue: editVenue || undefined,
                                note: editNote || undefined,
                            })
                            invalidate()
                            setEditSheet(false)
                        }}>{t('action.save')}</button>
                    </div>
                </div>
            </Sheet>

            {/* ── Add player sheet ── */}
            <Sheet open={playerSheet} onClose={() => setPlayerSheet(false)} title={t('player.add')}>
                <div className="flex flex-col gap-3">
                    {regularMembers.length > 0 && (
                        <div>
                            <div className="field-label">Stammspieler</div>
                            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                                {regularMembers.filter(rm => !players.some(p => p.regular_member_id === rm.id)).map(rm => (
                                    <button key={rm.id} type="button"
                                            className={`chip ${selectedMemberId === rm.id ? 'active' : ''}`}
                                            onClick={() => {
                                                setSelectedMemberId(rm.id)
                                                setGuestName('')
                                            }}>
                                        {rm.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <div>
                        <label className="field-label">{t('player.guestName')}</label>
                        <input className="kce-input" value={guestName}
                               onChange={e => {
                                   setGuestName(e.target.value)
                                   setSelectedMemberId(null)
                               }}
                               placeholder="z.B. Max Gast"/>
                    </div>
                    <div className="flex gap-2">
                        <button className="btn-secondary flex-1" onClick={() => setPlayerSheet(false)}>{t('action.cancel')}</button>
                        <button className="btn-primary flex-[2]"
                                disabled={!selectedMemberId && !guestName.trim()}
                                onClick={async () => {
                                    if (selectedMemberId) {
                                        const rm = regularMembers.find(r => r.id === selectedMemberId)!
                                        await api.addPlayer(evening.id, {name: rm.nickname || rm.name, regular_member_id: rm.id})
                                    } else if (guestName.trim()) {
                                        await api.addPlayer(evening.id, {name: guestName.trim()})
                                    }
                                    invalidate()
                                    setPlayerSheet(false)
                                }}>{t('action.add')}</button>
                    </div>
                </div>
            </Sheet>

            {/* ── Edit player sheet ── */}
            <Sheet open={editPlayerSheet} onClose={() => setEditPlayerSheet(false)} title={t('player.edit')}>
                {editingPlayer && (
                    <div className="flex flex-col gap-3">
                        <div className="text-sm font-bold text-kce-cream">{editingPlayer.name}</div>
                        <div>
                            <label className="field-label">Team</label>
                            <select className="kce-input" value={editPlayerTeam ?? ''}
                                    onChange={e => setEditPlayerTeam(e.target.value ? Number(e.target.value) : null)}>
                                <option value="">{t('player.noTeam')}</option>
                                {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                            </select>
                        </div>
                        <div className="flex gap-2">
                            <button className="btn-secondary flex-1" onClick={() => setEditPlayerSheet(false)}>{t('action.cancel')}</button>
                            <button className="btn-primary flex-[2]" onClick={async () => {
                                await api.updatePlayer(evening.id, editingPlayer.id, {team_id: editPlayerTeam})
                                invalidate()
                                setEditPlayerSheet(false)
                            }}>{t('action.save')}</button>
                        </div>
                    </div>
                )}
            </Sheet>

            {/* ── Team sheet ── */}
            <Sheet open={teamSheet} onClose={() => setTeamSheet(false)}
                   title={editingTeam ? t('team.edit') : t('team.create')}>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="field-label">{t('team.name')}</label>
                        <input className="kce-input" value={teamName} onChange={e => setTeamName(e.target.value)}
                               placeholder="z.B. Team A"/>
                    </div>
                    <ChipSelect
                        label={t('team.members')}
                        options={playerOptions}
                        selected={teamPlayerIds}
                        onChange={setTeamPlayerIds}
                        onSelectAll={() => setTeamPlayerIds(players.map(p => p.id))}
                        onSelectNone={() => setTeamPlayerIds([])}/>
                    <div className="flex gap-2">
                        <button className="btn-secondary flex-1" onClick={() => setTeamSheet(false)}>{t('action.cancel')}</button>
                        <button className="btn-primary flex-[2]" disabled={!teamName.trim()} onClick={async () => {
                            if (editingTeam) {
                                await api.updateTeam(evening.id, editingTeam.id, {
                                    name: teamName,
                                    player_ids: teamPlayerIds as number[],
                                })
                            } else {
                                await api.createTeam(evening.id, {
                                    name: teamName,
                                    player_ids: teamPlayerIds as number[],
                                })
                            }
                            invalidate()
                            setTeamSheet(false)
                        }}>{t('action.save')}</button>
                    </div>
                </div>
            </Sheet>

            {/* ── Drink sheet ── */}
            <Sheet open={drinkSheet} onClose={() => setDrinkSheet(false)} title={t('drinks.round')}>
                <div className="flex flex-col gap-3">
                    <div className="flex gap-1">
                        {(['beer', 'shots'] as const).map(dt => (
                            <button key={dt} type="button"
                                    className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${drinkType === dt ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                                    onClick={() => setDrinkType(dt)}>
                                {dt === 'beer' ? `🍺 ${t('drinks.beer')}` : `🥃 ${t('drinks.shots')}`}
                            </button>
                        ))}
                    </div>
                    <div>
                        <label className="field-label">{drinkType === 'shots' ? t('drinks.sortPlaceholder') : 'Sorte (optional)'}</label>
                        <input className="kce-input" value={drinkVariety} onChange={e => setDrinkVariety(e.target.value)}
                               placeholder={t('drinks.sortPlaceholder')}/>
                    </div>
                    <ChipSelect
                        label={t('drinks.who')}
                        options={playerOptions}
                        selected={drinkPlayerIds}
                        onChange={setDrinkPlayerIds}
                        onSelectAll={() => setDrinkPlayerIds(players.map(p => p.id))}
                        onSelectNone={() => setDrinkPlayerIds([])}/>
                    <div className="flex gap-2">
                        <button className="btn-secondary flex-1" onClick={() => setDrinkSheet(false)}>{t('action.cancel')}</button>
                        <button className="btn-primary flex-[2]" disabled={drinkPlayerIds.length === 0} onClick={async () => {
                            await api.addDrinkRound(evening.id, {
                                drink_type: drinkType,
                                variety: drinkVariety || undefined,
                                participant_ids: drinkPlayerIds as number[],
                                client_timestamp: Date.now(),
                            })
                            invalidate()
                            setDrinkSheet(false)
                        }}>{t('action.done')}</button>
                    </div>
                </div>
            </Sheet>
        </div>
    )
}

function today() {
    return new Date().toISOString().slice(0, 10)
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('de-DE', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'})
}
