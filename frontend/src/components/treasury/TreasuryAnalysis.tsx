import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {ModeToggle} from '@/components/ui/ModeToggle.tsx'
import {BalanceHistoryChart} from '@/components/treasury/BalanceHistoryChart.tsx'
import {
    clubEventsFromBookings,
    debtEventsFromTimeline,
    memberPaymentEvents,
    memberPenaltyEvents,
} from '@/lib/balanceHistory.ts'
import {refundPaidIn, shareSettlement, treasurySummary, writeOffOutstandingDebt} from '@/lib/treasurySummary.ts'
import {MeBadge} from '@/components/ui/MemberBadges.tsx'

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

// One clickable row in the money-flow breakdown. Tapping it expands the
// underlying bookings that make up the row's total, so e.g. "965,20 €" isn't
// just a number to take on faith.
type FlowItem = { id?: number | null; label: string; amount: number; date?: string | null }

function FlowRow({icon, label, amountLabel, colorClass, open, onToggle, items, myId, noEntriesLabel, testId}: {
    icon: string
    label: string
    amountLabel: string
    colorClass: string
    open: boolean
    onToggle: () => void
    items: FlowItem[]
    myId?: number | null
    noEntriesLabel: string
    testId?: string
}) {
    return (
        <div>
            <button type="button" className="flex items-center justify-between w-full text-left" onClick={onToggle}>
                <span className="text-muted">{icon} {label}</span>
                <span className={`font-bold ${colorClass}`} data-testid={testId}>{amountLabel}</span>
            </button>
            {open && (
                items.length === 0
                    ? <div className="pl-4 py-1 text-sm text-muted">{noEntriesLabel}</div>
                    : (
                        <div className="pl-4 pb-1 pt-0.5 flex flex-col gap-0.5">
                            {items.map((it, i) => (
                                <div key={it.id ?? i} className="flex items-center justify-between text-sm text-muted gap-2">
                                    <span className="truncate flex items-center gap-1 min-w-0">
                                        <span className="truncate">{it.label}</span>
                                        {myId != null && it.id === myId &&
                                            <MeBadge/>}
                                        {it.date && <span className="opacity-60 flex-shrink-0">· {fDate(it.date)}</span>}
                                    </span>
                                    <span className="flex-shrink-0">{fe(it.amount)}</span>
                                </div>
                            ))}
                        </div>
                    )
            )}
        </div>
    )
}

/**
 * Analyse tab — the drill-in level of the Kasse.
 *
 * The Übersicht answers "what do I owe / who still owes / what's in the till" on raw club
 * figures. Everything that interprets those figures lives here: the player filter with its
 * leaving-member simulation (an admin power tool that must not silently rescope what members
 * read on the Übersicht), the itemized money-flow breakdown, and the balance-history graph.
 *
 * Queries use the same keys as TreasuryPage, so react-query serves them from cache instead of
 * refetching when the tab is opened.
 */
export function TreasuryAnalysis() {
    const t = useT()
    const user = useAppStore(s => s.user)
    const myRegularMemberId = user?.regular_member_id

    const [flowDetail, setFlowDetail] = useState<'paidIn' | 'expenses' | 'otherIncome' | 'outstanding' | null>(null)
    const [balanceFilterIds, setBalanceFilterIds] = useState<Set<number>>(new Set())
    // View scope: restrict every filtered figure to just the selected members.
    const [balanceOnlySelected, setBalanceOnlySelected] = useState(false)
    // "What if the selected members left" adjustments (independent, only apply when
    // NOT in "only selected" view). Write-off outstanding debt is the historical default.
    const [balanceWriteOffDebt, setBalanceWriteOffDebt] = useState(true)
    const [balanceRefundPaid, setBalanceRefundPaid] = useState(false)
    const [balanceSettleShare, setBalanceSettleShare] = useState(false)

    const clearBalanceFilter = () => {
        setBalanceFilterIds(new Set())
        setBalanceOnlySelected(false)
        setBalanceWriteOffDebt(true)
        setBalanceRefundPaid(false)
        setBalanceSettleShare(false)
    }

    const {data: balances = []} = useQuery({
        queryKey: ['member-balances'],
        queryFn: api.getMemberBalances,
        staleTime: 1000 * 30,
    })
    const {data: guestBalances = []} = useQuery({
        queryKey: ['guest-balances'],
        queryFn: api.getGuestBalances,
        staleTime: 1000 * 30,
    })
    const {data: expenses = []} = useQuery({
        queryKey: ['club-expenses'],
        queryFn: api.getExpenses,
        staleTime: 1000 * 30,
    })
    const {data: allPayments = [], isLoading: allPaymentsLoading} = useQuery({
        queryKey: ['all-payments'],
        queryFn: api.getAllPayments,
        staleTime: 1000 * 30,
    })

    // ── Balance-history graph — Kasse (club) vs Mitglied (individual) scope ──
    const [historyScope, setHistoryScope] = useState<'club' | 'member'>('club')
    const [historyMemberId, setHistoryMemberId] = useState<number | null>(null)
    const allHistoryMembers = [...balances, ...(guestBalances as Balance[])] as Balance[]
    const myHistoryDefault = allHistoryMembers.find(m => m.regular_member_id === myRegularMemberId)
    const effectiveHistoryMemberId = historyMemberId
        ?? myHistoryDefault?.regular_member_id
        ?? allHistoryMembers[0]?.regular_member_id
        ?? null

    const {data: debtTimeline = [], isLoading: debtTimelineLoading} = useQuery({
        queryKey: ['treasury-debt-timeline'],
        queryFn: api.getTreasuryDebtTimeline,
        enabled: historyScope === 'club',
        staleTime: 1000 * 30,
    })
    const {data: historyMemberPayments = [], isLoading: historyPaymentsLoading} = useQuery({
        queryKey: ['member-payments', effectiveHistoryMemberId],
        queryFn: () => effectiveHistoryMemberId ? api.getMemberPayments(effectiveHistoryMemberId) : null,
        enabled: historyScope === 'member' && !!effectiveHistoryMemberId,
        staleTime: 1000 * 30,
    })
    const {data: historyMemberPenalties = [], isLoading: historyPenaltiesLoading} = useQuery({
        queryKey: ['member-penalties', effectiveHistoryMemberId],
        queryFn: () => effectiveHistoryMemberId ? api.getMemberPenalties(effectiveHistoryMemberId) : null,
        enabled: historyScope === 'member' && !!effectiveHistoryMemberId,
        staleTime: 1000 * 30,
    })
    const historyLoading = historyScope === 'club'
        ? (allPaymentsLoading || debtTimelineLoading)
        : (historyPaymentsLoading || historyPenaltiesLoading)

    // ── Filter application ──
    const balanceFilterActive = balanceFilterIds.size > 0
    // "Only selected" is a plain view restriction; otherwise the selection is treated as members
    // about to leave, and each simulation option adjusts the figures independently.
    let effectiveBalances = balances as Balance[]
    if (balanceFilterActive) {
        if (balanceOnlySelected) {
            effectiveBalances = (balances as Balance[]).filter(b => balanceFilterIds.has(b.regular_member_id))
        } else {
            if (balanceWriteOffDebt) effectiveBalances = writeOffOutstandingDebt(effectiveBalances, balanceFilterIds)
            if (balanceRefundPaid) effectiveBalances = refundPaidIn(effectiveBalances, balanceFilterIds)
        }
    }

    const summary = treasurySummary(effectiveBalances, guestBalances as Balance[], expenses as Expense[])
    // Positive = money the leaving selection would draw out of the till (lowers cash on hand);
    // negative = they'd pay in to settle their share (raises it).
    const shareOut = (balanceFilterActive && !balanceOnlySelected && balanceSettleShare)
        ? shareSettlement(summary.otherIncome, summary.expensesGross, balances.length, balanceFilterIds.size)
        : 0
    const kassenstand = summary.cashOnHand - shareOut
    const projectedCash = summary.projectedCash - shareOut

    // Per-row breakdowns — same source data, just grouped/filtered per row
    // instead of netted into a single figure.
    const allBalancesForFlow = [...effectiveBalances, ...(guestBalances as Balance[])] as Balance[]
    const paidInBreakdown = allBalancesForFlow
        .filter(b => Math.abs(b.payments_total) > 0.001)
        .map(b => ({id: b.regular_member_id, label: b.nickname || b.name, amount: b.payments_total}))
        .sort((a, b) => b.amount - a.amount)
    const expensesBreakdown = (expenses as Expense[])
        .filter(e => e.amount > 0)
        .map(e => ({id: e.id, label: e.description, amount: e.amount, date: e.date ?? e.created_at}))
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    const otherIncomeBreakdown = (expenses as Expense[])
        .filter(e => e.amount < 0)
        .map(e => ({id: e.id, label: e.description, amount: Math.abs(e.amount), date: e.date ?? e.created_at}))
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    const outstandingBreakdown = allBalancesForFlow
        .filter(b => b.balance < -0.01)
        .map(b => ({id: b.regular_member_id, label: b.nickname || b.name, amount: Math.abs(b.balance)}))
        .sort((a, b) => b.amount - a.amount)

    // The Kasse-scope "actual" line honors the filter's "only" mode (guests always pass through,
    // since they're never selectable); the leaving simulation leaves it untouched, since money
    // already received doesn't stop being real. The debt overlay stays whole-club regardless —
    // it's a single club-wide backend timeline, not attributable to individual members.
    const guestIds = new Set((guestBalances as Balance[]).map(b => b.regular_member_id))
    const filteredClubPayments = (balanceFilterActive && balanceOnlySelected)
        ? (allPayments as Payment[]).filter(p => guestIds.has(p.regular_member_id) || balanceFilterIds.has(p.regular_member_id))
        : (allPayments as Payment[])
    const historyActualEvents = historyScope === 'club'
        ? clubEventsFromBookings(filteredClubPayments, expenses as Expense[])
        : memberPaymentEvents(historyMemberPayments as MemberPayment[])
    const historyOverlayEvents = historyScope === 'club'
        ? debtEventsFromTimeline(debtTimeline)
        : memberPenaltyEvents(historyMemberPenalties as any[])

    return (
        <div>
            <p className="text-xs text-muted mb-3">{t('treasury.analysis.intro')}</p>

            {/* ── Nach Spielern filtern — expanded by default: it is the point of this view ── */}
            <div className="kce-card p-3 mb-3" data-testid="balance-filter">
                <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-bold text-muted truncate">
                        🔍 {t('treasury.balanceFilter.title')}
                        {balanceFilterActive && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-accent text-on-accent text-xs font-bold"
                                  data-testid="balance-filter-active">{balanceFilterIds.size}</span>
                        )}
                    </span>
                    {balanceFilterActive && (
                        <button type="button" className="flex-shrink-0 text-xs text-muted underline px-1"
                                data-testid="balance-filter-clear"
                                onClick={clearBalanceFilter}>
                            {t('treasury.balanceFilter.clear')}
                        </button>
                    )}
                </div>
                <div className="text-sm text-muted mb-2">{t('treasury.balanceFilter.hint')}</div>
                <div className="flex gap-2 flex-wrap">
                    {[...(balances as Balance[])].sort((a, b) => {
                        if (a.regular_member_id === myRegularMemberId) return -1
                        if (b.regular_member_id === myRegularMemberId) return 1
                        return 0
                    }).map(m => {
                        const selected = balanceFilterIds.has(m.regular_member_id)
                        const isMe = m.regular_member_id === myRegularMemberId
                        return (
                            <button key={m.regular_member_id} type="button"
                                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${selected ? 'bg-accent text-on-accent border-accent' : 'bg-surface-2 text-muted border-line'}`}
                                    onClick={() => setBalanceFilterIds(prev => {
                                        const next = new Set(prev)
                                        if (next.has(m.regular_member_id)) next.delete(m.regular_member_id)
                                        else next.add(m.regular_member_id)
                                        return next
                                    })}>
                                {m.nickname || m.name}
                                {isMe && <MeBadge inverted={selected} className="ml-1"/>}
                            </button>
                        )
                    })}
                </div>
                {balanceFilterActive && (
                    <div className="flex flex-col gap-2 mt-3 pt-2 border-t border-line" data-testid="balance-filter-options">
                        <label className="flex items-start gap-2 cursor-pointer">
                            <input type="checkbox" className="mt-0.5 flex-shrink-0" checked={balanceOnlySelected}
                                   data-testid="balance-opt-only"
                                   onChange={e => setBalanceOnlySelected(e.target.checked)}/>
                            <span>
                                <span className="text-xs font-bold text-ink">{t('treasury.balanceFilter.onlySelected')}</span>
                                <span className="block text-xs text-muted">{t('treasury.balanceFilter.onlySelectedHint')}</span>
                            </span>
                        </label>
                        {/* Removal-simulation adjustments — only meaningful when NOT scoping to the subset */}
                        <div className={`flex flex-col gap-2 ${balanceOnlySelected ? 'opacity-40 pointer-events-none' : ''}`}
                             aria-disabled={balanceOnlySelected}>
                            <div className="text-xs font-bold text-muted uppercase tracking-wider">{t('treasury.balanceFilter.simHeading')}</div>
                            <label className="flex items-start gap-2 cursor-pointer">
                                <input type="checkbox" className="mt-0.5 flex-shrink-0" checked={balanceWriteOffDebt}
                                       disabled={balanceOnlySelected} data-testid="balance-opt-writeoff"
                                       onChange={e => setBalanceWriteOffDebt(e.target.checked)}/>
                                <span>
                                    <span className="text-xs font-bold text-ink">{t('treasury.balanceFilter.optWriteOff')}</span>
                                    <span className="block text-xs text-muted">{t('treasury.balanceFilter.optWriteOffHint')}</span>
                                </span>
                            </label>
                            <label className="flex items-start gap-2 cursor-pointer">
                                <input type="checkbox" className="mt-0.5 flex-shrink-0" checked={balanceRefundPaid}
                                       disabled={balanceOnlySelected} data-testid="balance-opt-refund"
                                       onChange={e => setBalanceRefundPaid(e.target.checked)}/>
                                <span>
                                    <span className="text-xs font-bold text-ink">{t('treasury.balanceFilter.optRefund')}</span>
                                    <span className="block text-xs text-muted">{t('treasury.balanceFilter.optRefundHint')}</span>
                                </span>
                            </label>
                            <label className="flex items-start gap-2 cursor-pointer">
                                <input type="checkbox" className="mt-0.5 flex-shrink-0" checked={balanceSettleShare}
                                       disabled={balanceOnlySelected} data-testid="balance-opt-share"
                                       onChange={e => setBalanceSettleShare(e.target.checked)}/>
                                <span>
                                    <span className="text-xs font-bold text-ink">{t('treasury.balanceFilter.optShare')}</span>
                                    <span className="block text-xs text-muted">{t('treasury.balanceFilter.optShareHint')}</span>
                                </span>
                            </label>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Geldfluss — itemized, each row expands into the bookings behind it ── */}
            <div className="kce-card p-4 mb-3">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <div className="text-xs font-bold text-muted uppercase tracking-wider mb-0.5">
                            {t('treasury.analysis.flowHeading')}
                        </div>
                        <div className={`font-display font-bold text-2xl ${kassenstand >= 0 ? 'text-positive-fg' : 'text-danger-fg'}`}
                             data-testid="analysis-cash">{fe(kassenstand)}</div>
                    </div>
                    <span className="text-3xl opacity-20">📊</span>
                </div>
                <div className="pt-2 border-t border-line flex flex-col gap-1 text-xs">
                    <FlowRow
                        icon="⬆" label={t('treasury.flow.paidIn')}
                        amountLabel={`+${fe(summary.paidIn)}`} colorClass="text-positive-fg"
                        open={flowDetail === 'paidIn'} onToggle={() => setFlowDetail(flowDetail === 'paidIn' ? null : 'paidIn')}
                        items={paidInBreakdown} myId={myRegularMemberId} noEntriesLabel={t('treasury.flow.noEntries')}
                        testId="flow-amount-paidIn"
                    />
                    <FlowRow
                        icon="⬇" label={t('treasury.flow.expenses')}
                        amountLabel={`-${fe(summary.expensesGross)}`} colorClass="text-orange-400"
                        open={flowDetail === 'expenses'} onToggle={() => setFlowDetail(flowDetail === 'expenses' ? null : 'expenses')}
                        items={expensesBreakdown} noEntriesLabel={t('treasury.flow.noEntries')}
                        testId="flow-amount-expenses"
                    />
                    {summary.otherIncome > 0 && (
                        <FlowRow
                            icon="⬆" label={t('treasury.flow.otherIncome')}
                            amountLabel={`+${fe(summary.otherIncome)}`} colorClass="text-positive-fg"
                            open={flowDetail === 'otherIncome'} onToggle={() => setFlowDetail(flowDetail === 'otherIncome' ? null : 'otherIncome')}
                            items={otherIncomeBreakdown} noEntriesLabel={t('treasury.flow.noEntries')}
                            testId="flow-amount-otherIncome"
                        />
                    )}
                    {Math.abs(shareOut) >= 0.005 && (
                        <div className="flex items-center justify-between">
                            <span className="text-muted">⚖️ {t('treasury.flow.shareSettlement')}</span>
                            <span className={`font-bold ${shareOut > 0 ? 'text-orange-400' : 'text-positive-fg'}`}
                                  data-testid="flow-amount-share">
                                {shareOut > 0 ? `-${fe(shareOut)}` : `+${fe(-shareOut)}`}
                            </span>
                        </div>
                    )}
                    {summary.outstanding > 0 && (
                        <>
                            <FlowRow
                                icon="🔴" label={t('treasury.flow.outstanding')}
                                amountLabel={fe(summary.outstanding)} colorClass="text-danger-fg"
                                open={flowDetail === 'outstanding'} onToggle={() => setFlowDetail(flowDetail === 'outstanding' ? null : 'outstanding')}
                                items={outstandingBreakdown} myId={myRegularMemberId} noEntriesLabel={t('treasury.flow.noEntries')}
                                testId="flow-amount-outstanding"
                            />
                            <div className="flex items-center justify-between pt-1 border-t border-line">
                                <span className="text-muted">→ {t('treasury.flow.projected')}</span>
                                <span className="font-bold" style={{color: 'var(--ink)'}}>{fe(projectedCash)}</span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Saldo-Verlauf ── */}
            <div className="kce-card p-3 mb-3">
                <div className="sec-heading mb-2">{t('treasury.history.heading')}</div>
                <ModeToggle
                    options={[
                        {value: 'club', label: `🏛️ ${t('treasury.history.scopeClub')}`},
                        {value: 'member', label: `👤 ${t('treasury.history.scopeMember')}`},
                    ]}
                    value={historyScope}
                    onChange={v => setHistoryScope(v as 'club' | 'member')}/>
                {historyScope === 'member' && allHistoryMembers.length > 0 && (
                    <div className="flex gap-2 flex-wrap mt-2">
                        {[...allHistoryMembers].sort((a, b) => {
                            if (a.regular_member_id === myRegularMemberId) return -1
                            if (b.regular_member_id === myRegularMemberId) return 1
                            return 0
                        }).map(m => {
                            const isActive = effectiveHistoryMemberId === m.regular_member_id
                            const isMe = m.regular_member_id === myRegularMemberId
                            return (
                                <button key={m.regular_member_id} type="button"
                                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isActive ? 'bg-accent text-on-accent border-accent' : 'bg-surface-2 text-muted border-line'}`}
                                        onClick={() => setHistoryMemberId(m.regular_member_id)}>
                                    {m.nickname || m.name}
                                    {isMe && <MeBadge inverted={isActive} className="ml-1"/>}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            <BalanceHistoryChart
                key={historyScope === 'club' ? 'club' : `member-${effectiveHistoryMemberId}`}
                actualEvents={historyActualEvents}
                overlayEvents={historyOverlayEvents}
                actualLabel={historyScope === 'club' ? t('treasury.history.actual') : t('treasury.history.actualMember')}
                virtualLabel={historyScope === 'club' ? t('treasury.history.virtualClub') : t('treasury.history.virtualMember')}
                overlayLabel={t('treasury.history.penaltiesMember')}
                threeLine={historyScope === 'member'}
                loading={historyLoading}
                t={t}/>
        </div>
    )
}
