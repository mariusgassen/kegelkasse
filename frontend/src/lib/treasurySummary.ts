// Pure derivation of the treasury money flow shown on the Kasse overview.
// Balances come from GET /club/member-balances and /club/guest-balances,
// expenses from GET /club/expenses (positive amount = expense, negative = income).

export interface BalanceLike {
    balance: number
    payments_total: number
    penalty_total: number
}

export interface IdentifiedBalanceLike extends BalanceLike {
    regular_member_id: number
}

export interface ExpenseLike {
    amount: number
}

export interface TreasurySummary {
    /** Everything ever paid in by members and guests (real money received). */
    paidIn: number
    /** Sum of positive club-expense entries: real money that left the till. */
    expensesGross: number
    /** Sum of negative club-expense entries (as a positive number): extra income booked via the expenses ledger (sponsoring, grants, …). */
    otherIncome: number
    /** Net club expenses: expensesGross minus otherIncome. Positive = money left the till. */
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
    const expensesGross = expenses.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0)
    const otherIncome = expenses.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0)
    const expensesNet = expensesGross - otherIncome
    const cashOnHand = paidIn - expensesNet

    const debtors = all.filter(b => b.balance < DEBT_EPS)
    const outstanding = debtors.reduce((s, b) => s + Math.abs(b.balance), 0)

    const creditors = memberBalances.filter(b => b.balance > CREDIT_EPS)
    const credit = creditors.reduce((s, b) => s + b.balance, 0)

    return {
        paidIn: round2(paidIn),
        expensesGross: round2(expensesGross),
        otherIncome: round2(otherIncome),
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

/**
 * Excludes a set of members from future debt collection: any outstanding
 * debt (balance < 0) of a selected member is dropped to 0 (written off),
 * while credit balances and payments_total are left untouched — that money
 * already moved and stays real regardless of whether it's later collected.
 *
 * Feeds the "exclude selected members" mode of the treasury balance filter:
 * run the result through `treasurySummary()` (or sum balances directly) to
 * see totals with the selected members' open debt no longer counted.
 */
export function writeOffOutstandingDebt<T extends IdentifiedBalanceLike>(
    balances: T[],
    ids: ReadonlySet<number> | number[],
): T[] {
    const idSet = ids instanceof Set ? ids : new Set(ids)
    if (idSet.size === 0) return balances
    return balances.map(b => (idSet.has(b.regular_member_id) && b.balance < 0) ? {...b, balance: 0} : b)
}

/**
 * Zeroes the already-paid contribution (`payments_total`) of the selected
 * members, simulating a refund: the money they paid in is treated as no longer
 * in the till. Fed into `treasurySummary()`, this lowers `paidIn`/`cashOnHand`
 * (and drops the members from the paid-in breakdown) by exactly that amount.
 * `balance` is left untouched — who owes/holds credit is a separate axis handled
 * by `writeOffOutstandingDebt`, so the two options compose without double counting.
 */
export function refundPaidIn<T extends IdentifiedBalanceLike>(
    balances: T[],
    ids: ReadonlySet<number> | number[],
): T[] {
    const idSet = ids instanceof Set ? ids : new Set(ids)
    if (idSet.size === 0) return balances
    return balances.map(b => idSet.has(b.regular_member_id) ? {...b, payments_total: 0} : b)
}

/**
 * The net share the selected members would settle if they left the club: each
 * member holds an equal 1/n stake in the club's "other income" (grants,
 * sponsoring — money not paid in by members themselves) but also bears an equal
 * 1/n share of what the club has spent (gross expenses). Per member the claim is
 * `(otherIncome − expensesGross) / n`; summed over the selected members.
 *
 * Positive = the till pays them out on exit (cash on hand drops by this amount);
 * negative = their share of spending exceeds their share of income, so settling
 * it up raises the till. `n` is the total number of member accounts. Returns 0
 * when there are no members (guards division by zero).
 */
export function shareSettlement(
    otherIncome: number,
    expensesGross: number,
    memberCount: number,
    selectedCount: number,
): number {
    if (memberCount <= 0 || selectedCount <= 0) return 0
    return round2((selectedCount * (otherIncome - expensesGross)) / memberCount)
}

function round2(v: number) {
    return Math.round(v * 100) / 100
}
