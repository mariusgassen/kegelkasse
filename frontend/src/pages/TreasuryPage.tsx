import {Caption} from '@/components/ui/Caption.tsx'
import {lazy, Suspense, useEffect, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ConfirmSheet} from '@/components/ui/ConfirmSheet.tsx'
import {ModeToggle} from '@/components/ui/ModeToggle.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {Field} from '@/components/ui/Field.tsx'
import {SkeletonRows} from '@/components/ui/Skeleton'
import {CountUp} from '@/components/ui/CountUp'
import {SearchInput} from '@/components/ui/SearchInput.tsx'
import {ExpandableCard} from '@/components/ui/ExpandableCard.tsx'
import {MeBadge} from '@/components/ui/MemberBadges.tsx'
import {TreasuryAudit} from '@/components/treasury/TreasuryAudit.tsx'
import {SkeletonChart} from '@/components/ui/Skeleton.tsx'
import {TreasuryAnalysis} from '@/components/treasury/TreasuryAnalysis.tsx'
// Recharts is ~90 KB gz — only fetched when the Diagramme tab is opened.
const TreasuryCharts = lazy(() => import('@/components/treasury/TreasuryCharts.tsx').then(m => ({default: m.TreasuryCharts})))
import {toastError} from '@/utils/error.ts'
import {showToast} from '@/components/ui/Toast.tsx'
import {parseAmount} from '@/utils/parse.ts'
import {useHashTab} from '@/hooks/usePage.ts'
import {useDeepLinkVersion} from '@/hooks/useDeepLink.ts'
import {getHashParams, clearHashParams} from '@/utils/hashParams.ts'
import {cashPaidIn, paidShare, treasurySummary} from '@/lib/treasurySummary.ts'
import {todayDateInput} from '@/lib/datetime.ts'
import {buildAccountStatement} from '@/lib/accountStatement.ts'
import type {ClubTrip} from '@/types.ts'
import {Tabs} from '@/components/ui/Tabs'
import {Button} from '@/components/ui/Button.tsx'
import {CardActionMenu} from '@/components/ui/ActionSheet.tsx'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fDate(iso: string | null) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit'})
}

type Balance = {
    regular_member_id: number; name: string; nickname: string | null;
    penalty_total: number; payments_total: number; writeoff_total?: number; balance: number
}

type Payment = {
    id: number; regular_member_id: number; member_name: string;
    amount: number; note: string | null; created_at: string | null; updated_at: string | null; date: string | null;
    is_writeoff?: boolean
}

type MemberPayment = {
    id: number; amount: number; note: string | null; created_at: string | null; updated_at: string | null; date: string | null
}

type Expense = {
    id: number; amount: number; description: string; created_at: string | null; updated_at: string | null; date: string | null
    trip_id?: number | null
}

// Unified booking entry for the Buchungen tab
type BookingEntry =
    | { kind: 'payment'; data: Payment }
    | { kind: 'expense'; data: Expense }

// Booking being edited in the edit sheet
type EditTarget =
    | { kind: 'payment'; id: number; memberId: number; label: string }
    | { kind: 'expense'; id: number }

// Optional Kegelfahrt a club expense paid for — the trip card sums what is linked here.
function TripPicker({trips, value, onChange}: {
    trips: ClubTrip[]; value: number | null; onChange: (v: number | null) => void
}) {
    const t = useT()
    // Used about once a year, so it stays a small link until someone asks for it
    const [open, setOpen] = useState(false)
    if (trips.length === 0 && value == null) return null
    if (!open && value == null) {
        return (
            <button type="button" className="text-xs text-muted underline self-start" data-testid="booking-trip-link"
                    onClick={() => setOpen(true)}>
                🚌 {t('treasury.booking.assignTrip')}
            </button>
        )
    }
    return (
        <Field label={t('treasury.booking.trip')} htmlFor="booking-trip">
            <select id="booking-trip" className="kce-input" value={value ?? ''}
                    onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}>
                <option value="">{t('treasury.booking.noTrip')}</option>
                {trips.map(tr => (
                    <option key={tr.id} value={tr.id}>🚌 {tr.destination} · {tr.date.slice(0, 10).split('-').reverse().join('.')}</option>
                ))}
            </select>
        </Field>
    )
}

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
    const [tab, setTab] = useHashTab<'overview' | 'analysis' | 'charts' | 'accounts' | 'bookings' | 'audit'>('overview', ['overview', 'analysis', 'charts', 'accounts', 'bookings', 'audit'])
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
    const {data: trips = []} = useQuery({
        queryKey: ['committee-trips'],
        queryFn: api.listTrips,
        staleTime: 1000 * 60,
    })
    const tripName = (id: number | null | undefined) => (trips as ClubTrip[]).find(tr => tr.id === id)?.destination
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
    const {data: memberPenalties = []} = useQuery({
        queryKey: ['member-penalties', expandedMember],
        queryFn: () => expandedMember ? api.getMemberPenalties(expandedMember) : null,
        enabled: !!expandedMember,
        staleTime: 1000 * 30,
    })
    const accountStatement = buildAccountStatement(
        (memberPayments ?? []) as MemberPayment[],
        memberPenalties ?? [],
    )

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
    const [editTrip, setEditTrip] = useState<number | null>(null)
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
        setEditTrip(e.trip_id ?? null)
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
                await api.updateExpense(editTarget.id, {amount, description: editNote.trim(), date: editDate, trip_id: editTrip})
                refetchExpenses()
                qc.invalidateQueries({queryKey: ['committee-trips']})
                qc.invalidateQueries({queryKey: ['trip-expenses']})
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
    const [bookingDate, setBookingDate] = useState(todayDateInput)
    const [bookingAsExpense, setBookingAsExpense] = useState(false)
    const [bookingTrip, setBookingTrip] = useState<number | null>(null)
    const [savingBooking, setSavingBooking] = useState(false)

    function openBookingSheet() {
        setBookingTarget('club')
        setBookingDirection('out')
        setBookingAmount('')
        setBookingNote('')
        setBookingDate(todayDateInput())
        setBookingAsExpense(false)
        setBookingTrip(null)
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
                    trip_id: bookingTrip ?? undefined,
                })
                refetchExpenses()
            } else {
                const amount = bookingDirection === 'in' ? abs : -abs
                const asExpense = bookingAsExpense && bookingDirection === 'in'
                await api.createMemberPayment({
                    regular_member_id: bookingTarget,
                    amount,
                    note: bookingNote || undefined,
                    date: bookingDate || undefined,
                    as_club_expense: asExpense || undefined,
                    trip_id: asExpense && bookingTrip != null ? bookingTrip : undefined,
                })
                if (asExpense) refetchExpenses()
                refetchBalances()
                refetchGuestBalances()
                qc.invalidateQueries({queryKey: ['member-payments', bookingTarget]})
                qc.invalidateQueries({queryKey: ['all-payments']})
            }
            if (bookingTrip != null) {
                qc.invalidateQueries({queryKey: ['committee-trips']})
                qc.invalidateQueries({queryKey: ['trip-expenses']})
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
    const totalPaidMembers = balances.reduce((s, b) => s + cashPaidIn(b), 0)
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
        {id: 'charts', label: t('treasury.tab.charts')},
        {id: 'accounts', label: t('treasury.tab.accounts') + (pendingRequestCount > 0 ? ` (${pendingRequestCount})` : '')},
        {id: 'bookings', label: t('treasury.tab.bookings')},
        {id: 'audit', label: t('treasury.tab.audit')},
    ] as const

    // Statement (payments + penalties per evening) for an expanded account.
    const renderStatement = (memberId: number, memberName: string) => (
        <>
        {accountStatement.length === 0
            ?
            <p className="text-xs text-muted mb-2">{t('treasury.payment.noHistory')}</p>
            : accountStatement.map(entry => entry.kind === 'evening' ? (
                <div key={entry.key} className="flex items-center gap-2 mb-1.5 text-xs"
                     data-testid="statement-evening">
                    <span className="font-bold flex-shrink-0 w-20 text-danger-fg">
                        {fe(-entry.total)}
                    </span>
                    <span className="text-muted truncate flex-1">
                        {entry.absenceOnly ? '🚪' : '🎳'} {entry.absenceOnly ? t('treasury.statement.absence') : t('treasury.statement.evening')}
                        {' · '}{entry.count === 1 ? t('treasury.statement.penaltyCountOne') : t('treasury.statement.penaltyCount').replace('{n}', String(entry.count))}
                    </span>
                    <span className="text-muted flex-shrink-0">{fDate(entry.date)}</span>
                </div>
            ) : (() => { const p = entry.payment; return (
                <div key={entry.key} className="flex items-center gap-2 mb-1.5 text-xs">
                    <span
                        className={`font-bold flex-shrink-0 w-20 ${p.amount >= 0 ? 'text-positive-fg' : 'text-danger-fg'}`}>
                        {p.amount >= 0 ? '+' : ''}{fe(p.amount)}
                    </span>
                    <span
                        className="text-muted truncate flex-1">{p.note ?? (p.amount >= 0 ? t('treasury.payment.deposit') : t('treasury.payment.withdrawal'))}</span>
                    <span
                        className="text-muted flex-shrink-0">{p.updated_at && <span role="img" aria-label={t('treasury.booking.edited')}>✏️ </span>}{fDate(p.date ?? p.created_at)}</span>
                    {admin && (

                        <CardActionMenu title={t('treasury.booking.edit')} actions={[

                            {icon: '✏️', label: t('action.edit'), onClick: () => openEditPayment(p, memberId, memberName)},

                            {icon: '🗑️', label: t('action.delete'), danger: true, onClick: () => setConfirmDeletePayment({id: p.id, memberId: memberId})},

                        ]}/>

                    )}
                </div>
            )})())
        }
        </>
    )

    const isClubBooking = bookingTarget === 'club'
    const showAsExpense = !isClubBooking && bookingDirection === 'in'
    const bookingValid = parseAmount(bookingAmount) > 0
        && (isClubBooking || (showAsExpense && bookingAsExpense) ? bookingNote.trim().length > 0 : true)
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
            <Tabs items={TABS} value={tab} onChange={setTab} className="mb-4"/>

            {/* ── Übersicht ── */}
            {tab === 'overview' && (
                <div>
                    {/* Mein Konto — own status first: what did I pay, what is still open? */}
                    {myBalanceEntry && (
                        <div className="kce-card p-4 mb-3">
                            <Caption className="mb-1">
                                👤 {t('treasury.my.title')}
                            </Caption>
                            <div className="flex items-end justify-between gap-3">
                                <div>
                                    {myBalanceEntry.balance < -0.01 ? (
                                        <>
                                            <div className="font-display font-bold text-2xl text-danger-fg">{fe(Math.abs(myBalanceEntry.balance))}</div>
                                            <div className="text-sm text-danger-fg font-bold">{t('treasury.my.owe')}</div>
                                        </>
                                    ) : myBalanceEntry.balance > 0.01 ? (
                                        <>
                                            <div className="font-display font-bold text-2xl text-positive-fg">+{fe(myBalanceEntry.balance)}</div>
                                            <div className="text-sm text-positive-fg font-bold">{t('treasury.my.credit')}</div>
                                            <div className="text-xs text-muted">{t('treasury.my.creditHint')}</div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="font-display font-bold text-2xl text-positive-fg">✓ {t('treasury.my.settled')}</div>
                                            <div className="text-xs text-muted">{t('treasury.my.settledHint')}</div>
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
                                    <div className="text-xs text-muted mt-1">
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
                                                <Button variant="secondary" size="sm" className="flex-1"
                                                        onClick={() => { setReportingMyPayment(true); setMyPaymentAmount('') }}>
                                                    {t('profile.reportPayment')}
                                                </Button>
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
                                                    <Button variant="secondary" size="sm" className="flex-1"
                                                            onClick={() => { setReportingMyPayment(false); setMyPaymentAmount('') }}>
                                                        {t('action.cancel')}
                                                    </Button>
                                                    <Button variant="primary" size="sm" className="flex-1" onClick={async () => {
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
                                                    </Button>
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
                                <Caption className="mb-0.5">💰
                                    {t('treasury.cashOnHand')}
                                </Caption>
                                <CountUp value={kassenstand} format={fe}
                                         className={`font-display font-bold text-3xl block ${kassenstand >= 0 ? 'text-positive-fg' : 'text-danger-fg'}`}/>
                                <div className="text-xs text-muted mt-1">{t('treasury.cashOnHandHint')}</div>
                            </div>
                            <span className="text-4xl opacity-20">💰</span>
                        </div>
                        <div className="mt-3 pt-2 border-t border-line flex flex-col gap-1 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-muted">⬆ {t('treasury.flow.paidIn')}</span>
                                <span className="font-bold text-positive-fg" data-testid="glance-amount-paidIn">+<CountUp value={summary.paidIn} format={fe}/></span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted">⬇ {t('treasury.flow.expenses')}</span>
                                <span className="font-bold text-danger-fg" data-testid="glance-amount-expenses">-<CountUp value={summary.expensesGross} format={fe}/></span>
                            </div>
                            {summary.otherIncome > 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-muted">⬆ {t('treasury.flow.otherIncome')}</span>
                                    <span className="font-bold text-positive-fg" data-testid="glance-amount-otherIncome">+<CountUp value={summary.otherIncome} format={fe}/></span>
                                </div>
                            )}
                            {summary.outstanding > 0 && (
                                <>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted">🔴 {t('treasury.flow.outstanding')}</span>
                                        <span className="font-bold text-danger-fg" data-testid="glance-amount-outstanding"><CountUp value={summary.outstanding} format={fe}/></span>
                                    </div>
                                    <div className="flex items-center justify-between pt-1 border-t border-line">
                                        <span className="text-muted">→ {t('treasury.flow.projected')}</span>
                                        <span className="font-bold" style={{color: 'var(--ink)'}}><CountUp value={projectedCash} format={fe}/></span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Wer schuldet noch? — the two tiles head one answer; the lists below spell it out. */}
                    <div className="sec-heading">{t('treasury.whoOwes')}</div>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="kce-card p-4 flex flex-col gap-1">
                            <span className="text-xs text-muted">{t('treasury.openLabel')}</span>
                            <span className="font-display font-bold text-danger-fg text-xl">{fe(totalOutstanding)}</span>
                            <span
                                className="text-xs text-muted">{debtors.length} {t('treasury.membersCount')}</span>
                        </div>
                        <div className="kce-card p-4 flex flex-col gap-1">
                            <span className="text-xs text-muted">{t('treasury.creditLabel')}</span>
                            <span className="font-display font-bold text-positive-fg text-xl">{fe(totalSurplus)}</span>
                            <span
                                className="text-xs text-muted">{credits.length} {t('treasury.membersCount')}</span>
                        </div>
                    </div>

                    {debtors.length === 0 && credits.length === 0
                        ? <div
                            className="kce-card p-4 text-center text-sm font-bold text-positive-fg">{t('treasury.noOutstanding')}</div>
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
                                        className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-surface-2 text-muted transition-all">
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
                                                className="font-bold text-danger-fg text-sm flex-shrink-0">{fe(b.balance)}</span>
                                            {admin && (
                                                <Button variant="primary" size="sm" className="flex-shrink-0"
                                                        onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                                    {t('treasury.payment.settle')}
                                                </Button>
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
                                        className="font-bold text-positive-fg text-sm flex-shrink-0">+{fe(b.balance)}</span>
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
                                              className="px-2 py-1 rounded-full bg-surface-2 border border-line text-sm text-muted flex items-center gap-1">
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
                                        <span className="font-bold text-danger-fg text-sm flex-shrink-0">{fe(b.balance)}</span>
                                        {admin && (
                                            <Button variant="primary" size="sm" className="flex-shrink-0"
                                                    onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                                {t('treasury.payment.settle')}
                                            </Button>
                                        )}
                                    </div>
                                    {admin && (
                                        <div className="border-t border-line px-3 pb-3 pt-2">
                                            <Button variant="secondary" size="sm" block
                                                    onClick={() => openTransferSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                                ↪️ {t('treasury.transfer.button')}
                                            </Button>
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
            {tab === 'charts' && <Suspense fallback={<SkeletonChart height="260px"/>}><TreasuryCharts/></Suspense>}
            {tab === 'audit' && <TreasuryAudit/>}

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
                                    <Button
                                        variant="primary" size="sm" className="flex-shrink-0 text-xs px-2 py-1"
                                        onClick={() => confirmRequest(r.id, r.regular_member_id)}>
                                        {t('paymentRequest.confirm')}
                                    </Button>
                                    <Button
                                        variant="secondary" size="sm" className="flex-shrink-0 text-xs px-2 py-1"
                                        onClick={() => rejectRequest(r.id)}>
                                        {t('paymentRequest.reject')}
                                    </Button>
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
                                <span className="font-display font-bold text-danger-fg text-xl">{fe(totalOutstanding)}</span>
                                <span className="text-xs text-muted">{debtors.length} {t('treasury.membersCount')}</span>
                            </div>
                            <div className="kce-card p-4 flex flex-col gap-1">
                                <span className="text-xs text-muted">{t('treasury.accounts.totalPaid')}</span>
                                <span className="font-display font-bold text-positive-fg text-xl">{fe(totalPaidMembers)}</span>
                                {totalSurplus > 0
                                    ? <span className="text-xs text-muted">{t('treasury.accounts.creditOwed')}: {fe(totalSurplus)}</span>
                                    : <span className="text-xs text-muted">{credits.length} {t('treasury.membersCount')}</span>
                                }
                            </div>
                        </div>
                    )}

                    {/* Anteil pro Spieler — bezahlter (grün) vs. offener (rot) Anteil der Strafen, skaliert auf das größte Konto */}
                    {balances.length > 0 && (
                        <ExpandableCard className="mb-3"
                                        title={<span className="text-xs font-bold text-muted">📊 {t('treasury.accounts.shareChart')}</span>}>
                                <div>
                                    <div className="flex items-center justify-end gap-3 text-xs text-muted mb-2">
                                        <span className="flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{background: 'var(--positive-fg)'}}/>
                                            {t('treasury.paidLabel')}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{background: 'var(--danger-fg)'}}/>
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
                                                        {paidPct > 0 && <div className="h-full rounded-full" style={{width: `${paidPct}%`, background: 'var(--positive-fg)'}}/>}
                                                        {openPct > 0 && <div className="h-full rounded-full" style={{width: `${openPct}%`, background: 'var(--danger-fg)'}}/>}
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
                        ? <SkeletonRows rows={5}/>
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
                                ? 'linear-gradient(135deg,var(--danger),color-mix(in srgb, var(--danger) 70%, black))'
                                : hasCredit
                                    ? 'linear-gradient(135deg,var(--positive),color-mix(in srgb, var(--positive) 70%, black))'
                                    : 'linear-gradient(135deg,var(--muted),color-mix(in srgb, var(--muted) 70%, black))'
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
                                                <div className="font-bold text-sm text-danger-fg">{fe(b.balance)}</div>
                                            )}
                                            {hasCredit && (
                                                <div className="font-bold text-sm text-positive-fg">+{fe(b.balance)}</div>
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
                                            {renderStatement(b.regular_member_id, b.nickname || b.name)}
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
                                                                <Button variant="secondary" size="sm" className="flex-1"
                                                                        onClick={() => { setReportingMyPayment(true); setMyPaymentAmount('') }}>
                                                                    {t('profile.reportPayment')}
                                                                </Button>
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
                                                                    <Button variant="secondary" size="sm" className="flex-1"
                                                                            onClick={() => { setReportingMyPayment(false); setMyPaymentAmount('') }}>
                                                                        {t('action.cancel')}
                                                                    </Button>
                                                                    <Button variant="primary" size="sm" className="flex-1" onClick={async () => {
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
                                                                    </Button>
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
                                                        <Button variant="primary" size="sm" className="flex-1"
                                                                onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                                            💸 {t('treasury.payment.settle')}
                                                        </Button>
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
                                const isExpanded = expandedMember === b.regular_member_id
                                return (
                                    <div key={b.regular_member_id} className="kce-card mb-2 overflow-hidden">
                                        <div className="p-3 flex items-center gap-3">
                                            <button type="button" className="flex-1 min-w-0 flex items-center gap-3 text-left"
                                                    aria-expanded={isExpanded}
                                                    onClick={() => setExpandedMember(isExpanded ? null : b.regular_member_id)}>
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-on-accent text-xs flex-shrink-0"
                                                     style={{background: hasDebt ? 'linear-gradient(135deg,var(--danger),color-mix(in srgb, var(--danger) 70%, black))' : 'linear-gradient(135deg,var(--muted),color-mix(in srgb, var(--muted) 70%, black))'}}>
                                                    {b.name[0].toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold truncate flex items-center gap-1">
                                                        {b.nickname || b.name}
                                                        <span className="text-xs text-muted font-bold border border-line rounded px-1">{t('player.guestLabel')}</span>
                                                    </div>
                                                    <div className="text-xs text-muted">
                                                        {t('treasury.penaltiesLabel')}: {fe(b.penalty_total)} · {t('treasury.paidLabel')}: {fe(b.payments_total)}
                                                    </div>
                                                    <PaidShareBar b={b}/>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    {hasDebt
                                                        ? <div className="font-bold text-sm text-danger-fg">{fe(b.balance)}</div>
                                                        : <div className="text-sm text-muted">✓</div>
                                                    }
                                                </div>
                                            </button>
                                            {admin && hasDebt && (
                                                <Button variant="primary" size="sm" className="flex-shrink-0"
                                                        onClick={() => openPaymentSheet(b.regular_member_id, b.nickname || b.name, Math.abs(b.balance))}>
                                                    {t('treasury.payment.settle')}
                                                </Button>
                                            )}
                                        </div>
                                        {isExpanded && (
                                            <div className="border-t border-line px-3 pb-3 pt-2">
                                                <div className="text-xs font-bold text-muted mb-2">{t('treasury.payment.history')}</div>
                                                {renderStatement(b.regular_member_id, b.nickname || b.name)}
                                            </div>
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
                            <div className={`font-bold text-sm ${-totalExpenses >= 0 ? 'text-positive-fg' : 'text-danger-fg'}`}>{fe(-totalExpenses)}</div>
                        </div>
                        {admin && (
                            <Button variant="primary" size="sm" onClick={openBookingSheet}>
                                + {t('treasury.booking.add')}
                            </Button>
                        )}
                    </div>

                    {filteredBookings.length === 0
                        ? <Empty icon="📋" text={t('treasury.payment.noHistory')}/>
                        : filteredBookings.map((entry, idx) => {
                            if (entry.kind === 'payment') {
                                const p = entry.data
                                return (
                                    <div key={`p-${p.id}`} className="kce-card p-3 mb-2 flex items-center gap-3">
                                        <span className={`text-xl flex-shrink-0 ${p.is_writeoff ? 'text-muted' : p.amount >= 0 ? 'text-positive-fg' : 'text-danger-fg'}`}>
                                            {p.is_writeoff ? '🧾' : p.amount >= 0 ? '⬆' : '⬇'}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                                {p.member_name}
                                                {p.regular_member_id === myRegularMemberId && <MeBadge/>}
                                            </div>
                                            <div className="text-xs text-muted truncate">
                                                {p.is_writeoff && <>{t('treasury.payment.writeoff')}{p.note ? ' · ' : ''}</>}
                                                {p.note ?? (p.is_writeoff ? '' : p.amount >= 0 ? t('treasury.payment.deposit') : t('treasury.payment.withdrawal'))}
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className={`font-bold text-sm ${p.amount >= 0 ? 'text-positive-fg' : 'text-danger-fg'}`}>
                                                {p.amount >= 0 ? '+' : ''}{fe(p.amount)}
                                            </div>
                                            <div className="text-xs text-muted">{p.updated_at && <span role="img" aria-label={t('treasury.booking.edited')}>✏️ </span>}{fDate(p.date ?? p.created_at)}</div>
                                        </div>
                                        {admin && (

                                            <CardActionMenu title={t('treasury.booking.edit')} actions={[

                                                {icon: '✏️', label: t('action.edit'), onClick: () => openEditPayment(p, p.regular_member_id, p.member_name)},

                                                {icon: '🗑️', label: t('action.delete'), danger: true, onClick: () => setConfirmDeletePayment({id: p.id, memberId: p.regular_member_id})},

                                            ]}/>

                                        )}
                                    </div>
                                )
                            } else {
                                const e = entry.data
                                return (
                                    <div key={`e-${e.id}`} className="kce-card p-3 mb-2 flex items-center gap-3">
                                        <span className={`text-xl flex-shrink-0 ${e.amount < 0 ? 'text-positive-fg' : 'text-danger-fg'}`}>
                                            {e.amount < 0 ? '⬆' : '⬇'}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold truncate flex items-center gap-1.5">
                                                {e.description}
                                                <span className="text-xs text-muted font-bold border border-line rounded px-1">{t('treasury.booking.club')}</span>
                                            </div>
                                            {e.trip_id != null && tripName(e.trip_id) && (
                                                <div className="text-xs text-muted truncate">🚌 {tripName(e.trip_id)}</div>
                                            )}
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className={`font-bold text-sm ${e.amount < 0 ? 'text-positive-fg' : 'text-danger-fg'}`}>
                                                {e.amount < 0 ? '+' : '-'}{fe(Math.abs(e.amount))}
                                            </div>
                                            <div className="text-xs text-muted">{e.updated_at && <span role="img" aria-label={t('treasury.booking.edited')}>✏️ </span>}{fDate(e.date ?? e.created_at)}</div>
                                        </div>
                                        {admin && (

                                            <CardActionMenu title={t('treasury.booking.edit')} actions={[

                                                {icon: '✏️', label: t('action.edit'), onClick: () => openEditExpense(e)},

                                                {icon: '🗑️', label: t('action.delete'), danger: true, onClick: () => setConfirmDeleteExpense(e.id)},

                                            ]}/>

                                        )}
                                    </div>
                                )
                            }
                        })
                    }
                </div>
            )}

            {/* Confirm payment deletion */}
            <ConfirmSheet open={!!confirmDeletePayment} onClose={() => {setConfirmDeletePayment(null); setDeletePaymentReason('')}}
                          title={t('treasury.payment.deleteConfirm')} message={t('treasury.payment.deleteConfirmHint')}
                          confirmLabel={t('action.delete')} withCancel busy={deletingPaymentId !== null}
                          onConfirm={() => confirmDeletePayment && deletePayment(confirmDeletePayment.id, confirmDeletePayment.memberId, deletePaymentReason)}>
                <input className="kce-input" value={deletePaymentReason}
                       onChange={e => setDeletePaymentReason(e.target.value)}
                       placeholder={t('treasury.payment.deleteReasonPlaceholder')} />
            </ConfirmSheet>

            {/* Confirm expense deletion */}
            <ConfirmSheet open={!!confirmDeleteExpense} onClose={() => {setConfirmDeleteExpense(null); setDeleteExpenseReason('')}}
                          title={t('treasury.expense.deleteConfirm')} message={t('treasury.expense.deleteConfirmHint')}
                          confirmLabel={t('action.delete')} withCancel busy={deletingExpenseId !== null}
                          onConfirm={() => confirmDeleteExpense !== null && deleteExpense(confirmDeleteExpense, deleteExpenseReason)}>
                <input className="kce-input" value={deleteExpenseReason}
                       onChange={e => setDeleteExpenseReason(e.target.value)}
                       placeholder={t('treasury.expense.deleteReasonPlaceholder')} />
            </ConfirmSheet>

            {/* Edit booking sheet */}
            <Sheet open={!!editTarget} onClose={() => setEditTarget(null)}
                   title={`✏️ ${t('treasury.booking.edit')}`} onSubmit={submitEdit}>
                <div className="flex flex-col gap-3">
                    {editTarget?.kind === 'payment' && (
                        <div><label className="field-label">{t('treasury.booking.for')}: <span className="font-bold text-ink">{editTarget.label}</span></label></div>
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
                    <Field label={t('treasury.payment.amount')}>
                        <div className="flex items-center gap-2">
                            <span className="text-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={editAmount} onChange={e => setEditAmount(e.target.value)}
                                   placeholder="0,00" autoFocus/>
                        </div>
                    </Field>

                    {/* Note / description */}
                    <Field label={editTarget?.kind === 'expense' ? t('treasury.expense.description') : t('treasury.payment.note')}>
                        <input className="kce-input" value={editNote}
                               onChange={e => setEditNote(e.target.value)}
                               placeholder={editTarget?.kind === 'expense' ? t('treasury.expense.descPlaceholder') : t('treasury.payment.notePlaceholder')}/>
                    </Field>

                    {/* Date override */}
                    <Field label={t('treasury.expense.date')}>
                        <input type="date" className="kce-input" value={editDate}
                               onChange={e => setEditDate(e.target.value)}/>
                    </Field>

                    {editTarget?.kind === 'expense' && (
                        <TripPicker trips={trips as ClubTrip[]} value={editTrip} onChange={setEditTrip}/>
                    )}

                    <Button type="submit" variant="primary" block
                            disabled={savingEdit || !editValid}>
                        ✓ {t('action.save')}
                    </Button>
                </div>
            </Sheet>

            {/* Guest cost transfer sheet */}
            <Sheet open={!!transferGuest} onClose={() => setTransferGuest(null)}
                   title={`↪️ ${t('treasury.transfer.title')}`} onSubmit={submitTransfer}>
                <div className="flex flex-col gap-3">
                    <p className="text-xs text-muted">
                        {t('treasury.transfer.hint')}
                    </p>
                    <div><label className="field-label">{t('treasury.transfer.fromGuest')}: <span className="font-bold text-ink">{transferGuest?.name ?? ''}</span></label></div>
                    <Field label={t('treasury.transfer.target')}>
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
                    </Field>
                    <Field label={t('treasury.payment.amount')}>
                        <div className="flex items-center gap-2">
                            <span className="text-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={transferAmount} onChange={e => setTransferAmount(e.target.value)}
                                   placeholder="0,00"/>
                        </div>
                    </Field>
                    <Field label={t('treasury.payment.note')}>
                        <input className="kce-input" value={transferNote}
                               onChange={e => setTransferNote(e.target.value)}
                               placeholder={t('treasury.transfer.notePlaceholder')}/>
                    </Field>
                    <Button type="submit" variant="primary" block
                            disabled={transferring || !transferTargetId || parseAmount(transferAmount) <= 0}>
                        ✓ {t('treasury.transfer.submit')}
                    </Button>
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
                    <Field label={t('treasury.payment.amount')}>
                        <div className="flex items-center gap-2">
                            <span
                                className="text-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                                   placeholder="0,00" autoFocus/>
                        </div>
                    </Field>
                    <Field label={t('treasury.payment.note')}>
                        <input className="kce-input" value={paymentNote}
                               onChange={e => setPaymentNote(e.target.value)}
                               placeholder={t('treasury.payment.notePlaceholder')}/>
                    </Field>
                    <Button type="submit" variant="primary" block
                            disabled={saving || !paymentAmount || parseAmount(paymentAmount) <= 0}>
                        ✓ {t('treasury.payment.record')}
                    </Button>
                </div>
            </Sheet>

            {/* New booking sheet */}
            <Sheet open={bookingSheet} onClose={() => setBookingSheet(false)}
                   title={`📋 ${t('treasury.booking.add')}`} onSubmit={submitBooking}>
                <div className="flex flex-col gap-3">
                    {/* Target: Club or member */}
                    <Field label={t('treasury.booking.for')}>
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
                    </Field>

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
                    <Field label={t('treasury.payment.amount')}>
                        <div className="flex items-center gap-2">
                            <span className="text-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                            <input className="kce-input flex-1" type="text" inputMode="decimal"
                                   value={bookingAmount} onChange={e => setBookingAmount(e.target.value)}
                                   placeholder="0,00" autoFocus/>
                        </div>
                    </Field>

                    {/* Note / description */}
                    <Field label={isClubBooking ? t('treasury.expense.description') : t('treasury.payment.note')}>
                        <input className="kce-input" value={bookingNote}
                               onChange={e => setBookingNote(e.target.value)}
                               placeholder={isClubBooking ? t('treasury.expense.descPlaceholder') : t('treasury.payment.notePlaceholder')}/>
                    </Field>

                    {/* Member paid a club cost out of pocket → also book a linked club expense */}
                    {showAsExpense && (
                        <label className="flex items-start gap-2 text-sm cursor-pointer">
                            <input type="checkbox" className="mt-1" checked={bookingAsExpense}
                                   onChange={e => setBookingAsExpense(e.target.checked)}/>
                            <span>
                                <span className="font-bold">{t('treasury.booking.asExpense')}</span>
                                <span className="block text-xs text-muted">{t('treasury.booking.asExpenseHint')}</span>
                            </span>
                        </label>
                    )}

                    {(isClubBooking || (showAsExpense && bookingAsExpense)) && (
                        <TripPicker trips={trips as ClubTrip[]} value={bookingTrip} onChange={setBookingTrip}/>
                    )}

                    {/* Date override */}
                    <Field label={t('treasury.expense.date')}>
                        <input type="date" className="kce-input" value={bookingDate}
                               onChange={e => setBookingDate(e.target.value)}/>
                    </Field>

                    <Button type="submit" variant="primary" block
                            disabled={savingBooking || !bookingValid}>
                        ✓ {t('action.save')}
                    </Button>
                </div>
            </Sheet>

            {/* Export sheet — admin only */}
            <Sheet open={showExportSheet} onClose={() => setShowExportSheet(false)}
                   title={t('report.export')} onSubmit={downloadReport}>
                <div className="flex flex-col gap-3">
                    <Field label={t('report.year')}>
                        <select
                            value={exportYear ?? ''}
                            onChange={e => setExportYear(e.target.value ? parseInt(e.target.value, 10) : null)}
                            className="kce-input">
                            <option value="">{t('report.yearAll')}</option>
                            {exportYears.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label={t('report.format')}>
                        <select
                            value={exportFormat}
                            onChange={e => setExportFormat(e.target.value as 'xlsx' | 'pdf')}
                            className="kce-input">
                            <option value="xlsx">Excel</option>
                            <option value="pdf">PDF</option>
                        </select>
                    </Field>
                    <Button type="submit" variant="primary" block disabled={exporting}>
                        {exporting ? t('report.downloading') : t('report.download')}
                    </Button>
                </div>
            </Sheet>

        </div>
    )
}
