import {useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useAppStore, isAdmin} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ModeToggle} from '@/components/ui/ModeToggle.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {parseAmount} from '@/utils/parse.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fDate(iso: string | null) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'})
}

type Balance = {
    regular_member_id: number; name: string; nickname: string | null;
    penalty_total: number; payments_total: number; balance: number
}

type Payment = {
    id: number; regular_member_id: number; member_name: string;
    amount: number; note: string | null; created_at: string | null
}

type MemberPayment = {
    id: number; amount: number; note: string | null; created_at: string | null
}

export function TreasuryPage() {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const admin = isAdmin(user)

    const [tab, setTab] = useState<'overview' | 'accounts' | 'transactions'>('overview')

    // Balances — always loaded (used in overview + accounts tabs)
    const {data: balances = [], refetch: refetchBalances} = useQuery({
        queryKey: ['member-balances'],
        queryFn: api.getMemberBalances,
        staleTime: 1000 * 30,
    })

    // All payments — loaded for transactions tab
    const {data: allPayments = [], refetch: refetchAllPayments} = useQuery({
        queryKey: ['all-payments'],
        queryFn: api.getAllPayments,
        enabled: tab === 'transactions',
        staleTime: 1000 * 30,
    })

    // Per-member payments — loaded when a member is expanded in accounts tab
    const [expandedMember, setExpandedMember] = useState<number | null>(null)
    const {data: memberPayments = []} = useQuery({
        queryKey: ['member-payments', expandedMember],
        queryFn: () => expandedMember ? api.getMemberPayments(expandedMember) : null,
        enabled: !!expandedMember,
        staleTime: 1000 * 30,
    })

    // Payment sheet
    const [paymentTarget, setPaymentTarget] = useState<{id: number; name: string} | null>(null)
    const [paymentMode, setPaymentMode] = useState<'deposit' | 'withdrawal'>('deposit')
    const [paymentAmount, setPaymentAmount] = useState('')
    const [paymentNote, setPaymentNote] = useState('')
    const [saving, setSaving] = useState(false)

    function openPaymentSheet(id: number, name: string) {
        setPaymentTarget({id, name})
        setPaymentMode('deposit')
        setPaymentAmount('')
        setPaymentNote('')
    }

    async function submitPayment() {
        if (!paymentTarget) return
        const abs = parseAmount(paymentAmount)
        if (!abs || abs <= 0) return
        const amount = paymentMode === 'deposit' ? abs : -abs
        setSaving(true)
        try {
            await api.createMemberPayment({
                regular_member_id: paymentTarget.id,
                amount,
                note: paymentNote || undefined,
            })
            refetchBalances()
            qc.invalidateQueries({queryKey: ['member-payments', paymentTarget.id]})
            qc.invalidateQueries({queryKey: ['all-payments']})
            setPaymentTarget(null)
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : t('error.generic'))
        } finally {
            setSaving(false)
        }
    }

    async function deletePayment(pid: number, mid: number) {
        try {
            await api.deleteMemberPayment(pid)
            refetchBalances()
            qc.invalidateQueries({queryKey: ['member-payments', mid]})
            qc.invalidateQueries({queryKey: ['all-payments']})
            refetchAllPayments()
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : t('error.generic'))
        }
    }

    // Derived overview stats
    const kassenstand = balances.reduce((s, b) => s + b.payments_total, 0)
    const totalOutstanding = balances.reduce((s, b) => b.balance < 0 ? s + Math.abs(b.balance) : s, 0)
    const totalSurplus = balances.reduce((s, b) => b.balance > 0 ? s + b.balance : s, 0)
    const debtors = [...balances].filter(b => b.balance < -0.01).sort((a, b) => a.balance - b.balance)
    const credits = balances.filter(b => b.balance > 0.01).sort((a, b) => b.balance - a.balance)
    const exactlySettled = balances.filter(b => b.balance >= -0.01 && b.balance <= 0.01)

    const TABS = [
        {id: 'overview', label: t('treasury.tab.overview')},
        {id: 'accounts', label: t('treasury.tab.accounts')},
        {id: 'transactions', label: t('treasury.tab.transactions')},
    ] as const

    return (
        <div className="page-scroll px-3 py-3 pb-24">
            <div className="sec-heading">💰 {t('nav.treasury')}</div>

            {/* Tab strip */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
                {TABS.map(tb => (
                    <button key={tb.id} type="button"
                            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === tb.id ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                            onClick={() => setTab(tb.id)}>
                        {tb.label}
                    </button>
                ))}
            </div>

            {/* ── Übersicht ── */}
            {tab === 'overview' && (
                <div>
                    {/* Kassenstand hero */}
                    <div className="kce-card p-4 mb-3 flex items-center justify-between"
                         style={{background: 'linear-gradient(135deg, var(--kce-surface), var(--kce-surface2))'}}>
                        <div>
                            <div className="text-xs font-bold text-kce-muted uppercase tracking-wider mb-0.5">💰 {t('treasury.cashOnHand')}</div>
                            <div className="font-display font-bold text-kce-amber text-3xl">{fe(kassenstand)}</div>
                            <div className="text-[10px] text-kce-muted mt-1">{t('treasury.cashOnHandHint')}</div>
                        </div>
                        <span className="text-4xl opacity-20">💰</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="kce-card p-4 flex flex-col gap-1">
                            <span className="text-xs text-kce-muted">{t('treasury.openLabel')}</span>
                            <span className="font-display font-bold text-red-400 text-xl">{fe(totalOutstanding)}</span>
                            <span className="text-[10px] text-kce-muted">{debtors.length} {t('treasury.membersCount')}</span>
                        </div>
                        <div className="kce-card p-4 flex flex-col gap-1">
                            <span className="text-xs text-kce-muted">{t('treasury.creditLabel')}</span>
                            <span className="font-display font-bold text-green-400 text-xl">{fe(totalSurplus)}</span>
                            <span className="text-[10px] text-kce-muted">{credits.length} {t('treasury.membersCount')}</span>
                        </div>
                    </div>

                    {debtors.length === 0 && credits.length === 0
                        ? <div className="kce-card p-4 text-center text-sm font-bold text-green-400">{t('treasury.noOutstanding')}</div>
                        : null
                    }

                    {debtors.length > 0 && (
                        <>
                            <div className="sec-heading">{t('treasury.openLabel')}</div>
                            {debtors.map((b, i) => (
                                <div key={b.regular_member_id} className="kce-card p-3 mb-2 flex items-center gap-3">
                                    <span className="text-sm font-display font-bold text-kce-muted w-5 text-center flex-shrink-0">
                                        {i + 1}.
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate">{b.nickname || b.name}</div>
                                        <div className="text-xs text-kce-muted">
                                            Strafen: {fe(b.penalty_total)} · Bezahlt: {fe(b.payments_total)}
                                        </div>
                                    </div>
                                    <span className="font-bold text-red-400 text-sm flex-shrink-0">{fe(b.balance)}</span>
                                </div>
                            ))}
                        </>
                    )}

                    {credits.length > 0 && (
                        <>
                            <div className="sec-heading mt-2">{t('treasury.creditLabel')}</div>
                            <p className="text-xs text-kce-muted mb-2">{t('treasury.creditHint')}</p>
                            {credits.map(b => (
                                <div key={b.regular_member_id} className="kce-card p-3 mb-2 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate">{b.nickname || b.name}</div>
                                        <div className="text-xs text-kce-muted">
                                            Strafen: {fe(b.penalty_total)} · Bezahlt: {fe(b.payments_total)}
                                        </div>
                                    </div>
                                    <span className="font-bold text-green-400 text-sm flex-shrink-0">+{fe(b.balance)}</span>
                                </div>
                            ))}
                        </>
                    )}

                    {exactlySettled.length > 0 && (debtors.length > 0 || credits.length > 0) && (
                        <p className="text-xs text-kce-muted text-center mt-2">
                            + {exactlySettled.length} {t('treasury.settledCount')}
                        </p>
                    )}
                </div>
            )}

            {/* ── Konten ── */}
            {tab === 'accounts' && (
                <div>
                    {balances.length === 0
                        ? <Empty icon="👤" text={t('treasury.noData')}/>
                        : [...balances].sort((a, b) => a.balance - b.balance).map(b => {
                            const hasDebt = b.balance < -0.01
                            const hasCredit = b.balance > 0.01
                            const isExpanded = expandedMember === b.regular_member_id
                            const dotColor = hasDebt
                                ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                                : hasCredit
                                    ? 'linear-gradient(135deg,#22c55e,#16a34a)'
                                    : 'linear-gradient(135deg,#6b7280,#4b5563)'
                            return (
                                <div key={b.regular_member_id} className="kce-card mb-2 overflow-hidden">
                                    <button className="w-full p-3 flex items-center gap-3 text-left"
                                            onClick={() => setExpandedMember(isExpanded ? null : b.regular_member_id)}>
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-kce-bg text-xs flex-shrink-0"
                                             style={{background: dotColor}}>
                                            {b.name[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate">{b.nickname || b.name}</div>
                                            <div className="text-xs text-kce-muted">
                                                Strafen: {fe(b.penalty_total)} · Bezahlt: {fe(b.payments_total)}
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            {hasDebt && (
                                                <div className="font-bold text-sm text-red-400">{fe(b.balance)}</div>
                                            )}
                                            {hasCredit && (
                                                <div className="font-bold text-sm text-green-400">+{fe(b.balance)}</div>
                                            )}
                                            {!hasDebt && !hasCredit && (
                                                <div className="text-sm text-kce-muted">✓</div>
                                            )}
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="border-t border-kce-border px-3 pb-3 pt-2">
                                            <div className="text-xs font-bold text-kce-muted mb-2">{t('treasury.payment.history')}</div>
                                            {(memberPayments as MemberPayment[]).length === 0
                                                ? <p className="text-xs text-kce-muted mb-2">{t('treasury.payment.noHistory')}</p>
                                                : (memberPayments as MemberPayment[]).map(p => (
                                                    <div key={p.id} className="flex items-center gap-2 mb-1.5 text-xs">
                                                        <span className={`font-bold flex-shrink-0 w-20 ${p.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                            {p.amount >= 0 ? '+' : ''}{fe(p.amount)}
                                                        </span>
                                                        <span className="text-kce-muted truncate flex-1">{p.note ?? (p.amount >= 0 ? t('treasury.payment.deposit') : t('treasury.payment.withdrawal'))}</span>
                                                        <span className="text-kce-muted flex-shrink-0">{fDate(p.created_at)}</span>
                                                        {admin && (
                                                            <button className="btn-danger btn-xs flex-shrink-0"
                                                                    onClick={() => deletePayment(p.id, b.regular_member_id)}>✕</button>
                                                        )}
                                                    </div>
                                                ))
                                            }
                                            {admin && (
                                                <button className="btn-primary btn-sm w-full mt-2"
                                                        onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name)}>
                                                    + {t('treasury.payment.record')}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    }
                </div>
            )}

            {/* ── Buchungen ── */}
            {tab === 'transactions' && (
                <div>
                    {(allPayments as Payment[]).length === 0
                        ? <Empty icon="📋" text={t('treasury.payment.noHistory')}/>
                        : (allPayments as Payment[]).map(p => (
                            <div key={p.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                                <span className={`text-xl flex-shrink-0 ${p.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {p.amount >= 0 ? '⬆' : '⬇'}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold truncate">{p.member_name}</div>
                                    <div className="text-xs text-kce-muted truncate">
                                        {p.note ?? (p.amount >= 0 ? t('treasury.payment.deposit') : t('treasury.payment.withdrawal'))}
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <div className={`font-bold text-sm ${p.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {p.amount >= 0 ? '+' : ''}{fe(p.amount)}
                                    </div>
                                    <div className="text-xs text-kce-muted">{fDate(p.created_at)}</div>
                                </div>
                                {admin && (
                                    <button className="btn-danger btn-xs flex-shrink-0"
                                            onClick={() => deletePayment(p.id, p.regular_member_id)}>✕</button>
                                )}
                            </div>
                        ))
                    }
                </div>
            )}

            {/* Payment sheet */}
            <Sheet open={!!paymentTarget} onClose={() => setPaymentTarget(null)}
                   title={`💰 ${paymentTarget?.name ?? ''}`} onSubmit={submitPayment}>
                <div className="flex flex-col gap-3">
                    <ModeToggle
                        options={[
                            {value: 'deposit', label: `⬆ ${t('treasury.payment.deposit')}`},
                            {value: 'withdrawal', label: `⬇ ${t('treasury.payment.withdrawal')}`},
                        ]}
                        value={paymentMode}
                        onChange={v => setPaymentMode(v as 'deposit' | 'withdrawal')}/>
                    <div>
                        <label className="field-label">{t('treasury.payment.amount')}</label>
                        <div className="flex items-center gap-2">
                            <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                                   placeholder="0,00" autoFocus/>
                        </div>
                    </div>
                    <div>
                        <label className="field-label">{t('treasury.payment.note')}</label>
                        <input className="kce-input" value={paymentNote}
                               onChange={e => setPaymentNote(e.target.value)}
                               placeholder={t('treasury.payment.notePlaceholder')}/>
                    </div>
                    <div className="flex gap-2 mt-1">
                        <button type="button" className="btn-secondary flex-1"
                                onClick={() => setPaymentTarget(null)}>{t('action.cancel')}</button>
                        <button type="submit" className="btn-primary flex-[2]"
                                disabled={saving || !paymentAmount || parseAmount(paymentAmount) <= 0}>
                            ✓ {t('treasury.payment.record')}
                        </button>
                    </div>
                </div>
            </Sheet>
        </div>
    )
}
