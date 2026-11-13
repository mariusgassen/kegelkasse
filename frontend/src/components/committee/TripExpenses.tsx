import {useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {useAppStore} from '@/store/app.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ConfirmSheet} from '@/components/ui/ConfirmSheet.tsx'
import {CardActionMenu} from '@/components/ui/ActionSheet.tsx'
import {ExpandableCard} from '@/components/ui/ExpandableCard.tsx'
import {SkeletonRows} from '@/components/ui/Skeleton'
import {toastError} from '@/utils/error.ts'
import {parseAmount} from '@/utils/parse.ts'
import {todayDateInput} from '@/lib/datetime.ts'
import type {ClubTrip, TripExpenses as TripExpensesData} from '@/types.ts'
import {Button} from '@/components/ui/Button.tsx'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fDate(iso: string | null) {
    if (!iso) return ''
    const [y, m, d] = iso.slice(0, 10).split('-')
    return `${d}.${m}.${y.slice(2)}`
}

/** Who laid out what for this trip. Saving books the payer's outlay as a club expense linked to the trip. */
type TripExpenseRow = TripExpensesData['expenses'][number]

const INVALIDATE = ['trip-expenses', 'committee-trips', 'club-expenses', 'member-balances', 'guest-balances', 'all-payments']

/** Add an outlay, or edit one when `expense` is given. */
function AddExpenseSheet({trip, open, onClose, expense}: {
    trip: ClubTrip; open: boolean; onClose: () => void; expense?: TripExpenseRow
}) {
    const t = useT()
    const qc = useQueryClient()
    const user = useAppStore(s => s.user)
    const members = useAppStore(s => s.regularMembers)
    const candidates = members.filter(m => m.is_active && !m.deactivated_at)
        .sort((a, b) => Number(b.id === user?.regular_member_id) - Number(a.id === user?.regular_member_id))
    const [payer, setPayer] = useState<number | null>(expense ? expense.paid_by_member_id : user?.regular_member_id ?? null)
    const [description, setDescription] = useState(expense?.description ?? '')
    const [amount, setAmount] = useState(expense ? String(expense.amount).replace('.', ',') : '')
    const [day, setDay] = useState(expense ? (expense.date ?? '') : todayDateInput())
    const [saving, setSaving] = useState(false)
    const needsPayer = !expense || expense.paid_by_member_id != null
    const valid = (payer != null || !needsPayer) && parseAmount(amount) > 0 && description.trim().length > 0

    async function submit() {
        if (!valid) return
        setSaving(true)
        try {
            if (expense) {
                await api.updateTripExpense(trip.id, expense.id, {
                    ...(needsPayer && payer != null ? {paid_by_member_id: payer} : {}),
                    amount: parseAmount(amount), description: description.trim(), date: day,
                })
            } else {
                await api.addTripExpense(trip.id, {
                    paid_by_member_id: payer as number, amount: parseAmount(amount), description: description.trim(), date: day || undefined,
                })
            }
            // The booking also credits the payer's account and adds a club expense
            for (const key of INVALIDATE) qc.invalidateQueries({queryKey: [key]})
            onClose()
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Sheet open={open} onClose={onClose} title={`💶 ${t(expense ? 'trip.expenses.edit' : 'trip.expenses.add')}`} onSubmit={submit}>
            <div className="flex flex-col gap-3">
                {needsPayer && <div>
                    <label className="field-label">{t('trip.expenses.paidByLabel')}</label>
                    <div className="flex gap-2 flex-wrap" data-testid="trip-expense-payer">
                        {candidates.map(m => (
                            <button key={m.id} type="button" aria-pressed={payer === m.id}
                                    className={`chip ${payer === m.id ? 'active' : ''}`}
                                    onClick={() => setPayer(m.id)}>
                                {m.nickname || m.name}
                            </button>
                        ))}
                    </div>
                </div>}
                <div>
                    <label className="field-label" htmlFor="trip-exp-desc">{t('treasury.expense.description')}</label>
                    <input id="trip-exp-desc" className="kce-input" value={description} autoFocus
                           onChange={e => setDescription(e.target.value)}
                           placeholder={t('trip.expenses.descPlaceholder')}/>
                </div>
                <div>
                    <label className="field-label" htmlFor="trip-exp-amount">{t('treasury.payment.amount')}</label>
                    <div className="flex items-center gap-2">
                        <span className="text-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">€</span>
                        <input id="trip-exp-amount" className="kce-input flex-1" type="text" inputMode="decimal"
                               value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00"/>
                    </div>
                </div>
                <div>
                    <label className="field-label" htmlFor="trip-exp-date">{t('treasury.expense.date')}</label>
                    <input id="trip-exp-date" type="date" className="kce-input" value={day}
                           onChange={e => setDay(e.target.value)}/>
                </div>
                {!expense && <p className="text-xs text-muted">{t('trip.expenses.addHint')}</p>}
                <Button type="submit" variant="primary" block disabled={saving || !valid}>
                    ✓ {t('action.save')}
                </Button>
            </div>
        </Sheet>
    )
}

function DeleteExpenseSheet({trip, expense, onClose}: { trip: ClubTrip; expense: TripExpenseRow; onClose: () => void }) {
    const t = useT()
    const qc = useQueryClient()
    const [busy, setBusy] = useState(false)
    async function remove() {
        setBusy(true)
        try {
            await api.deleteTripExpense(trip.id, expense.id)
            for (const key of INVALIDATE) qc.invalidateQueries({queryKey: [key]})
            onClose()
        } catch (e: unknown) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }
    return (
        <ConfirmSheet open onClose={onClose} title={`🗑️ ${t('action.delete')}`}
                      message={t('trip.expenses.deleteConfirm')} confirmLabel={t('action.delete')}
                      busy={busy} onConfirm={remove}>
            <p className="text-sm font-bold">{expense.description} · {fe(expense.amount)}</p>
        </ConfirmSheet>
    )
}

/**
 * What the club paid for this Kegelfahrt: the club expenses booked against it, with the total
 * and what each person laid out. The committee can add an outlay right here.
 */
export function TripExpenses({trip, canWrite = false}: { trip: ClubTrip; canWrite?: boolean }) {
    const t = useT()
    const [open, setOpen] = useState(false)
    const [adding, setAdding] = useState(false)
    const [editing, setEditing] = useState<TripExpenseRow | null>(null)
    const [deleting, setDeleting] = useState<TripExpenseRow | null>(null)
    const hasExpenses = !!trip.expense_count
    const {data, isLoading} = useQuery({
        queryKey: ['trip-expenses', trip.id],
        queryFn: () => api.getTripExpenses(trip.id),
        enabled: hasExpenses,
    })
    if (!hasExpenses && !canWrite) return null
    return (
        <div className="mt-3 pt-3 border-t border-line">
            {hasExpenses && (
                <ExpandableCard bare open={open} onToggle={setOpen} headerClassName="text-sm"
                                data-testid="trip-expenses"
                                title={
                                    <span className="font-bold text-ink">
                                        💶 {t('trip.expenses')} · <span data-testid="trip-expenses-total">{fe(trip.expense_total ?? 0)}</span>
                                        <span className="text-muted font-normal"> ({trip.expense_count})</span>
                                    </span>
                                }>
                    {isLoading || !data ? <SkeletonRows rows={Math.min(trip.expense_count ?? 1, 3)}/> : (
                        <div className="mt-2 flex flex-col gap-3">
                            {data.by_payer.length > 0 && (
                                <div data-testid="trip-expenses-by-payer">
                                    <p className="field-label">{t('trip.expenses.byPayer')}</p>
                                    <ul className="flex flex-col gap-1">
                                        {data.by_payer.map(p => (
                                            <li key={p.member_id} className="flex justify-between text-sm">
                                                <span className="text-ink">{p.name}</span>
                                                <span className="font-bold">{fe(p.total)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <ul className="flex flex-col gap-1.5">
                                {data.expenses.map(e => (
                                    <li key={e.id} className="flex items-baseline justify-between gap-2 text-sm">
                                        <span className="min-w-0">
                                            <span className="text-ink">{e.description}</span>
                                            <span className="block text-xs text-muted">
                                                {fDate(e.date)}{e.paid_by_name && ` · ${t('trip.expenses.paidBy')} ${e.paid_by_name}`}
                                            </span>
                                        </span>
                                        <span className="flex items-center gap-1 flex-shrink-0">
                                            <span className="font-bold">{fe(e.amount)}</span>
                                            {canWrite && (
                                                <CardActionMenu title={e.description} actions={[
                                                    {icon: '✏️', label: t('action.edit'), onClick: () => setEditing(e)},
                                                    {icon: '🗑️', label: t('action.delete'), danger: true, onClick: () => setDeleting(e)},
                                                ]}/>
                                            )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </ExpandableCard>
            )}
            {canWrite && (
                <>
                    <Button type="button" variant="secondary" size="xs" className="mt-2" data-testid="trip-expense-add"
                            onClick={() => setAdding(true)}>
                        ＋ {t('trip.expenses.add')}
                    </Button>
                    {adding && <AddExpenseSheet trip={trip} open onClose={() => setAdding(false)}/>}
                </>
            )}
            {canWrite && editing && <AddExpenseSheet trip={trip} open expense={editing} onClose={() => setEditing(null)}/>}
            {canWrite && deleting && <DeleteExpenseSheet trip={trip} expense={deleting} onClose={() => setDeleting(null)}/>}
        </div>
    )
}
