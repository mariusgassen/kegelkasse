/**
 * Club admin page — settings, members, penalty types, game templates, invites.
 * Write operations guarded by AdminGuard (admin/superadmin only).
 */
import {useEffect, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {api, authState} from '@/api/client.ts'
import {applyClubTheme} from '@/App.tsx'
import {useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {AdminGuard} from '@/components/ui/AdminGuard.tsx'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import type {GameTemplate, PenaltyType} from '@/types.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

export function ClubAdminPage() {
    const t = useT()
    const user = useAppStore(s => s.user)
    const {setPenaltyTypes, setRegularMembers, setGameTemplates} = useAppStore()
    const [tab, setTab] = useState<'settings' | 'penalties' | 'templates' | 'invites' | 'clubs'>('settings')

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
        {id: 'settings', label: '⚙️ Einstellungen'},
        {id: 'penalties', label: '⚠️ Strafen'},
        {id: 'templates', label: '🏆 Spiele'},
        {id: 'invites', label: '📨 Einladungen'},
        ...(user?.role === 'superadmin' ? [{id: 'clubs', label: '🏛️ Vereine'}] : []),
    ] as const

    return (
        <div className="page-scroll px-3 py-3 pb-24">
            <div className="sec-heading">{t('club.title')}</div>

            {/* Tab strip */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
                {TABS.map(tb => (
                    <button key={tb.id} type="button"
                            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === tb.id ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                            onClick={() => setTab(tb.id as any)}>{tb.label}</button>
                ))}
            </div>

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
            {tab === 'invites' && (
                <AdminGuard>
                    <InvitesTab/>
                </AdminGuard>
            )}
            {tab === 'clubs' && user?.role === 'superadmin' && (
                <SuperadminClubsTab qc={qc}/>
            )}
        </div>
    )
}

// ── Club Settings ──
function ClubSettingsTab({club, onSaved}: { club: any; onSaved: () => void }) {
    const t = useT()
    const [clubName, setClubName] = useState(club?.name || '')
    const [venue, setVenue] = useState(club?.settings?.home_venue || '')
    const [color1, setColor1] = useState(club?.settings?.primary_color || '#e8a020')
    const [color2, setColor2] = useState(club?.settings?.secondary_color || '#6b7c5a')
    const [bgColor, setBgColor] = useState(club?.settings?.bg_color || '#1a1410')

    useEffect(() => {
        if (!club) return
        setClubName(club.name || '')
        setVenue(club.settings?.home_venue || '')
        setColor1(club.settings?.primary_color || '#e8a020')
        setColor2(club.settings?.secondary_color || '#6b7c5a')
        setBgColor(club.settings?.bg_color || '#1a1410')
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
                <button className="btn-primary w-full" onClick={async () => {
                    await api.updateClubSettings({name: clubName || undefined, home_venue: venue, primary_color: color1, secondary_color: color2, bg_color: bgColor})
                    applyClubTheme({settings: {primary_color: color1, secondary_color: color2, bg_color: bgColor}})
                    onSaved()
                }}>{t('action.save')}</button>
            </div>
        </div>
    )
}

// ── Penalty Types ──
function PenaltyTypesTab({penaltyTypes, onChanged}: { penaltyTypes: PenaltyType[]; onChanged: () => void }) {
    const [icon, setIcon] = useState('⚠️')
    const [name, setName] = useState('')
    const [amount, setAmount] = useState('0.50')
    const [editId, setEditId] = useState<number | null>(null)

    return (
        <div>
            {penaltyTypes.map(pt => (
                <div key={pt.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                    <span className="text-xl">{pt.icon}</span>
                    <div className="flex-1">
                        <div className="text-sm font-bold">{pt.name}</div>
                        <div className="text-xs text-kce-muted">{fe(pt.default_amount)}</div>
                    </div>
                    <button className="btn-danger btn-xs"
                            onClick={() => api.deletePenaltyType(pt.id).then(onChanged)}>✕
                    </button>
                </div>
            ))}
            <div className="kce-card p-3 mt-2">
                <div className="field-label">Neue Strafe</div>
                <div className="flex gap-2 mb-2">
                    <input className="kce-input w-14 text-center" value={icon} onChange={e => setIcon(e.target.value)}/>
                    <input className="kce-input flex-1" value={name} onChange={e => setName(e.target.value)}
                           placeholder="Name"/>
                    <input className="kce-input w-20" type="number" value={amount}
                           onChange={e => setAmount(e.target.value)} step="0.10"/>
                </div>
                <button className="btn-primary w-full btn-sm" onClick={async () => {
                    if (!name.trim()) return
                    await api.createPenaltyType({icon, name, default_amount: parseFloat(amount) || 0, sort_order: 99})
                    setIcon('⚠️');
                    setName('');
                    setAmount('0.50');
                    onChanged()
                }}>+ Hinzufügen
                </button>
            </div>
        </div>
    )
}

// ── Game Templates ──
function GameTemplatesTab({templates, onChanged}: { templates: GameTemplate[]; onChanged: () => void }) {
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

    return (
        <div>
            <button className="btn-primary btn-sm mb-3" onClick={openNew}>+ Vorlage</button>
            {!templates.length && <Empty icon="🏆" text="Noch keine Vorlagen."/>}
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
                   title={editing ? '✏️ Vorlage bearbeiten' : '🏆 Neue Vorlage'}>
                <div className="flex flex-col gap-3">
                    <div><label className="field-label">Name</label>
                        <input className="kce-input" value={name} onChange={e => setName(e.target.value)}/></div>
                    <div><label className="field-label">Beschreibung</label>
                        <input className="kce-input" value={desc} onChange={e => setDesc(e.target.value)}/></div>
                    <div><label className="field-label">Gewinner-Typ</label>
                        <select className="kce-input" value={wtype} onChange={e => setWtype(e.target.value)}>
                            <option value="either">Beliebig (Team oder Spieler)</option>
                            <option value="team">Nur Team</option>
                            <option value="individual">Nur Einzelspieler</option>
                        </select></div>
                    <div className="flex items-center gap-3">
                        <input type="checkbox" id="is-opener" checked={isOpener}
                               onChange={e => setIsOpener(e.target.checked)}/>
                        <label htmlFor="is-opener" className="text-sm font-bold cursor-pointer">
                            👑 Eröffnungsspiel / Großes Spiel
                        </label>
                    </div>
                    <div><label className="field-label">Standard Verlierer-Strafe (€)</label>
                        <input className="kce-input" type="number" value={penalty}
                               onChange={e => setPenalty(e.target.value)} step="0.50" min="0"/></div>
                    <div className="flex gap-2 mt-1">
                        <button className="btn-secondary flex-1" onClick={() => setSheet(false)}>Abbrechen</button>
                        <button className="btn-primary flex-[2]" onClick={async () => {
                            if (!name.trim()) return
                            const d = {
                                name,
                                description: desc || undefined,
                                winner_type: wtype,
                                is_opener: isOpener,
                                default_loser_penalty: parseFloat(penalty) || 0,
                                sort_order: 0
                            }
                            if (editing) await api.updateGameTemplate(editing.id, d)
                            else await api.createGameTemplate(d)
                            onChanged();
                            setSheet(false)
                        }}>Speichern
                        </button>
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
                    <div className="field-label">Einladungslink</div>
                    <div
                        className="bg-kce-bg rounded-lg p-3 text-xs font-mono text-kce-cream break-all mb-3">{inviteUrl}</div>
                    <div className="flex gap-2">
                        <button className="btn-secondary btn-sm flex-1" onClick={() => {
                            navigator.clipboard.writeText(inviteUrl)
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000)
                        }}>{copied ? t('auth.invite.copied') : '📋 Kopieren'}</button>
                        <a href={`https://wa.me/?text=${encodeURIComponent('Kegelkasse Einladung: ' + inviteUrl)}`}
                           target="_blank" rel="noopener noreferrer"
                           className="btn-secondary btn-sm flex-1 justify-center">
                            📱 WhatsApp
                        </a>
                    </div>
                </div>
            )}
        </div>
    )
}
