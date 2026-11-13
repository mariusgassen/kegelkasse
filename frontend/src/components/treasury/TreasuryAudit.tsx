import {useEffect, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {useOnline} from '@/hooks/useOnline.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ConfirmSheet} from '@/components/ui/ConfirmSheet.tsx'
import {StatTile} from '@/components/ui/StatTile.tsx'
import {ExpandableCard} from '@/components/ui/ExpandableCard.tsx'
import {SkeletonRows} from '@/components/ui/Skeleton.tsx'
import {BookingReviewCard} from '@/components/treasury/BookingReviewCard.tsx'
import {MeBadge} from '@/components/ui/MemberBadges.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {todayDateInput} from '@/lib/datetime.ts'
import {getHashParams, clearHashParams} from '@/utils/hashParams.ts'
import {useDeepLinkVersion} from '@/hooks/useDeepLink.ts'
import type {
    TreasuryAudit as Audit,
    TreasuryAuditBooking,
    TreasuryAuditStatus,
    TreasuryAuditSummary,
} from '@/types.ts'
import {Button} from '@/components/ui/Button.tsx'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fDate(iso: string | null | undefined) {
    if (!iso) return ''
    return new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: 'numeric'})
}

function periodLabel(a: {period_start: string; period_end: string}) {
    return `${fDate(a.period_start)} – ${fDate(a.period_end)}`
}

const STATUS_CLASS: Record<TreasuryAuditStatus, string> = {
    open: 'bg-surface-2 text-muted',
    approved: 'bg-positive-tint text-positive-fg',
    objection: 'bg-danger-tint text-danger-fg',
}

function StatusBadge({status}: {status: TreasuryAuditStatus}) {
    const t = useT()
    return (
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_CLASS[status]}`}
              data-testid="audit-status">
            {t(`audit.status.${status}`)}
        </span>
    )
}

/** The cash figures the auditors check: opening → movements → closing. */
function SummaryGrid({s}: {s: TreasuryAuditSummary}) {
    const t = useT()
    return (
        <div className="kce-card p-3 grid grid-cols-2 gap-3" data-testid="audit-summary">
            <StatTile bare value={fe(s.opening_cash)} label={t('audit.opening')} tone="default"/>
            <StatTile bare value={fe(s.closing_cash)} label={t('audit.closing')} data-testid="audit-closing"/>
            <StatTile bare size="sm" value={`+${fe(s.deposits)}`} label={t('audit.deposits')} tone="positive"/>
            <StatTile bare size="sm" value={`−${fe(s.payouts)}`} label={t('audit.payouts')} tone="negative"/>
            <StatTile bare size="sm" value={`−${fe(s.expenses)}`} label={t('audit.expenses')} tone="negative"/>
            <StatTile bare size="sm" value={`+${fe(s.other_income)}`} label={t('audit.otherIncome')} tone="positive"/>
        </div>
    )
}

function BookingLine({b, extra}: {b: TreasuryAuditBooking; extra?: string | null}) {
    return (
        <div className="flex items-start justify-between gap-2 py-1.5 border-b border-line last:border-b-0">
            <div className="min-w-0">
                <div className="text-sm text-ink truncate">
                    {b.kind === 'expense' ? '🧾 ' : '👤 '}{b.label || '—'}
                </div>
                <div className="text-xs text-muted">
                    {fDate(b.date)}{b.note ? ` · ${b.note}` : ''}{b.created_by ? ` · ${b.created_by}` : ''}
                </div>
                {extra && <div className="text-xs text-muted">{extra}</div>}
            </div>
            <div className={`text-sm font-bold flex-shrink-0 ${b.amount >= 0 ? 'text-positive-fg' : 'text-danger-fg'}`}>
                {b.amount >= 0 ? '+' : ''}{fe(b.amount)}
            </div>
        </div>
    )
}

function AuditDetailSheet({auditId, canSign, onClose}: {auditId: number | null; canSign: boolean; onClose: () => void}) {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const admin = isAdmin(user)
    const isOnline = useOnline()
    const [verdict, setVerdict] = useState<'approve' | 'object' | null>(null)
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const {data: audit} = useQuery({
        queryKey: ['treasury-audit', auditId],
        queryFn: () => api.getTreasuryAudit(auditId as number),
        enabled: auditId != null,
    })

    useEffect(() => {
        setVerdict(null)
        setNote('')
    }, [auditId])

    async function refresh() {
        await Promise.all([
            qc.invalidateQueries({queryKey: ['treasury-audits']}),
            qc.invalidateQueries({queryKey: ['treasury-audit', auditId]}),
        ])
    }

    async function sign() {
        if (auditId == null || !verdict) return
        setBusy(true)
        try {
            await api.signTreasuryAudit(auditId, {approved: verdict === 'approve', note: note.trim() || undefined})
            showToast(t(verdict === 'approve' ? 'audit.signed' : 'audit.objected'), 'success')
            setVerdict(null)
            setNote('')
            await refresh()
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    async function withdraw() {
        if (auditId == null) return
        setBusy(true)
        try {
            await api.withdrawTreasuryAuditSignature(auditId)
            await refresh()
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    async function remove() {
        if (auditId == null) return
        setBusy(true)
        try {
            await api.deleteTreasuryAudit(auditId)
            setConfirmDelete(false)
            await qc.invalidateQueries({queryKey: ['treasury-audits']})
            onClose()
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    const snap = audit?.snapshot
    const title = audit ? (audit.title || periodLabel(audit)) : t('audit.title')
    const objectionInvalid = verdict === 'object' && !note.trim()

    return (
        <Sheet open={auditId != null} onClose={onClose} title={title}
               overlays={
                   <ConfirmSheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('audit.delete')}
                                 message={t('audit.deleteConfirm')} confirmLabel={t('action.delete')} withCancel
                                 busy={busy} onConfirm={remove}/>
               }>
            {!audit || !snap ? <SkeletonRows rows={4}/> : (
                <div className="space-y-3" data-testid="audit-detail">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted">
                            {periodLabel(audit)}{audit.created_by_name ? ` · ${t('audit.createdBy')} ${audit.created_by_name}` : ''}
                        </div>
                        <StatusBadge status={audit.status}/>
                    </div>
                    <p className="text-xs text-muted">{t('audit.frozenHint')}</p>

                    <SummaryGrid s={snap}/>

                    <div className="kce-card p-3">
                        <div className="field-label mb-1">{t('audit.balances')}</div>
                        <p className="text-xs text-muted mb-2">{t('audit.balancesHint')}</p>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted">{t('audit.outstanding')}</span>
                            <span className="font-bold text-danger-fg">{fe(snap.outstanding_total)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted">{t('audit.credit')}</span>
                            <span className="font-bold text-positive-fg">{fe(snap.credit_total)}</span>
                        </div>
                    </div>

                    {(admin || canSign) && (
                        <BookingReviewCard initialStart={audit.period_start} initialEnd={audit.period_end}/>
                    )}

                    <ExpandableCard title={<span className="text-sm font-bold">📒 {t('audit.bookings')} ({snap.bookings.length})</span>}
                                    data-testid="audit-bookings">
                        <div className="px-3 pb-3 max-h-80 overflow-y-auto">
                            {snap.bookings.length === 0
                                ? <p className="text-xs text-muted">{t('audit.noBookings')}</p>
                                : snap.bookings.map(b => <BookingLine key={`${b.kind}-${b.id}`} b={b}/>)}
                        </div>
                    </ExpandableCard>

                    {snap.edited.length > 0 && (
                        <ExpandableCard title={<span className="text-sm font-bold">✏️ {t('audit.edited')} ({snap.edited.length})</span>}
                                        data-testid="audit-edited">
                            <div className="px-3 pb-3">
                                {snap.edited.map(b => (
                                    <BookingLine key={`e-${b.kind}-${b.id}`} b={b}
                                                 extra={`${t('audit.editedAt')} ${fDate(b.updated_at)}${b.updated_by ? ` · ${b.updated_by}` : ''}`}/>
                                ))}
                            </div>
                        </ExpandableCard>
                    )}

                    {snap.cancelled.length > 0 && (
                        <ExpandableCard title={<span className="text-sm font-bold">🗑️ {t('audit.cancelled')} ({snap.cancelled.length})</span>}
                                        data-testid="audit-cancelled">
                            <div className="px-3 pb-3">
                                {snap.cancelled.map(b => (
                                    <BookingLine key={`c-${b.kind}-${b.id}`} b={b}
                                                 extra={`${t('audit.cancelledAt')} ${fDate(b.deleted_at)}${b.deleted_by ? ` · ${b.deleted_by}` : ''}${b.reason ? ` · „${b.reason}“` : ''}`}/>
                                ))}
                            </div>
                        </ExpandableCard>
                    )}

                    <ExpandableCard title={<span className="text-sm font-bold">👤 {t('audit.memberBalances')} ({snap.balances.length})</span>}>
                        <div className="px-3 pb-3 max-h-80 overflow-y-auto">
                            {snap.balances.map((b, i) => (
                                <div key={`${b.is_guest ? 'g' : 'm'}-${b.regular_member_id ?? i}`}
                                     className="flex justify-between gap-2 py-1 text-sm border-b border-line last:border-b-0">
                                    <span className="text-ink truncate">
                                        {b.nickname || b.name}{b.is_guest ? ` · ${t('audit.guest')}` : ''}
                                    </span>
                                    <span className={`font-bold flex-shrink-0 ${b.balance < -0.005 ? 'text-danger-fg' : b.balance > 0.005 ? 'text-positive-fg' : 'text-muted'}`}>
                                        {fe(b.balance)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </ExpandableCard>

                    <div className="kce-card p-3" data-testid="audit-signatures">
                        <div className="field-label mb-2">✍️ {t('audit.signatures')}</div>
                        {audit.signatures.length === 0
                            ? <p className="text-xs text-muted">{t('audit.noSignatures')}</p>
                            : audit.signatures.map(s => (
                                <div key={s.id} className="py-1.5 border-b border-line last:border-b-0">
                                    <div className="flex items-center gap-1.5 text-sm">
                                        <span aria-hidden="true">{s.approved ? '✅' : '⚠️'}</span>
                                        <span className="font-bold text-ink">{s.signer_name}</span>
                                        {s.is_me && <MeBadge/>}
                                        <span className="text-xs text-muted ml-auto">{fDate(s.signed_at)}</span>
                                    </div>
                                    {s.note && <p className="text-sm text-ink mt-0.5 whitespace-pre-line break-words">{s.note}</p>}
                                </div>
                            ))}
                    </div>

                    {canSign && !audit.signed_by_me && (
                        <div className="kce-card p-3 space-y-2" data-testid="audit-sign-form">
                            <div className="flex gap-2">
                                <button className={verdict === 'approve' ? 'btn-primary btn-sm flex-1' : 'btn-secondary btn-sm flex-1'}
                                        onClick={() => setVerdict('approve')}>
                                    ✅ {t('audit.approve')}
                                </button>
                                <button className={verdict === 'object' ? 'btn-danger btn-sm flex-1' : 'btn-secondary btn-sm flex-1'}
                                        onClick={() => setVerdict('object')}>
                                    ⚠️ {t('audit.object')}
                                </button>
                            </div>
                            {verdict && (
                                <>
                                    <label className="field-label" htmlFor="audit-note">
                                        {t(verdict === 'object' ? 'audit.noteRequired' : 'audit.noteOptional')}
                                    </label>
                                    <textarea id="audit-note" className="kce-input w-full" rows={3} value={note}
                                              onChange={e => setNote(e.target.value)}/>
                                    <Button variant="primary" block disabled={busy || !isOnline || objectionInvalid}
                                            onClick={sign}>
                                        {t('audit.submit')}
                                    </Button>
                                </>
                            )}
                        </div>
                    )}

                    {audit.signed_by_me && (
                        <Button variant="secondary" block disabled={busy || !isOnline} onClick={withdraw}>
                            {t('audit.withdraw')}
                        </Button>
                    )}

                    {admin && audit.signatures.length === 0 && (
                        <Button variant="danger" block disabled={busy || !isOnline} onClick={() => setConfirmDelete(true)}>
                            {t('audit.delete')}
                        </Button>
                    )}
                </div>
            )}
        </Sheet>
    )
}

function CreateAuditSheet({open, onClose, onCreated}: {open: boolean; onClose: () => void; onCreated: (id: number) => void}) {
    const t = useT()
    const isOnline = useOnline()
    const [start, setStart] = useState(() => `${new Date().getFullYear()}-01-01`)
    const [end, setEnd] = useState(todayDateInput)
    const [title, setTitle] = useState('')
    const [busy, setBusy] = useState(false)
    const valid = !!start && !!end && end >= start

    const {data: preview} = useQuery({
        queryKey: ['treasury-audit-preview', start, end],
        queryFn: () => api.previewTreasuryAudit(start, end),
        enabled: open && valid,
    })

    async function create() {
        if (!valid) return
        setBusy(true)
        try {
            const audit = await api.createTreasuryAudit({period_start: start, period_end: end, title: title.trim() || undefined})
            showToast(t('audit.created'), 'success')
            setTitle('')
            onCreated(audit.id)
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    return (
        <Sheet open={open} onClose={onClose} title={t('audit.new')} onSubmit={create}>
            <div className="space-y-3">
                <p className="text-xs text-muted">{t('audit.newHint')}</p>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="field-label" htmlFor="audit-start">{t('audit.periodStart')}</label>
                        <input id="audit-start" type="date" className="kce-input w-full" value={start}
                               onChange={e => setStart(e.target.value)}/>
                    </div>
                    <div>
                        <label className="field-label" htmlFor="audit-end">{t('audit.periodEnd')}</label>
                        <input id="audit-end" type="date" className="kce-input w-full" value={end}
                               onChange={e => setEnd(e.target.value)}/>
                    </div>
                </div>
                {!valid && <p className="text-xs text-danger-fg">{t('audit.invalidPeriod')}</p>}
                <div>
                    <label className="field-label" htmlFor="audit-title">{t('audit.titleLabel')}</label>
                    <input id="audit-title" className="kce-input w-full" value={title}
                           placeholder={t('audit.titlePlaceholder')} onChange={e => setTitle(e.target.value)}/>
                </div>
                {valid && preview && (
                    <div data-testid="audit-preview">
                        <SummaryGrid s={preview}/>
                        <p className="text-xs text-muted mt-1">
                            {t('audit.previewCount').replace('{n}', String(preview.booking_count))}
                        </p>
                    </div>
                )}
                <Button type="submit" variant="primary" block disabled={!valid || busy || !isOnline}>
                    {t('audit.create')}
                </Button>
            </div>
        </Sheet>
    )
}

/** Admins pick which members audit the treasury. Guests cannot audit. */
function AuditorManager({auditorIds}: {auditorIds: Set<number>}) {
    const t = useT()
    const qc = useQueryClient()
    const regularMembers = useAppStore(s => s.regularMembers)
    const [busy, setBusy] = useState<number | null>(null)
    const candidates = regularMembers.filter(m => m.is_active && !m.is_guest && !m.deactivated_at)

    async function toggle(id: number) {
        setBusy(id)
        try {
            await api.setAuditor(id, !auditorIds.has(id))
            await Promise.all([
                qc.invalidateQueries({queryKey: ['treasury-auditors']}),
                qc.invalidateQueries({queryKey: ['treasury-audits']}),
            ])
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(null)
        }
    }

    return (
        <ExpandableCard title={<span className="text-sm font-bold">🛠️ {t('audit.manageAuditors')}</span>}
                        data-testid="audit-manage">
            <div className="px-3 pb-3">
                <p className="text-xs text-muted mb-2">{t('audit.manageHint')}</p>
                <div className="flex flex-wrap gap-1.5">
                    {candidates.map(m => (
                        <button key={m.id} type="button" disabled={busy === m.id}
                                className={`chip ${auditorIds.has(m.id) ? 'active' : ''}`}
                                aria-pressed={auditorIds.has(m.id)}
                                onClick={() => toggle(m.id)}>
                            {m.nickname || m.name}
                        </button>
                    ))}
                </div>
            </div>
        </ExpandableCard>
    )
}

/**
 * Kassenprüfung: the treasurer freezes a period's figures into an audit, the club's auditors
 * review the frozen bookings and sign off (or object with a remark). The snapshot never changes
 * after creation, so what was signed stays what was checked.
 */
export function TreasuryAudit() {
    const t = useT()
    const user = useAppStore(s => s.user)
    const admin = isAdmin(user)
    const qc = useQueryClient()
    const [openId, setOpenId] = useState<number | null>(null)
    const [creating, setCreating] = useState(false)
    const deepLinkVersion = useDeepLinkVersion()

    const {data, isLoading} = useQuery({
        queryKey: ['treasury-audits'],
        queryFn: api.listTreasuryAudits,
    })
    const {data: auditors = []} = useQuery({
        queryKey: ['treasury-auditors'],
        queryFn: api.listAuditors,
    })

    useEffect(() => {
        const id = Number(getHashParams().get('audit'))
        if (id > 0) {
            setOpenId(id)
            clearHashParams()
        }
    }, [deepLinkVersion])

    const audits: Audit[] = data?.audits ?? []
    const auditorIds = new Set(auditors.map(a => a.id))
    const myMemberId = user?.regular_member_id

    return (
        <div className="space-y-3" data-testid="treasury-audit">
            <div className="kce-card p-3">
                <div className="sec-heading mb-1">🔍 {t('audit.title')}</div>
                <p className="text-xs text-muted mb-2">{t('audit.hint')}</p>
                <div className="field-label mb-1">{t('audit.auditors')}</div>
                {auditors.length === 0
                    ? <p className="text-xs text-muted" data-testid="audit-no-auditors">{t('audit.noAuditors')}</p>
                    : (
                        <div className="flex flex-wrap gap-1.5" data-testid="audit-auditors">
                            {auditors.map(a => (
                                <span key={a.id} className="text-sm px-2 py-0.5 rounded-full bg-surface-2 text-ink inline-flex items-center gap-1">
                                    {a.nickname || a.name}{a.id === myMemberId && <MeBadge/>}
                                </span>
                            ))}
                        </div>
                    )}
            </div>

            {admin && <AuditorManager auditorIds={auditorIds}/>}

            {data?.can_create && (
                <Button variant="primary" block onClick={() => setCreating(true)} data-testid="audit-new">
                    + {t('audit.new')}
                </Button>
            )}

            {data?.can_create && <BookingReviewCard/>}

            {isLoading && !data ? <SkeletonRows rows={3}/> : audits.length === 0 ? (
                <p className="text-sm text-muted text-center py-4" data-testid="audit-empty">{t('audit.empty')}</p>
            ) : (
                audits.map(a => (
                    <button key={a.id} type="button" className="kce-card p-3 w-full text-left flex items-center gap-2"
                            data-testid="audit-row" onClick={() => setOpenId(a.id)}>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-ink truncate">{a.title || periodLabel(a)}</div>
                            <div className="text-xs text-muted">
                                {a.title ? `${periodLabel(a)} · ` : ''}{fe(a.summary.closing_cash)}
                                {' · '}✍️ {a.signatures.length}
                            </div>
                        </div>
                        <StatusBadge status={a.status}/>
                        <span className="text-muted" aria-hidden="true">›</span>
                    </button>
                ))
            )}

            <CreateAuditSheet open={creating} onClose={() => setCreating(false)}
                              onCreated={async id => {
                                  setCreating(false)
                                  await qc.invalidateQueries({queryKey: ['treasury-audits']})
                                  setOpenId(id)
                              }}/>
            <AuditDetailSheet auditId={openId} canSign={!!data?.can_sign} onClose={() => setOpenId(null)}/>
        </div>
    )
}
