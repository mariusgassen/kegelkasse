import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {shareOrCopy} from '@/utils/share.ts'
import type {RegularMember} from '@/types.ts'

export function MembersPage() {
    const t = useT()
    const {regularMembers, setRegularMembers, user} = useAppStore()
    const {evening, invalidate: invalidateEvening} = useActiveEvening()
    const admin = isAdmin(user)

    const [showInactive, setShowInactive] = useState(false)
    const [search, setSearch] = useState('')

    // App-Nutzer — admins always fetch all so we know if inactive exist
    const {data: appUsers = [], refetch: refetchUsers} = useQuery({
        queryKey: ['club-members', admin],
        queryFn: () => api.getMembers(admin),
        staleTime: 60000,
    })

    // Stammspieler sheet
    const [sheet, setSheet] = useState(false)
    const [editing, setEditing] = useState<RegularMember | null>(null)
    const [name, setName] = useState('')
    const [nickname, setNickname] = useState('')
    const [saving, setSaving] = useState(false)

    const [inviteSheet, setInviteSheet] = useState(false)
    const [inviteUrl, setInviteUrl] = useState<string | null>(null)
    const [inviteName, setInviteName] = useState('')
    const [copied, setCopied] = useState(false)

    // Reset password sheet
    const [resetSheet, setResetSheet] = useState(false)
    const [resetUrl, setResetUrl] = useState<string | null>(null)
    const [resetUserName, setResetUserName] = useState('')
    const [resetCopied, setResetCopied] = useState(false)

    // Link sheet — link app user to roster member
    const [linkSheet, setLinkSheet] = useState(false)
    const [linkUserId, setLinkUserId] = useState<number | null>(null)
    const [linkUserName, setLinkUserName] = useState('')

    // Merge sheet — merge duplicate roster entries
    const [mergeSheet, setMergeSheet] = useState(false)
    const [mergeDiscard, setMergeDiscard] = useState<RegularMember | null>(null)

    async function openResetSheet(userId: number, userName: string) {
        try {
            const res = await api.createResetToken(userId)
            setResetUrl(window.location.origin + res.reset_url)
            setResetUserName(userName)
            setResetCopied(false)
            setResetSheet(true)
        } catch (e: unknown) {
            toastError(e)
        }
    }

    async function openInvite(m: RegularMember) {
        const res = await api.createMemberInvite(m.id)
        setInviteUrl(window.location.origin + res.invite_url)
        setInviteName(res.member_name)
        setCopied(false)
        setInviteSheet(true)
    }

    async function refetchRoster() {
        const d = await api.listRegularMembers()
        setRegularMembers(d)
    }

    function openNew() {
        setEditing(null);
        setName('');
        setNickname('');
        setSheet(true)
    }

    function openEdit(m: RegularMember) {
        setEditing(m);
        setName(m.name);
        setNickname(m.nickname ?? '');
        setSheet(true)
    }

    async function save() {
        if (!name.trim()) return
        setSaving(true)
        try {
            if (editing) await api.updateRegularMember(editing.id, {
                name: name.trim(),
                nickname: nickname || undefined,
                is_guest: editing.is_guest
            })
            else await api.createRegularMember({name: name.trim(), nickname: nickname || undefined})
            await refetchRoster()
            setSheet(false)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    async function remove(m: RegularMember) {
        try {
            await api.deleteRegularMember(m.id);
            await refetchRoster()
        } catch (e: unknown) {
            toastError(e)
        }
    }

    async function addToEvening(m: RegularMember) {
        if (!evening) return
        try {
            await api.addPlayer(evening.id, {name: m.nickname || m.name, regular_member_id: m.id})
            invalidateEvening()
            showToast(`${m.name} ${t('member.addedToEvening')}`)
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Fehler')
        }
    }

    async function handleDeactivate(userId: number) {
        try {
            await api.deactivateMember(userId);
            refetchUsers()
        } catch (e: unknown) {
            toastError(e)
        }
    }

    async function handleReactivate(userId: number) {
        try {
            await api.reactivateMember(userId);
            refetchUsers()
        } catch (e: unknown) {
            toastError(e)
        }
    }

    async function handleLink(memberId: number) {
        if (!linkUserId) return
        try {
            await api.linkUserToRoster(linkUserId, memberId)
            await Promise.all([refetchUsers(), refetchRoster()])
            setLinkSheet(false)
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Fehler')
        }
    }

    async function handleMerge(keepId: number) {
        if (!mergeDiscard) return
        try {
            await api.mergeRegularMembers(mergeDiscard.id, keepId)
            await Promise.all([refetchUsers(), refetchRoster()])
            invalidateEvening()
            setMergeSheet(false)
            showToast(t('member.merged'))
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Fehler')
        }
    }

    async function handleAutoCreateRoster(userId: number, userName: string) {
        try {
            const newMember = await api.createRegularMember({name: userName})
            await api.linkUserToRoster(userId, newMember.id)
            await Promise.all([refetchUsers(), refetchRoster()])
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Fehler')
        }
    }

    const alreadyInEvening = new Set(evening?.players.map(p => p.regular_member_id).filter(Boolean))
    const linkedMemberIds = new Set(appUsers.map(u => u.regular_member_id).filter(Boolean))
    // Unlinked roster = not linked to any active app user
    const activeLinkedIds = new Set(appUsers.filter(u => u.is_active).map(u => u.regular_member_id).filter(Boolean))

    const q = search.trim().toLowerCase()
    const matchesMember = (m: RegularMember) =>
        !q || m.name.toLowerCase().includes(q) || (m.nickname ?? '').toLowerCase().includes(q)

    const unlinkedRoster = regularMembers.filter(m => !m.is_guest && !activeLinkedIds.has(m.id) && matchesMember(m))
    const savedGuests = regularMembers.filter(m => m.is_guest && matchesMember(m))

    // For link sheet: roster members not already linked to someone
    const availableForLink = regularMembers.filter(m => !linkedMemberIds.has(m.id))

    const activeUsers = appUsers.filter(u => {
        if (!u.is_active) return false
        if (!q) return true
        const linked = regularMembers.find(m => m.id === u.regular_member_id)
        return u.name.toLowerCase().includes(q) || (linked?.nickname ?? '').toLowerCase().includes(q)
    })
    const inactiveUsers = appUsers.filter(u => !u.is_active)

    return (
        <div className="page-scroll px-3 py-3 pb-24">

            {/* ── Suche ── */}
            <input
                className="kce-input mb-4"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('member.search')}
            />

            {/* ── App-Nutzer ── */}
            <div className="flex items-center justify-between mb-3">
                <div className="sec-heading mb-0">{t('member.appUsers')}</div>
                {admin && inactiveUsers.length > 0 && (
                    <button
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${showInactive ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                        onClick={() => setShowInactive(v => !v)}>
                        {showInactive ? t('member.hideInactive') : `+ ${inactiveUsers.length} ${t('member.showInactive')}`}
                    </button>
                )}
            </div>

            {activeUsers.length === 0
                ? <Empty icon="📱" text={t('member.noAppUsers')}/>
                : activeUsers.map(u => {
                    const linked = regularMembers.find(m => m.id === u.regular_member_id)
                    return (
                        <div key={u.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-kce-bg text-sm flex-shrink-0 overflow-hidden"
                                style={{background: 'linear-gradient(135deg,#c4701a, var(--kce-primary))'}}>
                                {u.avatar
                                    ? <img src={u.avatar} alt="" className="w-full h-full object-cover"/>
                                    : u.name[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate">{linked?.nickname || u.name}</div>
                                {linked?.nickname && <div className="text-xs text-kce-muted truncate">{u.name}</div>}
                                {!linked && <div className="text-[10px] text-kce-muted">{t('member.noRosterEntry')}</div>}
                            </div>
                            <span
                                className={u.role === 'admin' || u.role === 'superadmin' ? 'role-badge-admin' : 'role-badge-member'}>
                                {u.role}
                            </span>
                            {admin && linked && (
                                <button className="btn-secondary btn-xs" onClick={() => openEdit(linked)}>✏️</button>
                            )}
                            {admin && !linked && u.role !== 'superadmin' && (
                                <button className="btn-secondary btn-xs" title="Mit Roster verknüpfen"
                                        onClick={() => {
                                            setLinkUserId(u.id);
                                            setLinkUserName(u.name);
                                            setLinkSheet(true)
                                        }}>
                                    🔗
                                </button>
                            )}
                            {admin && u.role !== 'superadmin' && (
                                <button className="btn-secondary btn-xs" title={t('auth.reset.createLink')}
                                        onClick={() => openResetSheet(u.id, u.name)}>🔑</button>
                            )}
                            {admin && u.role !== 'superadmin' && u.id !== user?.id && (
                                <button className="btn-secondary btn-xs"
                                        onClick={() => api.updateMemberRole(u.id, u.role === 'admin' ? 'member' : 'admin').then(() => refetchUsers())}>
                                    {u.role === 'admin' ? '↓' : '↑'}
                                </button>
                            )}
                            {admin && u.role !== 'superadmin' && u.id !== user?.id && (
                                <button className="btn-danger btn-xs" title="Deaktivieren"
                                        onClick={() => handleDeactivate(u.id)}>✕</button>
                            )}
                        </div>
                    )
                })
            }

            {/* Inactive users */}
            {showInactive && inactiveUsers.length > 0 && (
                <>
                    <div className="text-[10px] font-bold text-kce-muted uppercase tracking-wider mt-3 mb-2">{t('member.inactive')}
                    </div>
                    {inactiveUsers.map(u => (
                        <div key={u.id} className="kce-card p-3 mb-2 flex items-center gap-3 opacity-50">
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-kce-bg text-sm flex-shrink-0 bg-kce-muted">
                                {u.name[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate line-through">{u.name}</div>
                            </div>
                            {admin && (
                                <button className="btn-secondary btn-xs opacity-100"
                                        onClick={() => handleReactivate(u.id)}>
                                    {t('member.reactivate')}
                                </button>
                            )}
                        </div>
                    ))}
                </>
            )}

            {/* ── Spieler-Roster ── */}
            <div className="flex items-center justify-between mt-4 mb-3">
                <div className="sec-heading mb-0">{t('member.roster')}</div>
                {admin && (
                    <button className="btn-secondary btn-xs" onClick={openNew}>+ {t('member.add')}</button>
                )}
            </div>
            <p className="text-[10px] text-kce-muted mb-3">
                {t('member.rosterHint')}
            </p>

            {unlinkedRoster.length === 0
                ? <Empty icon="👥" text={t('member.none')}/>
                : unlinkedRoster.map(m => {
                    const inEvening = alreadyInEvening.has(m.id)
                    return (
                        <div key={m.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-kce-bg text-sm flex-shrink-0 overflow-hidden"
                                style={{background: 'linear-gradient(135deg,#c4701a, var(--kce-primary))'}}>
                                {m.avatar
                                    ? <img src={m.avatar} alt="" className="w-full h-full object-cover"/>
                                    : (m.nickname || m.name)[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate">{m.nickname || m.name}</div>
                                {m.nickname && <div className="text-xs text-kce-muted truncate">{m.name}</div>}
                            </div>
                            <div className="flex gap-1.5 flex-shrink-0">
                                {evening && !evening.is_closed && (
                                    <button
                                        className={`btn-xs ${inEvening ? 'btn-secondary opacity-40' : 'btn-primary'}`}
                                        disabled={inEvening}
                                        onClick={() => addToEvening(m)}>
                                        {inEvening ? '✓' : `+ ${t('member.addToEvening')}`}
                                    </button>
                                )}
                                {admin && (
                                    <>
                                        <button className="btn-secondary btn-xs" onClick={() => openInvite(m)}
                                                title="Einladungslink">📨
                                        </button>
                                        <button className="btn-secondary btn-xs" onClick={() => openEdit(m)}>✏️</button>
                                        <button className="btn-secondary btn-xs" title="Zusammenlegen"
                                                onClick={() => {
                                                    setMergeDiscard(m);
                                                    setMergeSheet(true)
                                                }}>⇄
                                        </button>
                                        <button className="btn-danger btn-xs" onClick={() => remove(m)}>✕</button>
                                    </>
                                )}
                            </div>
                        </div>
                    )
                })
            }

            {/* ── Gäste ── */}
            {savedGuests.length > 0 && (<>
                <div className="sec-heading mt-4">{t('player.knownGuests')}</div>
                <p className="text-[10px] text-kce-muted mb-3">
                    {t('member.knownGuestsHint')}
                </p>
                {savedGuests.map(m => {
                    const inEvening = alreadyInEvening.has(m.id)
                    return (
                        <div key={m.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-kce-bg text-sm flex-shrink-0 overflow-hidden bg-kce-muted">
                                {m.avatar
                                    ? <img src={m.avatar} alt="" className="w-full h-full object-cover"/>
                                    : (m.nickname || m.name)[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate">{m.nickname || m.name}</div>
                                <div className="text-[10px] text-kce-muted">{m.nickname ? m.name + ' · ' : ''}{t('member.guestLabel')}</div>
                            </div>
                            <div className="flex gap-1.5 flex-shrink-0">
                                {evening && !evening.is_closed && (
                                    <button
                                        className={`btn-xs ${inEvening ? 'btn-secondary opacity-40' : 'btn-primary'}`}
                                        disabled={inEvening}
                                        onClick={() => addToEvening(m)}>
                                        {inEvening ? '✓' : `+ ${t('member.addToEvening')}`}
                                    </button>
                                )}
                                <button className="btn-secondary btn-xs" onClick={() => openEdit(m)}>✏️</button>
                                {admin && (
                                    <button className="btn-danger btn-xs" onClick={() => remove(m)}>✕</button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </>)}

            {/* Link to roster sheet */}
            <Sheet open={linkSheet} onClose={() => setLinkSheet(false)}
                   title={`🔗 ${linkUserName} ${t('member.linkWith')}`}>
                <div className="flex flex-col gap-2">
                    <p className="text-xs text-kce-muted mb-1">
                        {t('member.linkHint')}
                    </p>
                    {availableForLink.map(m => (
                        <button key={m.id} className="kce-card p-3 flex items-center gap-3 text-left active:opacity-70"
                                onClick={() => handleLink(m.id)}>
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-kce-bg text-sm flex-shrink-0"
                                style={{background: 'linear-gradient(135deg,#c4701a,var(--kce-primary))'}}>
                                {m.name[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate">{m.nickname || m.name}</div>
                                {m.nickname && <div className="text-xs text-kce-muted">{m.name}</div>}
                            </div>
                        </button>
                    ))}
                    {availableForLink.length === 0 && (
                        <p className="text-xs text-kce-muted text-center py-2">{t('member.allLinked')}</p>
                    )}
                    <button className="btn-secondary btn-sm mt-1"
                            onClick={async () => {
                                await handleAutoCreateRoster(linkUserId!, linkUserName);
                                setLinkSheet(false)
                            }}>
                        + {t('member.createRosterEntry')} „{linkUserName}"
                    </button>
                </div>
            </Sheet>

            {/* Merge roster sheet */}
            <Sheet open={mergeSheet} onClose={() => setMergeSheet(false)}
                   title={`⇄ "${mergeDiscard?.nickname || mergeDiscard?.name}" ${t('member.mergeWith')}`}>
                <div className="flex flex-col gap-2">
                    <p className="text-xs text-kce-muted mb-1">
                        {t('member.mergeHint')}
                    </p>
                    {regularMembers.filter(m => m.id !== mergeDiscard?.id).map(m => (
                        <button key={m.id} className="kce-card p-3 flex items-center gap-3 text-left active:opacity-70"
                                onClick={() => handleMerge(m.id)}>
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-kce-bg text-sm flex-shrink-0"
                                style={{background: 'linear-gradient(135deg,#c4701a,var(--kce-primary))'}}>
                                {m.name[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate">{m.nickname || m.name}</div>
                                {m.nickname && <div className="text-xs text-kce-muted">{m.name}</div>}
                            </div>
                            <span className="text-xs text-kce-muted">{t('member.keep')}</span>
                        </button>
                    ))}
                    {regularMembers.filter(m => m.id !== mergeDiscard?.id).length === 0 && (
                        <p className="text-xs text-kce-muted text-center py-2">{t('member.noOtherEntries')}</p>
                    )}
                </div>
            </Sheet>

            <Sheet open={inviteSheet} onClose={() => setInviteSheet(false)}
                   title={`📨 Einladung für ${inviteName}`}>
                <div className="flex flex-col gap-3">
                    <p className="text-xs text-kce-muted">
                        {t('member.inviteHint')}
                    </p>
                    {inviteUrl && (
                        <>
                            <div className="bg-kce-bg rounded-lg p-3 text-xs font-mono text-kce-cream break-all">
                                {inviteUrl}
                            </div>
                            <div className="flex gap-2">
                                <button className="btn-secondary btn-sm flex-1" onClick={() => {
                                    navigator.clipboard.writeText(inviteUrl)
                                    setCopied(true)
                                    setTimeout(() => setCopied(false), 2000)
                                }}>{copied ? `✓ ${t('auth.invite.copied')}` : t('club.invite.copy')}</button>
                                <button className="btn-primary btn-sm flex-1" onClick={async () => {
                                    await shareOrCopy(inviteUrl, `Kegelkasse Einladung für ${inviteName}`)
                                }}>📤 {t('share.button')}</button>
                            </div>
                        </>
                    )}
                </div>
            </Sheet>

            {/* Reset password sheet */}
            <Sheet open={resetSheet} onClose={() => setResetSheet(false)}
                   title={`🔑 ${resetUserName}`}>
                <div className="flex flex-col gap-3">
                    <p className="text-xs text-kce-muted">
                        {t('auth.reset.createLink')} — gültig 7 Tage, einmalig verwendbar.
                    </p>
                    {resetUrl && (
                        <>
                            <div className="bg-kce-bg rounded-lg p-3 text-xs font-mono text-kce-cream break-all">
                                {resetUrl}
                            </div>
                            <div className="flex gap-2">
                                <button className="btn-secondary btn-sm flex-1" onClick={() => {
                                    navigator.clipboard.writeText(resetUrl)
                                    setResetCopied(true)
                                    setTimeout(() => setResetCopied(false), 2000)
                                }}>{resetCopied ? `✓ ${t('auth.invite.copied')}` : t('club.invite.copy')}</button>
                                <button className="btn-primary btn-sm flex-1" onClick={async () => {
                                    await shareOrCopy(resetUrl, `${resetUserName} — Passwort zurücksetzen`)
                                }}>📤 {t('share.button')}</button>
                            </div>
                        </>
                    )}
                </div>
            </Sheet>

            <Sheet open={sheet} onClose={() => setSheet(false)}
                   title={editing ? t('action.edit') : t('member.add')} onSubmit={save}>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="field-label">{t('auth.name')}</label>
                        <input className="kce-input" value={name} onChange={e => setName(e.target.value)}
                               placeholder={t('member.namePlaceholder')}/>
                    </div>
                    <div>
                        <label className="field-label">{t('member.nickname')}</label>
                        <input className="kce-input" value={nickname} onChange={e => setNickname(e.target.value)}
                               placeholder="z.B. Kapitän, Aufschläger…"/>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" className="btn-secondary flex-1"
                                onClick={() => setSheet(false)}>{t('action.cancel')}</button>
                        <button type="submit" className="btn-primary flex-[2]" disabled={saving || !name.trim()}>
                            {t('action.save')}
                        </button>
                    </div>
                </div>
            </Sheet>
        </div>
    )
}
