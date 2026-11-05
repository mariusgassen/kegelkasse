import {useEffect, useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {useOnline} from '@/hooks/useOnline.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {StatTile} from '@/components/ui/StatTile.tsx'
import {ExpandableCard} from '@/components/ui/ExpandableCard.tsx'
import {MemberRow} from '@/components/ui/MemberRow.tsx'
import {CardActionMenu} from '@/components/ui/ActionSheet.tsx'
import {SkeletonRows} from '@/components/ui/Skeleton.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import {parseAmount} from '@/utils/parse.ts'
import type {ClubTrip, TripCash, TripCashExpense, TripCashMember} from '@/types.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fDate(iso: string | null) {
    if (!iso) return ''
    return new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'})
}

const display = (m: Pick<TripCashMember, 'name' | 'nickname'> | undefined) => (m ? m.nickname || m.name : '?')

/** Current user first, then alphabetical — the CLAUDE.md list convention. */
function sortMine<T extends TripCashMember>(list: T[], myId: number | null | undefined): T[] {
    return [...list].sort((a, b) => {
        if (a.id === myId) return -1
        if (b.id === myId) return 1
        return display(a).localeCompare(display(b), 'de')
    })
}

type Kind = 'expense' | 'transfer'

function AddEntrySheet({open, onClose, cash, tripId, onSaved}: {
    open: boolean; onClose: () => void; cash: TripCash; tripId: number; onSaved: (c: TripCash) => void
}) {
    const t = useT()
    const isOnline = useOnline()
    const myId = useAppStore(s => s.user?.regular_member_id)
    const participants = sortMine(cash.participants, myId)
    const defaultPayer = cash.participants.some(p => p.id === myId) ? myId! : (participants[0]?.id ?? 0)
    const [kind, setKind] = useState<Kind>('expense')
    const [description, setDescription] = useState('')
    const [amount, setAmount] = useState('')
    const [payer, setPayer] = useState(defaultPayer)
    const [recipient, setRecipient] = useState(0)
    const [split, setSplit] = useState<number[]>(() => cash.participants.map(p => p.id))
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (!open) return
        setKind('expense')
        setDescription('')
        setAmount('')
        setPayer(defaultPayer)
        setRecipient(0)
        setSplit(cash.participants.map(p => p.id))
    }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

    const value = parseAmount(amount)
    const valid = value > 0 && description.trim().length > 0 && payer > 0
        && (kind === 'expense' ? split.length > 0 : recipient > 0 && recipient !== payer)

    function toggleSplit(id: number) {
        setSplit(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
    }

    async function save() {
        if (!valid) return
        setBusy(true)
        try {
            const everyone = split.length === cash.participants.length
            const next = await api.addTripExpense(tripId, {
                kind, description: description.trim(), amount: value, paid_by_member_id: payer,
                ...(kind === 'transfer' ? {to_member_id: recipient} : everyone ? {} : {split_member_ids: split}),
            })
            onSaved(next)
            onClose()
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    return (
        <Sheet open={open} onClose={onClose} title={t('tripCash.add')} onSubmit={save}>
            <div className="space-y-3">
                <div className="flex gap-2" role="group" aria-label={t('tripCash.kind')}>
                    {(['expense', 'transfer'] as const).map(k => (
                        <button key={k} type="button" aria-pressed={kind === k}
                                className={`chip flex-1 justify-center ${kind === k ? 'active' : ''}`}
                                onClick={() => setKind(k)}>
                            {t(k === 'expense' ? 'tripCash.kind.expense' : 'tripCash.kind.transfer')}
                        </button>
                    ))}
                </div>
                <p className="text-xs text-muted">
                    {t(kind === 'expense' ? 'tripCash.kind.expenseHint' : 'tripCash.kind.transferHint')}
                </p>
                <div>
                    <label className="field-label" htmlFor="trip-cash-desc">{t('tripCash.description')}</label>
                    <input id="trip-cash-desc" className="kce-input w-full" value={description}
                           placeholder={t(kind === 'expense' ? 'tripCash.descriptionPlaceholder' : 'tripCash.transferPlaceholder')}
                           onChange={e => setDescription(e.target.value)}/>
                </div>
                <div>
                    <label className="field-label" htmlFor="trip-cash-amount">{t('tripCash.amount')}</label>
                    <input id="trip-cash-amount" className="kce-input w-full" inputMode="decimal" value={amount}
                           placeholder="0,00" onChange={e => setAmount(e.target.value)}/>
                </div>
                <div>
                    <label className="field-label" htmlFor="trip-cash-payer">
                        {t(kind === 'expense' ? 'tripCash.paidBy' : 'tripCash.from')}
                    </label>
                    <select id="trip-cash-payer" className="kce-input w-full" value={payer}
                            onChange={e => setPayer(Number(e.target.value))}>
                        {participants.map(p => <option key={p.id} value={p.id}>{display(p)}</option>)}
                    </select>
                </div>
                {kind === 'transfer' ? (
                    <div>
                        <label className="field-label" htmlFor="trip-cash-to">{t('tripCash.to')}</label>
                        <select id="trip-cash-to" className="kce-input w-full" value={recipient}
                                onChange={e => setRecipient(Number(e.target.value))}>
                            <option value={0}>—</option>
                            {participants.filter(p => p.id !== payer).map(p => (
                                <option key={p.id} value={p.id}>{display(p)}</option>
                            ))}
                        </select>
                    </div>
                ) : (
                    <div>
                        <div className="field-label">{t('tripCash.splitAmong')}</div>
                        <div className="flex flex-wrap gap-1.5" data-testid="trip-cash-split">
                            {participants.map(p => (
                                <button key={p.id} type="button" aria-pressed={split.includes(p.id)}
                                        className={`chip ${split.includes(p.id) ? 'active' : ''}`}
                                        onClick={() => toggleSplit(p.id)}>
                                    {display(p)}
                                </button>
                            ))}
                        </div>
                        {split.length > 0 && value > 0 && (
                            <p className="text-xs text-muted mt-1">
                                {t('tripCash.perPerson').replace('{amount}', fe(value / split.length))}
                            </p>
                        )}
                    </div>
                )}
                <button type="submit" className="btn-primary w-full" disabled={!valid || busy || !isOnline}>
                    {t('action.save')}
                </button>
            </div>
        </Sheet>
    )
}

/** Committee/admin picks who joins the trip. Anyone with bookings stays (server enforces it too). */
function ParticipantPicker({cash, tripId, onSaved}: {cash: TripCash; tripId: number; onSaved: (c: TripCash) => void}) {
    const t = useT()
    const regularMembers = useAppStore(s => s.regularMembers)
    const myId = useAppStore(s => s.user?.regular_member_id)
    const [busy, setBusy] = useState(false)
    const selected = new Set(cash.participants.map(p => p.id))
    const candidates = sortMine(
        regularMembers
            .filter(m => m.is_active && (!m.deactivated_at || selected.has(m.id)))
            .map(m => ({id: m.id, name: m.name, nickname: m.nickname, is_guest: m.is_guest})),
        myId,
    )

    async function toggle(id: number) {
        const next = selected.has(id) ? [...selected].filter(x => x !== id) : [...selected, id]
        setBusy(true)
        try {
            onSaved(await api.setTripParticipants(tripId, next))
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    return (
        <ExpandableCard title={<span className="text-sm font-bold">👥 {t('tripCash.participants')} ({cash.participants.length})</span>}
                        defaultOpen={cash.participants.length === 0} data-testid="trip-cash-participants">
            <div className="px-3 pb-3">
                <p className="text-xs text-muted mb-2">{t('tripCash.participantsHint')}</p>
                <div className="flex flex-wrap gap-1.5">
                    {candidates.map(m => (
                        <button key={m.id} type="button" disabled={busy} aria-pressed={selected.has(m.id)}
                                className={`chip ${selected.has(m.id) ? 'active' : ''}`}
                                onClick={() => toggle(m.id)}>
                            {display(m)}{m.is_guest ? ` · ${t('tripCash.guest')}` : ''}
                        </button>
                    ))}
                </div>
            </div>
        </ExpandableCard>
    )
}

/**
 * Kegelfahrt-Kasse: who laid out what for the trip, who owes whom, and the fewest payments that
 * square everyone up. Separate from the club treasury — this is the travellers' money.
 */
export function TripCashSheet({trip, open, onClose}: {trip: ClubTrip; open: boolean; onClose: () => void}) {
    const t = useT()
    const qc = useQueryClient()
    const isOnline = useOnline()
    const myId = useAppStore(s => s.user?.regular_member_id)
    const [adding, setAdding] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<TripCashExpense | null>(null)
    const [busy, setBusy] = useState(false)
    const key = ['trip-cash', trip.id]

    const {data: cash} = useQuery({
        queryKey: key,
        queryFn: () => api.getTripCash(trip.id),
        enabled: open,
    })

    function update(next: TripCash) {
        qc.setQueryData(key, next)
        void qc.invalidateQueries({queryKey: key})
    }

    async function settleUp(from: number, to: number, amount: number) {
        setBusy(true)
        try {
            update(await api.addTripExpense(trip.id, {
                kind: 'transfer', description: t('tripCash.settleDescription'), amount,
                paid_by_member_id: from, to_member_id: to,
            }))
            showToast(t('tripCash.settled'), 'success')
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    async function remove() {
        if (!deleteTarget) return
        setBusy(true)
        try {
            update(await api.deleteTripExpense(trip.id, deleteTarget.id))
            setDeleteTarget(null)
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    const members = new Map<number, TripCashMember>()
    cash?.participants.forEach(p => members.set(p.id, p))
    cash?.balances.forEach(b => members.set(b.id, b))
    const name = (id: number | null) => display(id != null ? members.get(id) : undefined)
    const mine = cash?.balances.find(b => b.id === myId)

    return (
        <Sheet open={open} onClose={onClose} title={`💶 ${t('tripCash.title')} · ${trip.destination}`}
               overlays={cash && (
                   <>
                       <AddEntrySheet open={adding} onClose={() => setAdding(false)} cash={cash} tripId={trip.id}
                                      onSaved={update}/>
                       <Sheet open={deleteTarget != null} onClose={() => setDeleteTarget(null)} title={t('tripCash.delete')}>
                           <p className="text-sm text-ink mb-4">
                               {t('tripCash.deleteConfirm').replace('{what}', deleteTarget?.description ?? '')}
                           </p>
                           <div className="flex gap-2">
                               <button className="btn-secondary flex-1" onClick={() => setDeleteTarget(null)}>{t('action.cancel')}</button>
                               <button className="btn-danger flex-1" disabled={busy} onClick={remove}>{t('action.delete')}</button>
                           </div>
                       </Sheet>
                   </>
               )}>
            {!cash ? <SkeletonRows rows={4}/> : (
                <div className="space-y-3" data-testid="trip-cash">
                    <p className="text-xs text-muted">{t('tripCash.hint')}</p>

                    <div className="grid grid-cols-2 gap-2">
                        <StatTile value={fe(cash.total)} label={t('tripCash.total')} data-testid="trip-cash-total"/>
                        {mine ? (
                            <StatTile value={fe(mine.balance)} label={t(mine.balance < 0 ? 'tripCash.youOwe' : 'tripCash.youGet')}
                                      tone={mine.balance < -0.005 ? 'negative' : mine.balance > 0.005 ? 'positive' : 'muted'}
                                      data-testid="trip-cash-mine"/>
                        ) : (
                            <StatTile value={String(cash.participants.length)} label={t('tripCash.participants')} tone="default"/>
                        )}
                    </div>

                    {cash.can_manage && <ParticipantPicker cash={cash} tripId={trip.id} onSaved={update}/>}

                    {cash.can_add && cash.participants.length > 0 && (
                        <button className="btn-primary w-full" disabled={!isOnline} onClick={() => setAdding(true)}
                                data-testid="trip-cash-add">
                            + {t('tripCash.add')}
                        </button>
                    )}

                    {cash.participants.length === 0 && !cash.can_manage && (
                        <p className="text-sm text-muted text-center py-2">{t('tripCash.noParticipants')}</p>
                    )}

                    {cash.settlements.length > 0 && (
                        <div className="kce-card p-3" data-testid="trip-cash-settlements">
                            <div className="field-label mb-2">🤝 {t('tripCash.settleUp')}</div>
                            {cash.settlements.map(s => (
                                <div key={`${s.from_member_id}-${s.to_member_id}`}
                                     className="flex items-center gap-2 py-1.5 border-b border-line last:border-b-0">
                                    <div className="flex-1 min-w-0 text-sm text-ink">
                                        <span className="font-bold">{name(s.from_member_id)}</span>
                                        {' → '}
                                        <span className="font-bold">{name(s.to_member_id)}</span>
                                    </div>
                                    <span className="text-sm font-bold text-accent-fg">{fe(s.amount)}</span>
                                    {cash.can_add && (
                                        <button className="btn-secondary btn-sm" disabled={busy || !isOnline}
                                                onClick={() => settleUp(s.from_member_id, s.to_member_id, s.amount)}>
                                            {t('tripCash.markPaid')}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {cash.settlements.length === 0 && cash.expenses.length > 0 && (
                        <p className="text-sm text-positive-fg text-center" data-testid="trip-cash-even">✅ {t('tripCash.allEven')}</p>
                    )}

                    {cash.balances.length > 0 && (
                        <div className="kce-card p-3" data-testid="trip-cash-balances">
                            <div className="field-label mb-1">{t('tripCash.balances')}</div>
                            {sortMine(cash.balances, myId).map(b => (
                                <MemberRow key={b.id} name={display(b)} isMe={b.id === myId}
                                           avatarVariant={b.is_guest ? 'muted' : 'default'}
                                           subtitle={t('tripCash.paidShare').replace('{paid}', fe(b.paid)).replace('{share}', fe(b.share))}
                                           trailing={
                                               <span className={`text-sm font-bold ${b.balance < -0.005 ? 'text-danger-fg' : b.balance > 0.005 ? 'text-positive-fg' : 'text-muted'}`}>
                                                   {b.balance > 0.005 ? '+' : ''}{fe(b.balance)}
                                               </span>
                                           }/>
                            ))}
                        </div>
                    )}

                    {cash.expenses.length > 0 && (
                        <div className="kce-card p-3" data-testid="trip-cash-entries">
                            <div className="field-label mb-1">{t('tripCash.entries')}</div>
                            {cash.expenses.map(e => (
                                <div key={e.id} className="flex items-start gap-2 py-1.5 border-b border-line last:border-b-0">
                                    <span aria-hidden="true">{e.kind === 'transfer' ? '💸' : '🧾'}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-ink truncate">{e.description}</div>
                                        <div className="text-xs text-muted">
                                            {fDate(e.date)} · {e.kind === 'transfer'
                                                ? `${name(e.paid_by_member_id)} → ${name(e.to_member_id)}`
                                                : `${t('tripCash.paidByShort')} ${name(e.paid_by_member_id)}${e.split_member_ids
                                                    ? ` · ${t('tripCash.forN').replace('{n}', String(e.split_member_ids.length))}`
                                                    : ''}`}
                                        </div>
                                    </div>
                                    <span className="text-sm font-bold text-ink flex-shrink-0">{fe(e.amount)}</span>
                                    {e.can_delete && (
                                        <CardActionMenu title={e.description} actions={[
                                            {icon: '🗑️', label: t('action.delete'), danger: true, onClick: () => setDeleteTarget(e)},
                                        ]}/>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </Sheet>
    )
}
