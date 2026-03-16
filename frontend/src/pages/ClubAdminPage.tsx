/**
 * Club admin page — settings, members, penalty types, game templates, invites.
 * Write operations guarded by AdminGuard (admin/superadmin only).
 */
import {useEffect, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {api, authState} from '@/api/client.ts'
import {shareOrCopy} from '@/utils/share.ts'
import {applyClubTheme} from '@/App.tsx'
import {useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {AdminGuard} from '@/components/ui/AdminGuard.tsx'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import type {GameTemplate, PenaltyType} from '@/types.ts'
import {MembersPage} from './MembersPage'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

export function ClubAdminPage() {
    const t = useT()
    const user = useAppStore(s => s.user)
    const {setPenaltyTypes, setRegularMembers, setGameTemplates} = useAppStore()
    const [tab, setTab] = useState<'settings' | 'penalties' | 'templates' | 'teams' | 'invites' | 'clubs' | 'members'>('settings')

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
        {id: 'invites', label: t('club.tab.invites')},
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
                    {tab === 'invites' && (
                        <AdminGuard>
                            <InvitesTab/>
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

    useEffect(() => {
        if (!club) return
        setClubName(club.name || '')
        setVenue(club.settings?.home_venue || '')
        setColor1(club.settings?.primary_color || '#e8a020')
        setColor2(club.settings?.secondary_color || '#6b7c5a')
        setBgColor(club.settings?.bg_color || '#1a1410')
        setGuestCap(club.settings?.guest_penalty_cap != null ? String(club.settings.guest_penalty_cap) : '')
    }, [club])

    return (
        <div className="flex flex-col gap-3">
            <div className="kce-card p-4">
                <div className="mb-3">
                    <label className="field-label">{t('club.name.label')}</label>
                    <input className="kce-input" value={clubName} onChange={e => setClubName(e.target.value)}
                           placeholder="Vereinsname"/>
                </div>
                <div className="mb-3">
                    <label className="field-label">{t('club.defaultVenue')}</label>
                    <input className="kce-input" value={venue} onChange={e => setVenue(e.target.value)}
                           placeholder={t('club.defaultVenuePlaceholder')}/>
                </div>
                <div className="flex gap-3 mb-3">
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
                <div className="mb-3">
                    <label className="field-label">{t('club.penalty.guestCap')}</label>
                    <div className="flex items-center gap-2">
                        <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
                        <input className="kce-input flex-1" type="number" step="0.50" min="0"
                               value={guestCap} placeholder={t('club.penalty.guestCapPlaceholder')}
                               onChange={e => setGuestCap(e.target.value)}/>
                    </div>
                    <p className="text-xs text-kce-muted mt-1">{t('club.penalty.guestCapHint')}</p>
                </div>
                <button className="btn-primary w-full" onClick={async () => {
                    const cap = guestCap.trim() ? parseFloat(guestCap) : null
                    await api.updateClubSettings({name: clubName || undefined, home_venue: venue, primary_color: color1, secondary_color: color2, bg_color: bgColor, guest_penalty_cap: cap})
                    applyClubTheme({settings: {primary_color: color1, secondary_color: color2, bg_color: bgColor}})
                    setGuestPenaltyCap(cap)
                    onSaved()
                }}>{t('action.save')}</button>
            </div>
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
                await api.createPenaltyType({icon, name, default_amount: parseFloat(amount) || 0, sort_order: 99})
                setIcon('⚠️'); setName(''); setAmount('0.50'); onChanged()
            }}>
                <div className="field-label">{t('club.penalty.newLabel')}</div>
                <div className="flex gap-2 mb-2">
                    <input className="kce-input w-14 text-center" value={icon} onChange={e => setIcon(e.target.value)}/>
                    <input className="kce-input flex-1" value={name} onChange={e => setName(e.target.value)}
                           placeholder="Name"/>
                    <input className="kce-input w-20" type="number" value={amount}
                           onChange={e => setAmount(e.target.value)} step="0.10"/>
                </div>
                <button type="submit" className="btn-primary w-full btn-sm">+ {t('action.add')}</button>
            </form>

            <Sheet open={!!editPt} onClose={() => setEditPt(null)} title={t('club.penalty.editLabel')}
                   onSubmit={async () => {
                       if (!editPt || !editName.trim()) return
                       await api.updatePenaltyType(editPt.id, {
                           icon: editIcon,
                           name: editName,
                           default_amount: parseFloat(editAmount) || 0,
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
                            <input className="kce-input w-14 text-center" value={editIcon}
                                   onChange={e => setEditIcon(e.target.value)}/>
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
                            <input className="kce-input flex-1" type="number" step="0.10" min="0"
                                   value={editAmount} onChange={e => setEditAmount(e.target.value)}/>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-1">
                        <button type="button" className="btn-secondary flex-1"
                                onClick={() => setEditPt(null)}>{t('action.cancel')}</button>
                        <button type="submit" className="btn-primary flex-[2]"
                                disabled={!editName.trim()}>{t('action.save')}</button>
                    </div>
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

    const openNew = () => {
        setEditing(null);
        setName('');
        setDesc('');
        setWtype('either');
        setIsOpener(false);
        setPenalty('0');
        setSheet(true)
    }
    const openEdit = (gt: GameTemplate) => {
        setEditing(gt);
        setName(gt.name);
        setDesc(gt.description || '');
        setWtype(gt.winner_type);
        setIsOpener(gt.is_opener);
        setPenalty(String(gt.default_loser_penalty));
        setSheet(true)
    }

    async function saveTemplate() {
        if (!name.trim()) return
        const d = {name, description: desc || undefined, winner_type: wtype,
            is_opener: isOpener, default_loser_penalty: parseFloat(penalty) || 0, sort_order: 0}
        if (editing) await api.updateGameTemplate(editing.id, d)
        else await api.createGameTemplate(d)
        onChanged(); setSheet(false)
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
                        <input className="kce-input" value={name} onChange={e => setName(e.target.value)}/></div>
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
                        <input className="kce-input" type="number" value={penalty}
                               onChange={e => setPenalty(e.target.value)} step="0.50" min="0"/></div>
                    <div className="flex gap-2 mt-1">
                        <button type="button" className="btn-secondary flex-1" onClick={() => setSheet(false)}>{t('action.cancel')}</button>
                        <button type="submit" className="btn-primary flex-[2]">{t('action.save')}</button>
                    </div>
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
                        <div className="text-[10px] text-kce-muted font-mono">{c.slug} · {c.member_count} Mitglieder</div>
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
    const [editing, setEditing] = useState<{id: number; name: string; sort_order: number} | null>(null)
    const [name, setName] = useState('')
    const [sortOrder, setSortOrder] = useState('0')

    function openNew() { setEditing(null); setName(''); setSortOrder(String(teams.length)); setSheet(true) }
    function openEdit(t: {id: number; name: string; sort_order: number}) {
        setEditing(t); setName(t.name); setSortOrder(String(t.sort_order)); setSheet(true)
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
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-kce-bg text-sm flex-shrink-0"
                         style={{background: 'linear-gradient(135deg,var(--kce-secondary),var(--kce-primary))'}}>
                        {team.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 font-bold text-sm">{team.name}</div>
                    <button className="btn-secondary btn-xs" onClick={() => openEdit(team)}>✏️</button>
                    <button className="btn-danger btn-xs" onClick={() => api.deleteClubTeam(team.id).then(() => refetch())}>✕</button>
                </div>
            ))}

            <Sheet open={sheet} onClose={() => setSheet(false)}
                   title={editing ? t('club.teams.edit') : t('club.teams.new')} onSubmit={save}>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="field-label">{t('club.teams.name')}</label>
                        <input className="kce-input" value={name} onChange={e => setName(e.target.value)}
                               placeholder="z.B. Team A, Die Adler…"/>
                    </div>
                    <div>
                        <label className="field-label">{t('club.teams.sortOrder')}</label>
                        <input className="kce-input w-20" type="number" value={sortOrder}
                               onChange={e => setSortOrder(e.target.value)} min="0"/>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" className="btn-secondary flex-1" onClick={() => setSheet(false)}>{t('action.cancel')}</button>
                        <button type="submit" className="btn-primary flex-[2]" disabled={!name.trim()}>{t('action.save')}</button>
                    </div>
                </div>
            </Sheet>
        </div>
    )
}

// ── Invites ──
function InvitesTab() {
    const t = useT()
    const [inviteUrl, setInviteUrl] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    return (
        <div className="flex flex-col gap-4">
            <button className="btn-primary" onClick={async () => {
                const res = await api.createInvite()
                setInviteUrl(window.location.origin + res.invite_url)
            }}>{t('club.invite.create')}</button>

            {inviteUrl && (
                <div className="kce-card p-4">
                    <div className="field-label">{t('club.invite.link')}</div>
                    <div
                        className="bg-kce-bg rounded-lg p-3 text-xs font-mono text-kce-cream break-all mb-3">{inviteUrl}</div>
                    <div className="flex gap-2">
                        <button className="btn-secondary btn-sm flex-1" onClick={() => {
                            navigator.clipboard.writeText(inviteUrl)
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000)
                        }}>{copied ? t('auth.invite.copied') : t('club.invite.copy')}</button>
                        <button className="btn-primary btn-sm flex-1" onClick={async () => {
                            await shareOrCopy(inviteUrl, 'Kegelkasse Einladung')
                        }}>📤 {t('share.button')}</button>
                    </div>
                </div>
            )}
        </div>
    )
}
