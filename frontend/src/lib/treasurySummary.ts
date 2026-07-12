// Pure derivation of the treasury money flow shown on the Kasse overview.
// Balances come from GET /club/member-balances and /club/guest-balances,
// expenses from GET /club/expenses (positive amount = expense, negative = income).

export interface BalanceLike {
    balance: number
    payments_total: number
    penalty_total: number
}

export interface ExpenseLike {
    amount: number
}

export interface TreasurySummary {
    /** Everything ever paid in by members and guests (real money received). */
    paidIn: number
    /** Net club expenses: expenses minus extra income. Positive = money left the till. */
    expensesNet: number
    /** Real money currently in the till: paidIn − expensesNet. */
    cashOnHand: number
    /** Debts still owed to the till (members + guests with negative balance). */
    outstanding: number
    /** Number of member/guest accounts with outstanding debt. */
    outstandingCount: number
    /** Prepaid credit held by members (positive balances). */
    credit: number
    /** Number of member accounts holding credit. */
    creditCount: number
    /** What the till would hold if every open debt were paid: cashOnHand + outstanding. */
    projectedCash: number
}

const DEBT_EPS = -0.01
const CREDIT_EPS = 0.01

export function treasurySummary(
    memberBalances: BalanceLike[],
    guestBalances: BalanceLike[],
    expenses: ExpenseLike[],
): TreasurySummary {
    const all = [...memberBalances, ...guestBalances]
    const paidIn = all.reduce((s, b) => s + b.payments_total, 0)
    const expensesNet = expenses.reduce((s, e) => s + e.amount, 0)
    const cashOnHand = paidIn - expensesNet

    const debtors = all.filter(b => b.balance < DEBT_EPS)
    const outstanding = debtors.reduce((s, b) => s + Math.abs(b.balance), 0)

    const creditors = memberBalances.filter(b => b.balance > CREDIT_EPS)
    const credit = creditors.reduce((s, b) => s + b.balance, 0)

    return {
        paidIn: round2(paidIn),
        expensesNet: round2(expensesNet),
        cashOnHand: round2(cashOnHand),
        outstanding: round2(outstanding),
        outstandingCount: debtors.length,
        credit: round2(credit),
        creditCount: creditors.length,
        projectedCash: round2(cashOnHand + outstanding),
    }
}

/**
 * Share of a member's accrued penalties already covered by payments, clamped
 * to 0…1 for use as a progress-bar width. `null` when the member has no
 * penalties (nothing to visualize).
 */
export function paidShare(b: Pick<BalanceLike, 'payments_total' | 'penalty_total'>): number | null {
    if (b.penalty_total <= 0) return null
    return Math.min(1, Math.max(0, b.payments_total / b.penalty_total))
}

function round2(v: number) {
    return Math.round(v * 100) / 100
}
