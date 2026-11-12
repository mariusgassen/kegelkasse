import {useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {isAdmin, useAppStore} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {useOnline} from '@/hooks/useOnline.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {ExpandableCard} from '@/components/ui/ExpandableCard.tsx'
import {SkeletonRows} from '@/components/ui/Skeleton.tsx'
import {EmojiPickerButton} from '@/components/ui/EmojiPickerButton.tsx'
import {ActionItem} from '@/components/ui/ActionSheet.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import {toastError} from '@/utils/error.ts'
import type {InventoryItem} from '@/types.ts'
import {Button} from '@/components/ui/Button.tsx'

function fDateTime(iso: string | null) {
    if (!iso) return ''
    return new Date(iso).toLocaleString('de-DE', {day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'})
}

/** Parse a non-negative whole number from an input; null when empty or invalid. */
function toCount(v: string): number | null {
    if (!/^\d+$/.test(v.trim())) return null
    return parseInt(v.trim(), 10)
}

function useInvalidateInventory() {
    const qc = useQueryClient()
    return (itemId?: number) => Promise.all([
        qc.invalidateQueries({queryKey: ['inventory']}),
        itemId != null ? qc.invalidateQueries({queryKey: ['inventory-movements', itemId]}) : Promise.resolve(),
    ])
}

/** Stock vs. target at a glance: a bar plus "N fehlen" when the club is short. */
function StockStatus({item}: {item: InventoryItem}) {
    const t = useT()
    const pct = item.target > 0 ? Math.min(100, Math.round((item.stock / item.target) * 100)) : 100
    return (
        <div className="mt-1.5">
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden" aria-hidden="true">
                <div className={`h-full ${item.missing > 0 ? 'bg-danger' : 'bg-positive'}`} style={{width: `${pct}%`}}/>
            </div>
            <div className="flex justify-between text-xs mt-1">
                <span className="text-muted">
                    {t('zeugwart.inStock').replace('{stock}', String(item.stock)).replace('{target}', String(item.target))}
                </span>
                {item.missing > 0
                    ? <span className="font-bold text-danger-fg">{t('zeugwart.missing').replace('{n}', String(item.missing))}</span>
                    : <span className="font-bold text-positive-fg">{t('zeugwart.complete')}</span>}
            </div>
        </div>
    )
}

function ItemForm({initial, onSubmit, onCancel, busy, withStock}: {
    initial?: InventoryItem
    withStock: boolean
    busy: boolean
    onCancel: () => void
    onSubmit: (v: { name: string; icon: string; stock: number; target: number; note: string }) => void
}) {
    const t = useT()
    const [name, setName] = useState(initial?.name ?? '')
    const [icon, setIcon] = useState(initial?.icon ?? '📦')
    const [stock, setStock] = useState('0')
    const [target, setTarget] = useState(String(initial?.target ?? 0))
    const [note, setNote] = useState(initial?.note ?? '')
    const targetN = toCount(target)
    const stockN = withStock ? toCount(stock) : 0
    const valid = name.trim() !== '' && targetN != null && stockN != null

    return (
        <form className="space-y-3" onSubmit={e => {
            e.preventDefault()
            if (valid) onSubmit({name: name.trim(), icon, stock: stockN ?? 0, target: targetN ?? 0, note: note.trim()})
        }}>
            <div>
                <label className="field-label" htmlFor="zw-name">{t('zeugwart.name')}</label>
                <div className="flex items-center gap-2">
                    <EmojiPickerButton value={icon} onChange={setIcon}/>
                    <input id="zw-name" className="kce-input flex-1" value={name} maxLength={80}
                           onChange={e => setName(e.target.value)}/>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {withStock && (
                    <div>
                        <label className="field-label" htmlFor="zw-stock">{t('zeugwart.stock')}</label>
                        <input id="zw-stock" className="kce-input" inputMode="numeric" value={stock}
                               onChange={e => setStock(e.target.value)}/>
                    </div>
                )}
                <div>
                    <label className="field-label" htmlFor="zw-target">{t('zeugwart.target')}</label>
                    <input id="zw-target" className="kce-input" inputMode="numeric" value={target}
                           onChange={e => setTarget(e.target.value)}/>
                </div>
            </div>
            <div>
                <label className="field-label" htmlFor="zw-note">{t('zeugwart.note')}</label>
                <input id="zw-note" className="kce-input" value={note} maxLength={500}
                       onChange={e => setNote(e.target.value)}/>
            </div>
            <div className="flex gap-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>{t('action.cancel')}</Button>
                <Button type="submit" variant="primary" className="flex-1" disabled={!valid || busy}>{t('action.save')}</Button>
            </div>
        </form>
    )
}

/** One item: book stock in/out, correct it, read the history; keepers can also edit or delete. */
function ItemSheet({item, canEdit, onClose}: { item: InventoryItem | null; canEdit: boolean; onClose: () => void }) {
    const t = useT()
    const isOnline = useOnline()
    const invalidate = useInvalidateInventory()
    const [amount, setAmount] = useState('')
    const [note, setNote] = useState('')
    const [recount, setRecount] = useState(false)
    const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
    const [busy, setBusy] = useState(false)

    const {data: moves = [], isLoading} = useQuery({
        queryKey: ['inventory-movements', item?.id],
        queryFn: () => api.listInventoryMovements(item!.id),
        enabled: item != null,
    })

    function reset() {
        setAmount('')
        setNote('')
        setRecount(false)
        setMode('view')
    }

    function close() {
        reset()
        onClose()
    }

    async function run(fn: () => Promise<unknown>, okKey: 'zeugwart.booked' | 'zeugwart.saved', then?: () => void) {
        if (!item) return
        setBusy(true)
        try {
            await fn()
            showToast(t(okKey), 'success')
            await invalidate(item.id)
            then?.()
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    const n = toCount(amount)
    const book = (sign: 1 | -1) => run(
        () => api.addInventoryMovement(item!.id, {delta: sign * (n as number), note: note.trim() || undefined}),
        'zeugwart.booked', () => { setAmount(''); setNote('') })
    const doRecount = () => run(
        () => api.addInventoryMovement(item!.id, {count: n as number, note: note.trim() || undefined}),
        'zeugwart.booked', () => { setAmount(''); setNote(''); setRecount(false) })

    const title = item ? `${item.icon ?? '📦'} ${item.name}` : t('zeugwart.title')

    return (
        <Sheet open={item != null} onClose={close} title={title}
               overlays={item && (
                   <Sheet open={mode === 'delete'} onClose={() => setMode('view')} title={t('zeugwart.delete')}>
                       <p className="text-sm text-ink mb-4">{t('zeugwart.deleteConfirm').replace('{name}', item.name)}</p>
                       <div className="flex gap-2">
                           <Button variant="secondary" className="flex-1" onClick={() => setMode('view')}>{t('action.cancel')}</Button>
                           <Button variant="danger" className="flex-1" disabled={busy || !isOnline}
                                   onClick={() => run(() => api.deleteInventoryItem(item.id), 'zeugwart.saved', close)}>
                               {t('action.delete')}
                           </Button>
                       </div>
                   </Sheet>
               )}>
            {item && mode === 'edit' ? (
                <ItemForm initial={item} withStock={false} busy={busy} onCancel={() => setMode('view')}
                          onSubmit={v => run(() => api.updateInventoryItem(item.id, {
                              name: v.name, icon: v.icon, target: v.target, note: v.note || null,
                          }), 'zeugwart.saved', () => setMode('view'))}/>
            ) : item && (
                <div className="space-y-3" data-testid="zeugwart-detail">
                    <div className="kce-card p-3">
                        <StockStatus item={item}/>
                        {item.note && <p className="text-xs text-muted mt-2">{item.note}</p>}
                    </div>

                    {canEdit && (
                        <div className="kce-card p-3 space-y-2">
                            <label className="field-label" htmlFor="zw-amount">
                                {recount ? t('zeugwart.recountTo') : t('zeugwart.amount')}
                            </label>
                            <input id="zw-amount" className="kce-input" inputMode="numeric" value={amount}
                                   onChange={e => setAmount(e.target.value)}/>
                            <input className="kce-input" placeholder={t('zeugwart.movementNote')} aria-label={t('zeugwart.movementNote')}
                                   value={note} maxLength={500} onChange={e => setNote(e.target.value)}/>
                            {recount ? (
                                <div className="flex gap-2">
                                    <Button variant="secondary" className="flex-1" onClick={() => setRecount(false)}>{t('action.cancel')}</Button>
                                    <Button variant="primary" className="flex-1" disabled={n == null || busy || !isOnline}
                                            onClick={doRecount}>{t('action.save')}</Button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <Button variant="secondary" className="flex-1" disabled={!n || busy || !isOnline}
                                            onClick={() => book(-1)}>− {t('zeugwart.out')}</Button>
                                    <Button variant="primary" className="flex-1" disabled={!n || busy || !isOnline}
                                            onClick={() => book(1)}>+ {t('zeugwart.in')}</Button>
                                </div>
                            )}
                            {!recount && (
                                <div className="flex flex-col gap-2 pt-1">
                                    <ActionItem icon="🧮" label={t('zeugwart.recount')} onClick={() => setRecount(true)}/>
                                    <ActionItem icon="✏️" label={t('zeugwart.edit')} onClick={() => setMode('edit')}/>
                                    <ActionItem icon="🗑️" label={t('zeugwart.delete')} danger onClick={() => setMode('delete')}/>
                                </div>
                            )}
                        </div>
                    )}

                    <div>
                        <div className="field-label mb-1">{t('zeugwart.history')}</div>
                        {isLoading ? <SkeletonRows rows={3}/> : moves.length === 0
                            ? <p className="text-xs text-muted" data-testid="zeugwart-no-history">{t('zeugwart.noHistory')}</p>
                            : (
                                <ul className="space-y-1.5" data-testid="zeugwart-history">
                                    {moves.map(m => (
                                        <li key={m.id} className="kce-card p-2.5 flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="text-sm">{m.note || '—'}</div>
                                                <div className="text-xs text-muted">{m.actor_name} · {fDateTime(m.created_at)}</div>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <div className={`text-sm font-bold ${m.delta > 0 ? 'text-positive-fg' : 'text-danger-fg'}`}>
                                                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                                                </div>
                                                <div className="text-xs text-muted">{t('zeugwart.after').replace('{n}', String(m.stock_after))}</div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                    </div>
                </div>
            )}
        </Sheet>
    )
}

/** Admins pick which members are Zeugwart. Guests cannot be. */
function KeeperManager({keeperIds}: { keeperIds: Set<number> }) {
    const t = useT()
    const qc = useQueryClient()
    const regularMembers = useAppStore(s => s.regularMembers)
    const [busy, setBusy] = useState<number | null>(null)
    const candidates = regularMembers.filter(m => m.is_active && !m.is_guest && !m.deactivated_at)

    async function toggle(id: number) {
        setBusy(id)
        try {
            await api.setZeugwart(id, !keeperIds.has(id))
            await Promise.all([
                qc.invalidateQueries({queryKey: ['inventory-keepers']}),
                qc.invalidateQueries({queryKey: ['inventory']}),
            ])
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(null)
        }
    }

    return (
        <ExpandableCard title={<span className="text-sm font-bold">🛠️ {t('zeugwart.manageKeepers')}</span>}
                        data-testid="zeugwart-manage">
            <div className="px-3 pb-3">
                <p className="text-xs text-muted mb-2">{t('zeugwart.manageHint')}</p>
                <div className="flex flex-wrap gap-1.5">
                    {candidates.map(m => (
                        <button key={m.id} type="button" disabled={busy === m.id}
                                className={`chip ${keeperIds.has(m.id) ? 'active' : ''}`}
                                aria-pressed={keeperIds.has(m.id)}
                                onClick={() => toggle(m.id)}>
                            {m.nickname || m.name}
                        </button>
                    ))}
                </div>
            </div>
        </ExpandableCard>
    )
}

/**
 * Zeugwart: what the club has (stickers, pins, shirts, …) and what it still needs. Everyone
 * reads; the Zeugwart and admins keep it current. Items that fall short of their target come first.
 */
export function ZeugwartPage() {
    const t = useT()
    const isOnline = useOnline()
    const user = useAppStore(s => s.user)
    const admin = isAdmin(user)
    const invalidate = useInvalidateInventory()
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [adding, setAdding] = useState(false)
    const [busy, setBusy] = useState(false)

    const {data, isLoading} = useQuery({queryKey: ['inventory'], queryFn: api.listInventory})
    const {data: keepers = []} = useQuery({queryKey: ['inventory-keepers'], queryFn: api.listZeugwarte})

    const items = [...(data?.items ?? [])].sort((a, b) =>
        (b.missing > 0 ? 1 : 0) - (a.missing > 0 ? 1 : 0) || a.name.localeCompare(b.name, 'de'))
    const canEdit = !!data?.can_edit
    const selected = items.find(i => i.id === selectedId) ?? null
    const keeperIds = new Set(keepers.map(k => k.id))

    async function create(v: { name: string; icon: string; stock: number; target: number; note: string }) {
        setBusy(true)
        try {
            await api.createInventoryItem({name: v.name, icon: v.icon, stock: v.stock, target: v.target, note: v.note || undefined})
            showToast(t('zeugwart.created'), 'success')
            setAdding(false)
            await invalidate()
        } catch (e) {
            toastError(e)
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="page-scroll p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h1 className="sec-heading">📦 {t('zeugwart.title')}</h1>
                    <p className="text-xs text-muted">{t('zeugwart.hint')}</p>
                </div>
                {canEdit && (
                    <Button variant="primary" className="flex-shrink-0" disabled={!isOnline} onClick={() => setAdding(true)}>
                        + {t('zeugwart.add')}
                    </Button>
                )}
            </div>

            <div className="text-xs text-muted">
                <span className="field-label mr-1">{t('zeugwart.keepers')}:</span>
                {keepers.length === 0
                    ? <span data-testid="zeugwart-no-keepers">{t('zeugwart.noKeepers')}</span>
                    : <span data-testid="zeugwart-keepers">{keepers.map(k => k.nickname || k.name).join(', ')}</span>}
            </div>

            {admin && <KeeperManager keeperIds={keeperIds}/>}

            {isLoading ? <SkeletonRows rows={4}/> : items.length === 0
                ? <Empty icon="📦" text={t('zeugwart.empty')}/>
                : (
                    <ul className="space-y-2" data-testid="zeugwart-list">
                        {items.map(item => (
                            <li key={item.id}>
                                <button type="button" className="kce-card p-3 w-full text-left active:opacity-70"
                                        onClick={() => setSelectedId(item.id)}>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl" aria-hidden="true">{item.icon ?? '📦'}</span>
                                        <span className="text-sm font-bold flex-1 min-w-0 truncate">{item.name}</span>
                                        <span className="text-muted" aria-hidden="true">›</span>
                                    </div>
                                    <StockStatus item={item}/>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

            <ItemSheet item={selected} canEdit={canEdit} onClose={() => setSelectedId(null)}/>

            <Sheet open={adding} onClose={() => setAdding(false)} title={t('zeugwart.add')}>
                {adding && <ItemForm withStock busy={busy} onCancel={() => setAdding(false)} onSubmit={create}/>}
            </Sheet>
        </div>
    )
}
