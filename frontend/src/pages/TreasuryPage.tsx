import {useEffect, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ModeToggle} from '@/components/ui/ModeToggle.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {Loading} from '@/components/ui/Loading.tsx'
import {SearchInput} from '@/components/ui/SearchInput.tsx'
import {ExpandableCard} from '@/components/ui/ExpandableCard.tsx'
import {MeBadge} from '@/components/ui/MemberBadges.tsx'
import {TreasuryAnalysis} from '@/components/treasury/TreasuryAnalysis.tsx'
import {toastError} from '@/utils/error.ts'
import {showToast} from '@/components/ui/Toast.tsx'
import {parseAmount} from '@/utils/parse.ts'
import {useHashTab} from '@/hooks/usePage.ts'
import {useDeepLinkVersion} from '@/hooks/useDeepLink.ts'
import {getHashParams, clearHashParams} from '@/utils/hashParams.ts'
import {paidShare, treasurySummary} from '@/lib/treasurySummary.ts'

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
    amount: number; note: string | null; created_at: string | null; updated_at: string | null; date: string | null
}

type MemberPayment = {
    id: number; amount: number; note: string | null; created_at: string | null; updated_at: string | null; date: string | null
}

type Expense = {
    id: number; amount: number; description: string; created_at: string | null; updated_at: string | null; date: string | null
}

// Unified booking entry for the Buchungen tab
type BookingEntry =
    | { kind: 'payment'; data: Payment }
    | { kind: 'expense'; data: Expense }

// Booking being edited in the edit sheet
type EditTarget =
    | { kind: 'payment'; id: number; memberId: number; label: string }
    | { kind: 'expense'; id: number }

// Thin progress bar: how much of the accrued penalties is already paid.
// Makes the "Strafen vs. Bezahlt" relation tangible at a glance.
function PaidShareBar({b}: { b: Pick<Balance, 'payments_total' | 'penalty_total'> }) {
    const share = paidShare(b)
    if (share === null) return null
    return (
        <div className="h-1 rounded-full bg-surface-2 border border-line mt-1.5 overflow-hidden">
            <div className="h-full rounded-full"
                 style={{
                     width: `${Math.round(share * 100)}%`,
                     background: share >= 1 ? 'var(--positive)' : 'var(--accent)',
                 }}/>
        </div>
    )
}


export function TreasuryPage() {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const regularMembers = useAppStore(s => s.regularMembers)
    const admin = isAdmin(user)

    // Übersicht is the glance level (one card per core question); Analyse is the drill-in
    // destination that owns the player filter, the itemized money flow and the history graph.
    const [tab, setTab] = useHashTab<'overview' | 'analysis' | 'accounts' | 'bookings'>('overview', ['overview', 'analysis', 'accounts', 'bookings'])
    const [showExportSheet, setShowExportSheet] = useState(false)

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
    const {data: balances = [], refetch: refetchBalances, isLoading: balancesLoading} = useQuery({
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

    // All payments — bookings tab list + the export sheet's year picker. The Analyse tab
    // loads the same query key itself (react-query serves it from cache either way).
    const {data: allPayments = [], refetch: refetchAllPayments} = useQuery({
        queryKey: ['all-payments'],
        queryFn: api.getAllPayments,
        enabled: tab === 'bookings' || showExportSheet,
        staleTime: 1000 * 30,
    })

    // Per-member payments — loaded when a member is expanded in accounts tab
    const [accountSearch, setAccountSearch] = useState('')
    const [bookingSearch, setBookingSearch] = useState('')
    const [expandedMember, setExpandedMember] = useState<number | null>(null)
    const [deepLinkRid, setDeepLinkRid] = useState<number | null>(null)

    // Deep-link: ?memberName=X pre-fills search; ?rid=N opens payment-request confirm sheet;
    // ?q=X pre-fills the bookings search (used by GlobalSearch for a specific payment/expense)
    function handleDeepLink() {
        const params = getHashParams()
        const memberName = params.get('memberName')
        const memberId = params.get('member')
        const rid = params.get('rid')
        const bookingQuery = params.get('q')
        if (memberName || memberId || rid || bookingQuery) {
            if (memberName) {
                setBookingSearch(memberName)
                setAccountSearch(memberName)
            }
            if (memberId) setExpandedMember(parseInt(memberId, 10))
            if (rid) {
                setTab('accounts' as Parameters<typeof setTab>[0])
                setDeepLinkRid(parseInt(rid, 10))
            }
            if (bookingQuery) {
                setTab('bookings' as Parameters<typeof setTab>[0])
                setBookingSearch(bookingQuery)
            }
            clearHashParams()
        }
    }
    const deepLinkVersion = useDeepLinkVersion()
    useEffect(() => {
        handleDeepLink()
    }, [deepLinkVersion]) // eslint-disable-line react-hooks/exhaustive-deps
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
    const [remindingDebtors, setRemindingDebtors] = useState(false)

    const [exportYear, setExportYear] = useState<number | null>(null)
    const [exportFormat, setExportFormat] = useState<'xlsx' | 'pdf'>('xlsx')
    const [exporting, setExporting] = useState(false)
    const exportYears = Array.from(new Set(
        [
            ...(allPayments as Payment[]).map(p => p.date ?? p.created_at),
            ...(expenses as Expense[]).map(e => e.date ?? e.created_at),
        ]
            .filter((d): d is string => !!d)
            .map(d => new Date(d).getFullYear())
    )).sort((a, b) => b - a)

    async function downloadReport() {
        setExporting(true)
        try {
            await api.downloadReport(exportYear ?? undefined, exportFormat)
            showToast(t('report.downloaded'))
            setShowExportSheet(false)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setExporting(false)
        }
    }

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

    const [confirmDeletePayment, setConfirmDeletePayment] = useState<{ id: number; memberId: number } | null>(null)
    const [deletingPaymentId, setDeletingPaymentId] = useState<number | null>(null)
    const [deletePaymentReason, setDeletePaymentReason] = useState('')

    async function deletePayment(pid: number, mid: number, reason: string) {
        setDeletingPaymentId(pid)
        try {
            await api.deleteMemberPayment(pid, reason || undefined)
            refetchBalances()
            refetchGuestBalances()
            qc.invalidateQueries({queryKey: ['member-payments', mid]})
            qc.invalidateQueries({queryKey: ['all-payments']})
            refetchAllPayments()
            setConfirmDeletePayment(null)
            setDeletePaymentReason('')
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setDeletingPaymentId(null)
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
    const [confirmDeleteExpense, setConfirmDeleteExpense] = useState<number | null>(null)
    const [deletingExpenseId, setDeletingExpenseId] = useState<number | null>(null)
    const [deleteExpenseReason, setDeleteExpenseReason] = useState('')

    async function deleteExpense(eid: number, reason: string) {
        setDeletingExpenseId(eid)
        try {
            await api.deleteExpense(eid, reason || undefined)
            refetchExpenses()
            refetchBalances()
            refetchGuestBalances()
            setConfirmDeleteExpense(null)
            setDeleteExpenseReason('')
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setDeletingExpenseId(null)
        }
    }

    // Edit booking sheet — shared by member payments and club expenses
    const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
    const [editDirection, setEditDirection] = useState<'in' | 'out'>('in')
    const [editAmount, setEditAmount] = useState('')
    const [editNote, setEditNote] = useState('')
    const [editDate, setEditDate] = useState('')
    const [savingEdit, setSavingEdit] = useState(false)

    function openEditPayment(p: { id: number; amount: number; note: string | null; created_at: string | null; date: string | null }, memberId: number, label: string) {
        setEditTarget({kind: 'payment', id: p.id, memberId, label})
        setEditDirection(p.amount >= 0 ? 'in' : 'out')
        setEditAmount(Math.abs(p.amount).toFixed(2))
        setEditNote(p.note ?? '')
        setEditDate(p.date ?? (p.created_at ? p.created_at.slice(0, 10) : ''))
    }

    function openEditExpense(e: Expense) {
        setEditTarget({kind: 'expense', id: e.id})
        // Positive expense amount = money going out, negative = income
        setEditDirection(e.amount >= 0 ? 'out' : 'in')
        setEditAmount(Math.abs(e.amount).toFixed(2))
        setEditNote(e.description)
        setEditDate(e.date ?? (e.created_at ? e.created_at.slice(0, 10) : ''))
    }

    async function submitEdit() {
        if (!editTarget) return
        const abs = parseAmount(editAmount)
        if (!abs || abs <= 0) return
        setSavingEdit(true)
        try {
            if (editTarget.kind === 'payment') {
                const amount = editDirection === 'in' ? abs : -abs
                await api.updateMemberPayment(editTarget.id, {amount, note: editNote, date: editDate})
                refetchBalances()
                refetchGuestBalances()
                qc.invalidateQueries({queryKey: ['member-payments', editTarget.memberId]})
                qc.invalidateQueries({queryKey: ['all-payments']})
            } else {
                if (!editNote.trim()) return
                const amount = editDirection === 'out' ? abs : -abs
                await api.updateExpense(editTarget.id, {amount, description: editNote.trim(), date: editDate})
                refetchExpenses()
                refetchBalances()
                refetchGuestBalances()
            }
            setEditTarget(null)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSavingEdit(false)
        }
    }

    // Guest cost transfer sheet — credit guest + debit chosen regular member
    const [transferGuest, setTransferGuest] = useState<{ id: number; name: string } | null>(null)
    const [transferTargetId, setTransferTargetId] = useState<number | null>(null)
    const [transferAmount, setTransferAmount] = useState('')
    const [transferNote, setTransferNote] = useState('')
    const [transferring, setTransferring] = useState(false)

    function openTransferSheet(id: number, name: string, prefillAmount: number) {
        setTransferGuest({id, name})
        setTransferTargetId(null)
        setTransferAmount(prefillAmount > 0 ? prefillAmount.toFixed(2) : '')
        setTransferNote('')
    }

    async function submitTransfer() {
        if (!transferGuest || !transferTargetId) return
        const abs = parseAmount(transferAmount)
        if (!abs || abs <= 0) return
        setTransferring(true)
        try {
            await api.transferGuestCosts({
                guest_id: transferGuest.id,
                target_member_id: transferTargetId,
                amount: abs,
                note: transferNote || undefined,
            })
            refetchBalances()
            refetchGuestBalances()
            qc.invalidateQueries({queryKey: ['member-payments', transferGuest.id]})
            qc.invalidateQueries({queryKey: ['member-payments', transferTargetId]})
            qc.invalidateQueries({queryKey: ['all-payments']})
            setTransferGuest(null)
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setTransferring(false)
        }
    }

    // New booking sheet — unified for Club expenses and member payments
    const [bookingSheet, setBookingSheet] = useState(false)
    const [bookingTarget, setBookingTarget] = useState<'club' | number>('club')
    const [bookingDirection, setBookingDirection] = useState<'in' | 'out'>('out')
    const [bookingAmount, setBookingAmount] = useState('')
    const [bookingNote, setBookingNote] = useState('')
    const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [savingBooking, setSavingBooking] = useState(false)

    function openBookingSheet() {
        setBookingTarget('club')
        setBookingDirection('out')
        setBookingAmount('')
        setBookingNote('')
        setBookingDate(new Date().toISOString().slice(0, 10))
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
                    date: bookingDate || undefined,
                })
                refetchExpenses()
            } else {
                const amount = bookingDirection === 'in' ? abs : -abs
                await api.createMemberPayment({
                    regular_member_id: bookingTarget,
                    amount,
                    note: bookingNote || undefined,
                    date: bookingDate || undefined,
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

    // Derived glance stats — full money flow: paid-in → expenses → cash on hand,
    // plus outstanding debt (members + guests) and the projected cash if everyone
    // settled up. Kept in lib/treasurySummary.ts (pure, tested).
    //
    // Always on the raw balances: the Übersicht is what every member reads, so it
    // must show the club's real figures. The player filter and its leaving-member
    // simulation live in the Analyse tab and scope that tab only.
    const summary = treasurySummary(balances, guestBalances as Balance[], expenses as Expense[])
    const totalExpenses = summary.expensesNet
    const kassenstand = summary.cashOnHand
    const projectedCash = summary.projectedCash

    const totalOutstanding = balances.reduce((s, b) => b.balance < 0 ? s + Math.abs(b.balance) : s, 0)
    const totalSurplus = balances.reduce((s, b) => b.balance > 0 ? s + b.balance : s, 0)
    // Total paid in by members (gross deposits) — separate from totalSurplus (credit),
    // since credit is money the till already owes back to the member, not free cash.
    const totalPaidMembers = balances.reduce((s, b) => s + b.payments_total, 0)
    const maxAccountPenalty = balances.reduce((m, b) => Math.max(m, b.penalty_total), 0)
    // Debtor / credit / settled splits — the "Wer schuldet noch?" card and the Konten tab
    // both read the whole club, so one unfiltered derivation serves both.
    const debtors = [...balances].filter(b => b.balance < -0.01).sort((a, b) => a.balance - b.balance)
    const credits = balances.filter(b => b.balance > 0.01).sort((a, b) => b.balance - a.balance)
    const exactlySettled = balances.filter(b => b.balance >= -0.01 && b.balance <= 0.01)

    const guestDebtors = (guestBalances as Balance[]).filter(b => b.balance < -0.01)
        .sort((a, b) => a.balance - b.balance)

    // Merged bookings for Buchungen tab — sorted by effective date desc
    // Uses the `date` field if set (admin backdate), otherwise `created_at`
    const mergedBookings: BookingEntry[] = [
        ...(allPayments as Payment[]).map(p => ({kind: 'payment' as const, data: p})),
        ...(expenses as Expense[]).map(e => ({kind: 'expense' as const, data: e})),
    ].sort((a, b) => {
        const ta = a.data.date ?? a.data.created_at ?? ''
        const tb = b.data.date ?? b.data.created_at ?? ''
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
        {id: 'analysis', label: t('treasury.tab.analysis')},
        {id: 'accounts', label: t('treasury.tab.accounts') + (pendingRequestCount > 0 ? ` (${pendingRequestCount})` : '')},
        {id: 'bookings', label: t('treasury.tab.bookings')},
    ] as const

    const isClubBooking = bookingTarget === 'club'
    const bookingValid = parseAmount(bookingAmount) > 0 && (isClubBooking ? bookingNote.trim().length > 0 : true)
    const editValid = parseAmount(editAmount) > 0 && (editTarget?.kind === 'expense' ? editNote.trim().length > 0 : true)

    return (
        <div className="page-scroll px-3 py-3 pb-24">
            <div className="flex items-center justify-between mb-3">
                <div className="sec-heading mb-0">💰 {t('nav.treasury')}</div>
                {admin && (
                    <button
                        type="button"
                        onClick={() => setShowExportSheet(true)}
                        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-surface-2 text-muted hover:bg-surface transition-all">
                        {t('report.export')}
                    </button>
                )}
            </div>

            {/* Tab strip */}
            <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
                {TABS.map(tb => (
                    <button key={tb.id} type="button"
                            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === tb.id ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'}`}
                            onClick={() => setTab(tb.id)}>
                        {tb.label}
                    </button>
                ))}
            </div>

            {/* ── Übersicht ── */}
            {tab === 'overview' && (
                <div>
                    {/* Mein Konto — own status first: what did I pay, what is still open? */}
                    {myBalanceEntry && (
                        <div className="kce-card p-4 mb-3">
                            <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">
                                👤 {t('treasury.my.title')}
                            </div>
                            <div className="flex items-end justify-between gap-3">
                                <div>
                                    {myBalanceEntry.balance < -0.01 ? (
                                        <>
                                            <div className="font-display font-bold text-2xl text-red-400">{fe(Math.abs(myBalanceEntry.balance))}</div>
                                            <div className="text-[11px] text-red-400 font-bold">{t('treasury.my.owe')}</div>
                                        </>
                                    ) : myBalanceEntry.balance > 0.01 ? (
                                        <>
                                            <div className="font-display font-bold text-2xl text-green-400">+{fe(myBalanceEntry.balance)}</div>
                                            <div className="text-[11px] text-green-400 font-bold">{t('treasury.my.credit')}</div>
                                            <div className="text-[10px] text-muted">{t('treasury.my.creditHint')}</div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="font-display font-bold text-2xl text-green-400">✓ {t('treasury.my.settled')}</div>
                                            <div className="text-[10px] text-muted">{t('treasury.my.settledHint')}</div>
                                        </>
                                    )}
                                </div>
                                <div className="text-right text-xs text-muted flex-shrink-0">
                                    <div>{t('treasury.penaltiesLabel')}: <span className="font-bold text-ink">{fe(myBalanceEntry.penalty_total)}</span></div>
                                    <div>{t('treasury.paidLabel')}: <span className="font-bold text-ink">{fe(myBalanceEntry.payments_total)}</span></div>
                                </div>
                            </div>
                            {paidShare(myBalanceEntry) !== null && (
                                <>
                                    <PaidShareBar b={myBalanceEntry}/>
                                    <div className="text-[10px] text-muted mt-1">
                                        {Math.round((paidShare(myBalanceEntry) ?? 0) * 100)}% {t('treasury.my.paidShare')}
                                    </div>
                                </>
                            )}
                            {myDebtAmount > 0 && paypalHandle && (
                                <div className="mt-2 pt-2 border-t border-line">
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
                                                    <span className="text-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
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
                                        <div className="text-xs text-accent-fg text-center py-1">
                                            ⏳ {t('paymentRequest.pending')}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Was ist in der Kasse? — the club's money at a glance. The rows state the
                        flow; the itemized bookings behind each row live in the Analyse tab. */}
                    <div className="kce-card p-4 mb-3"
                         style={{background: 'linear-gradient(135deg, var(--surface), var(--surface-2))'}}>
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-xs font-bold text-muted uppercase tracking-wider mb-0.5">💰
                                    {t('treasury.cashOnHand')}
                                </div>
                                <div className={`font-display font-bold text-3xl ${kassenstand >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fe(kassenstand)}</div>
                                <div className="text-[10px] text-muted mt-1">{t('treasury.cashOnHandHint')}</div>
                            </div>
                            <span className="text-4xl opacity-20">💰</span>
                        </div>
                        <div className="mt-3 pt-2 border-t border-line flex flex-col gap-1 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-muted">⬆ {t('treasury.flow.paidIn')}</span>
                                <span className="font-bold text-green-400" data-testid="glance-amount-paidIn">+{fe(summary.paidIn)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">⬇ {t('treasury.flow.expenses')}</span>
                                <span className="font-bold text-orange-400" data-testid="glance-amount-expenses">-{fe(summary.expensesGross)}</span>
                            </div>
                            {summary.otherIncome > 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-muted">⬆ {t('treasury.flow.otherIncome')}</span>
                                    <span className="font-bold text-green-400" data-testid="glance-amount-otherIncome">+{fe(summary.otherIncome)}</span>
                                </div>
                            )}
                            {summary.outstanding > 0 && (
                                <>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted">🔴 {t('treasury.flow.outstanding')}</span>
                                        <span className="font-bold text-red-400" data-testid="glance-amount-outstanding">{fe(summary.outstanding)}</span>
                                    </div>
                                    <div className="flex items-center justify-between pt-1 border-t border-line">
                                        <span className="text-muted">→ {t('treasury.flow.projected')}</span>
                                        <span className="font-bold" style={{color: 'var(--ink)'}}>{fe(projectedCash)}</span>
                                    </div>
                                </>
                            )}
                            <button type="button" data-testid="goto-analysis"
                                    className="mt-1 text-[11px] text-accent-fg font-bold text-left"
                                    onClick={() => setTab('analysis' as Parameters<typeof setTab>[0])}>
                                {t('treasury.analysis.link')} ›
                            </button>
                        </div>

                        {/* How does the treasury work? — tucked away inside the hero, less prominent than a standalone card */}
                        <div className="mt-2 pt-2 border-t border-line">
                            <ExpandableCard bare
                                            title={<span className="text-[10px] text-muted">❓ {t('treasury.help.title')}</span>}>
                                <ul className="pt-1.5 flex flex-col gap-1 text-[10px] text-muted list-disc list-inside">
                                    <li>{t('treasury.help.penalties')}</li>
                                    <li>{t('treasury.help.payments')}</li>
                                    <li>{t('treasury.help.cash')}</li>
                                    <li>{t('treasury.help.credit')}</li>
                                </ul>
                            </ExpandableCard>
                        </div>
                    </div>

                    {/* Wer schuldet noch? — the two tiles head one answer; the lists below spell it out. */}
                    <div className="sec-heading">{t('treasury.whoOwes')}</div>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="kce-card p-4 flex flex-col gap-1">
                            <span className="text-xs text-muted">{t('treasury.openLabel')}</span>
                            <span className="font-display font-bold text-red-400 text-xl">{fe(totalOutstanding)}</span>
                            <span
                                className="text-[10px] text-muted">{debtors.length} {t('treasury.membersCount')}</span>
                        </div>
                        <div className="kce-card p-4 flex flex-col gap-1">
                            <span className="text-xs text-muted">{t('treasury.creditLabel')}</span>
                            <span className="font-display font-bold text-green-400 text-xl">{fe(totalSurplus)}</span>
                            <span
                                className="text-[10px] text-muted">{credits.length} {t('treasury.membersCount')}</span>
                        </div>
                    </div>

                    {debtors.length === 0 && credits.length === 0
                        ? <div
                            className="kce-card p-4 text-center text-sm font-bold text-green-400">{t('treasury.noOutstanding')}</div>
                        : null
                    }

                    {debtors.length > 0 && (
                        <>
                            <div className="sec-heading flex items-center justify-between">
                                <span>{t('treasury.openLabel')}</span>
                                {admin && (
                                    <button
                                        disabled={remindingDebtors}
                                        onClick={async () => {
                                            setRemindingDebtors(true)
                                            try {
                                                await api.remindDebtors()
                                                showToast(t('treasury.remindDebtorsDone'))
                                            } catch (e: unknown) {
                                                toastError(e)
                                            } finally {
                                                setRemindingDebtors(false)
                                            }
                                        }}
                                        className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-surface-2 text-muted transition-all">
                                        {remindingDebtors ? '…' : t('treasury.remindDebtors')}
                                    </button>
                                )}
                            </div>
                            {debtors.map((b, i) => {
                                const isMe = b.regular_member_id === myRegularMemberId
                                return (
                                    <div key={b.regular_member_id} className="kce-card mb-2 overflow-hidden">
                                        <div className="p-3 flex items-center gap-3">
                                            <span
                                                className="text-sm font-display font-bold text-muted w-5 text-center flex-shrink-0">
                                                {i + 1}.
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                                    {b.nickname || b.name}
                                                    {isMe && <MeBadge/>}
                                                </div>
                                                <div className="text-xs text-muted">
                                                    {t('treasury.penaltiesLabel')}: {fe(b.penalty_total)} · {t('treasury.paidLabel')}: {fe(b.payments_total)}
                                                </div>
                                                <PaidShareBar b={b}/>
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
                                    </div>
                                )
                            })}
                        </>
                    )}

                    {credits.length > 0 && (
                        <>
                            <div className="sec-heading mt-2">{t('treasury.creditLabel')}</div>
                            <p className="text-xs text-muted mb-2">{t('treasury.creditHint')}</p>
                            {[...credits].sort((a, b) => {
                        if (a.regular_member_id === myRegularMemberId) return -1
                        if (b.regular_member_id === myRegularMemberId) return 1
                        return 0
                    }).map(b => (
                                <div key={b.regular_member_id} className="kce-card p-3 mb-2 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                            {b.nickname || b.name}
                                            {b.regular_member_id === myRegularMemberId && <MeBadge/>}
                                        </div>
                                        <div className="text-xs text-muted">
                                            {t('treasury.penaltiesLabel')}: {fe(b.penalty_total)} · {t('treasury.paidLabel')}: {fe(b.payments_total)}
                                        </div>
                                    </div>
                                    <span
                                        className="font-bold text-green-400 text-sm flex-shrink-0">+{fe(b.balance)}</span>
                                </div>
                            ))}
                        </>
                    )}

                    {exactlySettled.length > 0 && (debtors.length > 0 || credits.length > 0) && (
                        <div className="mt-2">
                            <ExpandableCard bare
                                            headerClassName="justify-center gap-1 text-xs text-muted"
                                            title={<>+ {exactlySettled.length} {t('treasury.settledCount')}</>}>
                                <div className="flex flex-wrap justify-center gap-1.5 mt-1.5">
                                    {[...exactlySettled].sort((a, b) => {
                                        if (a.regular_member_id === myRegularMemberId) return -1
                                        if (b.regular_member_id === myRegularMemberId) return 1
                                        return 0
                                    }).map(b => (
                                        <span key={b.regular_member_id}
                                              className="px-2 py-1 rounded-full bg-surface-2 border border-line text-[11px] text-muted flex items-center gap-1">
                                            {b.nickname || b.name}
                                            {b.regular_member_id === myRegularMemberId &&
                                                <MeBadge/>}
                                        </span>
                                    ))}
                                </div>
                            </ExpandableCard>
                        </div>
                    )}

                    {/* ── Gäste ausstehend ── */}
                    {guestDebtors.length > 0 && (
                        <>
                            <div className="sec-heading mt-3">{t('treasury.guestsLabel')}</div>
                            <p className="text-xs text-muted mb-2">{t('treasury.guestsHint')}</p>
                            {guestDebtors.map(b => (
                                <div key={b.regular_member_id}
                                     className="kce-card mb-2 overflow-hidden">
                                    <div className="p-3 flex items-center gap-3">
                                        <span className="text-sm">👤</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate">{b.nickname || b.name}</div>
                                            <div className="text-xs text-muted">
                                                {t('treasury.penaltiesLabel')}: {fe(b.penalty_total)} · {t('treasury.paidLabel')}: {fe(b.payments_total)}
                                            </div>
                                            <PaidShareBar b={b}/>
                                        </div>
                                        <span className="font-bold text-red-400 text-sm flex-shrink-0">{fe(b.balance)}</span>
                                        {admin && (
                                            <button className="btn-primary btn-sm flex-shrink-0"
                                                    onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                                {t('treasury.payment.settle')}
                                            </button>
                                        )}
                                    </div>
                                    {admin && (
                                        <div className="border-t border-line px-3 pb-3 pt-2">
                                            <button className="btn-secondary btn-sm w-full"
                                                    onClick={() => openTransferSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                                ↪️ {t('treasury.transfer.button')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </>
                    )}

                </div>
            )}

            {/* ── Analyse ── */}
            {tab === 'analysis' && <TreasuryAnalysis/>}

            {/* ── Konten ── */}
            {tab === 'accounts' && (
                <div>
                    {/* Pending payment requests (admin only) */}
                    {admin && paymentRequests.length > 0 && (
                        <div className="mb-4">
                            <div className="sec-heading">{t('paymentRequest.pendingTitle')}</div>
                            {paymentRequests.map(r => (
                                <div key={r.id} className={`kce-card p-3 mb-2 flex items-center gap-3 ${deepLinkRid === r.id ? 'ring-2 ring-accent' : ''}`}>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold truncate">{r.member_name}</div>
                                        <div className="text-xs text-muted">
                                            {r.created_at ? new Date(r.created_at).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'}) : ''}
                                            {r.note ? ` · ${r.note}` : ''}
                                        </div>
                                    </div>
                                    <span className="font-bold text-accent-fg flex-shrink-0">{fe(r.amount)}</span>
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
                        <div className="text-xs text-muted text-center py-2 mb-3">
                            {t('paymentRequest.none')}
                        </div>
                    )}

                    {/* Gesamt-Übersicht: offene & bezahlte Beträge über alle Konten */}
                    {balances.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="kce-card p-4 flex flex-col gap-1">
                                <span className="text-xs text-muted">{t('treasury.accounts.totalOpen')}</span>
                                <span className="font-display font-bold text-red-400 text-xl">{fe(totalOutstanding)}</span>
                                <span className="text-[10px] text-muted">{debtors.length} {t('treasury.membersCount')}</span>
                            </div>
                            <div className="kce-card p-4 flex flex-col gap-1">
                                <span className="text-xs text-muted">{t('treasury.accounts.totalPaid')}</span>
                                <span className="font-display font-bold text-green-400 text-xl">{fe(totalPaidMembers)}</span>
                                {totalSurplus > 0
                                    ? <span className="text-[10px] text-muted">{t('treasury.accounts.creditOwed')}: {fe(totalSurplus)}</span>
                                    : <span className="text-[10px] text-muted">{credits.length} {t('treasury.membersCount')}</span>
                                }
                            </div>
                        </div>
                    )}

                    {/* Anteil pro Spieler — bezahlter (grün) vs. offener (rot) Anteil der Strafen, skaliert auf das größte Konto */}
                    {balances.length > 0 && (
                        <ExpandableCard className="mb-3"
                                        title={<span className="text-xs font-bold text-muted">📊 {t('treasury.accounts.shareChart')}</span>}>
                                <div>
                                    <div className="flex items-center justify-end gap-3 text-[10px] text-muted mb-2">
                                        <span className="flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{background: '#22c55e'}}/>
                                            {t('treasury.paidLabel')}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{background: '#ef4444'}}/>
                                            {t('treasury.accounts.shareChartOpen')}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-2.5">
                                        {[...balances].sort((a, b) => b.penalty_total - a.penalty_total).map(b => {
                                            const isMe = b.regular_member_id === myRegularMemberId
                                            const paidPortion = Math.max(0, Math.min(b.payments_total, b.penalty_total))
                                            const openPortion = Math.max(0, b.penalty_total - b.payments_total)
                                            const paidPct = maxAccountPenalty > 0 ? (paidPortion / maxAccountPenalty) * 100 : 0
                                            const openPct = maxAccountPenalty > 0 ? (openPortion / maxAccountPenalty) * 100 : 0
                                            return (
                                                <div key={b.regular_member_id}>
                                                    <div className="flex items-center justify-between text-xs mb-1">
                                                        <span className="font-bold truncate flex items-center gap-1">
                                                            {b.nickname || b.name}
                                                            {isMe && <MeBadge/>}
                                                        </span>
                                                        <span className="text-muted flex-shrink-0">{fe(paidPortion)} / {fe(b.penalty_total)}</span>
                                                    </div>
                                                    <div className="h-1.5 rounded-full overflow-hidden flex"
                                                         style={{background: 'var(--surface-2)', gap: '2px'}}>
                                                        {paidPct > 0 && <div className="h-full rounded-full" style={{width: `${paidPct}%`, background: '#22c55e'}}/>}
                                                        {openPct > 0 && <div className="h-full rounded-full" style={{width: `${openPct}%`, background: '#ef4444'}}/>}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                        </ExpandableCard>
                    )}

                    <SearchInput
                        className="mb-3"
                        value={accountSearch}
                        onChange={setAccountSearch}
                        placeholder={t('treasury.accounts.search')}
                    />
                    {balancesLoading && balances.length === 0
                        ? <Loading className="py-8"/>
                        : filteredBalances.length === 0
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
                                            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-on-accent text-xs flex-shrink-0"
                                            style={{background: dotColor}}>
                                            {b.name[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                                {b.nickname || b.name}
                                                {isMe && <MeBadge/>}
                                            </div>
                                            <div className="text-xs text-muted">
                                                {t('treasury.penaltiesLabel')}: {fe(b.penalty_total)} · {t('treasury.paidLabel')}: {fe(b.payments_total)}
                                            </div>
                                            <PaidShareBar b={b}/>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            {hasDebt && (
                                                <div className="font-bold text-sm text-red-400">{fe(b.balance)}</div>
                                            )}
                                            {hasCredit && (
                                                <div className="font-bold text-sm text-green-400">+{fe(b.balance)}</div>
                                            )}
                                            {!hasDebt && !hasCredit && (
                                                <div className="text-sm text-muted">✓</div>
                                            )}
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="border-t border-line px-3 pb-3 pt-2">
                                            <div
                                                className="text-xs font-bold text-muted mb-2">{t('treasury.payment.history')}</div>
                                            {(memberPayments as MemberPayment[]).length === 0
                                                ?
                                                <p className="text-xs text-muted mb-2">{t('treasury.payment.noHistory')}</p>
                                                : (memberPayments as MemberPayment[]).map(p => (
                                                    <div key={p.id} className="flex items-center gap-2 mb-1.5 text-xs">
                                                        <span
                                                            className={`font-bold flex-shrink-0 w-20 ${p.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                            {p.amount >= 0 ? '+' : ''}{fe(p.amount)}
                                                        </span>
                                                        <span
                                                            className="text-muted truncate flex-1">{p.note ?? (p.amount >= 0 ? t('treasury.payment.deposit') : t('treasury.payment.withdrawal'))}</span>
                                                        <span
                                                            className="text-muted flex-shrink-0">{p.updated_at && <span title={t('treasury.booking.edited')}>✏️ </span>}{fDate(p.date ?? p.created_at)}</span>
                                                        {admin && (
                                                            <button className="btn-secondary btn-xs flex-shrink-0"
                                                                    aria-label={t('treasury.booking.edit')}
                                                                    onClick={() => openEditPayment(p, b.regular_member_id, b.nickname || b.name)}>✏️</button>
                                                        )}
                                                        {admin && (
                                                            <button className="btn-danger btn-xs flex-shrink-0"
                                                                    onClick={() => setConfirmDeletePayment({id: p.id, memberId: b.regular_member_id})}>✕</button>
                                                        )}
                                                    </div>
                                                ))
                                            }
                                            {/* PayPal payment option for own account */}
                                            {isMe && myDebtAmount > 0 && paypalHandle && (
                                                <div className="mt-2 pt-2 border-t border-line flex flex-col gap-2">
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
                                                                    <span className="text-muted font-bold text-sm w-5 text-center flex-shrink-0">€</span>
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
                                                        <div className="text-xs text-accent-fg text-center py-1">
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
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-on-accent text-xs flex-shrink-0"
                                             style={{background: hasDebt ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#6b7280,#4b5563)'}}>
                                            {b.name[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate flex items-center gap-1">
                                                {b.nickname || b.name}
                                                <span className="text-[9px] text-muted font-bold border border-line rounded px-1">{t('player.guestLabel')}</span>
                                            </div>
                                            <div className="text-xs text-muted">
                                                {t('treasury.penaltiesLabel')}: {fe(b.penalty_total)} · {t('treasury.paidLabel')}: {fe(b.payments_total)}
                                            </div>
                                            <PaidShareBar b={b}/>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            {hasDebt
                                                ? <div className="font-bold text-sm text-red-400">{fe(b.balance)}</div>
                                                : <div className="text-sm text-muted">✓</div>
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
                    <SearchInput
                        className="mb-3"
                        value={bookingSearch}
                        onChange={setBookingSearch}
                        placeholder={t('treasury.bookings.search')}
                    />
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <span className="text-xs text-muted">{t('treasury.netExpenses')}</span>
                            <div className={`font-bold text-sm ${-totalExpenses >= 0 ? 'text-green-400' : 'text-orange-400'}`}>{fe(-totalExpenses)}</div>
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
                                                {p.regular_member_id === myRegularMemberId && <MeBadge/>}
                                            </div>
                                            <div className="text-xs text-muted truncate">
                                                {p.note ?? (p.amount >= 0 ? t('treasury.payment.deposit') : t('treasury.payment.withdrawal'))}
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className={`font-bold text-sm ${p.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {p.amount >= 0 ? '+' : ''}{fe(p.amount)}
                                            </div>
                                            <div className="text-xs text-muted">{p.updated_at && <span title={t('treasury.booking.edited')}>✏️ </span>}{fDate(p.date ?? p.created_at)}</div>
                                        </div>
                                        {admin && (
                                            <button className="btn-secondary btn-xs flex-shrink-0"
                                                    aria-label={t('treasury.booking.edit')}
                                                    onClick={() => openEditPayment(p, p.regular_member_id, p.member_name)}>✏️</button>
                                        )}
                                        {admin && (
                                            <button className="btn-danger btn-xs flex-shrink-0"
                                                    onClick={() => setConfirmDeletePayment({id: p.id, memberId: p.regular_member_id})}>✕</button>
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
                                                <span className="text-[9px] text-muted font-bold border border-line rounded px-1">{t('treasury.booking.club')}</span>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className={`font-bold text-sm ${e.amount < 0 ? 'text-green-400' : 'text-orange-400'}`}>
                                                {e.amount < 0 ? '+' : '-'}{fe(Math.abs(e.amount))}
                                            </div>
                                            <div className="text-xs text-muted">{e.updated_at && <span title={t('treasury.booking.edited')}>✏️ </span>}{fDate(e.date ?? e.created_at)}</div>
                                        </div>
                                        {admin && (
                                            <button className="btn-secondary btn-xs flex-shrink-0"
                                                    aria-label={t('treasury.booking.edit')}
                                                    onClick={() => openEditExpense(e)}>✏️</button>
                                        )}
                                        {admin && (
                                            <button className="btn-danger btn-xs flex-shrink-0"
                                                    onClick={() => setConfirmDeleteExpense(e.id)}>✕</button>
                                        )}
                                    </div>
                                )
                            }
                        })
                    }
                </div>
            )}

            {/* Confirm payment deletion */}
            <Sheet open={!!confirmDeletePayment} onClose={() => {setConfirmDeletePayment(null); setDeletePaymentReason('')}}
                   title={t('treasury.payment.deleteConfirm')}>
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-muted">{t('treasury.payment.deleteConfirmHint')}</p>
                    <input className="kce-input" value={deletePaymentReason}
                           onChange={e => setDeletePaymentReason(e.target.value)}
                           placeholder={t('treasury.payment.deleteReasonPlaceholder')} />
                    <div className="flex gap-2">
                        <button className="btn-secondary btn-sm flex-1"
                                onClick={() => {setConfirmDeletePayment(null); setDeletePaymentReason('')}}>
                            {t('action.cancel')}
                        </button>
                        <button className="btn-danger btn-sm flex-1" disabled={deletingPaymentId !== null}
                                onClick={() => confirmDeletePayment && deletePayment(confirmDeletePayment.id, confirmDeletePayment.memberId, deletePaymentReason)}>
                            {t('action.delete')}
                        </button>
                    </div>
                </div>
            </Sheet>

            {/* Confirm expense deletion */}
            <Sheet open={!!confirmDeleteExpense} onClose={() => {setConfirmDeleteExpense(null); setDeleteExpenseReason('')}}
                   title={t('treasury.expense.deleteConfirm')}>
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-muted">{t('treasury.expense.deleteConfirmHint')}</p>
                    <input className="kce-input" value={deleteExpenseReason}
                           onChange={e => setDeleteExpenseReason(e.target.value)}
                           placeholder={t('treasury.expense.deleteReasonPlaceholder')} />
                    <div className="flex gap-2">
                        <button className="btn-secondary btn-sm flex-1"
                                onClick={() => {setConfirmDeleteExpense(null); setDeleteExpenseReason('')}}>
                            {t('action.cancel')}
                        </button>
                        <button className="btn-danger btn-sm flex-1" disabled={deletingExpenseId !== null}
                                onClick={() => confirmDeleteExpense !== null && deleteExpense(confirmDeleteExpense, deleteExpenseReason)}>
                            {t('action.delete')}
                        </button>
                    </div>
                </div>
            </Sheet>

            {/* Edit booking sheet */}
            <Sheet open={!!editTarget} onClose={() => setEditTarget(null)}
                   title={`✏️ ${t('treasury.booking.edit')}`} onSubmit={submitEdit}>
                <div className="flex flex-col gap-3">
                    {editTarget?.kind === 'payment' && (
                        <div>
                            <label className="field-label">
                                {t('treasury.booking.for')}: <span className="font-bold text-kce-text">{editTarget.label}</span>
                            </label>
                        </div>
                    )}

                    {/* Direction */}
                    <ModeToggle
                        options={editTarget?.kind === 'expense'
                            ? [
                                {value: 'in', label: `⬆ ${t('treasury.booking.income')}`},
                                {value: 'out', label: `⬇ ${t('treasury.booking.expense')}`},
                            ]
                            : [
                                {value: 'in', label: `⬆ ${t('treasury.payment.deposit')}`},
                                {value: 'out', label: `⬇ ${t('treasury.payment.withdrawal')}`},
                            ]
                        }
                        value={editDirection}
                        onChange={v => setEditDirection(v as 'in' | 'out')}/>

                    {/* Amount */}
                    <div>
                        <label className="field-label">{t('treasury.payment.amount')}</label>
                        <div className="flex items-center gap-2">
                            <span className="text-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={editAmount} onChange={e => setEditAmount(e.target.value)}
                                   placeholder="0,00" autoFocus/>
                        </div>
                    </div>

                    {/* Note / description */}
                    <div>
                        <label className="field-label">
                            {editTarget?.kind === 'expense' ? t('treasury.expense.description') : t('treasury.payment.note')}
                        </label>
                        <input className="kce-input" value={editNote}
                               onChange={e => setEditNote(e.target.value)}
                               placeholder={editTarget?.kind === 'expense' ? t('treasury.expense.descPlaceholder') : t('treasury.payment.notePlaceholder')}/>
                    </div>

                    {/* Date override */}
                    <div>
                        <label className="field-label">{t('treasury.expense.date')}</label>
                        <input type="date" className="kce-input" value={editDate}
                               onChange={e => setEditDate(e.target.value)}/>
                    </div>

                    <button type="submit" className="btn-primary w-full"
                            disabled={savingEdit || !editValid}>
                        ✓ {t('action.save')}
                    </button>
                </div>
            </Sheet>

            {/* Guest cost transfer sheet */}
            <Sheet open={!!transferGuest} onClose={() => setTransferGuest(null)}
                   title={`↪️ ${t('treasury.transfer.title')}`} onSubmit={submitTransfer}>
                <div className="flex flex-col gap-3">
                    <p className="text-xs text-muted">
                        {t('treasury.transfer.hint')}
                    </p>
                    <div>
                        <label className="field-label">
                            {t('treasury.transfer.fromGuest')}: <span className="font-bold text-kce-text">{transferGuest?.name ?? ''}</span>
                        </label>
                    </div>
                    <div>
                        <label className="field-label">{t('treasury.transfer.target')}</label>
                        {memberPickerList.length === 0
                            ? <p className="text-xs text-muted">{t('treasury.transfer.noTargets')}</p>
                            : (
                                <div className="flex gap-2 flex-wrap">
                                    {memberPickerList.map(m => (
                                        <button key={m.regular_member_id} type="button"
                                                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${transferTargetId === m.regular_member_id ? 'bg-accent text-on-accent border-accent' : 'bg-surface-2 text-muted border-line'}`}
                                                onClick={() => setTransferTargetId(m.regular_member_id)}>
                                            {m.nickname || m.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                    </div>
                    <div>
                        <label className="field-label">{t('treasury.payment.amount')}</label>
                        <div className="flex items-center gap-2">
                            <span className="text-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={transferAmount} onChange={e => setTransferAmount(e.target.value)}
                                   placeholder="0,00"/>
                        </div>
                    </div>
                    <div>
                        <label className="field-label">{t('treasury.payment.note')}</label>
                        <input className="kce-input" value={transferNote}
                               onChange={e => setTransferNote(e.target.value)}
                               placeholder={t('treasury.transfer.notePlaceholder')}/>
                    </div>
                    <button type="submit" className="btn-primary w-full"
                            disabled={transferring || !transferTargetId || parseAmount(transferAmount) <= 0}>
                        ✓ {t('treasury.transfer.submit')}
                    </button>
                </div>
            </Sheet>

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
                                className="text-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
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
                    <button type="submit" className="btn-primary w-full"
                            disabled={saving || !paymentAmount || parseAmount(paymentAmount) <= 0}>
                        ✓ {t('treasury.payment.record')}
                    </button>
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
                                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${bookingTarget === 'club' ? 'bg-accent text-on-accent border-accent' : 'bg-surface-2 text-muted border-line'}`}
                                    onClick={() => { setBookingTarget('club'); setBookingDirection('out') }}>
                                🏛️ {t('treasury.booking.club')}
                            </button>
                            {memberPickerList.map(m => (
                                <button key={m.regular_member_id} type="button"
                                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${bookingTarget === m.regular_member_id ? 'bg-accent text-on-accent border-accent' : 'bg-surface-2 text-muted border-line'}`}
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
                            <span className="text-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
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

                    {/* Date override */}
                    <div>
                        <label className="field-label">{t('treasury.expense.date')}</label>
                        <input type="date" className="kce-input" value={bookingDate}
                               onChange={e => setBookingDate(e.target.value)}/>
                    </div>

                    <button type="submit" className="btn-primary w-full"
                            disabled={savingBooking || !bookingValid}>
                        ✓ {t('action.save')}
                    </button>
                </div>
            </Sheet>

            {/* Export sheet — admin only */}
            <Sheet open={showExportSheet} onClose={() => setShowExportSheet(false)}
                   title={`📊 ${t('report.export')}`} onSubmit={downloadReport}>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="field-label">{t('report.year')}</label>
                        <select
                            value={exportYear ?? ''}
                            onChange={e => setExportYear(e.target.value ? parseInt(e.target.value, 10) : null)}
                            className="kce-input">
                            <option value="">{t('report.yearAll')}</option>
                            {exportYears.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="field-label">{t('report.format')}</label>
                        <select
                            value={exportFormat}
                            onChange={e => setExportFormat(e.target.value as 'xlsx' | 'pdf')}
                            className="kce-input">
                            <option value="xlsx">Excel</option>
                            <option value="pdf">PDF</option>
                        </select>
                    </div>
                    <button type="submit" className="btn-primary w-full" disabled={exporting}>
                        {exporting ? t('report.downloading') : t('report.download')}
                    </button>
                </div>
            </Sheet>

        </div>
    )
}
