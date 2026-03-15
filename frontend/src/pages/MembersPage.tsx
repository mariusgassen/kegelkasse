import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {useAppStore, isAdmin} from '@/store/app.ts'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import type {RegularMember} from '@/types.ts'

export function MembersPage() {
    const t = useT()
    const {regularMembers, setRegularMembers, user} = useAppStore()
    const {evening, invalidate: invalidateEvening} = useActiveEvening()
    const admin = isAdmin(user)

    // App-Nutzer
    const {data: appUsers = [], refetch: refetchUsers} = useQuery({
        queryKey: ['club-members'],
        queryFn: api.getMembers,
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

    function openNew() { setEditing(null); setName(''); setNickname(''); setSheet(true) }
    function openEdit(m: RegularMember) { setEditing(m); setName(m.name); setNickname(m.nickname ?? ''); setSheet(true) }

    async function save() {
        if (!name.trim()) return
        setSaving(true)
        try {
            if (editing) await api.updateRegularMember(editing.id, {name: name.trim(), nickname: nickname || undefined})
            else await api.createRegularMember({name: name.trim(), nickname: nickname || undefined})
            await refetchRoster()
            setSheet(false)
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Fehler')
        } finally {
            setSaving(false)
        }
    }

    async function remove(m: RegularMember) {
        try { await api.deleteRegularMember(m.id); await refetchRoster() }
        catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Fehler') }
    }

    async function addToEvening(m: RegularMember) {
        if (!evening) return
        try {
            await api.addPlayer(evening.id, {name: m.nickname || m.name, regular_member_id: m.id})
            invalidateEvening()
            showToast(`${m.name} hinzugefügt`)
        } catch (e: unknown) { showToast(e instanceof Error ? e.message : 'Fehler') }
    }

    const alreadyInEvening = new Set(evening?.players.map(p => p.regular_member_id).filter(Boolean))
    // Hide Stammspieler who already have an app account (linked via regular_member_id)
    const linkedMemberIds = new Set(appUsers.map(u => (u as any).regular_member_id).filter(Boolean))
    const unlinkedRoster = regularMembers.filter(m => !linkedMemberIds.has(m.id))

    return (
        <div className="page-scroll px-3 py-3 pb-24">

            {/* ── App-Nutzer ── */}
            <div className="sec-heading">App-Nutzer</div>
            {appUsers.length === 0
                ? <Empty icon="📱" text="Noch keine App-Nutzer."/>
                : appUsers.map(u => {
                    const linked = regularMembers.find(m => m.id === (u as any).regular_member_id)
                    return (
                        <div key={u.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-kce-bg text-sm flex-shrink-0"
                                 style={{background: 'linear-gradient(135deg,#c4701a, var(--kce-primary))'}}>
                                {u.name[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate">{linked?.nickname || u.name}</div>
                                {linked?.nickname && <div className="text-xs text-kce-muted truncate">{u.name}</div>}
                            </div>
                            <span className={u.role === 'admin' || u.role === 'superadmin' ? 'role-badge-admin' : 'role-badge-member'}>
                                {u.role}
                            </span>
                            {admin && linked && (
                                <button className="btn-secondary btn-xs" onClick={() => openEdit(linked)}>✏️</button>
                            )}
                            {admin && u.role !== 'superadmin' && u.id !== user?.id && (
                                <button className="btn-secondary btn-xs"
                                        onClick={() => api.updateMemberRole(u.id, u.role === 'admin' ? 'member' : 'admin').then(() => refetchUsers())}>
                                    {u.role === 'admin' ? '↓' : '↑'}
                                </button>
                            )}
                        </div>
                    )
                })
            }

            {/* ── Spieler-Roster ── */}
            <div className="flex items-center justify-between mt-4 mb-3">
                <div className="sec-heading mb-0">Spieler-Roster</div>
                {admin && (
                    <button className="btn-secondary btn-xs" onClick={openNew}>+ {t('member.add')}</button>
                )}
            </div>
            <p className="text-[10px] text-kce-muted mb-3">
                Vereinsmitglieder ohne App-Account — für Statistiken und Quick-Add beim Abend.
            </p>

            {unlinkedRoster.length === 0
                ? <Empty icon="👥" text={t('member.none')}/>
                : unlinkedRoster.map(m => {
                    const inEvening = alreadyInEvening.has(m.id)
                    return (
                        <div key={m.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-kce-bg text-sm flex-shrink-0"
                                 style={{background: 'linear-gradient(135deg,#c4701a, var(--kce-primary))'}}>
                                {m.name[0].toUpperCase()}
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
                                        {inEvening ? '✓' : '+ Abend'}
                                    </button>
                                )}
                                {admin && (
                                    <>
                                        <button className="btn-secondary btn-xs" onClick={() => openInvite(m)} title="Einladungslink">📨</button>
                                        <button className="btn-secondary btn-xs" onClick={() => openEdit(m)}>✏️</button>
                                        <button className="btn-danger btn-xs" onClick={() => remove(m)}>✕</button>
                                    </>
                                )}
                            </div>
                        </div>
                    )
                })
            }

            <Sheet open={inviteSheet} onClose={() => setInviteSheet(false)}
                   title={`📨 Einladung für ${inviteName}`}>
                <div className="flex flex-col gap-3">
                    <p className="text-xs text-kce-muted">
                        Link an {inviteName} senden — sie müssen nur ein Passwort setzen und sind direkt drin.
                        Gültig 7 Tage, einmalig verwendbar.
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
                                }}>{copied ? '✓ Kopiert' : '📋 Kopieren'}</button>
                                <a href={`https://wa.me/?text=${encodeURIComponent(`Kegelkasse Einladung für ${inviteName}: ${inviteUrl}`)}`}
                                   target="_blank" rel="noopener noreferrer"
                                   className="btn-secondary btn-sm flex-1 justify-center">
                                    📱 WhatsApp
                                </a>
                            </div>
                        </>
                    )}
                </div>
            </Sheet>

            <Sheet open={sheet} onClose={() => setSheet(false)}
                   title={editing ? t('action.edit') : t('member.add')}>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="field-label">{t('auth.name')}</label>
                        <input className="kce-input" value={name} onChange={e => setName(e.target.value)}
                               placeholder="Vorname Nachname"/>
                    </div>
                    <div>
                        <label className="field-label">{t('member.nickname')}</label>
                        <input className="kce-input" value={nickname} onChange={e => setNickname(e.target.value)}
                               placeholder="z.B. Kapitän, Aufschläger…"/>
                    </div>
                    <div className="flex gap-2">
                        <button className="btn-secondary flex-1" onClick={() => setSheet(false)}>{t('action.cancel')}</button>
                        <button className="btn-primary flex-[2]" disabled={saving || !name.trim()} onClick={save}>
                            {t('action.save')}
                        </button>
                    </div>
                </div>
            </Sheet>
        </div>
    )
}
