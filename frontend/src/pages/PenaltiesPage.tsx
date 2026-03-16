import {useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {useActiveEvening} from '@/hooks/useEvening.ts'
import {useAppStore, isAdmin} from '@/store/app.ts'
import {useT} from '@/i18n'
import {api} from '@/api/client.ts'
import {Sheet} from '@/components/ui/Sheet.tsx'
import {ChipSelect} from '@/components/ui/ChipSelect.tsx'
import {ModeToggle} from '@/components/ui/ModeToggle.tsx'
import {Empty} from '@/components/ui/Empty.tsx'
import {showToast} from '@/components/ui/Toast.tsx'
import type {PenaltyLogEntry, PenaltyMode} from '@/types.ts'

function fe(v: number) {
    return v.toLocaleString('de-DE', {style: 'currency', currency: 'EUR'})
}

function fTime(ms: number) {
    return new Date(ms).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})
}

/** Amount input with € or × prefix, adapts step/placeholder to mode */
function AmountInput({mode, value, onChange, defaultAmount}: {
    mode: PenaltyMode
    value: string
    onChange: (v: string) => void
    defaultAmount?: number
}) {
    const t = useT()
    const isEuro = mode === 'euro'
    const label = isEuro
        ? (defaultAmount !== undefined ? `${t('penalty.amount.override')} (Standard: ${fe(defaultAmount)})` : t('penalty.amount'))
        : t('penalty.count.label')
    const placeholder = isEuro
        ? (defaultAmount !== undefined ? String(defaultAmount) : '0.00')
        : '1'
    return (
        <div>
            <label className="field-label">{label}</label>
            <div className="flex items-center gap-2">
                <span className="text-kce-muted font-bold text-sm w-5 text-center flex-shrink-0 select-none">
                    {isEuro ? '€' : '×'}
                </span>
                <input className="kce-input flex-1"
                       type="number"
                       step={isEuro ? '0.10' : '1'}
                       min="0"
                       value={value}
                       placeholder={placeholder}
                       onChange={e => onChange(e.target.value)}/>
            </div>
        </div>
    )
}

export function PenaltiesPage() {
    const t = useT()
    const qc = useQueryClient()
    const {evening, invalidate} = useActiveEvening()
    const penaltyTypes = useAppStore(s => s.penaltyTypes)
    const setPenaltyTypes = useAppStore(s => s.setPenaltyTypes)
    const user = useAppStore(s => s.user)
    const [sheet, setSheet] = useState(false)
    const [tab, setTab] = useState<'quick' | 'custom'>('quick')

    // Quick form
    const [selectedType, setSelectedType] = useState<number | null>(null)
    const [playerIds, setPlayerIds] = useState<(number | string)[]>([])
    const [mode, setMode] = useState<PenaltyMode>('count')
    const [amount, setAmount] = useState('')

    // Custom form
    const [customIcon, setCustomIcon] = useState('⚠️')
    const [customName, setCustomName] = useState('')
    const [customAmount, setCustomAmount] = useState('')
    const [customMode, setCustomMode] = useState<PenaltyMode>('count')
    const [customPlayerIds, setCustomPlayerIds] = useState<(number | string)[]>([])
    const [saveAsTemplate, setSaveAsTemplate] = useState(false)

    const [saving, setSaving] = useState(false)

    // Delete confirmation
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

    // Edit sheet
    const [editEntry, setEditEntry] = useState<PenaltyLogEntry | null>(null)
    const [editPlayerId, setEditPlayerId] = useState<number | null>(null)
    const [editType, setEditType] = useState<number | null>(null)
    const [editMode, setEditMode] = useState<PenaltyMode>('euro')
    const [editAmount, setEditAmount] = useState('')

    if (!evening) {
        return (
            <div className="page-scroll px-3 py-3 pb-24">
                <div className="sec-heading">⚠️ {t('nav.penalties')}</div>
                <Empty icon="⚠️" text={t('evening.noActive')}/>
            </div>
        )
    }

    const players = evening.players
    const playerOptions = players.map(p => ({id: p.id, label: p.name}))

    // Total: euro entries + count entries × unit_amount (frozen at log time)
    const euroTotal = evening.penalty_log.reduce((sum, l) => {
        if (l.mode === 'euro') return sum + l.amount
        if (l.unit_amount != null) return sum + l.amount * l.unit_amount
        // fallback for legacy entries without unit_amount
        const pt = penaltyTypes.find(pt => pt.name === l.penalty_type_name)
        if (pt) return sum + l.amount * pt.default_amount
        return sum
    }, 0)

    const selectedPenaltyType = penaltyTypes.find(pt => pt.id === selectedType)

    function openSheet() {
        setTab('quick')
        const first = penaltyTypes[0] ?? null
        setSelectedType(first?.id ?? null)
        setPlayerIds([])
        setMode('count')
        setAmount('1')
        setCustomIcon('⚠️')
        setCustomName('')
        setCustomAmount('1')
        setCustomMode('count')
        setCustomPlayerIds([])
        setSaveAsTemplate(false)
        setSheet(true)
    }

    function openEditSheet(entry: PenaltyLogEntry) {
        setEditEntry(entry)
        setEditPlayerId(entry.player_id)
        const pt = penaltyTypes.find(pt => pt.name === entry.penalty_type_name)
        setEditType(pt?.id ?? null)
        setEditMode(entry.mode)
        setEditAmount(String(entry.amount))
    }

    async function submitQuick() {
        if (!selectedPenaltyType || playerIds.length === 0) return
        const effectiveAmount = mode === 'count'
            ? (parseInt(amount) || 1)
            : (parseFloat(amount) || selectedPenaltyType.default_amount)
        setSaving(true)
        try {
            await api.addPenalty(evening!.id, {
                player_ids: playerIds as number[],
                penalty_type_name: selectedPenaltyType.name,
                icon: selectedPenaltyType.icon,
                amount: effectiveAmount,
                mode,
                unit_amount: mode === 'count' ? selectedPenaltyType.default_amount : undefined,
                client_timestamp: Date.now(),
            })
            invalidate()
            setSheet(false)
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Fehler')
        } finally {
            setSaving(false)
        }
    }

    async function submitCustom() {
        if (!customName.trim() || customPlayerIds.length === 0) return
        const effectiveAmount = customMode === 'count'
            ? (parseInt(customAmount) || 1)
            : (parseFloat(customAmount) || 0)
        setSaving(true)
        try {
            await api.addPenalty(evening!.id, {
                player_ids: customPlayerIds as number[],
                penalty_type_name: customName,
                icon: customIcon,
                amount: effectiveAmount,
                mode: customMode,
                // custom count penalties have no unit price → contribute 0 to total
                client_timestamp: Date.now(),
            })
            if (saveAsTemplate) {
                const newPt = await api.createPenaltyType({
                    icon: customIcon,
                    name: customName,
                    default_amount: effectiveAmount,
                    sort_order: 99,
                })
                setPenaltyTypes([...penaltyTypes, newPt])
                await qc.invalidateQueries({queryKey: ['penalty-types']})
            }
            invalidate()
            setSheet(false)
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Fehler')
        } finally {
            setSaving(false)
        }
    }

    async function confirmDelete(lid: number) {
        try {
            await api.deletePenalty(evening!.id, lid)
            invalidate()
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Fehler')
        } finally {
            setConfirmDeleteId(null)
        }
    }

    async function submitEdit() {
        if (!editEntry) return
        const pt = penaltyTypes.find(p => p.id === editType)
        const patch: Parameters<typeof api.updatePenalty>[2] = {}
        if (editPlayerId !== editEntry.player_id) patch.player_id = editPlayerId ?? undefined
        if (pt && pt.name !== editEntry.penalty_type_name) {
            patch.penalty_type_name = pt.name
            patch.icon = pt.icon
        }
        if (editMode !== editEntry.mode) patch.mode = editMode
        const newAmount = editMode === 'count'
            ? (parseInt(editAmount) || 1)
            : (parseFloat(editAmount) || (pt?.default_amount ?? editEntry.amount))
        if (newAmount !== editEntry.amount) patch.amount = newAmount
        setSaving(true)
        try {
            await api.updatePenalty(evening!.id, editEntry.id, patch)
            invalidate()
            setEditEntry(null)
        } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : 'Fehler')
        } finally {
            setSaving(false)
        }
    }

    const log = [...evening.penalty_log].reverse()
    const editPenaltyType = penaltyTypes.find(pt => pt.id === editType)

    return (
        <div className="page-scroll px-3 py-3 pb-24">
            <div className="sec-heading">⚠️ {t('nav.penalties')}</div>

            {/* Total */}
            <div className="kce-card p-4 mb-3 flex items-center justify-between">
                <span className="text-sm font-bold text-kce-muted">{t('penalty.total')}</span>
                <span className="font-display font-bold text-kce-amber text-xl">{fe(euroTotal)}</span>
            </div>

            {/* Add button */}
            <button className="btn-primary w-full mb-4" onClick={openSheet}>
                + {t('penalty.enter')}
            </button>

            {/* Log */}
            {log.length === 0
                ? <Empty icon="⚠️" text={t('penalty.none')}/>
                : log.map(entry => (
                    <div key={entry.id} className="kce-card p-3 mb-2 flex items-center gap-3">
                        <span className="text-xl flex-shrink-0">{entry.icon}</span>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold truncate">{entry.player_name}</div>
                            <div className="text-xs text-kce-muted truncate">{entry.penalty_type_name}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                            {entry.mode === 'euro'
                                ? <span className="text-sm font-bold text-red-400">{fe(entry.amount)}</span>
                                : <span className="text-sm font-bold text-red-400">
                                    {entry.unit_amount != null
                                        ? `${entry.amount} × ${fe(entry.unit_amount)}`
                                        : `×${entry.amount}`}
                                  </span>
                            }
                            <div className="text-xs text-kce-muted">{fTime(entry.client_timestamp)}</div>
                        </div>
                        <button className="btn-ghost btn-xs flex-shrink-0 text-kce-muted"
                                onClick={() => openEditSheet(entry)}>✏️
                        </button>
                        {confirmDeleteId === entry.id ? (
                            <div className="flex gap-1 flex-shrink-0">
                                <button className="btn-danger btn-xs"
                                        onClick={() => confirmDelete(entry.id)}>✓
                                </button>
                                <button className="btn-secondary btn-xs"
                                        onClick={() => setConfirmDeleteId(null)}>✕
                                </button>
                            </div>
                        ) : (
                            <button className="btn-danger btn-xs flex-shrink-0"
                                    onClick={() => setConfirmDeleteId(entry.id)}>✕
                            </button>
                        )}
                    </div>
                ))
            }

            {/* Add penalty sheet */}
            <Sheet open={sheet} onClose={() => setSheet(false)} title={t('penalty.enter')}
                   onSubmit={tab === 'quick' ? submitQuick : submitCustom}>
                <div className="flex gap-1 mb-3">
                    {([['quick', t('penalty.quick')], ['custom', t('penalty.custom')]] as const).map(([id, label]) => (
                        <button key={id} type="button"
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === id ? 'bg-kce-amber text-kce-bg' : 'bg-kce-surface2 text-kce-muted'}`}
                                onClick={() => setTab(id)}>{label}
                        </button>
                    ))}
                </div>

                {tab === 'quick' ? (
                    <div className="flex flex-col gap-3">
                        {/* 1 — Players */}
                        <ChipSelect
                            label={t('penalty.who')}
                            options={playerOptions}
                            selected={playerIds}
                            onChange={setPlayerIds}
                            onSelectAll={() => setPlayerIds(players.map(p => p.id))}
                            onSelectNone={() => setPlayerIds([])}/>

                        {/* 2 — Pick type */}
                        <div>
                            <div className="field-label">{t('penalty.type')}</div>
                            <div className="flex flex-wrap gap-1.5">
                                {penaltyTypes.map(pt => (
                                    <button key={pt.id} type="button"
                                            className={`chip ${selectedType === pt.id ? 'active' : ''}`}
                                            onClick={() => { setSelectedType(pt.id); setAmount(mode === 'euro' ? String(pt.default_amount) : '') }}>
                                        {pt.icon} {pt.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 3 — Mode + Amount (less prominent) */}
                        <div className="border border-kce-border rounded-xl p-3 flex flex-col gap-2">
                            <ModeToggle
                                options={[{value: 'count', label: t('penalty.mode.count')}, {value: 'euro', label: t('penalty.mode.euro')}]}
                                value={mode} onChange={v => {
                                    const m = v as PenaltyMode
                                    setMode(m)
                                    setAmount(m === 'euro' && selectedPenaltyType ? String(selectedPenaltyType.default_amount) : '')
                                }}/>
                            {selectedPenaltyType && (
                                <AmountInput
                                    mode={mode}
                                    value={amount}
                                    onChange={setAmount}
                                    defaultAmount={mode === 'euro' ? selectedPenaltyType.default_amount : undefined}/>
                            )}
                        </div>

                        <div className="flex gap-2 mt-1">
                            <button type="button" className="btn-secondary flex-1" onClick={() => setSheet(false)}>
                                {t('action.cancel')}
                            </button>
                            <button type="submit" className="btn-primary flex-[2]" disabled={saving || !selectedType || playerIds.length === 0}>
                                {t('penalty.confirm')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {/* 1 — Players */}
                        <ChipSelect
                            label={t('penalty.who')}
                            options={playerOptions}
                            selected={customPlayerIds}
                            onChange={setCustomPlayerIds}
                            onSelectAll={() => setCustomPlayerIds(players.map(p => p.id))}
                            onSelectNone={() => setCustomPlayerIds([])}/>

                        {/* 2 — Icon + Name */}
                        <div className="flex gap-2">
                            <div>
                                <label className="field-label">Icon</label>
                                <input className="kce-input w-14 text-center" value={customIcon}
                                       onChange={e => setCustomIcon(e.target.value)}/>
                            </div>
                            <div className="flex-1">
                                <label className="field-label">Name</label>
                                <input className="kce-input" value={customName}
                                       onChange={e => setCustomName(e.target.value)}
                                       placeholder="z.B. Zu spät…"/>
                            </div>
                        </div>

                        {/* 3 — Mode + Amount (less prominent) */}
                        <div className="border border-kce-border rounded-xl p-3 flex flex-col gap-2">
                            <ModeToggle
                                options={[{value: 'count', label: t('penalty.mode.count')}, {value: 'euro', label: t('penalty.mode.euro')}]}
                                value={customMode} onChange={v => { setCustomMode(v as PenaltyMode); setCustomAmount('') }}/>
                            <AmountInput mode={customMode} value={customAmount} onChange={setCustomAmount}/>
                        </div>

                        {/* 4 — Save as template (admin only) */}
                        {isAdmin(user) && (
                            <button type="button"
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${saveAsTemplate ? 'border-kce-amber text-kce-amber bg-kce-amber/10' : 'border-kce-border text-kce-muted'}`}
                                    onClick={() => setSaveAsTemplate(v => !v)}>
                                <span>{saveAsTemplate ? '✓' : '+'}</span>
                                {t('penalty.saveAsTemplate')}
                            </button>
                        )}

                        <div className="flex gap-2 mt-1">
                            <button type="button" className="btn-secondary flex-1" onClick={() => setSheet(false)}>
                                {t('action.cancel')}
                            </button>
                            <button type="submit" className="btn-primary flex-[2]"
                                    disabled={saving || !customName.trim() || customPlayerIds.length === 0}>
                                {t('penalty.confirm')}
                            </button>
                        </div>
                    </div>
                )}
            </Sheet>

            {/* Edit penalty sheet */}
            <Sheet open={!!editEntry} onClose={() => setEditEntry(null)} title={t('penalty.edit')}
                   onSubmit={submitEdit}>
                <div className="flex flex-col gap-3">
                    {/* Penalty type */}
                    <div>
                        <div className="field-label">{t('penalty.quick')}</div>
                        <div className="flex flex-wrap gap-1.5">
                            {penaltyTypes.map(pt => (
                                <button key={pt.id} type="button"
                                        className={`chip ${editType === pt.id ? 'active' : ''}`}
                                        onClick={() => { setEditType(pt.id); setEditAmount('') }}>
                                    {pt.icon} {pt.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Mode */}
                    <ModeToggle
                        options={[{value: 'count', label: t('penalty.mode.count')}, {value: 'euro', label: t('penalty.mode.euro')}]}
                        value={editMode} onChange={v => { setEditMode(v as PenaltyMode); setEditAmount('') }}/>

                    {/* Amount */}
                    <AmountInput
                        mode={editMode}
                        value={editAmount}
                        onChange={setEditAmount}
                        defaultAmount={editMode === 'euro' ? editPenaltyType?.default_amount : undefined}/>

                    {/* Player */}
                    <div>
                        <div className="field-label">{t('penalty.who')}</div>
                        <div className="flex flex-wrap gap-1.5">
                            {players.map(p => (
                                <button key={p.id} type="button"
                                        className={`chip ${editPlayerId === p.id ? 'active' : ''}`}
                                        onClick={() => setEditPlayerId(p.id)}>
                                    {p.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-2 mt-1">
                        <button type="button" className="btn-secondary flex-1" onClick={() => setEditEntry(null)}>
                            {t('action.cancel')}
                        </button>
                        <button type="submit" className="btn-primary flex-[2]" disabled={saving}>
                            {t('action.save')}
                        </button>
                    </div>
                </div>
            </Sheet>
        </div>
    )
}
