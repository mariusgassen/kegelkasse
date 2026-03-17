import {useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ModeToggle} from '@/components/ui/ModeToggle.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {toastError} from '@/utils/error.ts'
import {showToast} from '@/components/ui/Toast.tsx'
import {parseAmount} from '@/utils/parse.ts'
import {useHashTab} from '@/hooks/usePage.ts'

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

type Expense = {
    id: number; amount: number; description: string; created_at: string | null
}

// Unified booking entry for the Buchungen tab
type BookingEntry =
    | { kind: 'payment'; data: Payment }
    | { kind: 'expense'; data: Expense }

export function TreasuryPage() {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const regularMembers = useAppStore(s => s.regularMembers)
    const admin = isAdmin(user)

    const [tab, setTab] = useHashTab<'overview' | 'accounts' | 'bookings'>('overview', ['overview', 'accounts', 'bookings'])

    // Club data (for PayPal handle)
    const {data: club} = useQuery({
        queryKey: ['club'],
        queryFn: api.getClub,
        staleTime: 1000 * 60,
    })

    // My pending payment requests (for own PayPal section)
    const {data: myPaymentRequests = [], refetch: refetchMyPaymentRequests} = useQuery({
        queryKey: ['my-payment-requests'],
        queryFn: api.getMyPaymentRequests,
        enabled: !!user?.regular_member_id,
        staleTime: 1000 * 30,
    })

    // Balances — always loaded (used in overview + accounts tabs)
    const {data: balances = [], refetch: refetchBalances} = useQuery({
        queryKey: ['member-balances'],
        queryFn: api.getMemberBalances,
        staleTime: 1000 * 30,
    })

    // Guest balances — always loaded
    const {data: guestBalances = [], refetch: refetchGuestBalances} = useQuery({
        queryKey: ['guest-balances'],
        queryFn: api.getGuestBalances,
        staleTime: 1000 * 30,
    })

    // Expenses — loaded for bookings tab + overview
    const {data: expenses = [], refetch: refetchExpenses} = useQuery({
        queryKey: ['club-expenses'],
        queryFn: api.getExpenses,
        staleTime: 1000 * 30,
    })

    // All payments — loaded for bookings tab
    const {data: allPayments = [], refetch: refetchAllPayments} = useQuery({
        queryKey: ['all-payments'],
        queryFn: api.getAllPayments,
        enabled: tab === 'bookings',
        staleTime: 1000 * 30,
    })

    // Per-member payments — loaded when a member is expanded in accounts tab
    const [accountSearch, setAccountSearch] = useState('')
    const [bookingSearch, setBookingSearch] = useState('')
    const [expandedMember, setExpandedMember] = useState<number | null>(null)
    const {data: memberPayments = []} = useQuery({
        queryKey: ['member-payments', expandedMember],
        queryFn: () => expandedMember ? api.getMemberPayments(expandedMember) : null,
        enabled: !!expandedMember,
        staleTime: 1000 * 30,
    })

    // Payment sheet (for members and guests)
    const [reportingMyPayment, setReportingMyPayment] = useState(false)
    const [myPaymentAmount, setMyPaymentAmount] = useState('')

    const [paymentTarget, setPaymentTarget] = useState<{ id: number; name: string } | null>(null)
    const [paymentMode, setPaymentMode] = useState<'deposit' | 'withdrawal'>('deposit')
    const [paymentAmount, setPaymentAmount] = useState('')
    const [paymentNote, setPaymentNote] = useState('')
    const [saving, setSaving] = useState(false)

    function openPaymentSheet(id: number, name: string, prefillAmount?: number) {
        setPaymentTarget({id, name})
        setPaymentMode('deposit')
        setPaymentAmount(prefillAmount ? prefillAmount.toFixed(2) : '')
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
            refetchGuestBalances()
            qc.invalidateQueries({queryKey: ['member-payments', paymentTarget.id]})
            qc.invalidateQueries({queryKey: ['all-payments']})
            setPaymentTarget(null)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    async function deletePayment(pid: number, mid: number) {
        try {
            await api.deleteMemberPayment(pid)
            refetchBalances()
            refetchGuestBalances()
            qc.invalidateQueries({queryKey: ['member-payments', mid]})
            qc.invalidateQueries({queryKey: ['all-payments']})
            refetchAllPayments()
        } catch (e: unknown) {
            toastError(e)
        }
    }

    // Payment requests (admin only)
    const {data: paymentRequests = [], refetch: refetchPaymentRequests} = useQuery({
        queryKey: ['payment-requests'],
        queryFn: api.getPaymentRequests,
        enabled: admin,
        staleTime: 1000 * 30,
    })

    async function confirmRequest(rid: number, mid: number) {
        try {
            await api.confirmPaymentRequest(rid)
            refetchPaymentRequests()
            refetchBalances()
            refetchGuestBalances()
            qc.invalidateQueries({queryKey: ['member-payments', mid]})
            qc.invalidateQueries({queryKey: ['all-payments']})
            qc.invalidateQueries({queryKey: ['my-payment-requests']})
            qc.invalidateQueries({queryKey: ['my-balance']})
        } catch (e: unknown) { toastError(e) }
    }

    async function rejectRequest(rid: number) {
        try {
            await api.rejectPaymentRequest(rid)
            refetchPaymentRequests()
            qc.invalidateQueries({queryKey: ['my-payment-requests']})
        } catch (e: unknown) { toastError(e) }
    }

    // Expense operations
    async function deleteExpense(eid: number) {
        try {
            await api.deleteExpense(eid)
            refetchExpenses()
            refetchBalances()
            refetchGuestBalances()
        } catch (e: unknown) {
            toastError(e)
        }
    }

    // New booking sheet — unified for Club expenses and member payments
    const [bookingSheet, setBookingSheet] = useState(false)
    const [bookingTarget, setBookingTarget] = useState<'club' | number>('club')
    const [bookingDirection, setBookingDirection] = useState<'in' | 'out'>('out')
    const [bookingAmount, setBookingAmount] = useState('')
    const [bookingNote, setBookingNote] = useState('')
    const [savingBooking, setSavingBooking] = useState(false)

    function openBookingSheet() {
        setBookingTarget('club')
        setBookingDirection('out')
        setBookingAmount('')
        setBookingNote('')
        setBookingSheet(true)
    }

    // Only regular (non-guest) members in the booking sheet picker
    const memberPickerList = (balances as Balance[]).filter(b => {
        const rm = regularMembers.find(r => r.id === b.regular_member_id)
        return rm && !rm.is_guest
    })

    async function submitBooking() {
        const abs = parseAmount(bookingAmount)
        if (!abs || abs <= 0) return
        setSavingBooking(true)
        try {
            if (bookingTarget === 'club') {
                if (!bookingNote.trim()) return
                // Positive = expense (Ausgabe), negative = income (Einnahme)
                const amount = bookingDirection === 'out' ? abs : -abs
                await api.createExpense({
                    amount,
                    description: bookingNote.trim(),
                })
                refetchExpenses()
            } else {
                const amount = bookingDirection === 'in' ? abs : -abs
                await api.createMemberPayment({
                    regular_member_id: bookingTarget,
                    amount,
                    note: bookingNote || undefined,
                })
                refetchBalances()
                refetchGuestBalances()
                qc.invalidateQueries({queryKey: ['member-payments', bookingTarget]})
                qc.invalidateQueries({queryKey: ['all-payments']})
            }
            setBookingSheet(false)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSavingBooking(false)
        }
    }

    // Derived overview stats
    // kassenstand = total deposits (members + guests) minus expenses
    const memberPaymentsTotal = balances.reduce((s, b) => s + b.payments_total, 0)
    const guestPaymentsTotal = (guestBalances as Balance[]).reduce((s, b) => s + b.payments_total, 0)
    const totalExpenses = (expenses as Expense[]).reduce((s, e) => s + e.amount, 0)
    const kassenstand = memberPaymentsTotal + guestPaymentsTotal - totalExpenses

    const totalOutstanding = balances.reduce((s, b) => b.balance < 0 ? s + Math.abs(b.balance) : s, 0)
    const totalSurplus = balances.reduce((s, b) => b.balance > 0 ? s + b.balance : s, 0)
    const debtors = [...balances].filter(b => b.balance < -0.01).sort((a, b) => a.balance - b.balance)
    const credits = balances.filter(b => b.balance > 0.01).sort((a, b) => b.balance - a.balance)
    const exactlySettled = balances.filter(b => b.balance >= -0.01 && b.balance <= 0.01)

    const guestDebtors = (guestBalances as Balance[]).filter(b => b.balance < -0.01)
        .sort((a, b) => a.balance - b.balance)

    // Merged bookings for Buchungen tab — sorted by created_at desc
    const mergedBookings: BookingEntry[] = [
        ...(allPayments as Payment[]).map(p => ({kind: 'payment' as const, data: p})),
        ...(expenses as Expense[]).map(e => ({kind: 'expense' as const, data: e})),
    ].sort((a, b) => {
        const ta = a.data.created_at ?? ''
        const tb = b.data.created_at ?? ''
        return tb.localeCompare(ta)
    })

    const aq = accountSearch.trim().toLowerCase()
    const filteredBalances = aq
        ? [...balances].filter(b => b.name.toLowerCase().includes(aq) || (b.nickname ?? '').toLowerCase().includes(aq))
        : balances

    const bq = bookingSearch.trim().toLowerCase()
    const filteredBookings = bq
        ? mergedBookings.filter(entry =>
            entry.kind === 'payment'
                ? entry.data.member_name.toLowerCase().includes(bq) || (entry.data.note ?? '').toLowerCase().includes(bq)
                : entry.data.description.toLowerCase().includes(bq)
        )
        : mergedBookings

    const paypalHandle = (club as any)?.settings?.paypal_me as string | undefined
    const myRegularMemberId = user?.regular_member_id
    const myBalanceEntry = balances.find(b => b.regular_member_id === myRegularMemberId)
    const myDebtAmount = myBalanceEntry && myBalanceEntry.balance < -0.01 ? Math.abs(myBalanceEntry.balance) : 0
    const hasPendingMyRequest = myPaymentRequests.some((r: any) => r.status === 'pending')

    const pendingRequestCount = admin ? paymentRequests.length : 0
    const TABS = [
        {id: 'overview', label: t('treasury.tab.overview')},
        {id: 'accounts', label: t('treasury.tab.accounts') + (pendingRequestCount > 0 ? ` (${pendingRequestCount})` : '')},
        {id: 'bookings', label: t('treasury.tab.bookings')},
    ] as const

    const isClubBooking = bookingTarget === 'club'
    const bookingValid = parseAmount(bookingAmount) > 0 && (isClubBooking ? bookingNote.trim().length > 0 : true)

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
                            <div className="text-xs font-bold text-kce-muted uppercase tracking-wider mb-0.5">💰
                                {t('treasury.cashOnHand')}
                            </div>
                            <div className={`font-display font-bold text-3xl ${kassenstand >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fe(kassenstand)}</div>
                            <div className="text-[10px] text-kce-muted mt-1">{t('treasury.cashOnHandHint')}</div>
                        </div>
                        <span className="text-4xl opacity-20">💰</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="kce-card p-4 flex flex-col gap-1">
                            <span className="text-xs text-kce-muted">{t('treasury.openLabel')}</span>
                            <span className="font-display font-bold text-red-400 text-xl">{fe(totalOutstanding)}</span>
                            <span
                                className="text-[10px] text-kce-muted">{debtors.length} {t('treasury.membersCount')}</span>
                        </div>
                        <div className="kce-card p-4 flex flex-col gap-1">
                            <span className="text-xs text-kce-muted">{t('treasury.creditLabel')}</span>
                            <span className="font-display font-bold text-green-400 text-xl">{fe(totalSurplus)}</span>
                            <span
                                className="text-[10px] text-kce-muted">{credits.length} {t('treasury.membersCount')}</span>
                        </div>
                    </div>

                    {debtors.length === 0 && credits.length === 0
                        ? <div
                            className="kce-card p-4 text-center text-sm font-bold text-green-400">{t('treasury.noOutstanding')}</div>
                        : null
                    }

                    {debtors.length > 0 && (
                        <>
                            <div className="sec-heading">{t('treasury.openLabel')}</div>
                            {debtors.map((b, i) => {
                                const isMe = b.regular_member_id === myRegularMemberId
                                return (
                                    <div key={b.regular_member_id} className="kce-card mb-2 overflow-hidden">
                                        <div className="p-3 flex items-center gap-3">
                                            <span
                                                className="text-sm font-display font-bold text-kce-muted w-5 text-center flex-shrink-0">
                                                {i + 1}.
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                                    {b.nickname || b.name}
                                                    {isMe && <span className="text-[9px] text-kce-amber font-bold">Ich</span>}
                                                </div>
                                                <div className="text-xs text-kce-muted">
                                                    Strafen: {fe(b.penalty_total)} · Bezahlt: {fe(b.payments_total)}
                                                </div>
                                            </div>
                                            <span
                                                className="font-bold text-red-400 text-sm flex-shrink-0">{fe(b.balance)}</span>
                                            {admin && (
                                                <button className="btn-primary btn-sm flex-shrink-0"
                                                        onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                                    {t('treasury.payment.settle')}
                                                </button>
                                            )}
                                        </div>
                                        {isMe && myDebtAmount > 0 && paypalHandle && (
                                            <div className="border-t border-kce-border px-3 pb-3 pt-2">
                                                {!hasPendingMyRequest ? (
                                                    !reportingMyPayment ? (
                                                        <div className="flex gap-2">
                                                            <a
                                                                href={`https://paypal.me/${paypalHandle}/${myDebtAmount.toFixed(2)}EUR`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="btn-primary flex-1 text-center text-sm py-2 no-underline"
                                                            >
                                                                {t('profile.payNow')}
                                                            </a>
                                                            <button className="btn-secondary flex-1 btn-sm"
                                                                    onClick={() => { setReportingMyPayment(true); setMyPaymentAmount('') }}>
                                                                {t('profile.reportPayment')}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
                                                                <input
                                                                    className="kce-input flex-1"
                                                                    type="text" inputMode="decimal"
                                                                    value={myPaymentAmount}
                                                                    placeholder={myDebtAmount.toFixed(2)}
                                                                    onChange={e => setMyPaymentAmount(e.target.value)}
                                                                />
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button className="btn-secondary flex-1 btn-sm"
                                                                        onClick={() => { setReportingMyPayment(false); setMyPaymentAmount('') }}>
                                                                    {t('action.cancel')}
                                                                </button>
                                                                <button className="btn-primary flex-1 btn-sm" onClick={async () => {
                                                                    const amt = myPaymentAmount.trim()
                                                                        ? parseFloat(myPaymentAmount.replace(',', '.'))
                                                                        : myDebtAmount
                                                                    if (!amt || amt <= 0) return
                                                                    try {
                                                                        await api.createPaymentRequest({amount: amt})
                                                                        await refetchMyPaymentRequests()
                                                                        if (admin) refetchPaymentRequests()
                                                                        setReportingMyPayment(false)
                                                                        setMyPaymentAmount('')
                                                                        showToast(t('profile.reportPayment'))
                                                                    } catch (e) { toastError(e) }
                                                                }}>
                                                                    {t('profile.reportPayment')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )
                                                ) : (
                                                    <div className="text-xs text-kce-amber text-center py-1">
                                                        ⏳ {t('paymentRequest.pending')}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </>
                    )}

                    {credits.length > 0 && (
                        <>
                            <div className="sec-heading mt-2">{t('treasury.creditLabel')}</div>
                            <p className="text-xs text-kce-muted mb-2">{t('treasury.creditHint')}</p>
                            {[...credits].sort((a, b) => {
                        if (a.regular_member_id === myRegularMemberId) return -1
                        if (b.regular_member_id === myRegularMemberId) return 1
                        return 0
                    }).map(b => (
                                <div key={b.regular_member_id} className="kce-card p-3 mb-2 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                            {b.nickname || b.name}
                                            {b.regular_member_id === myRegularMemberId && <span className="text-[9px] text-kce-amber font-bold">Ich</span>}
                                        </div>
                                        <div className="text-xs text-kce-muted">
                                            Strafen: {fe(b.penalty_total)} · Bezahlt: {fe(b.payments_total)}
                                        </div>
                                    </div>
                                    <span
                                        className="font-bold text-green-400 text-sm flex-shrink-0">+{fe(b.balance)}</span>
                                </div>
                            ))}
                        </>
                    )}

                    {exactlySettled.length > 0 && (debtors.length > 0 || credits.length > 0) && (
                        <p className="text-xs text-kce-muted text-center mt-2">
                            + {exactlySettled.length} {t('treasury.settledCount')}
                        </p>
                    )}

                    {/* ── Gäste ausstehend ── */}
                    {guestDebtors.length > 0 && (
                        <>
                            <div className="sec-heading mt-3">{t('treasury.guestsLabel')}</div>
                            <p className="text-xs text-kce-muted mb-2">{t('treasury.guestsHint')}</p>
                            {guestDebtors.map(b => (
                                <div key={b.regular_member_id}
                                     className="kce-card p-3 mb-2 flex items-center gap-3">
                                    <span className="text-sm">👤</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate">{b.nickname || b.name}</div>
                                        <div className="text-xs text-kce-muted">
                                            {t('treasury.penaltiesLabel')}: {fe(b.penalty_total)} · {t('treasury.paidLabel')}: {fe(b.payments_total)}
                                        </div>
                                    </div>
                                    <span className="font-bold text-red-400 text-sm flex-shrink-0">{fe(b.balance)}</span>
                                    {admin && (
                                        <button className="btn-primary btn-sm flex-shrink-0"
                                                onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                            {t('treasury.payment.settle')}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </>
                    )}

                    {/* ── Ausgaben Übersicht ── */}
                    {totalExpenses > 0 && (
                        <>
                            <div className="sec-heading mt-3">{t('treasury.expensesLabel')}</div>
                            <div className="kce-card p-3 flex items-center justify-between">
                                <span className="text-sm text-kce-muted">{t('treasury.expensesTotal')}</span>
                                <span className="font-bold text-orange-400 text-sm">-{fe(totalExpenses)}</span>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Konten ── */}
            {tab === 'accounts' && (
                <div>
                    {/* Pending payment requests (admin only) */}
                    {admin && paymentRequests.length > 0 && (
                        <div className="mb-4">
                            <div className="sec-heading">{t('paymentRequest.pendingTitle')}</div>
                            {paymentRequests.map(r => (
                                <div key={r.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate">{r.member_name}</div>
                                        <div className="text-xs text-kce-muted">
                                            {r.created_at ? new Date(r.created_at).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'}) : ''}
                                            {r.note ? ` · ${r.note}` : ''}
                                        </div>
                                    </div>
                                    <span className="font-bold text-kce-amber flex-shrink-0">{fe(r.amount)}</span>
                                    <button
                                        className="btn-primary btn-sm flex-shrink-0 text-xs px-2 py-1"
                                        onClick={() => confirmRequest(r.id, r.regular_member_id)}>
                                        {t('paymentRequest.confirm')}
                                    </button>
                                    <button
                                        className="btn-secondary btn-sm flex-shrink-0 text-xs px-2 py-1"
                                        onClick={() => rejectRequest(r.id)}>
                                        {t('paymentRequest.reject')}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {admin && paymentRequests.length === 0 && (
                        <div className="text-xs text-kce-muted text-center py-2 mb-3">
                            {t('paymentRequest.none')}
                        </div>
                    )}
                    <input
                        className="kce-input mb-3"
                        value={accountSearch}
                        onChange={e => setAccountSearch(e.target.value)}
                        placeholder={t('treasury.accounts.search')}
                    />
                    {filteredBalances.length === 0
                        ? <Empty icon="👤" text={t('treasury.noData')}/>
                        : [...filteredBalances].sort((a, b) => {
                            if (myRegularMemberId) {
                                if (a.regular_member_id === myRegularMemberId) return -1
                                if (b.regular_member_id === myRegularMemberId) return 1
                            }
                            return a.balance - b.balance
                        }).map(b => {
                            const hasDebt = b.balance < -0.01
                            const hasCredit = b.balance > 0.01
                            const isExpanded = expandedMember === b.regular_member_id
                            const isMe = b.regular_member_id === myRegularMemberId
                            const dotColor = hasDebt
                                ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                                : hasCredit
                                    ? 'linear-gradient(135deg,#22c55e,#16a34a)'
                                    : 'linear-gradient(135deg,#6b7280,#4b5563)'
                            return (
                                <div key={b.regular_member_id} className="kce-card mb-2 overflow-hidden">
                                    <button className="w-full p-3 flex items-center gap-3 text-left"
                                            onClick={() => setExpandedMember(isExpanded ? null : b.regular_member_id)}>
                                        <div
                                            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-kce-bg text-xs flex-shrink-0"
                                            style={{background: dotColor}}>
                                            {b.name[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                                {b.nickname || b.name}
                                                {isMe && <span className="text-[9px] text-kce-amber font-bold">Ich</span>}
                                            </div>
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
                                            <div
                                                className="text-xs font-bold text-kce-muted mb-2">{t('treasury.payment.history')}</div>
                                            {(memberPayments as MemberPayment[]).length === 0
                                                ?
                                                <p className="text-xs text-kce-muted mb-2">{t('treasury.payment.noHistory')}</p>
                                                : (memberPayments as MemberPayment[]).map(p => (
                                                    <div key={p.id} className="flex items-center gap-2 mb-1.5 text-xs">
                                                        <span
                                                            className={`font-bold flex-shrink-0 w-20 ${p.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                            {p.amount >= 0 ? '+' : ''}{fe(p.amount)}
                                                        </span>
                                                        <span
                                                            className="text-kce-muted truncate flex-1">{p.note ?? (p.amount >= 0 ? t('treasury.payment.deposit') : t('treasury.payment.withdrawal'))}</span>
                                                        <span
                                                            className="text-kce-muted flex-shrink-0">{fDate(p.created_at)}</span>
                                                        {admin && (
                                                            <button className="btn-danger btn-xs flex-shrink-0"
                                                                    onClick={() => deletePayment(p.id, b.regular_member_id)}>✕</button>
                                                        )}
                                                    </div>
                                                ))
                                            }
                                            {/* PayPal payment option for own account */}
                                            {isMe && myDebtAmount > 0 && paypalHandle && (
                                                <div className="mt-2 pt-2 border-t border-kce-border flex flex-col gap-2">
                                                    {!hasPendingMyRequest ? (
                                                        !reportingMyPayment ? (
                                                            <div className="flex gap-2">
                                                                <a
                                                                    href={`https://paypal.me/${paypalHandle}/${myDebtAmount.toFixed(2)}EUR`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="btn-primary flex-1 text-center text-sm py-2 no-underline"
                                                                >
                                                                    {t('profile.payNow')}
                                                                </a>
                                                                <button className="btn-secondary flex-1 btn-sm"
                                                                        onClick={() => { setReportingMyPayment(true); setMyPaymentAmount('') }}>
                                                                    {t('profile.reportPayment')}
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
                                                                    <input
                                                                        className="kce-input flex-1"
                                                                        type="text" inputMode="decimal"
                                                                        value={myPaymentAmount}
                                                                        placeholder={myDebtAmount.toFixed(2)}
                                                                        onChange={e => setMyPaymentAmount(e.target.value)}
                                                                    />
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <button className="btn-secondary flex-1 btn-sm"
                                                                            onClick={() => { setReportingMyPayment(false); setMyPaymentAmount('') }}>
                                                                        {t('action.cancel')}
                                                                    </button>
                                                                    <button className="btn-primary flex-1 btn-sm" onClick={async () => {
                                                                        const amt = myPaymentAmount.trim()
                                                                            ? parseFloat(myPaymentAmount.replace(',', '.'))
                                                                            : myDebtAmount
                                                                        if (!amt || amt <= 0) return
                                                                        try {
                                                                            await api.createPaymentRequest({amount: amt})
                                                                            await refetchMyPaymentRequests()
                                                                            if (admin) refetchPaymentRequests()
                                                                            setReportingMyPayment(false)
                                                                            setMyPaymentAmount('')
                                                                            showToast(t('profile.reportPayment'))
                                                                        } catch (e) { toastError(e) }
                                                                    }}>
                                                                        {t('profile.reportPayment')}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )
                                                    ) : (
                                                        <div className="text-xs text-kce-amber text-center py-1">
                                                            ⏳ {t('paymentRequest.pending')}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {admin && (
                                                <div className="flex gap-2 mt-2">
                                                    {hasDebt && (
                                                        <button className="btn-primary btn-sm flex-1"
                                                                onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                                            💸 {t('treasury.payment.settle')}
                                                        </button>
                                                    )}
                                                    <button
                                                        className={`btn-secondary btn-sm ${hasDebt ? '' : 'w-full'}`}
                                                        onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name)}>
                                                        + {t('treasury.payment.record')}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    }

                    {/* Guest accounts section */}
                    {(guestBalances as Balance[]).length > 0 && (
                        <>
                            <div className="sec-heading mt-3">{t('treasury.guestsLabel')}</div>
                            {(guestBalances as Balance[]).sort((a, b) => a.balance - b.balance).map(b => {
                                const hasDebt = b.balance < -0.01
                                return (
                                    <div key={b.regular_member_id} className="kce-card p-3 mb-2 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-kce-bg text-xs flex-shrink-0"
                                             style={{background: hasDebt ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#6b7280,#4b5563)'}}>
                                            {b.name[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate flex items-center gap-1">
                                                {b.nickname || b.name}
                                                <span className="text-[9px] text-kce-muted font-bold border border-kce-border rounded px-1">{t('player.guestLabel')}</span>
                                            </div>
                                            <div className="text-xs text-kce-muted">
                                                {t('treasury.penaltiesLabel')}: {fe(b.penalty_total)} · {t('treasury.paidLabel')}: {fe(b.payments_total)}
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            {hasDebt
                                                ? <div className="font-bold text-sm text-red-400">{fe(b.balance)}</div>
                                                : <div className="text-sm text-kce-muted">✓</div>
                                            }
                                        </div>
                                        {admin && hasDebt && (
                                            <button className="btn-primary btn-sm flex-shrink-0"
                                                    onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                                {t('treasury.payment.settle')}
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </>
                    )}
                </div>
            )}

            {/* ── Buchungen ── */}
            {tab === 'bookings' && (
                <div>
                    <input
                        className="kce-input mb-3"
                        value={bookingSearch}
                        onChange={e => setBookingSearch(e.target.value)}
                        placeholder={t('treasury.bookings.search')}
                    />
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <span className="text-xs text-kce-muted">{t('treasury.expensesTotal')}</span>
                            <div className="font-bold text-orange-400 text-sm">-{fe(totalExpenses)}</div>
                        </div>
                        {admin && (
                            <button className="btn-primary btn-sm" onClick={openBookingSheet}>
                                + {t('treasury.booking.add')}
                            </button>
                        )}
                    </div>

                    {filteredBookings.length === 0
                        ? <Empty icon="📋" text={t('treasury.payment.noHistory')}/>
                        : filteredBookings.map((entry, idx) => {
                            if (entry.kind === 'payment') {
                                const p = entry.data
                                return (
                                    <div key={`p-${p.id}`} className="kce-card p-3 mb-2 flex items-center gap-3">
                                        <span className={`text-xl flex-shrink-0 ${p.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {p.amount >= 0 ? '⬆' : '⬇'}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                                {p.member_name}
                                                {p.regular_member_id === myRegularMemberId && <span className="text-[9px] text-kce-amber font-bold">Ich</span>}
                                            </div>
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
                                )
                            } else {
                                const e = entry.data
                                return (
                                    <div key={`e-${e.id}`} className="kce-card p-3 mb-2 flex items-center gap-3">
                                        <span className={`text-xl flex-shrink-0 ${e.amount < 0 ? 'text-green-400' : 'text-orange-400'}`}>
                                            {e.amount < 0 ? '⬆' : '⬇'}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                                {e.description}
                                                <span className="text-[9px] text-kce-muted font-bold border border-kce-border rounded px-1">{t('treasury.booking.club')}</span>
                                            </div>
                                            <div className="text-xs text-kce-muted">{fDate(e.created_at)}</div>
                                        </div>
                                        <div className={`font-bold text-sm flex-shrink-0 ${e.amount < 0 ? 'text-green-400' : 'text-orange-400'}`}>
                                            {e.amount < 0 ? '+' : '-'}{fe(Math.abs(e.amount))}
                                        </div>
                                        {admin && (
                                            <button className="btn-danger btn-xs flex-shrink-0"
                                                    onClick={() => deleteExpense(e.id)}>✕</button>
                                        )}
                                    </div>
                                )
                            }
                        })
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
                            <span
                                className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
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

            {/* New booking sheet */}
            <Sheet open={bookingSheet} onClose={() => setBookingSheet(false)}
                   title={`📋 ${t('treasury.booking.add')}`} onSubmit={submitBooking}>
                <div className="flex flex-col gap-3">
                    {/* Target: Club or member */}
                    <div>
                        <label className="field-label">{t('treasury.booking.for')}</label>
                        <div className="flex gap-2 flex-wrap">
                            <button type="button"
                                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${bookingTarget === 'club' ? 'bg-kce-amber text-kce-bg border-kce-amber' : 'bg-kce-surface2 text-kce-muted border-kce-border'}`}
                                    onClick={() => { setBookingTarget('club'); setBookingDirection('out') }}>
                                🏛️ {t('treasury.booking.club')}
                            </button>
                            {memberPickerList.map(m => (
                                <button key={m.regular_member_id} type="button"
                                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${bookingTarget === m.regular_member_id ? 'bg-kce-amber text-kce-bg border-kce-amber' : 'bg-kce-surface2 text-kce-muted border-kce-border'}`}
                                        onClick={() => { setBookingTarget(m.regular_member_id); setBookingDirection('in') }}>
                                    {m.nickname || m.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Direction */}
                    <ModeToggle
                        options={isClubBooking
                            ? [
                                {value: 'in', label: `⬆ ${t('treasury.booking.income')}`},
                                {value: 'out', label: `⬇ ${t('treasury.booking.expense')}`},
                            ]
                            : [
                                {value: 'in', label: `⬆ ${t('treasury.payment.deposit')}`},
                                {value: 'out', label: `⬇ ${t('treasury.payment.withdrawal')}`},
                            ]
                        }
                        value={bookingDirection}
                        onChange={v => setBookingDirection(v as 'in' | 'out')}/>

                    {/* Amount */}
                    <div>
                        <label className="field-label">{t('treasury.payment.amount')}</label>
                        <div className="flex items-center gap-2">
                            <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={bookingAmount} onChange={e => setBookingAmount(e.target.value)}
                                   placeholder="0,00" autoFocus/>
                        </div>
                    </div>

                    {/* Note / description */}
                    <div>
                        <label className="field-label">
                            {isClubBooking ? t('treasury.expense.description') : t('treasury.payment.note')}
                        </label>
                        <input className="kce-input" value={bookingNote}
                               onChange={e => setBookingNote(e.target.value)}
                               placeholder={isClubBooking ? t('treasury.expense.descPlaceholder') : t('treasury.payment.notePlaceholder')}/>
                    </div>

                    <div className="flex gap-2 mt-1">
                        <button type="button" className="btn-secondary flex-1"
                                onClick={() => setBookingSheet(false)}>{t('action.cancel')}</button>
                        <button type="submit" className="btn-primary flex-[2]"
                                disabled={savingBooking || !bookingValid}>
                            ✓ {t('action.save')}
                        </button>
                    </div>
                </div>
            </Sheet>
        </div>
    )
}
