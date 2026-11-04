/**
 * Account statement ("Kontoauszug") for one member: every amount that hit the account, newest
 * first — payments individually, penalties folded into one line per Kegelabend.
 *
 * Penalty amounts come from `GET /club/member-penalties/{mid}`, whose `amount` is already the
 * penalty's marginal contribution to the balance (guest cap applied, guest absences excluded), so
 * the per-evening sums add up to the account's `penalty_total`.
 */

export interface StatementPayment {
    id: number
    amount: number
    note: string | null
    created_at: string | null
    updated_at: string | null
    date: string | null
}

export interface StatementPenalty {
    amount: number
    evening_id: number
    evening_date: string | null
    is_absence: boolean
    created_at: string | null
}

export type StatementEntry<P extends StatementPayment = StatementPayment> =
    | {kind: 'payment'; key: string; date: string | null; payment: P}
    | {
        kind: 'evening'
        key: string
        eveningId: number
        date: string | null
        /** Sum of the evening's penalties as a positive € amount (debits the account). */
        total: number
        count: number
        /** Every penalty of this evening is an absence penalty (member wasn't there). */
        absenceOnly: boolean
    }

function ts(iso: string | null): number {
    if (!iso) return 0
    const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00` : iso)
    return Number.isNaN(t) ? 0 : t
}

export function buildAccountStatement<P extends StatementPayment>(
    payments: P[],
    penalties: StatementPenalty[],
): StatementEntry<P>[] {
    const evenings = new Map<number, Extract<StatementEntry<P>, {kind: 'evening'}>>()
    for (const p of penalties) {
        const e = evenings.get(p.evening_id)
        if (e) {
            e.total += p.amount
            e.count += 1
            e.absenceOnly = e.absenceOnly && p.is_absence
            if (!e.date) e.date = p.evening_date ?? p.created_at
        } else {
            evenings.set(p.evening_id, {
                kind: 'evening',
                key: `e-${p.evening_id}`,
                eveningId: p.evening_id,
                date: p.evening_date ?? p.created_at,
                total: p.amount,
                count: 1,
                absenceOnly: p.is_absence,
            })
        }
    }
    const entries: StatementEntry<P>[] = [
        ...payments.map(p => ({kind: 'payment' as const, key: `p-${p.id}`, date: p.date ?? p.created_at, payment: p})),
        ...[...evenings.values()]
            // A guest's capped evening can contribute 0 € — nothing hit the account.
            .filter(e => Math.abs(e.total) >= 0.005)
            .map(e => ({...e, total: Math.round(e.total * 100) / 100})),
    ]
    return entries.sort((a, b) => ts(b.date) - ts(a.date))
}
