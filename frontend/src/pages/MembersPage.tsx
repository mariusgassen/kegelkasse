import {useState} from 'react'
import {getHashParams, clearHashParams} from '@/utils/hashParams.ts'
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
import {useOnline} from '@/hooks/useOnline.ts'
import {parseAmount} from '@/utils/parse.ts'
import type {RegularMember} from '@/types.ts'

type MemberAction = {
    icon: string
    label: string
    onClick: () => void
    danger?: boolean
    disabled?: boolean
}

function ActionItem({icon, label, onClick, danger, disabled}: MemberAction) {
    return (
        <button type="button" disabled={disabled}
                className={`kce-card p-3 flex items-center gap-3 text-left active:opacity-70 disabled:opacity-40 ${danger ? 'text-red-400' : ''}`}
                onClick={onClick}>
            <span className="text-lg flex-shrink-0" aria-hidden="true">{icon}</span>
            <span className="text-sm font-bold flex-1">{label}</span>
        </button>
    )
}

export function MembersPage() {
    const t = useT()
    const isOnline = useOnline()
    const {regularMembers, setRegularMembers, user} = useAppStore()
    const {evening, invalidate: invalidateEvening} = useActiveEvening()
    const admin = isAdmin(user)

    const {data: pins = []} = useQuery({queryKey: ['pins'], queryFn: api.listPins, staleTime: 60000})

    const [showInactive, setShowInactive] = useState(false)
    const [removeConfirm, setRemoveConfirm] = useState<RegularMember | null>(null)
    const [removePayoutAmount, setRemovePayoutAmount] = useState('')
    const [removePaymentsTotal, setRemovePaymentsTotal] = useState<number | null>(null)
    const [removePenaltyTotal, setRemovePenaltyTotal] = useState<number | null>(null)
    const [promoteConfirm, setPromoteConfirm] = useState<RegularMember | null>(null)
    const [promoteEntryFee, setPromoteEntryFee] = useState('')
    const [search, setSearch] = useState(() => {
        const v = getHashParams().get('memberName') ?? ''
        if (v) clearHashParams()
        return v
    })

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
    const [resetUsername, setResetUsername] = useState<string | null>(null)
    const [resetCopied, setResetCopied] = useState(false)

    // Link sheet — link app user to roster member
    const [linkSheet, setLinkSheet] = useState(false)
    const [linkUserId, setLinkUserId] = useState<number | null>(null)
    const [linkUserName, setLinkUserName] = useState('')

    // Merge sheet — merge duplicate roster entries
    const [mergeSheet, setMergeSheet] = useState(false)
    const [mergeDiscard, setMergeDiscard] = useState<RegularMember | null>(null)

    // Row action sheet — tap a member/user row to see its available actions
    const [actionSheet, setActionSheet] = useState<{ title: string; actions: MemberAction[] } | null>(null)

    function openActionSheet(title: string, actions: MemberAction[]) {
        setActionSheet({
            title,
            actions: actions.map(a => ({...a, onClick: () => { setActionSheet(null); a.onClick() }})),
        })
    }

    async function openResetSheet(userId: number, userName: string) {
        try {
            const res = await api.createResetToken(userId)
            setResetUrl(window.location.origin + res.reset_url)
            setResetUserName(userName)
            setResetUsername(res.username)
            setResetCopied(false)
            setResetSheet(true)
        } catch (e: unknown) {
            toastError(e)
        }
    }

    async function openInvite(m: RegularMember) {
        try {
            const res = await api.createMemberInvite(m.id)
            setInviteUrl(window.location.origin + res.invite_url)
            setInviteName(res.member_name)
            setCopied(false)
            setInviteSheet(true)
        } catch (e) { toastError(e) }
    }

    async function openGeneralInvite() {
        try {
            const res = await api.createInvite()
            setInviteUrl(window.location.origin + res.invite_url)
            setInviteName(t('club.invite.create'))
            setCopied(false)
            setInviteSheet(true)
        } catch (e) { toastError(e) }
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

    async function openRemoveConfirm(m: RegularMember) {
        setRemoveConfirm(m)
        setRemovePayoutAmount('')
        setRemovePaymentsTotal(null)
        setRemovePenaltyTotal(null)
        try {
            const balances = await api.getMemberBalances()
            const b = balances.find(b => b.regular_member_id === m.id)
            const payments = b?.payments_total ?? 0
            const penalties = b?.penalty_total ?? 0
            setRemovePaymentsTotal(payments)
            setRemovePenaltyTotal(penalties)
            // Pre-fill payout with what was physically paid in (not balance)
            if (payments > 0.01) {
                setRemovePayoutAmount(payments.toFixed(2))
            }
        } catch {
            // balance is optional — form still works without it
        }
    }

    async function remove(m: RegularMember) {
        try {
            await api.deleteRegularMember(m.id)
            // Write off outstanding penalties so the balance reaches zero
            if ((removePenaltyTotal ?? 0) > 0.01) {
                await api.createMemberPayment({
                    regular_member_id: m.id,
                    amount: removePenaltyTotal!,
                    note: t('member.writeOffNote'),
                })
            }
            const payoutAmt = parseAmount(removePayoutAmount)
            if (payoutAmt > 0) {
                await api.treasuryPayout({
                    payouts: [{regular_member_id: m.id, amount: payoutAmt}],
                    note: t('member.payoutNote'),
                })
            }
            await Promise.all([refetchRoster(), refetchUsers()])
            showToast(t('member.removedFromClub'))
            setRemoveConfirm(null)
        } catch (e: unknown) {
            toastError(e)
        }
    }

    async function openPromoteConfirm(m: RegularMember) {
        setPromoteConfirm(m)
        setPromoteEntryFee('')
        try {
            const balances = await api.getMemberBalances()
            const memberCount = balances.length
            if (memberCount > 0) {
                // Treasury incl. open debts: sum of all current member balances
                const treasuryTotal = balances.reduce((sum, b) => sum + b.balance, 0)
                const entryFee = Math.max(0, treasuryTotal / memberCount)
                if (entryFee > 0.01) {
                    setPromoteEntryFee(entryFee.toFixed(2))
                }
            }
        } catch {
            // suggested fee is optional — sheet still works without it
        }
    }

    async function promote(m: RegularMember) {
        try {
            await api.reactivateRegularMember(m.id)
            const feeAmt = parseAmount(promoteEntryFee)
            if (feeAmt > 0) {
                // Negative payment = debt the new member owes the club
                await api.createMemberPayment({
                    regular_member_id: m.id,
                    amount: -feeAmt,
                    note: t('member.entryFeeNote'),
                })
            }
            await Promise.all([refetchRoster(), refetchUsers()])
            showToast(t('member.promotedToMember'))
            setPromoteConfirm(null)
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
            toastError(e)
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
            toastError(e)
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
            toastError(e)
        }
    }

    async function handleAutoCreateRoster(userId: number, userName: string) {
        try {
            const newMember = await api.createRegularMember({name: userName})
            await api.linkUserToRoster(userId, newMember.id)
            await Promise.all([refetchUsers(), refetchRoster()])
        } catch (e: unknown) {
            toastError(e)
        }
    }

    const alreadyInEvening = new Set(evening?.players.map(p => p.regular_member_id).filter(Boolean))
    const linkedMemberIds = new Set(appUsers.map(u => u.regular_member_id).filter(Boolean))
    // Unlinked roster = not linked to any active app user
    const activeLinkedIds = new Set(appUsers.filter(u => u.is_active).map(u => u.regular_member_id).filter(Boolean))

    const q = search.trim().toLowerCase()
    const matchesMember = (m: RegularMember) =>
        !q || m.name.toLowerCase().includes(q) || (m.nickname ?? '').toLowerCase().includes(q)

    const unlinkedRoster = regularMembers.filter(m => !m.is_guest && !activeLinkedIds.has(m.id) && matchesMember(m)).sort((a, b) => {
        if (a.id === user?.regular_member_id) return -1
        if (b.id === user?.regular_member_id) return 1
        return 0
    })
    const savedGuests = regularMembers.filter(m => m.is_guest && matchesMember(m))

    // For link sheet: roster members not already linked to someone
    const availableForLink = regularMembers.filter(m => !linkedMemberIds.has(m.id))

    const activeUsers = appUsers.filter(u => {
        if (!u.is_active) return false
        if (!q) return true
        const linked = regularMembers.find(m => m.id === u.regular_member_id)
        return u.name.toLowerCase().includes(q) || (linked?.nickname ?? '').toLowerCase().includes(q)
    }).sort((a, b) => {
        if (a.id === user?.id) return -1
        if (b.id === user?.id) return 1
        return 0
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
                <div className="flex gap-1">
                    {admin && (
                        <button className="btn-secondary btn-xs" disabled={!isOnline} onClick={openGeneralInvite}>
                            📨 {t('club.tab.invites')}
                        </button>
                    )}
                    {admin && inactiveUsers.length > 0 && (
                        <button
                            className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${showInactive ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                            onClick={() => setShowInactive(v => !v)}>
                            {showInactive ? t('member.hideInactive') : `+ ${inactiveUsers.length} ${t('member.showInactive')}`}
                        </button>
                    )}
                </div>
            </div>

            {activeUsers.length === 0
                ? <Empty icon="📱" text={t('member.noAppUsers')}/>
                : activeUsers.map(u => {
                    const linked = regularMembers.find(m => m.id === u.regular_member_id)
                    const displayName = linked?.nickname || u.name

                    const actions: MemberAction[] = []
                    if (admin) {
                        if (linked) actions.push({icon: '✏️', label: t('action.edit'), onClick: () => openEdit(linked)})
                        if (!linked && u.role !== 'superadmin') actions.push({
                            icon: '🔗', label: t('member.action.linkToRoster'),
                            onClick: () => { setLinkUserId(u.id); setLinkUserName(u.name); setLinkSheet(true) },
                        })
                        if (u.role !== 'superadmin') actions.push({
                            icon: '🔑', label: t('auth.reset.createLink'), disabled: !isOnline,
                            onClick: () => openResetSheet(u.id, u.name),
                        })
                        if (u.role !== 'superadmin' && u.id !== user?.id) actions.push({
                            icon: u.role === 'admin' ? '↓' : '↑',
                            label: u.role === 'admin' ? t('member.action.removeAdmin') : t('member.action.makeAdmin'),
                            onClick: () => api.updateMemberRole(u.id, u.role === 'admin' ? 'member' : 'admin').then(() => refetchUsers()),
                        })
                        if (u.role !== 'superadmin' && u.id !== user?.id) actions.push({
                            icon: '✕', label: t('member.action.deactivate'), danger: true,
                            onClick: () => handleDeactivate(u.id),
                        })
                    }
                    const hasActions = actions.length > 0

                    return (
                        <div key={u.id}
                             className={`kce-card p-3 mb-2 flex items-center gap-3 ${hasActions ? 'active:opacity-70 cursor-pointer' : ''}`}
                             role={hasActions ? 'button' : undefined}
                             tabIndex={hasActions ? 0 : undefined}
                             aria-label={hasActions ? `${t('member.actionsFor')} ${displayName}` : undefined}
                             onClick={hasActions ? () => openActionSheet(displayName, actions) : undefined}
                             onKeyDown={hasActions ? e => {
                                 if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openActionSheet(displayName, actions) }
                             } : undefined}>
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-kce-bg text-sm flex-shrink-0 overflow-hidden"
                                style={{background: 'linear-gradient(135deg,#c4701a, var(--kce-primary))'}}>
                                {u.avatar
                                    ? <img src={u.avatar} alt="" className="w-full h-full object-cover"/>
                                    : u.name[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                    {displayName}
                                    {u.id === user?.id && <span className="text-[9px] text-kce-amber font-bold flex-shrink-0">Ich</span>}
                                    {linked && pins.filter((p: any) => p.holder_regular_member_id === linked.id).map((p: any) => (
                                        <span key={p.id} title={p.name} className="flex-shrink-0">{p.icon}</span>
                                    ))}
                                </div>
                                {linked?.nickname && <div className="text-xs text-kce-muted truncate">{u.name}</div>}
                                {u.username && admin && <div className="text-[10px] text-kce-muted truncate">@{u.username}</div>}
                                {!linked && <div className="text-[10px] text-kce-muted">{t('member.noRosterEntry')}</div>}
                            </div>
                            <span
                                className={u.role === 'admin' || u.role === 'superadmin' ? 'role-badge-admin' : 'role-badge-member'}>
                                {u.role}
                            </span>
                            {hasActions && <span className="text-kce-muted text-lg flex-shrink-0" aria-hidden="true">›</span>}
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
                    const displayName = m.nickname || m.name

                    const actions: MemberAction[] = []
                    if (evening && !evening.is_closed) actions.push({
                        icon: inEvening ? '✓' : '+',
                        label: inEvening ? t('member.action.inEvening') : t('member.addToEvening'),
                        disabled: inEvening,
                        onClick: () => addToEvening(m),
                    })
                    if (admin) {
                        actions.push({icon: '📨', label: t('member.action.createInvite'), disabled: !isOnline, onClick: () => openInvite(m)})
                        actions.push({icon: '✏️', label: t('action.edit'), onClick: () => openEdit(m)})
                        actions.push({
                            icon: '⇄', label: t('member.action.merge'),
                            onClick: () => { setMergeDiscard(m); setMergeSheet(true) },
                        })
                        actions.push({icon: '⬇️', label: t('member.removeFromClub'), danger: true, onClick: () => openRemoveConfirm(m)})
                    }
                    const hasActions = actions.length > 0

                    return (
                        <div key={m.id}
                             className={`kce-card p-3 mb-2 flex items-center gap-3 ${hasActions ? 'active:opacity-70 cursor-pointer' : ''}`}
                             role={hasActions ? 'button' : undefined}
                             tabIndex={hasActions ? 0 : undefined}
                             aria-label={hasActions ? `${t('member.actionsFor')} ${displayName}` : undefined}
                             onClick={hasActions ? () => openActionSheet(displayName, actions) : undefined}
                             onKeyDown={hasActions ? e => {
                                 if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openActionSheet(displayName, actions) }
                             } : undefined}>
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-kce-bg text-sm flex-shrink-0 overflow-hidden"
                                style={{background: 'linear-gradient(135deg,#c4701a, var(--kce-primary))'}}>
                                {m.avatar
                                    ? <img src={m.avatar} alt="" className="w-full h-full object-cover"/>
                                    : (m.nickname || m.name)[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                    {displayName}
                                    {m.id === user?.regular_member_id && <span className="text-[9px] text-kce-amber font-bold flex-shrink-0">Ich</span>}
                                    {pins.filter((p: any) => p.holder_regular_member_id === m.id).map((p: any) => (
                                        <span key={p.id} title={p.name} className="flex-shrink-0">{p.icon}</span>
                                    ))}
                                </div>
                                {m.nickname && <div className="text-xs text-kce-muted truncate">{m.name}</div>}
                            </div>
                            {inEvening && <span className="text-kce-amber text-sm flex-shrink-0" aria-hidden="true">✓</span>}
                            {hasActions && <span className="text-kce-muted text-lg flex-shrink-0" aria-hidden="true">›</span>}
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
                    const displayName = m.nickname || m.name

                    const actions: MemberAction[] = []
                    if (evening && !evening.is_closed) actions.push({
                        icon: inEvening ? '✓' : '+',
                        label: inEvening ? t('member.action.inEvening') : t('member.addToEvening'),
                        disabled: inEvening,
                        onClick: () => addToEvening(m),
                    })
                    actions.push({icon: '✏️', label: t('action.edit'), onClick: () => openEdit(m)})
                    if (admin) actions.push({icon: '⬆️', label: t('member.reactivateRoster'), onClick: () => openPromoteConfirm(m)})

                    return (
                        <div key={m.id}
                             className="kce-card p-3 mb-2 flex items-center gap-3 active:opacity-70 cursor-pointer"
                             role="button" tabIndex={0}
                             aria-label={`${t('member.actionsFor')} ${displayName}`}
                             onClick={() => openActionSheet(displayName, actions)}
                             onKeyDown={e => {
                                 if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openActionSheet(displayName, actions) }
                             }}>
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-kce-bg text-sm flex-shrink-0 overflow-hidden bg-kce-muted">
                                {m.avatar
                                    ? <img src={m.avatar} alt="" className="w-full h-full object-cover"/>
                                    : (m.nickname || m.name)[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold truncate">{displayName}</div>
                                <div className="text-[10px] text-kce-muted">{m.nickname ? m.name + ' · ' : ''}{t('member.guestLabel')}</div>
                            </div>
                            {inEvening && <span className="text-kce-amber text-sm flex-shrink-0" aria-hidden="true">✓</span>}
                            <span className="text-kce-muted text-lg flex-shrink-0" aria-hidden="true">›</span>
                        </div>
                    )
                })}
            </>)}

            {/* Row action sheet — actions for the tapped member/user */}
            <Sheet open={!!actionSheet} onClose={() => setActionSheet(null)} title={actionSheet?.title ?? ''}>
                <div className="flex flex-col gap-2">
                    {actionSheet?.actions.map((a, i) => <ActionItem key={i} {...a}/>)}
                </div>
            </Sheet>

            {/* Confirm remove from club sheet */}
            <Sheet open={!!removeConfirm} onClose={() => setRemoveConfirm(null)}
                   title={t('member.removeConfirm')}>
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-kce-muted">{t('member.removeConfirmHint')}</p>
                    {removeConfirm && (
                        <div className="kce-card p-3 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-kce-bg text-sm flex-shrink-0 bg-kce-muted">
                                {(removeConfirm.nickname || removeConfirm.name)[0].toUpperCase()}
                            </div>
                            <div className="font-bold text-sm">{removeConfirm.nickname || removeConfirm.name}</div>
                        </div>
                    )}
                    {/* Payout on departure */}
                    <div>
                        <label className="field-label">{t('member.payoutLabel')}</label>
                        <p className="text-[10px] text-kce-muted mb-1.5">{t('member.payoutHint')}</p>
                        {removePenaltyTotal !== null && removePenaltyTotal > 0.01 && (
                            <p className="text-[10px] text-kce-amber mb-1.5">
                                {t('member.payoutWriteOffInfo')} ({removePenaltyTotal.toFixed(2).replace('.', ',')} €)
                            </p>
                        )}
                        <div className="flex items-center gap-2">
                            <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                            <input
                                className="kce-input flex-1"
                                type="text" inputMode="decimal"
                                placeholder="0,00"
                                value={removePayoutAmount}
                                onChange={e => setRemovePayoutAmount(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button className="btn-secondary btn-sm flex-1" onClick={() => setRemoveConfirm(null)}>
                            {t('action.cancel')}
                        </button>
                        <button className="btn-primary btn-sm flex-1"
                                onClick={() => removeConfirm && remove(removeConfirm)}>
                            {t('member.removeFromClub')}
                        </button>
                    </div>
                </div>
            </Sheet>

            {/* Confirm promote guest to member sheet */}
            <Sheet open={!!promoteConfirm} onClose={() => setPromoteConfirm(null)}
                   title={t('member.promoteConfirm')}>
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-kce-muted">{t('member.promoteConfirmHint')}</p>
                    {promoteConfirm && (
                        <div className="kce-card p-3 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-kce-bg text-sm flex-shrink-0 bg-kce-muted">
                                {(promoteConfirm.nickname || promoteConfirm.name)[0].toUpperCase()}
                            </div>
                            <div className="font-bold text-sm">{promoteConfirm.nickname || promoteConfirm.name}</div>
                        </div>
                    )}
                    {/* Pro-rata entry fee (1/x of treasury incl. open debts) */}
                    <div>
                        <label className="field-label">{t('member.entryFeeLabel')}</label>
                        <p className="text-[10px] text-kce-muted mb-1.5">{t('member.entryFeeHint')}</p>
                        <div className="flex items-center gap-2">
                            <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                            <input
                                className="kce-input flex-1"
                                type="text" inputMode="decimal"
                                placeholder="0,00"
                                value={promoteEntryFee}
                                onChange={e => setPromoteEntryFee(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button className="btn-secondary btn-sm flex-1" onClick={() => setPromoteConfirm(null)}>
                            {t('action.cancel')}
                        </button>
                        <button className="btn-primary btn-sm flex-1"
                                onClick={() => promoteConfirm && promote(promoteConfirm)}>
                            {t('member.reactivateRoster')}
                        </button>
                    </div>
                </div>
            </Sheet>

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
                    {resetUsername && (
                        <div className="text-xs text-kce-muted">
                            {t('auth.username')}: <span className="font-mono text-kce-cream">@{resetUsername}</span>
                        </div>
                    )}
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
                    <button type="submit" className="btn-primary w-full" disabled={saving || !name.trim()}>
                        {t('action.save')}
                    </button>
                </div>
            </Sheet>
        </div>
    )
}
